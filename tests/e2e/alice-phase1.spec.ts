import { expect, test, type Browser, type BrowserContext } from "@playwright/test";

import {
  agentPlatformUrl,
  fetchJson,
  loginAsAdmin,
  type LoginResponse,
} from "./http";
import {
  closeSingleWindowSession,
  createSingleWindowSession,
  markFeedbackFixtureHandled,
} from "./helpers";

/**
 * Alice 一期验收场景（PRD §11）。
 *
 * 运行前提（与 tests/e2e 现有套件一致）：
 * - dev server + 后端 + PostgreSQL 已就绪（npm run test:e2e -- alice-phase1）
 * - 后端启用公开注册且非生产回显验证码：
 *   AGENT_WEB_ENV=development、ENABLE_PUBLIC_REGISTER=1、EMAIL_OTP_DEV_ECHO_CODE=1
 * - 场景 3「报告模式扣减」依赖真实 LLM agent-runtime（round 需执行到计划提交才会预留权益）
 * - 场景 2「连通测试」依赖组件内 OPEN_API_BASE_URL（www.mdata.xin/agent-platform）
 *   解析到当前后端，否则浏览器侧 /v1/whoami 返回非 2xx 属环境问题
 */

const USER_PASSWORD = "AlicePhase1!2026";
const TRIAL_DATA_QUERY_REMAINING = 5;
const TRIAL_RESEARCH_REPORT_REMAINING = 1;
const PAID_PLAN_CODE = "paid_basic";
const PAID_PLAN_CYCLE = "monthly";

type BillingSummary = {
  has_active_cycle: boolean;
  plan_code: string | null;
  plan_name: string | null;
  kind: string | null;
  data_query_remaining: number;
  research_report_remaining: number;
};

type CreatedApiKey = {
  key_id: string;
  api_key: string;
  name: string;
  scopes: string[];
};

type CreatedOrder = {
  id: string;
  order_no: string;
  order_type: string;
  status: string;
  amount_cents: number;
  plan_snapshot: { code: string; name: string };
};

type PlanSpec = {
  code: string;
  data_query_quota: number;
  research_report_quota: number;
};

async function registerEmailUser(baseURL: string, suffix: string): Promise<LoginResponse> {
  const username = `alice_e2e_${Date.now()}_${suffix}`;
  const email = `${username}@example.com`;
  const sendRes = await fetch(agentPlatformUrl(baseURL, "/api/auth/register/email/send"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, email }),
  });
  if (!sendRes.ok) {
    const text = await sendRes.text();
    throw new Error(`register OTP send failed (${sendRes.status}): ${text}`);
  }
  const debugCode =
    sendRes.headers.get("X-Debug-Email-Code") || process.env.PLAYWRIGHT_REGISTER_CODE;
  if (!debugCode) {
    throw new Error(
      "register OTP unavailable: start the backend with EMAIL_OTP_DEV_ECHO_CODE=1 (dev echoes X-Debug-Email-Code) or set PLAYWRIGHT_REGISTER_CODE",
    );
  }
  return fetchJson<LoginResponse>(baseURL, "/api/auth/register/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, email, password: USER_PASSWORD, code: debugCode }),
  });
}

async function seedUserSession(context: BrowserContext, auth: LoginResponse): Promise<void> {
  await context.addInitScript((snapshot) => {
    try {
      sessionStorage.setItem("agent_platform.access_token", snapshot.accessToken);
      sessionStorage.setItem("agent_platform.refresh_token", snapshot.refreshToken);
      sessionStorage.setItem("agent_platform.user_id", snapshot.userId);
      sessionStorage.setItem("agent_platform.user_role", snapshot.userRole);
      sessionStorage.setItem("agent_platform.user_display_name", snapshot.displayName);
    } catch {
      // about:blank or restricted contexts may not expose sessionStorage.
    }
  }, {
    accessToken: auth.access_token,
    refreshToken: auth.refresh_token,
    userId: auth.user_id,
    userRole: auth.user_role ?? "user",
    displayName: `alice_${auth.user_id.slice(0, 6)}`,
  });
}

async function createUserSession(
  browser: Browser,
  baseURL: string,
  path: string,
  auth: LoginResponse,
) {
  const context = await browser.newContext();
  await seedUserSession(context, auth);

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

  return { context, baselinePage, appPage };
}

function bearerHeaders(auth: LoginResponse): Record<string, string> {
  return { Authorization: `Bearer ${auth.access_token}` };
}

async function fetchBillingSummary(baseURL: string, auth: LoginResponse): Promise<BillingSummary> {
  return fetchJson<BillingSummary>(baseURL, "/api/billing/summary", {
    headers: bearerHeaders(auth),
  });
}

