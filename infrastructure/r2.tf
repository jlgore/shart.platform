resource "cloudflare_r2_bucket" "shart_r2_bucket" {
  account_id = var.cloudflare_account_id
  name = "shart-workshop-log-${var.environment}"
  location = "enam"
  storage_class = "Standard"
}

resource "cloudflare_r2_bucket_cors" "shart_r2_bucket_cors" {
  account_id = var.cloudflare_account_id
  bucket_name = cloudflare_r2_bucket.shart_r2_bucket.name
  rules = [{
    allowed = {
      methods = ["GET", "HEAD"]
      origins = ["http://localhost:4321", "https://dev.shart.cloud", "https://shart.cloud"]
      // Allow range so the browser can request byte ranges without failing CORS preflight
      headers = ["range"]
    }
    id = "Allow Local Development"
    // Expose headers needed for progress UI and partial content handling
    expose_headers = [
      "Content-Length",
      "Accept-Ranges",
      "Content-Range",
      "ETag",
      "Last-Modified",
      "Content-Encoding"
    ]
    max_age_seconds = 86400
  }]
}
