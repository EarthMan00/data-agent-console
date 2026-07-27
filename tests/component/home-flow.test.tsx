import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
const mockCreateInitialChatRound = vi.hoisted(() => vi.fn());
const mockSafeRandomUUID = vi.hoisted(() => vi.fn(() => "a62430bc-1417-4b95-9432-937b331a7d7a"));
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
    setActivePlatformSession: ReturnType<typeof vi.fn>;
    clearActivePlatformSession: ReturnType<typeof vi.fn>;
    withFreshToken: ReturnType<typeof vi.fn>;
  },
}));

vi.mock("@/components/agent-workspace", () => ({
  AgentWorkspace: () => <div>agent workspace</div>,
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
    setActivePlatformSession: vi.fn(),
    clearActivePlatformSession: vi.fn(),
    withFreshToken: vi.fn(async (run: (token: string) => Promise<unknown> | unknown) => run("fresh-token")),
  };
}

type TestLoginContinuation = {
  onAuthenticated: () => void;
  onCancelled: () => void;
};

function installReplacingLoginLifecycle(agent: ReturnType<typeof createPlatformAgentMock>) {
  const installed: TestLoginContinuation[] = [];
  let current: TestLoginContinuation | null = null;
  agent.openLogin.mockImplementation((_banner: string, continuation: TestLoginContinuation) => {
    const previous = current;
    current = continuation;
    installed.push(continuation);
    previous?.onCancelled();
  });
  return installed;
}

vi.mock("@/components/platform-agent-provider", () => ({
  useOptionalPlatformAgent: () => mockPlatformAgent.current,
}));

vi.mock("@/lib/agent-api/chat-rounds", () => ({
  createInitialChatRound: mockCreateInitialChatRound,
}));

vi.mock("@/lib/random-uuid", () => ({
  safeRandomUUID: mockSafeRandomUUID,
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

vi.mock("@/lib/agent-runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agent-runtime")>();
  return {
    ...actual,
    isAgentRuntimeConfigured: () => true,
    isPlatformBackendEnabled: () => true,
  };
});

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
    sessionStorage.clear();
    replace.mockClear();
    mockSearchParams.forEach((_, key) => mockSearchParams.delete(key));
    mockAliceShellState.refreshHistoryNow.mockClear();
    mockAliceShellState.setActiveSessionTitle.mockClear();
    mockAliceShellState.upsertOptimisticHistorySession.mockClear();
    mockPlatformAgent.current = createPlatformAgentMock();
    mockListUserPromptGroups.mockReset();
    mockListUserPrompts.mockReset();
    mockCreateUserPrompt.mockReset();
    mockCreateInitialChatRound.mockReset();
    mockSafeRandomUUID.mockClear();
    mockCreateInitialChatRound.mockResolvedValue({
      session_id: "f4159ee9-c863-41c8-9c1b-ffbfa193917f",
      round_id: "3da8ff9a-95e2-4f9e-9788-7fda3d450fe7",
      assistant_message_id: "46aa60a5-64dd-471d-adfe-9856a3ee17c5",
      status: "QUEUED",
      last_event_seq: 1,
    });
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
    const mixedMetadataCard = {
      id: "mixed-metadata-card",
      title: "最后一个工具来自元数据",
      description: "prompt 已经有一个 @，最后一个工具只在 capability metadata。",
      prompt: "@Keepa-亚马逊价格历史 查询价格历史后，再模拟前台搜索。",
      meta: "",
      capability_ids: ["@Keepa-亚马逊价格历史", "亚马逊前端搜索模拟"],
      replay_run_id: null,
      replay_share_id: null,
      sort_order: 4,
    };
    const parentMetadataCard = {
      id: "parent-metadata-card",
      title: "分组能力补全",
      description: "metadata 给的是分组标题，也要补成真实数据源。",
      prompt: "@亚马逊-商品评论 先看评论，再继续做前台搜索。",
      meta: "",
      capability_ids: ["@亚马逊-商品评论", "亚马逊前台"],
      replay_run_id: null,
      replay_share_id: null,
      sort_order: 5,
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
      scenarios: [webCard, keepaCard, excelCard, metadataOnlyCard, mixedMetadataCard, parentMetadataCard],
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

  it("renders readable greeting and placeholder copy on a fresh home page", async () => {
    renderHomePage();

    expect(
      await screen.findByText(/早上好，有什么可以帮你的吗？|下午好，准备好创建点什么了吗？|晚上好，需要什么帮助吗？|还在忙？我可以帮你。/),
    ).toBeInTheDocument();
    expect(screen.queryByText("你的跨境数据运营搭档，24h 随时在线")).not.toBeInTheDocument();
    const placeholder = screen.getByText("需要分析亚马逊的流量来源？试试 @Sif-亚马逊 流量来源分析。");
    expect(placeholder).toBeInTheDocument();
    expect(placeholder).toHaveClass("right-2", "whitespace-pre-wrap", "break-words");
    expect(placeholder).not.toHaveClass("truncate");
    expect(placeholder).not.toHaveClass("max-w-lg");
    expect(screen.queryByText(/\\u9700\\u8981/)).not.toBeInTheDocument();
    expect(screen.queryByText(/浣犵殑/)).not.toBeInTheDocument();
  });

  it("swaps the default greeting token on hover and restores it on leave", async () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.2);

    try {
      renderHomePage();

      const greetingSwitch = await screen.findByTestId("home-greeting-switch");
      expect(screen.getByText("朋友")).toBeInTheDocument();
      expect(screen.getByText("👋")).toBeInTheDocument();

      fireEvent.mouseEnter(greetingSwitch);
      expect(screen.getByText("(⌐■_■)")).toBeInTheDocument();
      expect(screen.queryByText("👋")).not.toBeInTheDocument();

      fireEvent.mouseLeave(greetingSwitch);
      expect(screen.getByText("朋友")).toBeInTheDocument();
      expect(screen.getByText("👋")).toBeInTheDocument();
    } finally {
      randomSpy.mockRestore();
    }
  });

  it("creates one initial Round before selecting history and navigating", async () => {
    mockPlatformAgent.current = createPlatformAgentMock({ accessToken: "access-token", userId: "user-1" });
    let acceptRound!: (value: {
      session_id: string;
      round_id: string;
      assistant_message_id: string;
      status: string;
      last_event_seq: number;
    }) => void;
    mockCreateInitialChatRound.mockReturnValueOnce(new Promise((resolve) => {
      acceptRound = resolve;
    }));

    renderHomePage();

    const editor = await screen.findByTestId("task-composer-editor");
    await userEvent.click(editor);
    await userEvent.type(editor, "分析 cup 的前三爆品");
    await userEvent.click(screen.getByTestId("task-composer-submit"));

    await waitFor(() => {
      expect(mockCreateInitialChatRound).toHaveBeenCalledWith(
        "fresh-token",
        "分析 cup 的前三爆品",
        "a62430bc-1417-4b95-9432-937b331a7d7a",
        [],
      );
    });
    expect(mockCreateInitialChatRound).toHaveBeenCalledTimes(1);
    expect(mockSafeRandomUUID).toHaveBeenCalledTimes(1);
    expect(mockAliceShellState.upsertOptimisticHistorySession).not.toHaveBeenCalled();
    expect(mockPlatformAgent.current?.setActivePlatformSession).not.toHaveBeenCalled();
    expect(mockAliceShellState.refreshHistoryNow).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();

    acceptRound({
      session_id: "f4159ee9-c863-41c8-9c1b-ffbfa193917f",
      round_id: "3da8ff9a-95e2-4f9e-9788-7fda3d450fe7",
      assistant_message_id: "46aa60a5-64dd-471d-adfe-9856a3ee17c5",
      status: "QUEUED",
      last_event_seq: 1,
    });

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/agent?sessionId=f4159ee9-c863-41c8-9c1b-ffbfa193917f");
    });
    expect(mockAliceShellState.upsertOptimisticHistorySession).toHaveBeenCalledWith(
      "f4159ee9-c863-41c8-9c1b-ffbfa193917f",
    );
    expect(mockPlatformAgent.current?.setActivePlatformSession).toHaveBeenCalledWith(
      "f4159ee9-c863-41c8-9c1b-ffbfa193917f",
    );
    expect(mockAliceShellState.refreshHistoryNow).toHaveBeenCalled();
  });

  it("continues the login-first handoff with exactly one initial Round", async () => {
    const view = renderHomePage();
    const editor = await screen.findByTestId("task-composer-editor");
    await userEvent.click(editor);
    await userEvent.type(editor, "登录后分析库存");
    await userEvent.click(screen.getByTestId("task-composer-submit"));

    expect(mockPlatformAgent.current?.openLogin).toHaveBeenCalledTimes(1);
    expect(mockCreateInitialChatRound).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("alice:pending-home-task-after-login")).toBeNull();

    const continuation = mockPlatformAgent.current?.openLogin.mock.calls[0]?.[1] as
      | { onAuthenticated: () => void; onCancelled: () => void }
      | undefined;
    expect(continuation).toEqual({
      onAuthenticated: expect.any(Function),
      onCancelled: expect.any(Function),
    });

    mockPlatformAgent.current = createPlatformAgentMock({ accessToken: "access-token", userId: "user-1" });
    act(() => continuation?.onAuthenticated());
    view.rerender(<AliceHomePage />);

    await waitFor(() => expect(mockCreateInitialChatRound).toHaveBeenCalledTimes(1));
    expect(mockCreateInitialChatRound).toHaveBeenCalledWith(
      "fresh-token",
      "登录后分析库存",
      "a62430bc-1417-4b95-9432-937b331a7d7a",
      [],
    );
    await waitFor(() => expect(replace).toHaveBeenCalledTimes(1));
  });

  it("launches only the latest homepage request when login continuation replacement cancels the previous one", async () => {
    const unauthenticatedAgent = createPlatformAgentMock();
    const continuations = installReplacingLoginLifecycle(unauthenticatedAgent);
    mockPlatformAgent.current = unauthenticatedAgent;
    const view = renderHomePage();
    const editor = await screen.findByTestId("task-composer-editor");

    await userEvent.click(editor);
    await userEvent.type(editor, "request A");
    await userEvent.click(screen.getByTestId("task-composer-submit"));
    await userEvent.clear(editor);
    await userEvent.type(editor, "request B");
    await userEvent.click(screen.getByTestId("task-composer-submit"));

    expect(continuations).toHaveLength(2);
    expect(mockCreateInitialChatRound).not.toHaveBeenCalled();
    act(() => continuations[1]?.onAuthenticated());
    mockPlatformAgent.current = createPlatformAgentMock({ accessToken: "access-token", userId: "user-1" });
    view.rerender(<AliceHomePage />);

    await waitFor(() => expect(mockCreateInitialChatRound).toHaveBeenCalledTimes(1));
    expect(mockCreateInitialChatRound).toHaveBeenCalledWith(
      "fresh-token",
      "request B",
      "a62430bc-1417-4b95-9432-937b331a7d7a",
      [],
    );
  });

  it("does not let a stale authenticated continuation activate the replacement request", async () => {
    const unauthenticatedAgent = createPlatformAgentMock();
    const continuations = installReplacingLoginLifecycle(unauthenticatedAgent);
    mockPlatformAgent.current = unauthenticatedAgent;
    const view = renderHomePage();
    const editor = await screen.findByTestId("task-composer-editor");

    await userEvent.click(editor);
    await userEvent.type(editor, "request A");
    await userEvent.click(screen.getByTestId("task-composer-submit"));
    await userEvent.clear(editor);
    await userEvent.type(editor, "request B");
    await userEvent.click(screen.getByTestId("task-composer-submit"));

    expect(continuations).toHaveLength(2);
    act(() => continuations[0]?.onAuthenticated());
    mockPlatformAgent.current = createPlatformAgentMock({ accessToken: "access-token", userId: "user-1" });
    view.rerender(<AliceHomePage />);
    await waitFor(() => expect(screen.getByTestId("task-composer-editor")).toBeInTheDocument());
    expect(mockCreateInitialChatRound).not.toHaveBeenCalled();

    act(() => continuations[1]?.onAuthenticated());
    await waitFor(() => expect(mockCreateInitialChatRound).toHaveBeenCalledTimes(1));
    expect(mockCreateInitialChatRound.mock.calls[0]?.[1]).toBe("request B");
  });

  it("does not launch the replacement homepage request after its own continuation is cancelled", async () => {
    const unauthenticatedAgent = createPlatformAgentMock();
    const continuations = installReplacingLoginLifecycle(unauthenticatedAgent);
    mockPlatformAgent.current = unauthenticatedAgent;
    const view = renderHomePage();
    const editor = await screen.findByTestId("task-composer-editor");

    await userEvent.click(editor);
    await userEvent.type(editor, "request A");
    await userEvent.click(screen.getByTestId("task-composer-submit"));
    await userEvent.clear(editor);
    await userEvent.type(editor, "request B");
    await userEvent.click(screen.getByTestId("task-composer-submit"));

    expect(continuations).toHaveLength(2);
    act(() => continuations[1]?.onCancelled());
    mockPlatformAgent.current = createPlatformAgentMock({ accessToken: "access-token", userId: "user-1" });
    view.rerender(<AliceHomePage />);

    await waitFor(() => expect(screen.getByTestId("task-composer-editor")).toBeInTheDocument());
    expect(mockCreateInitialChatRound).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("revokes the pending homepage intent when login is cancelled", async () => {
    const view = renderHomePage();
    const editor = await screen.findByTestId("task-composer-editor");
    await userEvent.click(editor);
    await userEvent.type(editor, "取消后不得发送");
    await userEvent.click(screen.getByTestId("task-composer-submit"));

    const continuation = mockPlatformAgent.current?.openLogin.mock.calls[0]?.[1] as
      | { onAuthenticated: () => void; onCancelled: () => void }
      | undefined;
    expect(continuation?.onCancelled).toEqual(expect.any(Function));
    act(() => continuation?.onCancelled());

    mockPlatformAgent.current = createPlatformAgentMock({ accessToken: "later-token", userId: "later-user" });
    view.rerender(<AliceHomePage />);

    await waitFor(() => expect(screen.getByTestId("task-composer-editor")).toBeInTheDocument());
    expect(mockCreateInitialChatRound).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("serializes visible datasource tags into the initial Round message", async () => {
    mockPlatformAgent.current = createPlatformAgentMock({ accessToken: "access-token", userId: "user-1" });
    renderHomePage();

    fireEvent.click(await screen.findByLabelText("使用示例任务 站外评论洞察"));
    expect(screen.getByLabelText("数据源 站外实时信息检索")).toBeInTheDocument();
    await userEvent.click(screen.getByTestId("task-composer-submit"));

    await waitFor(() => expect(mockCreateInitialChatRound).toHaveBeenCalledTimes(1));
    expect(mockCreateInitialChatRound.mock.calls[0]?.[1]).toBe("@站外实时信息检索 搜索 Anker 评论");
  });

  it("reuses the launch client_message_id when an accepted response is lost", async () => {
    mockPlatformAgent.current = createPlatformAgentMock({ accessToken: "access-token", userId: "user-1" });
    mockSafeRandomUUID.mockReset();
    mockSafeRandomUUID
      .mockReturnValueOnce("a62430bc-1417-4b95-9432-937b331a7d7a")
      .mockReturnValue("0743332a-89e5-423c-9278-6f62262ab7c2");
    mockCreateInitialChatRound
      .mockRejectedValueOnce(new Error("accepted response lost"))
      .mockResolvedValueOnce({
        session_id: "f4159ee9-c863-41c8-9c1b-ffbfa193917f",
        round_id: "3da8ff9a-95e2-4f9e-9788-7fda3d450fe7",
        assistant_message_id: "46aa60a5-64dd-471d-adfe-9856a3ee17c5",
        status: "QUEUED",
        last_event_seq: 1,
      });
    renderHomePage();

    const editor = await screen.findByTestId("task-composer-editor");
    await userEvent.click(editor);
    await userEvent.type(editor, "重试同一个首发请求");
    await userEvent.click(screen.getByTestId("task-composer-submit"));
    await waitFor(() => expect(mockCreateInitialChatRound).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText("accepted response lost")).toBeInTheDocument());

    await userEvent.click(screen.getByTestId("task-composer-submit"));
    await waitFor(() => expect(mockCreateInitialChatRound).toHaveBeenCalledTimes(2));
    expect(mockCreateInitialChatRound.mock.calls[0]?.[2]).toBe("a62430bc-1417-4b95-9432-937b331a7d7a");
    expect(mockCreateInitialChatRound.mock.calls[1]?.[2]).toBe("a62430bc-1417-4b95-9432-937b331a7d7a");
    expect(mockSafeRandomUUID).toHaveBeenCalledTimes(1);
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

  it("creates a datasource tag from capability metadata when the prompt has no @ mention", async () => {
    renderHomePage();

    fireEvent.click(await screen.findByLabelText("使用示例任务 不含数据源标记的场景"));

    const editor = screen.getByTestId("task-composer-editor");
    const sourceTag = screen.getByLabelText("数据源 SIF-查询ASIN的关键词");
    const childSummary = Array.from(editor.childNodes).map((node) => {
      if (node.nodeType === Node.TEXT_NODE) return { type: "text", text: node.textContent ?? "" };
      const element = node as HTMLElement;
      return { type: "tag", sourceId: element.dataset.toolId ?? "", text: element.textContent ?? "" };
    });

    expect(sourceTag).toBeInTheDocument();
    expect(sourceTag).toHaveAttribute("data-tool-id", "SIF-查询ASIN的关键词");
    expect(childSummary[0]).toMatchObject({ type: "tag", sourceId: "SIF-查询ASIN的关键词" });
    expect(editor).toHaveTextContent("努力思考，选择适合以下场景的工具");
    expect(editor).not.toHaveTextContent("@SIF-查询ASIN的关键词");
  });

  it("adds datasource tags for capability metadata missing after prompt mentions", async () => {
    renderHomePage();

    fireEvent.click(await screen.findByLabelText("使用示例任务 最后一个工具来自元数据"));

    const editor = screen.getByTestId("task-composer-editor");
    expect(screen.getByLabelText("数据源 Keepa-亚马逊价格历史")).toBeInTheDocument();
    expect(screen.getByLabelText("数据源 亚马逊前端搜索模拟")).toBeInTheDocument();
    expect(editor).toHaveTextContent("查询价格历史后，再模拟前台搜索。");
    expect(editor).not.toHaveTextContent("@Keepa-亚马逊价格历史");
    expect(editor).not.toHaveTextContent("@亚马逊前端搜索模拟");
  });

  it("resolves parent capability metadata into a visible datasource tag", async () => {
    renderHomePage();

    fireEvent.click(await screen.findByLabelText("使用示例任务 分组能力补全"));

    const editor = screen.getByTestId("task-composer-editor");
    expect(screen.getByLabelText("数据源 亚马逊-商品评论")).toBeInTheDocument();
    expect(screen.getByLabelText("数据源 亚马逊前端搜索模拟")).toBeInTheDocument();
    expect(screen.queryByLabelText("数据源 亚马逊前台")).not.toBeInTheDocument();
    expect(editor).toHaveTextContent("先看评论，再继续做前台搜索。");
    expect(editor).not.toHaveTextContent("@亚马逊-商品评论");
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
