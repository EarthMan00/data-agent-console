import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AliceHomePage } from "@/components/alice-home-page";

const replace = vi.fn();
const mockSearchParams = vi.hoisted(() => new URLSearchParams());
const mockFetchHomePromptRecommendations = vi.hoisted(() => vi.fn());
const mockFetchPublicPromptCategories = vi.hoisted(() => vi.fn());
const mockListUserPromptGroups = vi.hoisted(() => vi.fn());
const mockListUserPrompts = vi.hoisted(() => vi.fn());
const mockCreateUserPrompt = vi.hoisted(() => vi.fn());
const mockAliceShellState = vi.hoisted(() => ({
  refreshHistoryNow: vi.fn(),
  setActiveSessionTitle: vi.fn(),
  upsertOptimisticHistorySession: vi.fn(),
}));
const mockPlatformAgent = vi.hoisted(() => ({
  current: null as null | {
    auth: null | { accessToken: string; userId?: string };
    authHydrated: boolean;
    authValidated: boolean;
    platformSessionId: null | string;
    openLogin: ReturnType<typeof vi.fn>;
    closeLogin: ReturnType<typeof vi.fn>;
    loginWithPassword: ReturnType<typeof vi.fn>;
    logout: ReturnType<typeof vi.fn>;
    beginNewHomeTaskSession: ReturnType<typeof vi.fn>;
    ensurePlatformSession: ReturnType<typeof vi.fn>;
    setActivePlatformSession: ReturnType<typeof vi.fn>;
    clearActivePlatformSession: ReturnType<typeof vi.fn>;
    withFreshToken: ReturnType<typeof vi.fn>;
  },
}));

vi.mock("@/components/agent-workspace", () => ({
  AgentWorkspace: () => <div>agent workspace</div>,
}));

vi.mock("@/components/ui/flickering-grid", () => ({
  FlickeringGrid: () => <div data-testid="flickering-grid" />,
}));

vi.mock("@/components/alice-shell", () => ({
  AliceShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
  useAliceShellState: () => mockAliceShellState,
}));

function createPlatformAgentMock(auth: null | { accessToken: string; userId?: string } = null) {
  return {
    auth,
    authHydrated: true,
    authValidated: true,
    platformSessionId: null,
    openLogin: vi.fn(),
    closeLogin: vi.fn(),
    loginWithPassword: vi.fn(),
    logout: vi.fn(),
    beginNewHomeTaskSession: vi.fn(),
    ensurePlatformSession: vi.fn(),
    setActivePlatformSession: vi.fn(),
    clearActivePlatformSession: vi.fn(),
    withFreshToken: vi.fn(async (run: (token: string) => Promise<unknown> | unknown) => run("fresh-token")),
  };
}

vi.mock("@/components/platform-agent-provider", () => ({
  useOptionalPlatformAgent: () => mockPlatformAgent.current,
}));

vi.mock("@/lib/agent-api/home-prompts", () => ({
  fetchHomePromptRecommendations: mockFetchHomePromptRecommendations,
  fetchPublicPromptCategories: mockFetchPublicPromptCategories,
}));

