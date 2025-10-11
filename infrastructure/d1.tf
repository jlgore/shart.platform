resource "cloudflare_d1_database" "shart_d1_database" {
  account_id = var.cloudflare_account_id
  name = var.d1_database_name
  primary_location_hint = "enam"

  read_replication = {
    mode = "disabled"
  }
}

resource "cloudflare_d1_database" "auth_d1_database" {
  account_id = var.cloudflare_account_id
  name = "shart-auth-${var.environment}"
  primary_location_hint = "enam"

  read_replication = {
    mode = "disabled"
  }
}


