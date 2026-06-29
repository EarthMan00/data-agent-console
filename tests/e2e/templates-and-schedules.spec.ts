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

  test("renders the schedules workspace entry points", async () => {
    await expect(appPage.getByText("定时任务")).toBeVisible();
    await expect(appPage.getByRole("tab", { name: "已定时" })).toBeVisible();
    await expect(appPage.getByRole("tab", { name: "运行记录" })).toBeVisible();
    await expect(appPage.getByRole("button", { name: "创建定时任务" })).toBeVisible();
    await expect(appPage.locator("button[role='combobox']").filter({ hasText: "全部状态" })).toBeVisible();
  });
});
