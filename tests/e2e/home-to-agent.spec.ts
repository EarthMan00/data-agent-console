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
    const message = `e2e home task ${Date.now()}`;
    await appPage.getByTestId("task-composer-textbox").click();
    await appPage.keyboard.type(message);
    await appPage.getByTestId("task-composer-submit").click();

    await expect(appPage).toHaveURL(/\/agent\?sessionId=/, { timeout: 60000 });
    const userInputCard = appPage.getByTestId("agent-user-input-card");
    await expect(userInputCard).toBeVisible({ timeout: 60000 });
    await expect(userInputCard).toContainText(message);
  });
});
