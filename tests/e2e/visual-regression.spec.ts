import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import {
  closeSingleWindowSession,
  createFavoriteFixture,
  createPublicShareFixture,
  createSingleWindowSession,
  deleteFavoriteFixture,
  deletePromptTemplateFixture,
} from "./helpers";

test.describe.serial("visual regression baseline", () => {
  let context: BrowserContext;
  let baselinePage: Page;
  let appPage: Page;
  let rootUrl: string;
  let favoriteId: string;
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
    favoriteId = await createFavoriteFixture(rootUrl);
    shareFixture = await createPublicShareFixture(rootUrl);
    ({ context, baselinePage, appPage } = await createSingleWindowSession(
      browser,
      rootUrl,
      `/favorite/report/${favoriteId}`,
    ));
  });

  test.afterAll(async () => {
    await closeSingleWindowSession(context, baselinePage, appPage);
    await deleteFavoriteFixture(rootUrl, favoriteId);
    await deletePromptTemplateFixture(rootUrl, shareFixture.templateId, shareFixture.categoryId);
  });

  test("keeps share and favorite report pages renderable", async () => {
    await expect(appPage.getByText("最后生成时间：")).toBeVisible();
    await expect(appPage.getByRole("button", { name: "下载" })).toBeVisible();

    await appPage.goto(`${rootUrl}/share/${shareFixture.shareId}`);
    await expect(appPage.getByText(shareFixture.title)).toBeVisible();
    await expect(appPage.getByText(shareFixture.objective)).toBeVisible();
    await expect(appPage.getByText("加载分享内容…")).toHaveCount(0);
  });
});
