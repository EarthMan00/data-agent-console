import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { closeSingleWindowSession, createSingleWindowSession, expectSingleWindowModel } from "./helpers";

test.describe.serial("core navigation", () => {
  let context: BrowserContext;
  let baselinePage: Page;
  let appPage: Page;

  test.beforeAll(async ({ browser, baseURL }) => {
    ({ context, baselinePage, appPage } = await createSingleWindowSession(browser, baseURL!, "/"));
  });

  test.afterAll(async () => {
    await closeSingleWindowSession(context, baselinePage, appPage);
  });

  test("navigates through the shell", async () => {
    await expectSingleWindowModel(context);
    await expect(appPage.getByText("MData Agent")).toBeVisible();
    await appPage.getByRole("link", { name: "指令库" }).click();
    await expect(appPage).toHaveURL(/\/templates/);
    await appPage.getByRole("link", { name: "定时任务" }).click();
    await expect(appPage).toHaveURL(/\/schedules/);
    await appPage.getByRole("link", { name: "收藏夹" }).click();
    await expect(appPage).toHaveURL(/\/artifacts/);
  });
});