async function createApiKeyFor(
  baseURL: string,
  auth: LoginResponse,
  name: string,
): Promise<CreatedApiKey> {
  return fetchJson<CreatedApiKey>(baseURL, "/api/user/api-keys", {
    method: "POST",
    headers: { ...bearerHeaders(auth), "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

async function createOrderFor(
  baseURL: string,
  auth: LoginResponse,
): Promise<CreatedOrder> {
  const created = await fetchJson<{ order: CreatedOrder }>(baseURL, "/api/billing/orders", {
    method: "POST",
    headers: { ...bearerHeaders(auth), "Content-Type": "application/json" },
    body: JSON.stringify({
      order_type: "new",
      plan_code: PAID_PLAN_CODE,
      billing_cycle: PAID_PLAN_CYCLE,
      idempotency_key: `alice-order-${Date.now()}`,
    }),
  });
  return created.order;
}

test.describe("Alice 一期验收", () => {
  test("注册即发放体验额度，费用页可见余额", async ({ browser, baseURL }) => {
    const auth = await registerEmailUser(baseURL!, "trial");
    const { context, baselinePage, appPage } = await createUserSession(browser, baseURL!, "/", auth);
    try {
      const summary = await fetchBillingSummary(baseURL!, auth);
      expect(summary.has_active_cycle).toBe(true);
      expect(summary.kind).toBe("trial");
      expect(summary.data_query_remaining).toBe(TRIAL_DATA_QUERY_REMAINING);
      expect(summary.research_report_remaining).toBe(TRIAL_RESEARCH_REPORT_REMAINING);

      await appPage.getByRole("button", { name: "用户中心" }).click();
      await expect(appPage.getByText("剩余 5 次")).toBeVisible();
      await expect(appPage.getByText("剩余 1 次")).toBeVisible();
    } finally {
      await closeSingleWindowSession(context, baselinePage, appPage);
    }
  });

  test("API&Skills：创建 Key 一次性展示明文密钥", async ({ browser, baseURL }) => {
    const auth = await registerEmailUser(baseURL!, "apikey");
    const { context, baselinePage, appPage } = await createUserSession(
      browser,
      baseURL!,
      "/settings/api-keys",
      auth,
    );
    try {
      await appPage.getByRole("button", { name: "生成 Key" }).click();
      await appPage.getByPlaceholder(/数据分析工作流/).fill(`e2e-key-${Date.now()}`);
      await appPage.getByRole("button", { name: "创建", exact: true }).click();

      await expect(appPage.getByText("API 密钥已创建")).toBeVisible({ timeout: 15000 });
      // 明文 Key 一次性展示
      await expect(appPage.getByText(/da_live_/)).toBeVisible();

      // 确认弹窗不再提供连通测试入口，点击完成关闭
      await expect(appPage.getByRole("button", { name: "测试连通" })).toHaveCount(0);
      await appPage.getByRole("button", { name: "完成" }).click();
      await expect(appPage.getByText("API 密钥已创建")).toHaveCount(0);
    } finally {
      await closeSingleWindowSession(context, baselinePage, appPage);
    }
  });

  test("报告模式创建 round 扣减调研报告权益", async ({ browser, baseURL }) => {
    test.setTimeout(240_000);
    const auth = await registerEmailUser(baseURL!, "report");
    const { context, baselinePage, appPage } = await createUserSession(browser, baseURL!, "/", auth);
    try {
      await appPage.getByTestId("task-composer-mode-trigger").click();
      await appPage.getByRole("button", { name: "报告模式" }).click();

      const message = `请调研美国市场蓝牙耳机竞品 ${Date.now()}`;
      await appPage.getByTestId("task-composer-textbox").click();
      await appPage.keyboard.type(message);
      await appPage.getByTestId("task-composer-submit").click();

      await expect(appPage).toHaveURL(/\/agent\?sessionId=/, { timeout: 60000 });

      // Web 报告模式在计划提交阶段预留 research_report，轮询费用摘要直至扣减
      await expect
        .poll(async () => (await fetchBillingSummary(baseURL!, auth)).research_report_remaining, {
          timeout: 180_000,
          message: "报告模式 round 未在期限内扣减调研报告权益",
        })
        .toBeLessThan(TRIAL_RESEARCH_REPORT_REMAINING);
    } finally {
      await closeSingleWindowSession(context, baselinePage, appPage);
    }
  });

  test("权益不足时外部 API 返回 402", async ({ request, baseURL }) => {
    const auth = await registerEmailUser(baseURL!, "quota");
    const key = await createApiKeyFor(baseURL!, auth, `e2e-quota-${Date.now()}`);

    try {
      // trial 周期仅 1 次调研报告；第一次预留成功，第二次必然 402
      const runBody = {
        task_type: "research_report",
        query: "调研美国市场蓝牙耳机竞品",
        market: "us",
        time_range: "2026-01-01~2026-06-30",
        fields: ["brand", "price"],
        output_format: "csv",
      };

      const first = await request.post(agentPlatformUrl(baseURL!, "/api/v1/runs"), {
        headers: {
          "X-API-Key": key.api_key,
          "Idempotency-Key": `alice-402-1-${Date.now()}`,
        },
        data: runBody,
      });
      expect(first.status()).toBe(202);

      const second = await request.post(agentPlatformUrl(baseURL!, "/api/v1/runs"), {
        headers: {
          "X-API-Key": key.api_key,
          "Idempotency-Key": `alice-402-2-${Date.now()}`,
        },
        data: runBody,
      });
      expect(second.status()).toBe(402);
      const body = await second.json();
      expect(body.error.code).toBe("entitlement_insufficient");
    } finally {
      await request.delete(agentPlatformUrl(baseURL!, `/api/user/api-keys/${key.key_id}`), {
        headers: bearerHeaders(auth),
      });
    }
  });

  test("人工开通全链路", async ({ browser, baseURL }) => {
    const auth = await registerEmailUser(baseURL!, "order");
    const order = await createOrderFor(baseURL!, auth);
    expect(order.status).toBe("created");

    // 管理员后台确认收款并开通
    const { context, baselinePage, appPage } = await createSingleWindowSession(
      browser,
      baseURL!,
      "/admin/orders",
    );
    try {
      const row = appPage.locator("tr").filter({ hasText: order.order_no });
      await expect(row).toBeVisible();
      await row.getByRole("button", { name: "确认收款" }).click();
      await expect(row.getByRole("button", { name: "开通" })).toBeVisible({ timeout: 15000 });
      await row.getByRole("button", { name: "开通" }).click();
      await expect(row.getByText("已开通")).toBeVisible({ timeout: 15000 });
    } finally {
      await closeSingleWindowSession(context, baselinePage, appPage);
    }

    // 用户费用摘要 = 套餐额度
    const summary = await fetchBillingSummary(baseURL!, auth);
    expect(summary.has_active_cycle).toBe(true);
    expect(summary.plan_code).toBe(PAID_PLAN_CODE);
    expect(summary.kind).toBe("purchased");

    const plans = await fetchJson<{ plans: PlanSpec[] }>(baseURL!, "/api/billing/plans", {
      headers: bearerHeaders(auth),
    });
    const paid = plans.plans.find((plan) => plan.code === PAID_PLAN_CODE);
    expect(paid).toBeTruthy();
    expect(summary.data_query_remaining).toBe(paid!.data_query_quota);
    expect(summary.research_report_remaining).toBe(paid!.research_report_quota);
  });

  test("个人中心名称与头像色持久化", async ({ browser, baseURL }) => {
    const auth = await registerEmailUser(baseURL!, "profile");
    const { context, baselinePage, appPage } = await createUserSession(browser, baseURL!, "/", auth);
    const newName = `艾丽丝_${Date.now()}`;
    const avatarColor = "#a855f7";
    try {
      await appPage.getByRole("button", { name: "用户中心" }).click();
      await appPage.getByRole("button", { name: "个人中心" }).click();

      const profileDialog = appPage.getByRole("dialog", { name: "个人资料" });
      await profileDialog.getByRole("button", { name: "编辑名称" }).click();
      await profileDialog.getByLabel("名称").fill(newName);
      await profileDialog.getByRole("button", { name: "完成", exact: true }).click();

      await profileDialog.getByRole("button", { name: `选择头像背景色 ${avatarColor}` }).click();

      // 刷新页面后断言持久化
      await appPage.reload();
      await appPage.getByRole("button", { name: "用户中心" }).click();
      await appPage.getByRole("button", { name: "个人中心" }).click();
      const reopenedDialog = appPage.getByRole("dialog", { name: "个人资料" });
      await expect(reopenedDialog.getByText(newName)).toBeVisible();
      await expect(
        reopenedDialog.getByRole("button", { name: `选择头像背景色 ${avatarColor}` }),
      ).toHaveAttribute("aria-pressed", "true");
    } finally {
      await closeSingleWindowSession(context, baselinePage, appPage);
    }
  });

  test("反馈自动携带定位信息", async ({ browser, baseURL }) => {
    const auth = await registerEmailUser(baseURL!, "feedback");
    const { context, baselinePage, appPage } = await createUserSession(browser, baseURL!, "/plans", auth);
    const message = `alice e2e feedback ${Date.now()}`;
    try {
      await appPage.getByRole("button", { name: "用户中心" }).click();
      await appPage.getByRole("button", { name: "问题反馈" }).click();
      await appPage.getByLabel("问题反馈内容").fill(message);
      await appPage.getByRole("button", { name: "提交反馈" }).click();
      await expect(appPage.getByText("感谢你的反馈")).toBeVisible({ timeout: 15000 });
    } finally {
      await closeSingleWindowSession(context, baselinePage, appPage);
    }

    // 后台断言 user_uuid 与 page_path 已自动携带
    const admin = await loginAsAdmin(baseURL!);
    const listed = await fetchJson<{
      entries: Array<{ id: string; user_uuid: string | null; page_path: string | null; message: string }>;
    }>(baseURL!, `/admin/feedback?page_path=${encodeURIComponent("/plans")}`, {
      headers: bearerHeaders(admin),
    });
    const entry = listed.entries.find((item) => item.message === message);
    expect(entry).toBeTruthy();
    expect(entry!.user_uuid).toBe(auth.user_id);
    expect(entry!.page_path).toBe("/plans");
    await markFeedbackFixtureHandled(baseURL!, entry!.id);
  });
});
