import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { closeSingleWindowSession, createSingleWindowSession, expectSingleWindowModel } from "./helpers";

test.describe.serial("core navigation", () => {
  let context: BrowserContext;
  let baselinePage: Page;
  let appPage: Page;
  let rootUrl: string;

  test.beforeAll(async ({ browser, baseURL }) => {
    rootUrl = baseURL!;
    ({ context, baselinePage, appPage } = await createSingleWindowSession(browser, rootUrl, "/"));
  });

  test.afterAll(async () => {
    await closeSingleWindowSession(context, baselinePage, appPage);
  });

  test("navigates through the authenticated shell", async () => {
    await expectSingleWindowModel(context);
    await expect(appPage.getByText("你好，admin")).toBeVisible();

    await appPage.getByRole("link", { name: "定时任务" }).click();
    await expect(appPage).toHaveURL(/\/schedules/);
    await expect(appPage.getByRole("button", { name: "创建定时任务" })).toBeVisible();

    await appPage.getByRole("link", { name: "新的对话" }).click();
    await expect(appPage).toHaveURL(/\/$/);

    await appPage.getByRole("link", { name: "收藏夹" }).click();
    await expect(appPage).toHaveURL(/\/artifacts/);
    await expect(appPage.getByRole("button", { name: "新建文件夹" })).toBeVisible();

    await appPage.goto(`${rootUrl}/prompt-library`);
    await expect(appPage).toHaveURL(/\/prompt-library/);
    await expect(appPage.getByText("我的提示词")).toBeVisible();
  });
});
