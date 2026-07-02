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

  it("keeps chat in the main pane and shows task results in a right drawer on compact tablet widths", async () => {
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

    fireEvent.click(screen.getByRole("button", { name: "查看任务执行结果" }));

    const drawer = await screen.findByRole("dialog", { name: "任务执行结果" });
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
