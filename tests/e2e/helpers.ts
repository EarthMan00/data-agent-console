import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";

import { e2eConfig } from "./config";
import { agentPlatformUrl, fetchJson, loginAsAdmin } from "./http";

type AdminPromptCategoryCreateResponse = {
  category?: { id: string };
};

type AdminPromptCreateResponse = {
  template?: { id: string };
};

type UserFavoriteDetailResponse = {
  id?: string;
};

type PublicShareFixture = {
  shareId: string;
  templateId: string;
  categoryId: string;
  title: string;
  description: string;
  objective: string;
};

function fixtureSlug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "e2e";
}

async function seedAdminSession(context: BrowserContext, baseURL: string): Promise<void> {
  const auth = await loginAsAdmin(baseURL);
  await context.addInitScript((snapshot) => {
    try {
      sessionStorage.setItem("agent_platform.access_token", snapshot.accessToken);
      sessionStorage.setItem("agent_platform.refresh_token", snapshot.refreshToken);
      sessionStorage.setItem("agent_platform.user_id", snapshot.userId);
      sessionStorage.setItem("agent_platform.user_role", snapshot.userRole);
      sessionStorage.setItem("agent_platform.user_display_name", snapshot.displayName);
    } catch {
      // about:blank or restricted contexts may not expose localStorage.
    }
  }, {
    accessToken: auth.access_token,
    refreshToken: "__http_only_refresh__",
    userId: auth.user_id,
    userRole: auth.user_role ?? "admin",
    displayName: e2eConfig.adminUsername,
  });
}

export async function createSingleWindowSession(browser: Browser, baseURL: string, path: string) {
  const context = await browser.newContext();
  await seedAdminSession(context, baseURL);

  const baselinePage = await context.newPage();
  await baselinePage.setContent(`
    <!doctype html>
    <html lang="en">
      <head><title>Alice</title></head>
      <body><main>baseline tab</main></body>
    </html>
  `);

  const appPage = await context.newPage();
  await appPage.goto(`${baseURL}${path}`);
  await expectSingleWindowModel(context);

  return { context, baselinePage, appPage };
}

export async function closeSingleWindowSession(context: BrowserContext, baselinePage: Page, appPage: Page) {
  await appPage.close();
  expect(context.pages()).toHaveLength(1);
  await expect(baselinePage).toHaveTitle("Alice");
  await context.close();
}

export async function expectSingleWindowModel(context: BrowserContext) {
  const pages = context.pages();
  expect(pages).toHaveLength(2);
  await expect(pages[0]).toHaveTitle("Alice");
}

export async function createFeedbackFixture(baseURL: string, message: string): Promise<string> {
  const fixturePath = `/e2e/${fixtureSlug(e2eConfig.fixturePrefix)}/admin-feedback`;
  const payload = {
    message,
    page_path: fixturePath,
    context_type: "workflow",
    context_id: "playwright",
    app_version: "e2e",
  };
  const response = await fetchJson<{ id: string }>(baseURL, "/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return response.id;
}

export async function markFeedbackFixtureHandled(baseURL: string, feedbackId: string): Promise<void> {
  const auth = await loginAsAdmin(baseURL);
  const res = await fetch(agentPlatformUrl(baseURL, `/admin/feedback/${encodeURIComponent(feedbackId)}`), {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${auth.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      status: e2eConfig.feedbackResolvedStatus,
      admin_note: e2eConfig.feedbackAdminNote,
    }),
  });
  if (!res.ok) {
    throw new Error(`mark feedback fixture handled failed (${res.status})`);
  }
}

export async function createPublicShareFixture(baseURL: string): Promise<PublicShareFixture> {
  const auth = await loginAsAdmin(baseURL);
  const title = `${e2eConfig.fixturePrefix} Share Fixture`;
  const description = "fixture";
  const objective = `${e2eConfig.fixturePrefix} public share objective`;
  const category = await fetchJson<AdminPromptCategoryCreateResponse>(baseURL, "/admin/prompts/categories", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${auth.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: `${e2eConfig.fixturePrefix} Share Category ${Date.now()}`,
      sort_order: 9999,
    }),
  });
  const categoryId = category.category?.id;
  if (!categoryId) {
    throw new Error("share fixture category id missing");
  }

  const shareId = `e2e-share-${Date.now()}`;
  const created = await fetchJson<AdminPromptCreateResponse>(baseURL, "/admin/prompts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${auth.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      category_id: categoryId,
      title,
      description,
      prompt_text: objective,
      variables: [],
      capability_ids: [],
      replay_run_id: null,
      replay_share_id: shareId,
      status: "published",
      sort_order: 0,
      is_active: true,
    }),
  });
  const templateId = created.template?.id;
  if (!templateId) {
    throw new Error("share fixture template id missing");
  }
  return { shareId, templateId, categoryId, title, description, objective };
}

export async function deletePromptTemplateFixture(baseURL: string, templateId: string, categoryId?: string): Promise<void> {
  const auth = await loginAsAdmin(baseURL);
  let templateDeleteError: Error | null = null;

  const templateRes = await fetch(agentPlatformUrl(baseURL, `/admin/prompts/${encodeURIComponent(templateId)}`), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${auth.access_token}` },
  });
  if (!templateRes.ok) {
    templateDeleteError = new Error(`delete prompt template failed (${templateRes.status})`);
  }

  let categoryDeleteError: Error | null = null;
  if (categoryId) {
    const categoryRes = await fetch(agentPlatformUrl(baseURL, `/admin/prompts/categories/${encodeURIComponent(categoryId)}`), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${auth.access_token}` },
    });
    if (!categoryRes.ok) {
      categoryDeleteError = new Error(`delete prompt category failed (${categoryRes.status})`);
    }
  }

  if (templateDeleteError) {
    throw templateDeleteError;
  }
  if (categoryDeleteError) {
    throw categoryDeleteError;
  }
}

export async function createFavoriteFixture(baseURL: string): Promise<string> {
  const auth = await loginAsAdmin(baseURL);
  const favorite = await fetchJson<UserFavoriteDetailResponse>(
    baseURL,
    "/api/user/favorites",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${auth.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: `${e2eConfig.fixturePrefix} Favorite Fixture ${Date.now()}`,
        snapshot: {
          version: 1,
          result_kind: "md",
          card_preview: `${e2eConfig.fixturePrefix} favorite fixture`,
          content_text: `# ${e2eConfig.fixturePrefix} Favorite Fixture\n\nThis favorite is created by Playwright for render validation.`,
        },
      }),
    },
  );
  const favoriteId = favorite.id;
  if (!favoriteId) {
    throw new Error("favorite fixture id missing");
  }
  return favoriteId;
}

export async function deleteFavoriteFixture(baseURL: string, favoriteId: string): Promise<void> {
  const auth = await loginAsAdmin(baseURL);
  const res = await fetch(agentPlatformUrl(baseURL, `/api/user/favorites/${encodeURIComponent(favoriteId)}`), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${auth.access_token}` },
  });
  if (!res.ok) {
    throw new Error(`delete favorite fixture failed (${res.status})`);
  }
}
