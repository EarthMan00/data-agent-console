import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { closeSingleWindowSession, createSingleWindowSession } from "./helpers";

test.describe.serial("report and artifacts", () => {
  let context: BrowserContext;
  let baselinePage: Page;
  let appPage: Page;
  let rootUrl: string;

  test.beforeAll(async ({ browser, baseURL }) => {
    rootUrl = baseURL!;
    ({ context, baselinePage, appPage } = await createSingleWindowSession(browser, rootUrl, "/report"));
  });

  test.afterAll(async () => {
    await closeSingleWindowSession(context, baselinePage, appPage);
  });

  test("renders the current report empty state and artifacts workspace", async () => {
    await expect(appPage.getByText("未找到报告", { exact: true })).toBeVisible();
    await expect(appPage.getByText("未找到报告。请从运行列表或带 reportId 的链接进入。")).toBeVisible();

    await appPage.goto(`${rootUrl}/artifacts`);
    await expect(appPage).toHaveURL(/\/artifacts/);
    await expect(appPage.getByText("我的收藏夹")).toBeVisible();
    await expect(appPage.getByRole("button", { name: "新建文件夹" })).toBeVisible();
    await expect(appPage.getByPlaceholder("搜索收藏")).toBeVisible();
  });
});
