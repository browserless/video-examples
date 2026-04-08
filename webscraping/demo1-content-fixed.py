import requests
from bs4 import BeautifulSoup

BROWSERLESS_TOKEN = "YOUR_API_TOKEN_HERE"

# Fetch the page
response = requests.post(
    f"https://production-sfo.browserless.io/content?token={BROWSERLESS_TOKEN}",
    json={
        "url": "https://www.scrapingcourse.com/javascript-rendering",
        "waitForSelector": {
            "selector": ".product-name",
            "timeout": 10000
        }
    },
    headers={"Content-Type": "application/json"}
)

# Parse the HTML
soup = BeautifulSoup(response.text, "html.parser")

# Extract product data
products = soup.select(".product-item")
print(f"Products found: {len(products)}\n")

for i, product in enumerate(products):
    name = product.select_one(".product-name")
    price = product.select_one(".product-price")
    image = product.select_one("img")
    print(f"  {i + 1}. {name.text.strip() if name else '(empty)'} {price.text.strip() if price else '(empty)'}")
    print(f"     {image.get('src', '(empty)') if image else '(empty)'}")
    print()
