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
template.yaml         AWS SAM template
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

## Deploy from GitHub (no tools on your PC) — start here
Phase 1 is **training photos only**: strip reading by the model stays off (cap 0), so the bill is a few cents.
1. **AWS account** (aws.amazon.com), region **Asia Pacific (Mumbai) ap-south-1**. Turn on MFA for the root user.
2. **A deploy user:** IAM → Users → Create user `takesure-deploy` → Attach policies directly →
   `AdministratorAccess` (simplest for a one-person account; narrow it later) → Create. Open the user →
   Security credentials → Create access key → "Application running outside AWS" → copy both keys.
3. **GitHub:** repo → Settings → Secrets and variables → Actions → **New repository secret**:
   `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`. (Later, for strip reading: `ANTHROPIC_API_KEY`.)
4. **Deploy:** Actions → **Server deploy (AWS)** → Run workflow (daily model cap `0`). It creates the install
   secret, deploys, checks `/v1/health` and prints the **server address** on the run's summary page.
5. **Point test builds at it:** Settings → Secrets and variables → Actions → **Variables** → New variable
   `TAKESURE_API_URL` = the server address. The next iPhone/Android test build sends training photos there instead of
   email (Settings → Helper → Send photos). Store builds don't use it.
6. **Get the photos:** `aws s3 sync s3://<bucket>/training ./server-training` (bucket name is on the summary page),
   then `python training/server_photos.py ./server-training ./server-export` and `python training/autolabel.py
   --export ./server-export`.

Turning on strip reading later: add the `ANTHROPIC_API_KEY` secret and run the deploy again with a daily cap
(e.g. 200). The key stays in SSM on the server; phones never see it.

## Deploy (first time, from a computer with the AWS CLI)
Needs an AWS account, the AWS CLI (`aws configure`) and the SAM CLI.
```bash
# 1. Secrets (once). Pick your region, e.g. ap-south-1 (Mumbai).
aws ssm put-parameter --name /takesure/install-secret --type SecureString --value "$(openssl rand -base64 48)"
aws ssm put-parameter --name /takesure/model-key      --type SecureString --value "sk-ant-..."

# 2. Build and deploy
cd server
sam build
sam deploy --guided        # stack name: takesure; accept defaults; saves samconfig.toml for next time
```
The output `ApiUrl` is the base URL for the app (`EXPO_PUBLIC_API_URL`; for test builds set the GitHub variable
`TAKESURE_API_URL`).
Later deploys: `sam build && sam deploy`.

Parameters you can change in `sam deploy --guided`: `Model` (default `claude-sonnet-5-5`) and `ModelCallsPerDay`
(global cost cap, default 500).

## Rules when changing this code
* Never log request bodies, ids, tokens, IP addresses or model answers. One line per request (handler.ts).
* Never store an install token, or link stored data to one. Rate counters use a hash and expire in 2 days.
* Anything readable about a family (backups, activity) must arrive encrypted; the server must not need the key.
* New stored data gets an expiry (`expiresAt` for DynamoDB, a lifecycle rule for S3).
* Update `openapi.yaml`, spec 16 and the tests with every route change.
