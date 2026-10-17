# TakeSure server on AWS: API Gateway (HTTP API) → one Lambda (Node 22, arm64) → DynamoDB + S3; secrets in SSM.
# Strictly anonymous (docs/specs/16-takesure-server.md). Deploy: see ../README.md → "Deploy with Terraform".

terraform {
  required_version = ">= 1.6"
  required_providers {
    aws     = { source = "hashicorp/aws", version = ">= 5.70" }
    random  = { source = "hashicorp/random", version = ">= 3.6" }
    archive = { source = "hashicorp/archive", version = ">= 2.4" }
  }
  # Keep state somewhere safe — it holds the install secret. Your usual S3 backend, e.g.:
  # backend "s3" {
  #   bucket       = "your-terraform-state"
  #   key          = "takesure/server.tfstate"
  #   region       = "us-east-1"
  #   use_lockfile = true
  # }
}

provider "aws" {
  region = var.region
  default_tags { tags = { app = var.name } }
}

data "aws_caller_identity" "me" {}
data "aws_partition" "p" {}

locals {
  install_secret_param = "/${var.name}/install-secret"
  model_key_param      = "/${var.name}/model-key"
  ssm_arn              = "arn:${data.aws_partition.p.partition}:ssm:${var.region}:${data.aws_caller_identity.me.account_id}:parameter"
}

# ---------- Secrets ----------
# The install secret signs anonymous install tokens. Generated here (so it is in Terraform state: keep state private).
resource "random_password" "install_secret" {
  length  = 48
  special = false
}

resource "aws_ssm_parameter" "install_secret" {
  name  = local.install_secret_param
  type  = "SecureString"
  value = random_password.install_secret.result
}

# The model provider's API key is NOT managed here, so it never enters Terraform state. Put it in yourself when
# strip reading is switched on:
#   aws ssm put-parameter --name /takesure/model-key --type SecureString --value "sk-ant-..." --overwrite

# ---------- Storage ----------
# One table, pay per request; TTL deletes expired items (rate counters, activity events, old backups).
resource "aws_dynamodb_table" "main" {
  name         = var.name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }
  attribute {
    name = "sk"
    type = "S"
  }
  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }
  server_side_encryption { enabled = true }
  point_in_time_recovery { enabled = true }
}

# Private bucket: encrypted backups (already ciphertext) and opt-in training photos.
resource "aws_s3_bucket" "main" {
  bucket_prefix = "${var.name}-"
}

resource "aws_s3_bucket_public_access_block" "main" {
  bucket                  = aws_s3_bucket.main.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "main" {
  bucket = aws_s3_bucket.main.id
  rule { object_ownership = "BucketOwnerEnforced" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "main" {
  bucket = aws_s3_bucket.main.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "main" {
  bucket = aws_s3_bucket.main.id
  rule {
    id     = "backups-not-updated"
    status = "Enabled"
    filter { prefix = "vault/" }
    expiration { days = 400 }
  }
  rule {
    id     = "training-photos"
    status = "Enabled"
    filter { prefix = "training/" }
    expiration { days = 730 }
  }
}

# ---------- Lambda ----------
# Build first: (in server/) npm ci && npm run bundle  → dist/handler.mjs
data "archive_file" "lambda" {
  type        = "zip"
  source_file = "${path.module}/../dist/handler.mjs"
  output_path = "${path.module}/.build/lambda.zip"
}

resource "aws_iam_role" "lambda" {
  name = "${var.name}-api"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "lambda.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}

resource "aws_iam_role_policy" "lambda" {
  name = "${var.name}-api"
  role = aws_iam_role.lambda.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem", "dynamodb:Query", "dynamodb:BatchGetItem", "dynamodb:BatchWriteItem", "dynamodb:ConditionCheckItem"]
        Resource = [aws_dynamodb_table.main.arn, "${aws_dynamodb_table.main.arn}/index/*"]
      },
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
        Resource = "${aws_s3_bucket.main.arn}/*"
      },
      {
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = aws_s3_bucket.main.arn
      },
      {
        Effect   = "Allow"
        Action   = "ssm:GetParameter"
        Resource = ["${local.ssm_arn}${local.install_secret_param}", "${local.ssm_arn}${local.model_key_param}"]
      },
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.lambda.arn}:*"
      },
    ]
  })
}

resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${var.name}-api"
  retention_in_days = 14
}

resource "aws_lambda_function" "api" {
  function_name    = "${var.name}-api"
  role             = aws_iam_role.lambda.arn
  runtime          = "nodejs22.x"
  architectures    = ["arm64"]
  handler          = "handler.main"
  filename         = data.archive_file.lambda.output_path
  source_code_hash = data.archive_file.lambda.output_base64sha256
  memory_size      = 512
  timeout          = 30

  logging_config {
    log_format            = "JSON"
    application_log_level = "INFO"
    log_group             = aws_cloudwatch_log_group.lambda.name
  }

  environment {
    variables = {
      TABLE                = aws_dynamodb_table.main.name
      BUCKET               = aws_s3_bucket.main.bucket
      MODEL                = var.model
      MODEL_CALLS_PER_DAY  = tostring(var.model_calls_per_day)
      INSTALL_SECRET_PARAM = local.install_secret_param
      MODEL_KEY_PARAM      = local.model_key_param
    }
  }

  depends_on = [aws_iam_role_policy.lambda]
}

# ---------- API ----------
# No access logs on purpose: API Gateway access logs would record IP addresses.
resource "aws_apigatewayv2_api" "api" {
  name          = var.name
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_integration" "lambda" {
  api_id                 = aws_apigatewayv2_api.api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "all" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "ANY /{proxy+}"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.api.id
  name        = "$default"
  auto_deploy = true
  default_route_settings {
    throttling_burst_limit = 50
    throttling_rate_limit  = 20
  }
}

resource "aws_lambda_permission" "api" {
  statement_id  = "AllowApiGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*/*"
}
