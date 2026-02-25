resource "supabase_project" "shart_platform_db" {
  organization_id   = var.supabase_org_id
  name              = "shart-platform-${var.environment}"
  database_password = var.database_password
  region            = "us-east-1"
  lifecycle {
    ignore_changes = [database_password]
  }
}
