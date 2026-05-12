import puppeteer, { type Browser } from "puppeteer";

export async function renderPdfBuffer(html: string): Promise<Buffer> {
  const launchOpts: Parameters<typeof puppeteer.launch>[0] = {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  };
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    launchOpts.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  let browser: Browser | null = null;
  try {
    browser = await puppeteer.launch(launchOpts);
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({
      format: "Letter",
      margin: { top: "1in", right: "1in", bottom: "1in", left: "1in" },
      printBackground: true,
    });
    return Buffer.from(pdf);
  } finally {
    if (browser) await browser.close();
  }
}
