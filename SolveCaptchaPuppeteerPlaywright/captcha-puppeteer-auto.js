import puppeteer from "puppeteer-core";
const TOKEN = "YOUR_API_TOKEN_HERE";
const browser = await puppeteer.connect({
  browserWSEndpoint: `wss://production-sfo.browserless.io/stealth?token=${TOKEN}&proxy=residential&proxyCountry=us&solveCaptchas=true&timeout=300000`,
});
console.log("Browser connected!");
const page = await browser.newPage();
const cdp = await page.createCDPSession();
console.log("Page and CDP session created!");
// Attach BEFORE navigation — survives the whole session
const captchaSolved = new Promise((resolve) => {
  cdp.on("Browserless.captchaAutoSolved", resolve);
});
console.log("Set up the Captcha listener.");
// Start on 2captcha homepage, click through to reCAPTCHA v2 demo
await page.goto("https://2captcha.com/", {
  waitUntil: "networkidle0",
});
console.log("Navigation to 2captcha homepage completed...");
await page.click(
  "#order-captchas > table > tbody > tr:nth-child(2) span > a:nth-child(2)"
);
console.log("Clicked on the captcha demo link...");
const { solved, token, time } = await captchaSolved;
console.log({ solved, token, time });
console.log("Captcha solved!");

await page.click("._actionsItem_151cx_41");
await new Promise((resolve) => setTimeout(resolve, 1000)); //1 second delay
await page.screenshot({ path: "./screenshots/screenshot.png" });
console.log("Screenshot saved...");

await browser.close();
