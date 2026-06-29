import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import {
  closeSingleWindowSession,
  createFeedbackFixture,
  createSingleWindowSession,
  markFeedbackFixtureHandled,
} from "./helpers";

test.describe.serial("admin feedback", () => {
  let context: BrowserContext;
  let baselinePage: Page;
  let appPage: Page;
  let feedbackMessage: string;
  let feedbackId: string;
  let rootUrl: string;

  test.beforeAll(async ({ browser, baseURL }) => {
    rootUrl = baseURL!;
    feedbackMessage = `e2e feedback ${Date.now()}`;
    feedbackId = await createFeedbackFixture(rootUrl, feedbackMessage);
    ({ context, baselinePage, appPage } = await createSingleWindowSession(browser, rootUrl, "/admin/feedback"));
  });

  test.afterAll(async () => {
    await closeSingleWindowSession(context, baselinePage, appPage);
    await markFeedbackFixtureHandled(rootUrl, feedbackId);
  });

  test("shows public feedback entries in the admin list", async () => {
    await expect(appPage).toHaveURL(/\/admin\/feedback/);
    await expect(appPage.getByRole("heading", { name: "反馈管理" })).toBeVisible();
    await expect(appPage.getByText(feedbackMessage)).toBeVisible();
  });
});
