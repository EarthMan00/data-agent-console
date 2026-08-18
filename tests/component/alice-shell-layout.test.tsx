import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AliceShell, AliceShellRoot } from "@/components/alice-shell";

const push = vi.fn();
const replace = vi.fn();
const platformAgentMock = vi.hoisted(() => ({
  current: null as
    | {
        auth: { accessToken: string; displayName: string; userId: string };
        platformSessionId: string | null;
        withFreshToken: ReturnType<typeof vi.fn>;
        setActivePlatformSession: ReturnType<typeof vi.fn>;
        clearActivePlatformSession: ReturnType<typeof vi.fn>;
        openLogin: ReturnType<typeof vi.fn>;
      }
    | null,
}));
const agentApiMocks = vi.hoisted(() => ({
  listSessions: vi.fn(),
  listSessionMessages: vi.fn(),
  purgeSessionData: vi.fn(),
  parseFastApiDetail: vi.fn(),
}));
const localStorageMock = vi.hoisted(() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
});

vi.mock("next/navigation", () => ({
  usePathname: () => "/agent",
  useRouter: () => ({ push, replace }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/platform-agent-provider", () => ({
  useOptionalPlatformAgent: () => platformAgentMock.current,
}));

vi.mock("@/lib/agent-runtime", () => ({
  isPlatformBackendEnabled: () => true,
}));

vi.mock("@/lib/agent-api/client", () => ({
  AgentApiError: class AgentApiError extends Error {
    status = 500;
    body = null;
  },
  listSessions: agentApiMocks.listSessions,
  listSessionMessages: agentApiMocks.listSessionMessages,
  purgeSessionData: agentApiMocks.purgeSessionData,
  parseFastApiDetail: agentApiMocks.parseFastApiDetail,
}));

const billingMocks = vi.hoisted(() => ({
  fetchBillingSummary: vi.fn(),
  fetchEntitlementLedger: vi.fn(),
  fetchBillingOrders: vi.fn(),
  fetchUserPlans: vi.fn(),
  createBillingOrder: vi.fn(),
}));
const profileMocks = vi.hoisted(() => ({
  fetchProfile: vi.fn(),
  patchProfile: vi.fn(),
}));
const feedbackMocks = vi.hoisted(() => ({
  submitFeedback: vi.fn(),
}));

vi.mock("@/lib/agent-api/billing", () => ({
  fetchBillingSummary: billingMocks.fetchBillingSummary,
  fetchEntitlementLedger: billingMocks.fetchEntitlementLedger,
  fetchBillingOrders: billingMocks.fetchBillingOrders,
  fetchUserPlans: billingMocks.fetchUserPlans,
  createBillingOrder: billingMocks.createBillingOrder,
}));

vi.mock("@/lib/agent-api/profile", () => ({
  fetchProfile: profileMocks.fetchProfile,
  patchProfile: profileMocks.patchProfile,
}));

vi.mock("@/lib/agent-api/feedback", () => ({
  submitFeedback: feedbackMocks.submitFeedback,
}));

function mockMatchMedia(matchesByQuery: Record<string, boolean>) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: Boolean(matchesByQuery[query]),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

function renderShellWithResultPanel({ headerContentScrolled = false }: { headerContentScrolled?: boolean } = {}) {
  render(
    <AliceShellRoot>
      <AliceShell
        currentPath="/agent"
        contentScrollMode="child"
        currentRunLabel="测试任务"
        headerContentScrolled={headerContentScrolled}
        rightRail={<div data-testid="agent-preview-panel">任务执行结果</div>}
      >
        <div data-testid="chat-content">聊天内容</div>
      </AliceShell>
    </AliceShellRoot>,
  );
}

function session(sessionId: string, createdAt: string) {
  return {
    session_id: sessionId,
    status: "active",
    created_at: createdAt,
    last_active_at: createdAt,
    expires_at: "2026-07-20T00:00:00.000Z",
  };
}

describe("AliceShell right rail layout", () => {
  beforeEach(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: localStorageMock,
    });
    window.localStorage.clear();
    billingMocks.fetchBillingSummary.mockResolvedValue({
      has_active_cycle: true,
      plan_code: "paid_basic",
      plan_name: "基础版",
      cycle_status: "active",
      kind: "purchased",
      starts_at: "2026-08-01T00:00:00Z",
      ends_at: "2026-09-01T00:00:00Z",
      data_query_remaining: 65,
      research_report_remaining: 7,
    });
    billingMocks.fetchEntitlementLedger.mockResolvedValue({
      items: [
        { id: "ledger-1", entitlement_type: "data_query", delta: -1, source: "web", event_type: "consume", task_kind: "standard_query", created_at: "2026-08-16T10:00:00Z" },
        { id: "ledger-2", entitlement_type: "research_report", delta: -1, source: "web", event_type: "consume", task_kind: "research_report", created_at: "2026-08-15T10:00:00Z" },
      ],
      total: 2,
      page: 1,
      page_size: 10,
    });
    billingMocks.fetchBillingOrders.mockResolvedValue({
      orders: [
        { id: "order-1", order_no: "AL202608130001", order_type: "renew", plan_snapshot: { code: "paid_basic", name: "基础版", sale_price_cents: 15900 }, amount_cents: 15900, billing_cycle: "monthly", status: "paid", created_at: "2026-08-13T10:00:00Z" },
      ],
    });
    billingMocks.fetchUserPlans.mockResolvedValue({
      plans: [
        { code: "paid_basic", name: "基础版", billing_cycle: "monthly", catalog_price_cents: 19900, sale_price_cents: 15900, campaign_label: null, data_query_quota: 80, research_report_quota: 8 },
        { code: "paid_advanced", name: "高级版", billing_cycle: "monthly", catalog_price_cents: 39900, sale_price_cents: 31900, campaign_label: null, data_query_quota: 220, research_report_quota: 22 },
      ],
    });
    billingMocks.createBillingOrder.mockResolvedValue({
      order: {
        id: "order-1",
        order_no: "SO20260817001",
        order_type: "new",
        plan_snapshot: { code: "paid_basic", name: "基础版", sale_price_cents: 9900 },
        amount_cents: 9900,
        billing_cycle: "monthly",
        status: "created",
        created_at: "2026-08-17T00:00:00Z",
      },
    });
    profileMocks.fetchProfile.mockResolvedValue({
      username: "sensen",
      display_name: null,
      avatar_color: null,
      email: "sensen@example.com",
      phone: null,
      uuid: "sensen",
    });
    profileMocks.patchProfile.mockResolvedValue({ display_name: "Alice 用户", avatar_color: null });
    feedbackMocks.submitFeedback.mockResolvedValue({ id: "fb-1" });
  });

  afterEach(() => {
    platformAgentMock.current = null;
    vi.clearAllMocks();
    vi.useRealTimers();
    window.localStorage.clear();
  });

  it("keeps the desktop sidebar element aligned to the collapsed grid width", async () => {
    mockMatchMedia({
      "(max-width: 767px)": false,
      "(max-width: 1023px)": false,
    });
    renderShellWithResultPanel();

    fireEvent.click(await screen.findByRole("button", { name: "收起侧边栏" }));

    const sidebar = screen.getByRole("button", { name: "展开侧边栏" }).closest("aside");
    expect(sidebar).toHaveClass("md:!w-[var(--sidebar-width)]");
    expect(sidebar).toHaveClass("md:!max-w-[var(--sidebar-width)]");
  });

  it("renders task results in a drawer on mobile viewports", async () => {
    mockMatchMedia({
      "(max-width: 767px)": true,
      "(max-width: 1023px)": true,
    });
    renderShellWithResultPanel();

    const drawer = await screen.findByRole("dialog", { name: "任务执行结果抽屉" });
    expect(drawer).toContainElement(screen.getByTestId("agent-preview-panel"));
    expect(document.querySelector("main aside [data-testid='agent-preview-panel']")).not.toBeInTheDocument();
  });

  it("shows task results in the mobile result drawer on widths below the desktop breakpoint", async () => {
    mockMatchMedia({
      "(max-width: 767px)": false,
      "(max-width: 1023px)": true,
    });
    renderShellWithResultPanel();

    await waitFor(() => {
      expect(document.querySelector("main [data-testid='chat-content']")).toBeInTheDocument();
    });
    expect(document.querySelector("main [data-testid='agent-preview-panel']")).not.toBeInTheDocument();
    expect(document.querySelector("main aside [data-testid='agent-preview-panel']")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "查看任务执行结果" })).not.toBeInTheDocument();

    const drawer = await screen.findByRole("dialog", { name: "任务执行结果抽屉" });
    expect(drawer).toHaveClass("z-modal");
    expect(drawer).toContainElement(screen.getByTestId("agent-preview-panel"));
    expect(drawer).not.toContainElement(screen.getByTestId("chat-content"));
  });

  it("keeps task results in the desktop right rail above mobile breakpoint", async () => {
    mockMatchMedia({
      "(max-width: 767px)": false,
      "(max-width: 1023px)": false,
    });
    renderShellWithResultPanel();

    const grid = await screen.findByTestId("workspace-main-grid");
    expect(grid).toHaveClass("lg:grid-cols-[minmax(360px,1fr)_8px_minmax(0,760px)]");
    expect(grid).toHaveClass("overflow-hidden");
    expect(grid).not.toHaveClass("lg:grid-workspace-rail");
    const separator = screen.getByRole("separator", { name: "调整对话和结果宽度" });
    expect(separator).toBeInTheDocument();
    expect(separator).toHaveClass("bg-[#fff]");
    expect(separator.className).not.toContain("hover:bg-[rgba");
    expect(separator.className).not.toContain("bg-[rgba");
    await waitFor(() => {
      expect(document.querySelector("main aside [data-testid='agent-preview-panel']")).toBeInTheDocument();
    });
    const leftPane = screen.getByTestId("workspace-left-pane");
    const rightRail = screen.getByTestId("workspace-right-rail");
    const runHeader = screen.getByTestId("workspace-run-header");
    expect(leftPane).toContainElement(runHeader);
    expect(runHeader).not.toHaveClass("after:bg-[linear-gradient(180deg,#0f172a12,#0f172a00)]");
    expect(within(runHeader).getByText("测试任务")).toBeInTheDocument();
    expect(rightRail).not.toContainElement(runHeader);
    expect(document.querySelector('[data-testid="workspace-right-rail"]')).not.toHaveClass("lg:border-t");
    expect(rightRail).toHaveClass("bg-bg-surface");
    expect(rightRail).not.toHaveClass("backdrop-blur-xl");
    expect(document.querySelector("main > div > div [data-testid='agent-preview-panel']")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "任务执行结果抽屉" })).not.toBeInTheDocument();
  });

  it("adds a subtle header gradient when the left chat content has scrolled", async () => {
    mockMatchMedia({
      "(max-width: 767px)": false,
      "(max-width: 1023px)": false,
    });
    renderShellWithResultPanel({ headerContentScrolled: true });

    const runHeader = await screen.findByTestId("workspace-run-header");
    expect(runHeader).toHaveClass("after:bg-[linear-gradient(180deg,#0f172a12,#0f172a00)]");
  });

  it(
    "groups account, plan and support actions while moving API&Skills into the sidebar",
    { timeout: 20_000 },
    async () => {
    mockMatchMedia({
      "(max-width: 767px)": false,
      "(max-width: 1023px)": false,
    });
    platformAgentMock.current = {
      auth: { accessToken: "token", displayName: "sensen", userId: "sensen" },
      platformSessionId: null,
      withFreshToken: vi.fn(async (callback: (token: string) => Promise<unknown> | unknown) => callback("token")),
      setActivePlatformSession: vi.fn(),
      clearActivePlatformSession: vi.fn(),
      openLogin: vi.fn(),
    };
    agentApiMocks.listSessions.mockResolvedValue({ sessions: [], total: 0, page: 1, page_size: 20 });

    renderShellWithResultPanel();

    expect(await screen.findByRole("link", { name: "API&Skills" })).toHaveAttribute("href", "/settings/api-keys");
    fireEvent.click(screen.getByRole("button", { name: "用户中心" }));

    expect(await screen.findByText("基础版")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "当前套餐与可用次数" })).toHaveTextContent("数据查询剩余 65 次");
    expect(screen.getByRole("region", { name: "当前套餐与可用次数" })).toHaveTextContent("调研报告剩余 7 次");
    expect(screen.getByRole("link", { name: "帮助文档" })).toHaveAttribute("href", "/help");
    expect(screen.queryByText("暂未开通额度")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "升级套餐" }));
    expect(await screen.findByRole("heading", { name: "费用" })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("dialog", { name: "费用" }), { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "用户中心" }));
    fireEvent.click(screen.getByRole("button", { name: "个人中心" }));
    expect(await screen.findByRole("dialog", { name: "个人资料" })).toBeInTheDocument();
    expect(await screen.findByText("sensen@example.com")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "编辑名称" }));
    const nameInput = screen.getByRole("textbox", { name: "名称" });
    fireEvent.change(nameInput, { target: { value: "Alice 用户" } });
    fireEvent.keyDown(nameInput, { key: "Enter" });
    expect(await screen.findAllByText("Alice 用户")).toHaveLength(2);
    expect(screen.getByText("账号 UUID")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "费用" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "费用" }));
    expect(await screen.findByRole("heading", { name: "费用" })).toBeInTheDocument();
    expect(screen.getByText("套餐与账单")).toBeInTheDocument();
    expect(screen.getByText("额度明细")).toBeInTheDocument();
    expect(await screen.findByText("标准数据查询")).toBeInTheDocument();
    expect(screen.getByText("数据查询剩余")).toBeInTheDocument();
    expect(screen.getByText("调研报告剩余")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "权益" })).toBeInTheDocument();
    expect(screen.getAllByText("数据查询").length).toBeGreaterThan(0);
    expect(screen.getAllByText("调研报告").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "订单记录" }));
    expect(await screen.findByText("AL202608130001")).toBeInTheDocument();
    expect(screen.getByText("¥159.00")).toBeInTheDocument();
    expect(screen.getByText("待开通")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /订单记录/ }));
    expect(screen.getByText("基础版")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "续订" }));
    expect((await screen.findAllByText("¥159.00")).length).toBeGreaterThan(0);
    expect(screen.queryByText("套餐价 ¥199 · 优惠 ¥40")).not.toBeInTheDocument();
    expect(screen.getAllByText("省 20%").length).toBeGreaterThan(0);
    expect(screen.getByText("80 次数据查询")).toBeInTheDocument();
    expect(screen.getByText("8 次调研报告")).toBeInTheDocument();
    expect(screen.getByText("220 次数据查询")).toBeInTheDocument();
    expect(screen.getByText("22 次调研报告")).toBeInTheDocument();
    expect(screen.queryByText(/Alice 任务额度/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "继续支付" }));
    expect(await screen.findByRole("heading", { name: "订单已创建" })).toBeInTheDocument();
    expect(screen.getByText("SO20260817001")).toBeInTheDocument();
    expect(screen.getByText("¥99.00")).toBeInTheDocument();
    expect(screen.getByText("待付款")).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("dialog", { name: "订单已创建" }), { key: "Escape" });
    fireEvent.keyDown(screen.getByRole("dialog", { name: "费用" }), { key: "Escape" });

    fireEvent.click(screen.getByRole("button", { name: "用户中心" }));
    expect(screen.getByText("退出登录")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "问题反馈" }));
    expect(await screen.findByRole("dialog", { name: "问题反馈" })).toBeInTheDocument();
  });

  it("supports drag sorting history tasks in the sidebar", async () => {
    vi.useFakeTimers();
    mockMatchMedia({
      "(max-width: 767px)": false,
      "(max-width: 1023px)": false,
    });
    platformAgentMock.current = {
      auth: { accessToken: "token", displayName: "sensen", userId: "sensen" },
      platformSessionId: null,
      withFreshToken: vi.fn(async (callback: (token: string) => Promise<unknown> | unknown) => callback("token")),
      setActivePlatformSession: vi.fn(),
      clearActivePlatformSession: vi.fn(),
      openLogin: vi.fn(),
    };
    const titles: Record<string, string> = {
      "session-alpha": "Alpha task",
      "session-beta": "Beta task",
      "session-gamma": "Gamma task",
    };
    const messageTimes: Record<string, string> = {
      "session-alpha": "2026-06-20T10:00:00.000Z",
      "session-beta": "2026-06-20T09:00:00.000Z",
      "session-gamma": "2026-06-20T08:00:00.000Z",
    };
    agentApiMocks.listSessions.mockResolvedValue({
      sessions: [
        session("session-alpha", "2026-06-20T10:00:00.000Z"),
        session("session-beta", "2026-06-20T09:00:00.000Z"),
        session("session-gamma", "2026-06-20T08:00:00.000Z"),
      ],
      total: 3,
      page: 1,
      page_size: 20,
    });
    agentApiMocks.listSessionMessages.mockImplementation(async (_token: string, sessionId: string) => ({
      messages: [
        {
          id: `message-${sessionId}`,
          role: "user",
          content: titles[sessionId] ?? sessionId,
          created_at: messageTimes[sessionId] ?? "2026-06-20T00:00:00.000Z",
          message_index: 0,
        },
      ],
      has_more: false,
    }));

    renderShellWithResultPanel();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(950);
    });
    vi.useRealTimers();

    const list = await screen.findByTestId("sidebar-history-list");
    await waitFor(() => expect(within(list).getByText("Alpha task")).toBeInTheDocument());
    const orderedText = () =>
      within(list)
        .getAllByTestId("sidebar-history-item")
        .map((item) => item.textContent ?? "");
    expect(orderedText()[0]).toContain("Alpha task");
    expect(orderedText()[1]).toContain("Beta task");

    const alphaItem = within(list).getByText("Alpha task").closest("[data-testid='sidebar-history-item']");
    const betaItem = within(list).getByText("Beta task").closest("[data-testid='sidebar-history-item']");
    expect(alphaItem).toBeInstanceOf(HTMLElement);
    expect(betaItem).toBeInstanceOf(HTMLElement);
    Object.defineProperty(alphaItem as HTMLElement, "getBoundingClientRect", {
      value: () => ({
        top: 0,
        bottom: 40,
        left: 0,
        right: 260,
        width: 260,
        height: 40,
        x: 0,
        y: 0,
        toJSON: () => {},
      }),
    });
    const dataTransfer = {
      effectAllowed: "",
      dropEffect: "",
      setData: vi.fn(),
      getData: vi.fn(() => "session-beta"),
    };

    fireEvent.dragStart(betaItem as HTMLElement, { dataTransfer });
    fireEvent.dragOver(alphaItem as HTMLElement, { clientY: 1, dataTransfer });
    fireEvent.drop(alphaItem as HTMLElement, { clientY: 1, dataTransfer });

    await waitFor(() => {
      expect(within(list).getAllByTestId("sidebar-history-item")[0]).toHaveTextContent("Beta task");
    });
    expect(JSON.parse(window.localStorage.getItem("alice:history-order-overrides") || "[]")[0]).toBe("session-beta");
  });

  it("supports drag sorting history tasks in the sidebar", async () => {
    vi.useFakeTimers();
    mockMatchMedia({
      "(max-width: 767px)": false,
      "(max-width: 1023px)": false,
    });
    platformAgentMock.current = {
      auth: { accessToken: "token", displayName: "sensen", userId: "sensen" },
      platformSessionId: null,
      withFreshToken: vi.fn(async (callback: (token: string) => Promise<unknown> | unknown) => callback("token")),
      setActivePlatformSession: vi.fn(),
      clearActivePlatformSession: vi.fn(),
      openLogin: vi.fn(),
    };
    const titles: Record<string, string> = {
      "session-alpha": "Alpha task",
      "session-beta": "Beta task",
      "session-gamma": "Gamma task",
    };
    const messageTimes: Record<string, string> = {
      "session-alpha": "2026-06-20T10:00:00.000Z",
      "session-beta": "2026-06-20T09:00:00.000Z",
      "session-gamma": "2026-06-20T08:00:00.000Z",
    };
    agentApiMocks.listSessions.mockResolvedValue({
      sessions: [
        session("session-alpha", "2026-06-20T10:00:00.000Z"),
        session("session-beta", "2026-06-20T09:00:00.000Z"),
        session("session-gamma", "2026-06-20T08:00:00.000Z"),
      ],
      total: 3,
      page: 1,
      page_size: 20,
    });
    agentApiMocks.listSessionMessages.mockImplementation(async (_token: string, sessionId: string) => ({
      messages: [
        {
          id: `message-${sessionId}`,
          role: "user",
          content: titles[sessionId] ?? sessionId,
          created_at: messageTimes[sessionId] ?? "2026-06-20T00:00:00.000Z",
          message_index: 0,
        },
      ],
      has_more: false,
    }));

    renderShellWithResultPanel();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(950);
    });
    vi.useRealTimers();

    const list = await screen.findByTestId("sidebar-history-list");
    await waitFor(() => expect(within(list).getByText("Alpha task")).toBeInTheDocument());
    const orderedText = () =>
      within(list)
        .getAllByTestId("sidebar-history-item")
        .map((item) => item.textContent ?? "");
    expect(orderedText()[0]).toContain("Alpha task");
    expect(orderedText()[1]).toContain("Beta task");

    const alphaItem = within(list).getByText("Alpha task").closest("[data-testid='sidebar-history-item']");
    const betaItem = within(list).getByText("Beta task").closest("[data-testid='sidebar-history-item']");
    expect(alphaItem).toBeInstanceOf(HTMLElement);
    expect(betaItem).toBeInstanceOf(HTMLElement);
    Object.defineProperty(alphaItem as HTMLElement, "getBoundingClientRect", {
      value: () => ({
        top: 0,
        bottom: 40,
        left: 0,
        right: 260,
        width: 260,
        height: 40,
        x: 0,
        y: 0,
        toJSON: () => {},
      }),
    });
    const dataTransfer = {
      effectAllowed: "",
      dropEffect: "",
      setData: vi.fn(),
      getData: vi.fn(() => "session-beta"),
    };

    fireEvent.dragStart(betaItem as HTMLElement, { dataTransfer });
    fireEvent.dragOver(alphaItem as HTMLElement, { clientY: 1, dataTransfer });
    fireEvent.drop(alphaItem as HTMLElement, { clientY: 1, dataTransfer });

    await waitFor(() => {
      expect(within(list).getAllByTestId("sidebar-history-item")[0]).toHaveTextContent("Beta task");
    });
    expect(JSON.parse(window.localStorage.getItem("alice:history-order-overrides") || "[]")[0]).toBe("session-beta");
  });
});
