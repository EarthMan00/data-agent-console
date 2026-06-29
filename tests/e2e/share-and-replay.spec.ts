import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import {
  closeSingleWindowSession,
  createPublicShareFixture,
  createSingleWindowSession,
  deletePromptTemplateFixture,
} from "./helpers";

test.describe.serial("share and replay", () => {
  let context: BrowserContext;
  let baselinePage: Page;
  let appPage: Page;
  let rootUrl: string;
  let shareFixture: {
    shareId: string;
    templateId: string;
    categoryId: string;
    title: string;
    description: string;
    objective: string;
  };

  test.beforeAll(async ({ browser, baseURL }) => {
    rootUrl = baseURL!;
    shareFixture = await createPublicShareFixture(rootUrl);
    ({ context, baselinePage, appPage } = await createSingleWindowSession(
      browser,
      rootUrl,
      `/share/${shareFixture.shareId}`,
    ));
  });

  test.afterAll(async () => {
    await closeSingleWindowSession(context, baselinePage, appPage);
    await deletePromptTemplateFixture(rootUrl, shareFixture.templateId, shareFixture.categoryId);
  });

  test("renders the public share replay shell", async () => {
    await expect(appPage.getByText(shareFixture.title)).toBeVisible();
    await expect(appPage.getByText(shareFixture.description, { exact: true })).toBeVisible();
    await expect(appPage.getByText(shareFixture.objective)).toBeVisible();
    await expect(
      appPage.getByText("完整执行回放需关联真实会话数据；当前仅展示该分享的任务目标与说明。"),
    ).toBeVisible();
  });
});
