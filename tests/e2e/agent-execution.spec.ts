import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { closeSingleWindowSession, createSingleWindowSession } from "./helpers";

test.describe.serial("agent execution", () => {
  let context: BrowserContext;
  let baselinePage: Page;
  let appPage: Page;

  test.beforeAll(async ({ browser, baseURL }) => {
    ({ context, baselinePage, appPage } = await createSingleWindowSession(browser, baseURL!, "/agent?runId=run-default"));
  });

  test.afterAll(async () => {
    await closeSingleWindowSession(context, baselinePage, appPage);
  });

  test("shows the latest /agent sequence and preview behavior", async () => {
    await expect(appPage.getByTestId("agent-split-section")).toBeVisible();
    await expect(appPage.getByTestId("agent-execution-summary-bar")).toBeVisible();
    await expect(appPage.getByTestId("agent-result-section")).toBeVisible();
    await expect(appPage.getByTestId("agent-preview-panel")).toBeVisible();

    await appPage.getByTestId("agent-execution-summary-bar").click();
    await expect(appPage.getByTestId("agent-execution-panel")).toBeVisible();
    await expect(appPage.getByTestId("agent-execution-panel")).not.toContainText("调用工具");
    await expect(appPage.getByTestId("agent-execution-panel")).toContainText(/亚马逊|积木|实时与全网检索/);
  });
});
