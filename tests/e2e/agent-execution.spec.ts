import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { closeSingleWindowSession, createSingleWindowSession } from "./helpers";

test.describe.serial("agent execution", () => {
  let context: BrowserContext;
  let baselinePage: Page;
  let appPage: Page;

  test.beforeAll(async ({ browser, baseURL }) => {
    ({ context, baselinePage, appPage } = await createSingleWindowSession(
      browser,
      baseURL!,
      "/agent?runId=run-e2e-missing",
    ));
  });

  test.afterAll(async () => {
    await closeSingleWindowSession(context, baselinePage, appPage);
  });

  test("shows a clear empty state for an unknown run id", async () => {
    await expect(appPage).toHaveURL(/\/agent\?runId=run-e2e-missing/);
    await expect(appPage.getByText("未找到任务")).toBeVisible();
    await expect(
      appPage.getByText("未在本地状态中找到该任务。请从首页发起研究，或确认 URL 中 runId 有效。"),
    ).toBeVisible();
  });
});
