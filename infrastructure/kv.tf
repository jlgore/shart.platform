resource "cloudflare_workers_kv_namespace" "shart_workers_kv_namespace" {
  account_id = var.cloudflare_account_id
  title = "shart-auth-kv-${var.environment}"
}

resource "cloudflare_workers_kv" "shart_workers_kv" {
  account_id = var.cloudflare_account_id
  namespace_id = cloudflare_workers_kv_namespace.shart_workers_kv_namespace.id
  key_name = "test-shart-${var.environment}"
  value = "Some Value"
}
