output "api_url" {
  description = "Server address for the app: GitHub variable TAKESURE_API_URL (test builds) / EXPO_PUBLIC_API_URL."
  value       = aws_apigatewayv2_api.api.api_endpoint
}

output "bucket" {
  description = "Private bucket: training photos under training/, encrypted backups under vault/."
  value       = aws_s3_bucket.main.bucket
}

output "table" {
  value = aws_dynamodb_table.main.name
}

output "model_key_command" {
  description = "Run this when switching strip reading on (keeps the key out of Terraform state)."
  value       = "aws ssm put-parameter --region ${var.region} --name ${local.model_key_param} --type SecureString --value \"sk-ant-...\" --overwrite"
}
