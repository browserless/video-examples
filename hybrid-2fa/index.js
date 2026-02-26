import puppeteer from "puppeteer-core";

const API_TOKEN = "YOUR_API_TOKEN_HERE";

const queryParams = new URLSearchParams({
  token: API_TOKEN,
  timeout: "300000", // 5 minutes
  headless: "false", // basic anti-bot measures
}).toString();

(async () => {
  let browser;
  try {
    browser = await puppeteer.connect({
      browserWSEndpoint: `wss://production-sfo.browserless.io?${queryParams}`,
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    // Step 1: Navigate to Proton Mail login
    console.log("Step 1: Navigating to https://account.proton.me/mail ...");
    await page.goto("https://account.proton.me/mail", {
      waitUntil: "networkidle2",
      timeout: 60000,
    });

    // Step 2: Type username
    console.log("Step 2: Typing username...");
    await page.waitForSelector("#username", { timeout: 15000 });
    await page.type("#username", "2fahybridtest", { delay: 50 });

    // Step 3: Type password
    console.log("Step 3: Typing password...");
    await page.waitForSelector("#password", { timeout: 15000 });
    await page.type("#password", "HybridTest2FA!", { delay: 50 });

    // Step 4: Click submit button
    console.log("Step 4: Clicking submit...");
    const submitSelector =
      "body > div.app-root > div.flex.\\*\\:min-size-auto.flex-nowrap.flex-column.h-full.overflow-auto.relative.ui-standard.sign-layout-bg > div.sign-layout-container.p-0.sm\\:px-6.flex.flex-nowrap.flex-column.justify-space-between > main > div.w-full.max-w-custom.relative.sign-layout.pt-1.pb-6.sm\\:p-11.px-4.mx-auto.sm\\:shadow-lifted.shadow-color-primary > div.sign-layout-main-content > form > button";
    await page.waitForSelector(submitSelector, { timeout: 15000 });
    await page.click(submitSelector);

    // Step 5: Wait for navigation and 2FA page
    console.log("Step 5: Waiting for 2FA page to load...");
    const twoFAHeaderSelector =
      "body > div.app-root > div.flex.\\*\\:min-size-auto.flex-nowrap.flex-column.h-full.overflow-auto.relative.ui-standard.sign-layout-bg > div > main > div > div.sign-layout-header.mb-6 > div > h1";
    await page.waitForSelector(twoFAHeaderSelector, { timeout: 30000 });
    console.log("2FA page detected!");

    // Step 6: Generate LiveURL for manual 2FA input
    console.log("Step 6: Generating LiveURL...");
    const cdp = await page.createCDPSession();
    const { liveURL, liveURLId } = await cdp.send("Browserless.liveURL", {
      timeout: 180000, // 3 minutes to complete 2FA
    });
    console.log("\n========================================");
    console.log("LIVE URL (open this to enter your 2FA code):");
    console.log(liveURL);
    console.log("========================================\n");

    // Step 7: Wait for the user to finish 2FA via LiveURL
    console.log(
      "Step 7: Waiting for you to complete 2FA and press Authenticate..."
    );
    await Promise.race([
      new Promise((r) => cdp.once("Browserless.liveComplete", r)),
      page.waitForSelector('h2[title="Inbox"]', { timeout: 180000 }),
      new Promise((r) => page.once("close", r)),
    ]);

    try {
      await cdp.send("Browserless.closeLiveURL", { liveURLId });
    } catch (e) {
      // Already closed or race condition
    }

    await browser.close();
    console.log("Browser closed.");
  } catch (error) {
    console.error("Error:", error.message);
    if (browser) {
      try {
        const pages = await browser.pages();
        if (pages.length > 0) {
          await pages[0].screenshot({ path: "error-screenshot.png" });
          console.log("Error screenshot saved: error-screenshot.png");
        }
      } catch (_) {}
      await browser.close();
      process.exit(1);
    }
  }
})();
