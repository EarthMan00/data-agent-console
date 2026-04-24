import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { closeSingleWindowSession, createSingleWindowSession } from "./helpers";

test.describe.serial("schedules", () => {
  let context: BrowserContext;
  let baselinePage: Page;
  let appPage: Page;

  test.beforeAll(async ({ browser, baseURL }) => {
    ({ context, baselinePage, appPage } = await createSingleWindowSession(browser, baseURL!, "/schedules"));
  });

  test.afterAll(async () => {
    await closeSingleWindowSession(context, baselinePage, appPage);
  });

  test("covers schedule list and run history tab", async () => {
    await expect(appPage.getByRole("heading", { name: "定时任务" })).toBeVisible();
    await appPage.getByRole("tab", { name: "运行记录" }).click();
    await expect(appPage.getByText("亚马逊搜索computer desk并返回前100条数据")).toBeVisible();
  });
});
