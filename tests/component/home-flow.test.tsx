import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MoreDataHomePage } from "@/components/more-data-home-page";
import { MoreDataShellStateProvider } from "@/components/more-data-shell";

const replace = vi.fn();
const homePromptApiMocks = vi.hoisted(() => ({
  fetchHomePromptRecommendations: vi.fn(),
  fetchPublicPromptCategories: vi.fn(),
}));

const platformAgentMock = vi.hoisted(() => ({
  auth: null,
  authHydrated: true,
  authValidated: false,
  platformSessionId: null,
  openLogin: vi.fn(),
  closeLogin: vi.fn(),
  loginWithPassword: vi.fn(),
  logout: vi.fn(),
  beginNewHomeTaskSession: vi.fn(),
  ensurePlatformSession: vi.fn(),
  setActivePlatformSession: vi.fn(),
  clearActivePlatformSession: vi.fn(),
  withFreshToken: vi.fn(),
}));

vi.mock("@/components/agent-workspace", () => ({
  AgentWorkspace: () => <div>agent workspace</div>,
}));

vi.mock("@/components/ui/flickering-grid", () => ({
  FlickeringGrid: () => <div data-testid="flickering-grid" />,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace,
    push: vi.fn(),
  }),
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
  useOptionalPlatformAgent: () => platformAgentMock,
}));

vi.mock("@/lib/agent-api/home-prompts", () => ({
  fetchHomePromptRecommendations: homePromptApiMocks.fetchHomePromptRecommendations,
  fetchPublicPromptCategories: homePromptApiMocks.fetchPublicPromptCategories,
}));

function renderHomePage() {
  return render(
    <MoreDataShellStateProvider>
      <MoreDataHomePage />
    </MoreDataShellStateProvider>,
  );
}

describe("home flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    homePromptApiMocks.fetchPublicPromptCategories.mockResolvedValue([
      { id: "cat-scenarios", name: "应用场景", sort_order: 1 },
    ]);
    homePromptApiMocks.fetchHomePromptRecommendations.mockResolvedValue([
      {
        id: "card-1",
        title: "竞品 ASIN 流量词库",
        description: "利用 SIF 工具调取目标 ASIN 的核心流量词库",
        prompt: "@Keepa 请分析竞品 ASIN 的流量词库",
        meta: "",
        capability_ids: ["Keepa"],
        replay_run_id: null,
        replay_share_id: null,
        sort_order: 1,
      },
      {
        id: "card-2",
        title: "关键词市场供需比",
        description: "通过计算关键词月搜索量与竞品存量比，构建供需价值模型",
        prompt: "@Sif数据分析工具 请计算关键词市场供需比",
        meta: "",
        capability_ids: ["Sif数据分析工具"],
        replay_run_id: null,
        replay_share_id: null,
        sort_order: 2,
      },
    ]);
  });

  it("keeps prompt cards stable when selecting datasource tokens", async () => {
    renderHomePage();

    const initialCount = (await screen.findAllByLabelText(/^使用示例任务 /)).length;
    const editor = screen.getByTestId("task-composer-editor");
    editor.textContent = "@";
    fireEvent.input(editor);

    const mentionMenu = await screen.findByTestId("task-composer-mention-menu");
    const option = within(mentionMenu).getByRole("option", { name: /Keepa-亚马逊-商品搜索/ });
    fireEvent.pointerDown(option);

    await waitFor(() => {
      expect(screen.getByLabelText("移除数据源 Keepa-亚马逊-商品搜索")).toBeInTheDocument();
    });
    expect(screen.getAllByLabelText(/^使用示例任务 /)).toHaveLength(initialCount);
  });

  it("applies a sample task to the composer", async () => {
    renderHomePage();

    fireEvent.click((await screen.findAllByLabelText(/^使用示例任务 /))[0]);

    await waitFor(() => {
      expect(screen.getByTestId("task-composer-editor")).toHaveTextContent("请分析竞品 ASIN 的流量词库");
    });
    expect(screen.getByText("已载入示例任务「竞品 ASIN 流量词库」，可继续补充要求后发送。")).toBeInTheDocument();
  });
});