vi.mock("@/lib/agent-api/user-prompts", () => ({
  createUserPrompt: mockCreateUserPrompt,
  listUserPromptGroups: mockListUserPromptGroups,
  listUserPrompts: mockListUserPrompts,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace,
    push: vi.fn(),
  }),
  useSearchParams: () => mockSearchParams,
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

function renderHomePage() {
  return render(<AliceHomePage />);
}

describe("home flow", () => {
  beforeEach(() => {
    replace.mockClear();
    mockSearchParams.forEach((_, key) => mockSearchParams.delete(key));
    mockAliceShellState.refreshHistoryNow.mockClear();
    mockAliceShellState.setActiveSessionTitle.mockClear();
    mockAliceShellState.upsertOptimisticHistorySession.mockClear();
    mockPlatformAgent.current = createPlatformAgentMock();
    mockListUserPromptGroups.mockReset();
    mockListUserPrompts.mockReset();
    mockCreateUserPrompt.mockReset();
    mockListUserPromptGroups.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      page_size: 100,
    });
    mockListUserPrompts.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      page_size: 100,
    });
    mockFetchPublicPromptCategories.mockResolvedValue([
      { id: "scenarios", name: "应用场景", sort_order: 0 },
      { id: "keepa", name: "Keepa", sort_order: 1 },
      { id: "web", name: "实时与全网检索", sort_order: 2 },
      { id: "amazon", name: "亚马逊前台", sort_order: 3 },
      { id: "patent", name: "专利检索", sort_order: 4 },
    ]);
    const webCard = {
      id: "web-card",
      title: "站外评论洞察",
      description: "通过网页检索汇总站外评论。",
      prompt: "@实时与全网检索 搜索 Anker 评论",
      meta: "",
      capability_ids: ["站外实时信息检索"],
      replay_run_id: null,
      replay_share_id: null,
      sort_order: 1,
    };
    const excelCard = {
      id: "excel-card",
      title: "处理Excel新增列",
      description: "处理 Excel 新增列。",
      prompt: "@智能Excel处理 帮我处理excel，新增列：图片提示词",
      meta: "",
      capability_ids: ["@智能Excel处理"],
      replay_run_id: null,
      replay_share_id: null,
      sort_order: 2,
    };
    const metadataOnlyCard = {
      id: "metadata-only-card",
      title: "不含数据源标记的场景",
      description: "只通过 capability metadata 归类。",
      prompt: "努力思考，选择适合以下场景的工具，完美完成以下任务：查询这些 ASIN 的关键词表现。",
      meta: "",
      capability_ids: ["SIF-查询ASIN的关键词"],
      replay_run_id: null,
      replay_share_id: null,
      sort_order: 3,
    };
    const keepaCard = {
      id: "keepa-card",
      title: "Keepa 价格历史",
      description: "查看价格历史。",
      prompt: "Keepa-亚马逊价格历史 @Keepa-亚马逊价格历史，{{美国站}}，查询ASIN:{{B0D5MV1S5W}}，过去{{365天}}数据",
      meta: "",
      capability_ids: ["@Keepa-亚马逊价格历史"],
      replay_run_id: null,
      replay_share_id: null,
      sort_order: 2,
    };
    const keepaSearchCard = {
      id: "keepa-search-card",
      title: "Keepa 商品搜索",
      description: "搜索商品。",
      prompt: "@Keepa-亚马逊-商品搜索 查询商品",
      meta: "",
      capability_ids: ["Keepa-亚马逊-商品搜索"],
      replay_run_id: null,
      replay_share_id: null,
      sort_order: 3,
    };
    const amazonCard = {
      id: "amazon-card",
      title: "亚马逊前端搜索模拟",
      description: "模拟前台搜索。",
      prompt: "1、使用@亚马逊前端搜索这个工具：帮我在美国亚马逊站搜索 women's pullover sweater",
      meta: "",
      capability_ids: ["亚马逊前端搜索模拟"],
      replay_run_id: null,
      replay_share_id: null,
      sort_order: 4,
    };
    const patentAliasCard = {
      id: "patent-alias-card",
      title: "智慧芽专利摘要翻译",
      description: "查询专利摘要并翻译。",
      prompt: "@智慧芽-摘要翻译，查询专利公开号：CN306918247S 的摘要，翻译成英文",
      meta: "",
      capability_ids: ["@睿观-版权检测"],
      replay_run_id: null,
      replay_share_id: null,
      sort_order: 1,
    };
    mockFetchHomePromptRecommendations.mockImplementation((categoryId: string) => Promise.resolve({
      scenarios: [webCard, keepaCard, excelCard, metadataOnlyCard],
      keepa: [keepaCard, keepaSearchCard],
      web: [webCard],
      amazon: [amazonCard],
      patent: [patentAliasCard],
    }[categoryId] ?? []));
  });

  it("clears the home composer when returning from an active run", async () => {
    mockSearchParams.set("runId", "run-1");
    const { rerender } = renderHomePage();
    expect(screen.getByText("agent workspace")).toBeInTheDocument();

    mockSearchParams.delete("runId");
    rerender(<AliceHomePage />);

    const editor = await screen.findByTestId("task-composer-editor");
    expect(editor.textContent?.trim()).toBe("");
  });

  it("keeps prompt cards stable when selecting datasource tokens", async () => {
    renderHomePage();

    await screen.findByLabelText("使用示例任务 站外评论洞察");
    const initialCount = screen.getAllByLabelText(/^使用示例任务 /).length;
    const editor = screen.getByTestId("task-composer-editor");
    await userEvent.click(editor);
    await userEvent.type(editor, "@");

    const mentionMenu = await screen.findByTestId("task-composer-mention-menu");
    const option = within(mentionMenu).getByRole("option", { name: /Keepa-亚马逊-商品搜索/ });
    fireEvent.click(option);

    await waitFor(() => {
      expect(screen.getByLabelText("数据源 Keepa-亚马逊-商品搜索")).toBeInTheDocument();
    });
    expect(screen.getAllByLabelText(/^使用示例任务 /)).toHaveLength(initialCount);
  });

  it("switches prompt cards when selecting a browse category", async () => {
    renderHomePage();

    await screen.findByLabelText("使用示例任务 站外评论洞察");

    fireEvent.click(screen.getByRole("button", { name: /^Keepa$/ }));
    await waitFor(() => {
      expect(screen.getByLabelText("使用示例任务 Keepa 价格历史")).toBeInTheDocument();
    });
    expect(screen.queryByLabelText("使用示例任务 站外评论洞察")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /实时与全网检索/ }));
    await waitFor(() => {
      expect(screen.getByLabelText("使用示例任务 站外评论洞察")).toBeInTheDocument();
    });
    expect(screen.queryByLabelText("使用示例任务 Keepa 价格历史")).not.toBeInTheDocument();
  });

  it("keeps the selected category active after applying a visible prompt card", async () => {
    renderHomePage();

    const keepaCategory = await screen.findByRole("button", { name: /^Keepa$/ });
    fireEvent.click(keepaCategory);
    expect(keepaCategory).toHaveClass("text-foreground");

    fireEvent.click(await screen.findByLabelText("使用示例任务 Keepa 价格历史"));

    expect(keepaCategory).toHaveClass("text-foreground");
    const editor = screen.getByTestId("task-composer-editor");
    const sourceTag = screen.getByLabelText("数据源 Keepa-亚马逊价格历史");
    const templateSlots = Array.from(editor.querySelectorAll<HTMLElement>("[data-template-slot='true']"));
    const childSummary = Array.from(editor.childNodes).map((node) => {
      if (node.nodeType === Node.TEXT_NODE) return { type: "text", text: node.textContent ?? "" };
      const element = node as HTMLElement;
      return { type: "tag", sourceId: element.dataset.toolId ?? "", text: element.textContent ?? "" };
    });
    const sourceTagIndex = childSummary.findIndex((item) => item.type === "tag" && item.sourceId === "keepa-price-history");
    const textBeforeSourceTag = childSummary.slice(0, sourceTagIndex).map((item) => item.text).join("");

    expect(sourceTag).toBeInTheDocument();
    expect(sourceTag).toHaveAttribute("data-tool-id", "keepa-price-history");
    expect(sourceTagIndex).toBeGreaterThan(0);
    expect(textBeforeSourceTag).toBe("Keepa-亚马逊价格历史 ");
    expect(templateSlots.map((slot) => slot.textContent)).toEqual(["美国站", "B0D5MV1S5W", "365天"]);
    expect(editor.textContent).not.toContain("{{");
    expect(editor.textContent).not.toContain("}}");
    expect(editor).not.toHaveTextContent("@Keepa-亚马逊价格历史");
    expect(editor).not.toHaveTextContent("按 Tab 键补全");
  });

  it("applies a prompt-library prompt into the composer with datasource tokens and variable slots", async () => {
    mockPlatformAgent.current = createPlatformAgentMock({ accessToken: "access-token", userId: "user-1" });
    mockListUserPromptGroups.mockResolvedValue({
      items: [
        { id: "group-keepa", name: "Keepa", created_at: "2026-06-01T00:00:00Z", updated_at: "2026-06-01T00:00:00Z" },
      ],
      total: 1,
      page: 1,
      page_size: 100,
    });
    mockListUserPrompts.mockResolvedValue({
      items: [
        {
          id: "prompt-keepa-history",
          group_id: "group-keepa",
          group_name: "Keepa",
          title: "Keepa 价格历史模板",
          description: "从提示词库插入数据源与变量",
          prompt_text: "Keepa-亚马逊价格历史 @Keepa-亚马逊价格历史，{{美国站}}，查询ASIN:{{B0D5MV1S5W}}，过去{{365天}}数据",
          created_at: "2026-06-01T00:00:00Z",
          updated_at: "2026-06-01T00:00:00Z",
        },
      ],
      total: 1,
      page: 1,
      page_size: 100,
    });

    renderHomePage();
    await screen.findByLabelText("使用示例任务 Keepa 价格历史");

    fireEvent.click(screen.getByRole("button", { name: "提示词库" }));
    expect(await screen.findByPlaceholderText("搜索提示词")).toBeInTheDocument();
    await userEvent.click(await screen.findByRole("option", { name: "使用提示词 Keepa 价格历史模板" }));

    const editor = screen.getByTestId("task-composer-editor");
    const sourceTag = await screen.findByLabelText("数据源 Keepa-亚马逊价格历史");
    const templateSlots = Array.from(editor.querySelectorAll<HTMLElement>("[data-template-slot='true']"));

    expect(sourceTag).toBeInTheDocument();
    expect(sourceTag).toHaveAttribute("data-tool-id", "keepa-price-history");
    expect(templateSlots.map((slot) => slot.textContent)).toEqual(["美国站", "B0D5MV1S5W", "365天"]);
    expect(editor).toHaveTextContent("Keepa-亚马逊价格历史");
    expect(editor.textContent).not.toContain("{{");
    expect(editor.textContent).not.toContain("}}");
    expect(editor).not.toHaveTextContent("@Keepa-亚马逊价格历史");
    expect(editor).not.toHaveTextContent("按 Tab 键补全");
    expect(mockListUserPrompts).toHaveBeenCalledWith("fresh-token", { page: 1, page_size: 100 });
  });

  it("applies a sample task directly into the composer", async () => {
    renderHomePage();

    fireEvent.click(await screen.findByLabelText("使用示例任务 站外评论洞察"));

    await waitFor(() => {
      expect(screen.getByText("搜索 Anker 评论")).toBeInTheDocument();
    });
    expect(screen.getByLabelText("数据源 站外实时信息检索")).toBeInTheDocument();
  });

  it("does not create a datasource tag from capability metadata when the prompt has no @ mention", async () => {
    renderHomePage();

    fireEvent.click(await screen.findByLabelText("使用示例任务 不含数据源标记的场景"));

    const editor = screen.getByTestId("task-composer-editor");
    expect(editor).toHaveTextContent("努力思考，选择适合以下场景的工具");
    expect(editor.querySelector("[data-tool-token='true']")).toBeNull();
    expect(editor).not.toHaveTextContent("@SIF-查询ASIN的关键词");
  });

  it("matches datasource mentions that only appear in scenario prompt cards", async () => {
    renderHomePage();

    await waitFor(() => {
      expect(mockFetchHomePromptRecommendations).toHaveBeenCalledWith("patent", undefined);
    });
    fireEvent.click(await screen.findByLabelText("使用示例任务 处理Excel新增列"));

    const editor = screen.getByTestId("task-composer-editor");
    expect(screen.getByLabelText("数据源 智能Excel处理")).toBeInTheDocument();
    expect(editor).not.toHaveTextContent("@智能Excel处理");
  });

  it("creates datasource tags for prompt aliases missing from capability metadata", async () => {
    renderHomePage();

    fireEvent.click(await screen.findByRole("button", { name: /专利检索/ }));
    await waitFor(() => {
      expect(mockFetchHomePromptRecommendations).toHaveBeenCalledWith("patent", undefined);
    });
    fireEvent.click(await screen.findByLabelText("使用示例任务 智慧芽专利摘要翻译"));

    const editor = screen.getByTestId("task-composer-editor");
    expect(screen.getByLabelText("数据源 智慧芽-摘要翻译")).toBeInTheDocument();
    expect(editor).not.toHaveTextContent("@智慧芽-摘要翻译");
    expect(editor.textContent?.startsWith("睿观-版权检测")).toBe(false);
  });

  it("turns prompt card @ datasource aliases into selected tools", async () => {
    renderHomePage();

    fireEvent.click(await screen.findByRole("button", { name: /亚马逊前台/ }));
    fireEvent.click(await screen.findByLabelText("使用示例任务 亚马逊前端搜索模拟"));

    let editor = screen.getByTestId("task-composer-editor");
    await waitFor(() => {
      expect(editor.textContent).toContain("1、使用亚马逊前端搜索模拟这个工具");
    });
    editor = screen.getByTestId("task-composer-editor");
    expect(editor.textContent).toContain("1、使用亚马逊前端搜索模拟这个工具");
    expect(editor.textContent?.startsWith("亚马逊前端搜索模拟")).toBe(false);
    expect(editor).not.toHaveTextContent("@亚马逊前端搜索");
    const sourceTag = screen.getByLabelText("数据源 亚马逊前端搜索模拟");
    expect(sourceTag).toBeInTheDocument();
    expect(sourceTag).toHaveTextContent("亚马逊前端搜索模拟");
    expect(sourceTag).toHaveClass("bg-bg-surface", "text-foreground");
    expect(sourceTag.className).not.toContain("arcoblue");
  });
});
