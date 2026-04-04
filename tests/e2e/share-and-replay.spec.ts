import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { closeSingleWindowSession, createSingleWindowSession } from "./helpers";

test.describe.serial("share and replay", () => {
  let context: BrowserContext;
  let baselinePage: Page;
  let appPage: Page;

  test.beforeAll(async ({ browser, baseURL }) => {
    ({ context, baselinePage, appPage } = await createSingleWindowSession(browser, baseURL!, "/share/yM2iGJyrFHeG8SfJojT9rP"));
  });

  test.afterAll(async () => {
    await closeSingleWindowSession(context, baselinePage, appPage);
  });

  test("renders replay timeline and result reader", async () => {
    await expect(appPage.getByTestId("share-timeline")).toBeVisible();
    await expect(appPage.getByTestId("share-result-reader")).toBeVisible();
    await expect(appPage.getByText("完成思考")).toBeVisible();
    await expect(appPage.getByText("任务执行结果")).toBeVisible();
  });
});
