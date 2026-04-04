import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { closeSingleWindowSession, createSingleWindowSession } from "./helpers";

test.describe.serial("home to agent", () => {
  let context: BrowserContext;
  let baselinePage: Page;
  let appPage: Page;

  test.beforeAll(async ({ browser, baseURL }) => {
    ({ context, baselinePage, appPage } = await createSingleWindowSession(browser, baseURL!, "/"));
  });

  test.afterAll(async () => {
    await closeSingleWindowSession(context, baselinePage, appPage);
  });

  test("starts a task from the home composer", async () => {
    await appPage.getByLabel("任务输入编辑器").click();
    await appPage.keyboard.type("请分析美国站 keyboard tablet case 赛道，并输出机会点。");
    await appPage.getByTestId("task-composer-submit").click();

    await expect(appPage).toHaveURL(/runId=/);
    await expect(appPage.getByTestId("agent-user-input-card")).toBeVisible();
  });
});
