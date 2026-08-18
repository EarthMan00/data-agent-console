import { render } from "@testing-library/react";
import { vi } from "vitest";

import { AliceShell, AliceShellRoot } from "@/components/alice-shell";

export type PlatformAgentMock = {
  auth: { accessToken: string; displayName: string; userId: string };
  platformSessionId: string | null;
  withFreshToken: ReturnType<typeof vi.fn>;
  setActivePlatformSession: ReturnType<typeof vi.fn>;
  clearActivePlatformSession: ReturnType<typeof vi.fn>;
  openLogin: ReturnType<typeof vi.fn>;
};

export const push = vi.fn();
export const replace = vi.fn();

const platformAgentMock = vi.hoisted(() => ({
  current: null as PlatformAgentMock | null,
}));

const agentApiMocks = vi.hoisted(() => ({
  listSessions: vi.fn(),
  listSessionMessages: vi.fn(),
  purgeSessionData: vi.fn(),
  parseFastApiDetail: vi.fn(),
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

const searchParamsMock = vi.hoisted(() => ({
  value: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/agent",
  useRouter: () => ({ push, replace }),
  useSearchParams: () => searchParamsMock.value,
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

export function getPlatformAgentMock() {
  return platformAgentMock;
}

export function getBillingMocks() {
  return billingMocks;
}

export function getProfileMocks() {
  return profileMocks;
}

export function getFeedbackMocks() {
  return feedbackMocks;
}

export function setSearchParams(query: string) {
  searchParamsMock.value = new URLSearchParams(query);
}

export function mockMatchMedia(matchesByQuery: Record<string, boolean>) {
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

export function loggedInPlatformAgent(overrides: Partial<PlatformAgentMock> = {}): PlatformAgentMock {
  return {
    auth: { accessToken: "token", displayName: "sensen", userId: "sensen" },
    platformSessionId: null,
    withFreshToken: vi.fn(async (callback: (token: string) => Promise<unknown> | unknown) => callback("token")),
    setActivePlatformSession: vi.fn(),
    clearActivePlatformSession: vi.fn(),
    openLogin: vi.fn(),
    ...overrides,
  };
}

export function installDefaultApiMocks() {
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
      plan_snapshot: { code: "paid_basic", name: "基础版", sale_price_cents: 15900 },
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
    phone: "13800138000",
    uuid: "sensen",
  });
  profileMocks.patchProfile.mockResolvedValue({ display_name: "Alice 用户", avatar_color: null });
  feedbackMocks.submitFeedback.mockResolvedValue({ id: "fb-1" });
  agentApiMocks.listSessions.mockResolvedValue({ sessions: [], total: 0, page: 1, page_size: 20 });
  agentApiMocks.listSessionMessages.mockResolvedValue({ messages: [], total: 0, page: 1, page_size: 20 });
}

export function renderAliceShell(options: { searchParams?: string } = {}) {
  setSearchParams(options.searchParams ?? "");
  mockMatchMedia({
    "(max-width: 767px)": false,
    "(max-width: 1023px)": false,
  });
  return render(
    <AliceShellRoot>
      <AliceShell currentPath="/agent" contentScrollMode="child">
        <div data-testid="chat-content">会话内容</div>
      </AliceShell>
    </AliceShellRoot>,
  );
}
