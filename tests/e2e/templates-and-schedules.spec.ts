import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { closeSingleWindowSession, createSingleWindowSession } from "./helpers";

test.describe.serial("templates and schedules", () => {
  let context: BrowserContext;
  let baselinePage: Page;
  let appPage: Page;

  test.beforeAll(async ({ browser, baseURL }) => {
    ({ context, baselinePage, appPage } = await createSingleWindowSession(browser, baseURL!, "/templates"));
  });

  test.afterAll(async () => {
    await closeSingleWindowSession(context, baselinePage, appPage);
  });

  test("covers template reuse and schedule pages", async () => {
    await expect(appPage.getByRole("button", { name: "创建任务指令" })).toBeVisible();
    await appPage.getByRole("button", { name: "默认" }).click();
    await appPage.getByRole("button", { name: "直接发起任务" }).click();
    await expect(appPage).toHaveURL(/\/agent\?runId=/);

    await appPage.goto("http://127.0.0.1:3000/schedules");
    await expect(appPage.getByRole("heading", { name: "定时任务" })).toBeVisible();
    await appPage.getByRole("tab", { name: "运行记录" }).click();
    await expect(appPage.getByText("美国站keyboard tablet case监控")).toBeVisible();
  });
});
