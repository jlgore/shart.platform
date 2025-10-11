terraform {
  required_providers {
    cloudflare = {
      source = "cloudflare/cloudflare"
      version = "5.11.0"
    }
    supabase = {
      source = "supabase/supabase"
      version = "~> 1.0"
    }
  }

}

provider "supabase" {
  access_token = var.supabase_access_token
}


provider "cloudflare" {
  # Configuration options
  api_token = var.cloudflare_account_token
}
