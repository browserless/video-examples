"""Demo 4 — The 'broken' version: plain requests.get() on StockX.
Shows that a simple HTTP request gets blocked by Cloudflare."""

import requests

url = "https://stockx.com/nike-dunk-low-retro-white-black-panda"

response = requests.get(url, headers={
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) "
                  "Chrome/120.0.0.0 Safari/537.36"
})

print(f"Status: {response.status_code}")
print(f"Title:  {response.text[response.text.find('<title>')+7:response.text.find('</title>')]}")
print(f"Body:   {len(response.text)} chars")
print(f"\n⚠️  Blocked! Got a Cloudflare 'Just a moment...' challenge page.")
print("→ This is exactly what Browserless /unblock solves.")
