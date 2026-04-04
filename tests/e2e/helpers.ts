import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";

export async function createSingleWindowSession(browser: Browser, baseURL: string, path: string) {
  const context = await browser.newContext();

  const baselinePage = await context.newPage();
  await baselinePage.setContent(`
    <!doctype html>
    <html lang="en">
      <head><title>linkfoxAgent</title></head>
      <body><main>baseline tab</main></body>
    </html>
  `);

  const appPage = await context.newPage();
  await appPage.goto(`${baseURL}${path}`);
  await expectSingleWindowModel(context);

  return { context, baselinePage, appPage };
}

export async function closeSingleWindowSession(context: BrowserContext, baselinePage: Page, appPage: Page) {
  await appPage.close();
  expect(context.pages()).toHaveLength(1);
  await expect(baselinePage).toHaveTitle("linkfoxAgent");
  await context.close();
}

export async function expectSingleWindowModel(context: BrowserContext) {
  const pages = context.pages();
  expect(pages).toHaveLength(2);
  await expect(pages[0]).toHaveTitle("linkfoxAgent");
}
