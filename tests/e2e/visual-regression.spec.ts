import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { closeSingleWindowSession, createSingleWindowSession } from "./helpers";

test.describe.serial("visual regression baseline", () => {
  let context: BrowserContext;
  let baselinePage: Page;
  let appPage: Page;

  test.beforeAll(async ({ browser, baseURL }) => {
    ({ context, baselinePage, appPage } = await createSingleWindowSession(browser, baseURL!, "/agent?runId=run-default"));
  });

  test.afterAll(async () => {
    await closeSingleWindowSession(context, baselinePage, appPage);
  });

  test("keeps agent and share in the same visual language", async () => {
    await expect(appPage.locator("div.flex.h-full.min-h-0.flex-col.overflow-hidden.bg-white").first()).toHaveCSS(
      "background-color",
      "rgb(255, 255, 255)",
    );
    await expect(appPage.getByTestId("agent-result-section")).toBeVisible();

    await appPage.goto("http://127.0.0.1:3000/share/yM2iGJyrFHeG8SfJojT9rP");
    await expect(appPage.getByTestId("share-timeline")).toBeVisible();
    await expect(appPage.getByTestId("share-result-reader")).toBeVisible();
  });
});
