locals {
  allowed_hosts_expr        = join(" ", formatlist("\"%s\"", var.allowed_hosts))
  action_block_or_challenge = var.safe_rollout ? "managed_challenge" : "block"
  action_log_or_challenge   = var.safe_rollout ? "log" : "managed_challenge"
}

resource "cloudflare_ruleset" "custom_waf" {
  zone_id     = var.cloudflare_zone_id
  name        = "shart-platform-custom-waf"
  description = "Custom WAF protections for auth and API abuse"
  kind        = "zone"
  phase       = "http_request_firewall_custom"

  rules = [
    {
      description = "Block non-standard API methods"
      enabled     = true
      action      = local.action_block_or_challenge
      expression  = "(starts_with(http.request.uri.path, \"/api/\") and not http.request.method in {\"GET\" \"POST\" \"OPTIONS\"})"
    },
    {
      description = "Challenge scanner user agents on auth"
      enabled     = true
      action      = "managed_challenge"
      expression  = "(starts_with(http.request.uri.path, \"/api/auth/\") and lower(http.user_agent) matches \"(sqlmap|nikto|nmap|acunetix|dirbuster|gobuster)\")"
    },
    {
      description = "Block oversized auth request bodies"
      enabled     = true
      action      = local.action_block_or_challenge
      expression  = "(starts_with(http.request.uri.path, \"/api/auth/\") and http.request.body.size gt 16384)"
    },
    {
      description = "Block unexpected host headers"
      enabled     = true
      action      = local.action_block_or_challenge
      expression  = "not http.host in { ${local.allowed_hosts_expr} }"
    },
    {
      description = "Challenge obvious auth injection probes"
      enabled     = true
      action      = local.action_log_or_challenge
      expression  = "(starts_with(http.request.uri.path, \"/api/auth/\") and (http.request.uri.query matches \"(?i)(union\\\\s+select|\\\\bor\\\\b\\\\s+1=1|<script|%3Cscript)\"))"
    }
  ]
}

resource "cloudflare_ruleset" "rate_limits" {
  zone_id     = var.cloudflare_zone_id
  name        = "shart-platform-rate-limits"
  description = "Edge rate limits for auth and CTF endpoints"
  kind        = "zone"
  phase       = "http_ratelimit"

  rules = [
    {
      description = "Sign-in endpoint rate limit"
      enabled     = true
      action      = "managed_challenge"
      expression  = "(http.request.method eq \"POST\" and http.request.uri.path eq \"/api/auth/sign-in/email\")"
      ratelimit = {
        characteristics     = ["ip.src"]
        period              = var.auth_sign_in_period
        requests_per_period = var.auth_sign_in_limit
        mitigation_timeout  = 600
      }
    },
    {
      description = "Sign-up endpoint rate limit"
      enabled     = true
      action      = "managed_challenge"
      expression  = "(http.request.method eq \"POST\" and http.request.uri.path eq \"/api/auth/sign-up/email\")"
      ratelimit = {
        characteristics     = ["ip.src"]
        period              = var.auth_sign_up_period
        requests_per_period = var.auth_sign_up_limit
        mitigation_timeout  = 600
      }
    },
    {
      description = "Password reset endpoint rate limit"
      enabled     = true
      action      = "managed_challenge"
      expression  = "(http.request.method eq \"POST\" and http.request.uri.path eq \"/api/auth/request-password-reset\")"
      ratelimit = {
        characteristics     = ["ip.src"]
        period              = var.auth_reset_period
        requests_per_period = var.auth_reset_limit
        mitigation_timeout  = 600
      }
    },
    {
      description = "CTF submit endpoint rate limit"
      enabled     = true
      action      = local.action_block_or_challenge
      expression  = "(http.request.method eq \"POST\" and http.request.uri.path eq \"/api/ctf/questions/submit\")"
      ratelimit = {
        characteristics     = ["ip.src"]
        period              = var.ctf_submit_period
        requests_per_period = var.ctf_submit_limit
        mitigation_timeout  = 300
      }
    }
  ]
}
