import requests
from bs4 import BeautifulSoup

url = "https://www.scrapingcourse.com/javascript-rendering"

# Fetch the page
response = requests.get(url)

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
