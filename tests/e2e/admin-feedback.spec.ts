import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { closeSingleWindowSession, createSingleWindowSession } from "./helpers";

test.describe.serial("admin feedback", () => {
  let context: BrowserContext;
  let baselinePage: Page;
  let appPage: Page;

  test.beforeAll(async ({ browser, baseURL }) => {
    ({ context, baselinePage, appPage } = await createSingleWindowSession(browser, baseURL!, "/admin/login"));
  });

  test.afterAll(async () => {
    await closeSingleWindowSession(context, baselinePage, appPage);
  });

  test("logs into the feedback admin and shows the configured empty state", async () => {
    await appPage.getByLabel("账号").fill("Admin");
    await appPage.getByLabel("密码").fill("admin123");
    await appPage.getByRole("button", { name: "登录后台" }).click();

    await expect(appPage).toHaveURL(/\/admin\/feedback/);
    await expect(appPage.getByText("问题反馈")).toBeVisible();
  });
});
