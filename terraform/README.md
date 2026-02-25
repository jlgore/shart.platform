# Cloudflare WAF Terraform

This directory contains Terraform to manage Cloudflare WAF custom firewall rules and edge rate limits for `shart.cloud`.

## What it deploys

- Custom WAF rules (`http_request_firewall_custom`) for:
  - non-standard API methods
  - scanner user-agent challenges on auth paths
  - oversized auth body blocking
  - host header allowlist enforcement
  - basic auth query injection probing challenge
- Rate-limit rules (`http_ratelimit`) for:
  - `/api/auth/sign-in/email`
  - `/api/auth/sign-up/email`
  - `/api/auth/request-password-reset`
  - `/api/ctf/questions/submit`

## Prereqs

- Terraform `>= 1.5.0`
- Cloudflare API token with zone WAF/ruleset edit permissions

## Usage

1. Copy the example vars file:

```bash
cp terraform/terraform.tfvars.example terraform/terraform.tfvars
```

2. Fill in `cloudflare_api_token` and `cloudflare_zone_id`.

3. Apply:

```bash
cd terraform
terraform init
terraform plan
terraform apply
```

## Safer rollout mode

Set `safe_rollout = true` (default) for pre-testing rollout:

- uses challenge-first actions instead of hard block where possible
- keeps strict blocking for less risky transitions disabled until you are ready

When testing is complete, set `safe_rollout = false` and apply again to enforce hard blocks.

## Notes

- Start with `managed_challenge` actions and review Cloudflare Security Events before tightening to full `block` where needed.
- These rules are intended to complement (not replace) your app-level Better Auth and endpoint-specific rate limits.
