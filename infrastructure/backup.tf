#resource "null_resource" "d1_backup" {
#  triggers = {
    # Only run when database configuration changes that would cause replacement
#    database_name = cloudflare_d1_database.shart_d1_database.name
#    database_id = cloudflare_d1_database.shart_d1_database.id
#    primary_location = cloudflare_d1_database.shart_d1_database.primary_location_hint
#    account_id = cloudflare_d1_database.shart_d1_database.account_id
#  }
#
#  provisioner "local-exec" {
#    command = "CLOUDFLARE_API_TOKEN=${var.cloudflare_account_token} CLOUDFLARE_ACCOUNT_ID=${var.cloudflare_account_id} npx wrangler d1 export ${var.d1_database_name} --output backup-$(date +%Y%m%d-%H%M%S).sql --remote"
#  }
#
#  depends_on = [cloudflare_d1_database.shart_d1_database]
#}
