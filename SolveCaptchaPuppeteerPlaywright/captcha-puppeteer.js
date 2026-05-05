import puppeteer from "puppeteer-core";
const token = "YOUR_API_TOKEN_HERE";

const browserWSEndpoint =
  `wss://production-sfo.browserless.io/stealth?token=${token}&proxy=residential&proxyCountry=us&timeout=300000`;

try {
  const browser = await puppeteer.connect({ browserWSEndpoint });
  const page = await browser.newPage();
  const cdp = await page.createCDPSession();
  console.log("Page and CDP session created!");

  // Set up the promise BEFORE goto
  const captchaSolved = new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("no captcha found in 30s")),
      30_000
    );
    cdp.on("Browserless.captchaFound", async () => {
      console.log("Captcha found!");
      try {
        console.log("Solving captcha...");
        const { solved, error } = await cdp.send("Browserless.solveCaptcha");
        clearTimeout(timeout);
        resolve({ solved, error });
      } catch (e) {
        clearTimeout(timeout);
        reject(e);
      }
    });
  });
  console.log("Set up the Captcha listener.");
  await page.goto("https://2captcha.com/demo/recaptcha-v2", {
    waitUntil: "networkidle2",
  });
  console.log("Navigation to 2captcha demo page completed...");

  const { solved, error } = await captchaSolved;
  console.log({ solved, error });

  await page.click("._actionsItem_151cx_41");
  console.log("Clicked on the captcha...");
  await new Promise((resolve) => setTimeout(resolve, 1000)); //1 second delay
  console.log("Delayed for 1 second...");
  await page.screenshot({ path: "./screenshots/screenshot.png" });
  console.log("Captcha solved! Screenshot saved...");

  await browser.close();
} catch (e) {
  console.error(e);
  process.exit(1);
}
