import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MoreDataShell, MoreDataShellRoot } from "@/components/more-data-shell";

const push = vi.fn();
const replace = vi.fn();

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
  useOptionalPlatformAgent: () => null,
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

function renderShellWithResultPanel() {
  render(
    <MoreDataShellRoot>
      <MoreDataShell
        currentPath="/agent"
        contentScrollMode="child"
        currentRunLabel="测试任务"
        rightRail={<div data-testid="agent-preview-panel">任务执行结果</div>}
      >
        <div data-testid="chat-content">聊天内容</div>
      </MoreDataShell>
    </MoreDataShellRoot>,
  );
}

describe("MoreDataShell right rail layout", () => {
  afterEach(() => {
    vi.clearAllMocks();
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
    expect(grid).toHaveClass("lg:grid-cols-[minmax(360px,42%)_minmax(680px,58%)]");
    expect(grid).toHaveClass("overflow-hidden");
    expect(grid).not.toHaveClass("lg:grid-workspace-rail");
    await waitFor(() => {
      expect(document.querySelector("main aside [data-testid='agent-preview-panel']")).toBeInTheDocument();
    });
    expect(document.querySelector("main > div > div [data-testid='agent-preview-panel']")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "任务执行结果抽屉" })).not.toBeInTheDocument();
  });
});
