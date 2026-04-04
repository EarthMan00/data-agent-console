import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { closeSingleWindowSession, createSingleWindowSession } from "./helpers";

test.describe.serial("report and artifacts", () => {
  let context: BrowserContext;
  let baselinePage: Page;
  let appPage: Page;

  test.beforeAll(async ({ browser, baseURL }) => {
    ({ context, baselinePage, appPage } = await createSingleWindowSession(browser, baseURL!, "/report"));
  });

  test.afterAll(async () => {
    await closeSingleWindowSession(context, baselinePage, appPage);
  });

  test("renders report view and artifacts page actions", async () => {
    await expect(appPage.getByRole("button", { name: "报告摘要" })).toBeVisible();
    await appPage.getByRole("button", { name: "结构化表格" }).click();
    await expect(appPage.getByRole("button", { name: "保存为模板" })).toBeVisible();

    await appPage.goto("http://127.0.0.1:3000/artifacts");
    await expect(appPage.getByRole("button", { name: "打开结果页" })).toBeVisible();
    await expect(appPage.getByRole("button", { name: "返回任务上下文" })).toBeVisible();
  });
});
