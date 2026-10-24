# TakeSure server

One central, strictly anonymous backend for every TakeSure phone: strip reading with a frontier model, a shared
strip catalogue, encrypted cloud backups, an encrypted family activity feed, and opt-in training photos.
Why and how: [`docs/specs/16-takesure-server.md`](../docs/specs/16-takesure-server.md). API: [`openapi.yaml`](openapi.yaml).

AWS: API Gateway (HTTP API) → one Lambda (Node 22, arm64) → DynamoDB (one table, on-demand, TTL) + S3 (private bucket).
Secrets in SSM Parameter Store.

## Layout
```
src/api.ts            all routes and the anonymity rules
src/profile.ts        checks the model's strip profile field by field
src/tokens.ts         anonymous install tokens (self-checking HMAC, nothing stored)
src/limits.ts         per-install rate limits, global daily caps
src/jpeg.ts           removes EXIF/XMP/comments from photos
src/model/            the model behind strip reading (Claude by default; swap without an app update)
src/store/            DynamoDB + S3 for AWS, in-memory for tests and local runs
src/handler.ts        Lambda entry
src/local.ts          local server on :8787
tests/phone.ts        what the phone does: key derivation and encryption (reference for the app)
scripts/bundle.mjs    bundles the Lambda (esbuild) into dist/handler.mjs
terraform/            AWS infrastructure (Terraform)
```

## Run locally
```bash
cd server
npm install
npm test
npm run local                                      # fake model, everything in memory
ANTHROPIC_API_KEY=sk-... npm run local             # real strip reading
```
Try it:
```bash
TOKEN=$(curl -s -X POST localhost:8787/v1/install | jq -r .token)
curl -s localhost:8787/v1/strip/read -H "Authorization: Install $TOKEN" \
  -H 'content-type: application/json' -d "{\"photos\":[\"$(base64 -w0 strip.jpg)\"]}" | jq
```

## Deploy with Terraform
Everything is in `terraform/` (region `us-east-1` by default). Phase 1 is **training photos only**: strip reading
by the model stays off (`model_calls_per_day = 0`), so the bill is a few cents.

```bash
cd server
npm ci
npm run bundle                 # → dist/handler.mjs (rerun before every apply that changes server code)
cd terraform
terraform init                 # add your usual S3 backend in main.tf first; state holds the install secret
terraform apply
```
Outputs: `api_url` (the server address), `bucket` (training photos and backups), `model_key_command`.

Check it: `curl <api_url>/v1/health`.

**Point the test builds at it:** GitHub → repo Settings → Secrets and variables → Actions → **Variables** → New
variable `TAKESURE_API_URL` = `api_url`. The next iPhone/Android test build sends training photos there instead of
email (Settings → Your data → Photos for improving the scanner → **Send photos**). Store builds don't use it.

**Get the photos:**
```bash
aws s3 sync s3://<bucket>/training ./server-training
python training/server_photos.py ./server-training ./server-export
python training/autolabel.py --export ./server-export
```

**Turn on strip reading later:** put the model key in SSM with the `model_key_command` output (kept out of
Terraform state on purpose), then `terraform apply -var model_calls_per_day=200`. Phones never see the key.

**What it creates:** HTTP API (throttled, no access logs — they would record IP addresses) → Lambda `takesure-api`
(Node 22, arm64, 512 MB, 14-day logs, one line per request) → DynamoDB `takesure` (on demand, TTL, encrypted,
no point-in-time recovery, so deleted items are gone) and a private, encrypted S3 bucket (backups expire after 400 days unchanged, training
photos after 2 years). IAM allows only those, plus reading the two SSM parameters.

CI (`.github/workflows/server.yml`) runs the tests, the bundle and `terraform fmt/validate` on every server change.

## Rules when changing this code
* Never log request bodies, ids, tokens, IP addresses or model answers. One line per request (handler.ts).
* Never store an install token, or link stored data to one. Rate counters use a hash and expire in 2 days.
* Anything readable about a family (backups, activity) must arrive encrypted; the server must not need the key.
* New stored data gets an expiry (`expiresAt` for DynamoDB, a lifecycle rule for S3).
* Update `openapi.yaml`, spec 16 and the tests with every route change.
