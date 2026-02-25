variable "cloudflare_api_token" {
  description = "Cloudflare API token with Zone WAF edit permissions"
  type        = string
  sensitive   = true
}

variable "cloudflare_zone_id" {
  description = "Cloudflare Zone ID for shart.cloud"
  type        = string
}

variable "allowed_hosts" {
  description = "Allowed Host header values"
  type        = list(string)
  default = [
    "shart.cloud",
    "www.shart.cloud",
    "platform.shart.cloud",
  ]
}

variable "auth_sign_in_limit" {
  description = "Allowed sign-in POSTs per period"
  type        = number
  default     = 10
}

variable "auth_sign_in_period" {
  description = "Rate-limit period in seconds for sign-in"
  type        = number
  default     = 60
}

variable "auth_sign_up_limit" {
  description = "Allowed sign-up POSTs per period"
  type        = number
  default     = 5
}

variable "auth_sign_up_period" {
  description = "Rate-limit period in seconds for sign-up"
  type        = number
  default     = 600
}

variable "auth_reset_limit" {
  description = "Allowed reset-password POSTs per period"
  type        = number
  default     = 5
}

variable "auth_reset_period" {
  description = "Rate-limit period in seconds for reset-password"
  type        = number
  default     = 600
}

variable "ctf_submit_limit" {
  description = "Allowed CTF answer submissions per period"
  type        = number
  default     = 30
}

variable "ctf_submit_period" {
  description = "Rate-limit period in seconds for CTF answer submit"
  type        = number
  default     = 60
}

variable "safe_rollout" {
  description = "If true, use safer challenge-first actions instead of hard blocks where possible"
  type        = bool
  default     = true
}
