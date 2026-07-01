import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NewConversationTaskComposer } from "@/components/new-conversation-task-composer";

const mockPlatformAgent = vi.hoisted(() => ({
  current: null as null | {
    auth: { accessToken: string };
    authHydrated: boolean;
    openLogin: ReturnType<typeof vi.fn>;
    withFreshToken: (run: (token: string) => Promise<void>) => Promise<void>;
  },
}));
const mockListUserPromptGroups = vi.hoisted(() => vi.fn());
const mockListUserPrompts = vi.hoisted(() => vi.fn());
const mockCreateUserPrompt = vi.hoisted(() => vi.fn());
const mockFetchPublicPromptCategories = vi.hoisted(() => vi.fn());
const mockFetchHomePromptRecommendations = vi.hoisted(() => vi.fn());

vi.mock("@/components/platform-agent-provider", () => ({
  useOptionalPlatformAgent: () => mockPlatformAgent.current,
}));

vi.mock("@/lib/agent-api/user-prompts", () => ({
  createUserPrompt: mockCreateUserPrompt,
  listUserPromptGroups: mockListUserPromptGroups,
  listUserPrompts: mockListUserPrompts,
}));

vi.mock("@/lib/agent-api/home-prompts", () => ({
  fetchPublicPromptCategories: mockFetchPublicPromptCategories,
  fetchHomePromptRecommendations: mockFetchHomePromptRecommendations,
}));

function renderComposer(showSubmitButton = true) {
  render(
    <NewConversationTaskComposer
      value=""
      onValueChange={vi.fn()}
      placeholder="输入任务"
      mode="深度模式"
      onModeChange={vi.fn()}
      selectedSourceIds={[]}
      onToolSelect={vi.fn()}
      onSourceRemove={vi.fn()}
      onFilesSelected={vi.fn()}
      onSubmit={vi.fn()}
      showSubmitButton={showSubmitButton}
    />,
  );
}

function renderEmbeddedScheduleComposer() {
  render(
    <NewConversationTaskComposer
      value=""
      onValueChange={vi.fn()}
      placeholder="输入任务"
      mode="深度模式"
      onModeChange={vi.fn()}
      selectedSourceIds={[]}
      onToolSelect={vi.fn()}
      onSourceRemove={vi.fn()}
      onFilesSelected={vi.fn()}
      onSubmit={vi.fn()}
      showSubmitButton={false}
      containerClassName="!shadow-none"
    />,
  );
}

function renderProductDetailComposerWithSelectedSource() {
  render(
    <NewConversationTaskComposer
      value=""
      onValueChange={vi.fn()}
      placeholder="输入任务"
      mode="深度模式"
      onModeChange={vi.fn()}
      selectedSourceIds={["keepa-product-detail"]}
      onToolSelect={vi.fn()}
      onSourceRemove={vi.fn()}
      onFilesSelected={vi.fn()}
      onSubmit={vi.fn()}
      showSubmitButton={false}
      containerClassName="!shadow-none"
    />,
  );
}

function PromptLibraryFallbackHarness() {
  const [value, setValue] = useState("");
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);

  return (
    <NewConversationTaskComposer
      value={value}
      onValueChange={setValue}
      placeholder="输入任务"
      mode="深度模式"
      onModeChange={vi.fn()}
      selectedSourceIds={selectedSourceIds}
      onToolSelect={(capabilityId) => {
        setSelectedSourceIds((current) => (current.includes(capabilityId) ? current : [...current, capabilityId]));
      }}
      onSourceRemove={(capabilityId) => {
        setSelectedSourceIds((current) => current.filter((id) => id !== capabilityId));
      }}
      onFilesSelected={vi.fn()}
      onSubmit={vi.fn()}
    />
  );
}

describe("NewConversationTaskComposer", () => {
  beforeEach(() => {
    mockPlatformAgent.current = null;
    mockListUserPromptGroups.mockReset();
    mockListUserPrompts.mockReset();
    mockCreateUserPrompt.mockReset();
    mockFetchPublicPromptCategories.mockReset();
    mockFetchPublicPromptCategories.mockResolvedValue([]);
    mockFetchHomePromptRecommendations.mockReset();
    mockFetchHomePromptRecommendations.mockResolvedValue([]);
  });

  it("uses the shared new conversation composer styling", () => {
    renderComposer();

    expect(screen.getByTestId("task-composer-editor")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /@数据源/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "提示词库" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "提示词库" })).not.toBeInTheDocument();
    expect(screen.getByTestId("task-composer-submit")).toBeInTheDocument();
    expect(document.querySelector("[data-task-composer-root]")).toHaveClass("rounded-composer", "bg-bg-surface");
  });

  it("can hide only the submit button for schedule forms", () => {
    renderComposer(false);

    expect(screen.getByTestId("task-composer-editor")).toBeInTheDocument();
    const dataSourceButton = screen.getByRole("button", { name: /@数据源/ });
    const promptLibraryButton = screen.getByRole("button", { name: "提示词库" });
    const attachmentButton = screen.getByRole("button", { name: "添加附件" });
    expect(dataSourceButton.compareDocumentPosition(promptLibraryButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(promptLibraryButton.compareDocumentPosition(attachmentButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByTestId("task-composer-submit")).not.toBeInTheDocument();
    expect(document.querySelector("[data-task-composer-root]")).toHaveClass("rounded-composer", "bg-bg-surface");
  });

  it("can remove the container shadow when embedded in schedule forms", () => {
    renderEmbeddedScheduleComposer();

    expect(screen.getByRole("button", { name: "添加附件" })).toBeInTheDocument();
    expect(document.querySelector("[data-task-composer-root]")).toHaveClass("!shadow-none");
  });

  it("opens the prompt library dropdown and applies a selected prompt", async () => {
    const onPromptUse = vi.fn();
    mockPlatformAgent.current = {
      auth: { accessToken: "access-token" },
      authHydrated: true,
      openLogin: vi.fn(),
      withFreshToken: async (run) => {
        await run("fresh-token");
      },
    };
    mockListUserPromptGroups.mockResolvedValue({
      items: [
        { id: "group-1", name: "Keepa", created_at: "2026-06-01T00:00:00Z", updated_at: "2026-06-01T00:00:00Z" },
      ],
      total: 1,
      page: 1,
      page_size: 100,
    });
    mockListUserPrompts.mockResolvedValue({
      items: [
        {
          id: "prompt-1",
          group_id: "group-1",
          group_name: "Keepa",
          title: "Keepa 模板",
          description: "价格历史查询",
          prompt_text: "@Keepa-亚马逊价格历史，{{美国站}}，查询ASIN:{{B0D5MV1S5W}}",
          created_at: "2026-06-01T00:00:00Z",
          updated_at: "2026-06-01T00:00:00Z",
        },
      ],
      total: 1,
      page: 1,
      page_size: 100,
    });

    render(
      <NewConversationTaskComposer
        value=""
        onValueChange={vi.fn()}
        placeholder="输入任务"
        mode="深度模式"
        onModeChange={vi.fn()}
        selectedSourceIds={[]}
        onToolSelect={vi.fn()}
        onSourceRemove={vi.fn()}
        onFilesSelected={vi.fn()}
        onSubmit={vi.fn()}
        onPromptUse={onPromptUse}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "提示词库" }));

    expect(await screen.findByPlaceholderText("搜索提示词")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("option", { name: "使用提示词 Keepa 模板" }));

    expect(onPromptUse).toHaveBeenCalledWith("@Keepa-亚马逊价格历史，{{美国站}}，查询ASIN:{{B0D5MV1S5W}}");
    expect(screen.queryByTestId("prompt-library-picker-item")).not.toBeInTheDocument();
  });

  it("applies prompt-library datasource mentions through the composer fallback handler", async () => {
    mockPlatformAgent.current = {
      auth: { accessToken: "access-token" },
      authHydrated: true,
      openLogin: vi.fn(),
      withFreshToken: async (run) => {
        await run("fresh-token");
      },
    };
    mockListUserPromptGroups.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      page_size: 100,
    });
    mockListUserPrompts.mockResolvedValue({
      items: [
        {
          id: "prompt-fallback",
          group_id: null,
          group_name: null,
          title: "Fallback Keepa 模板",
          description: "由 composer 自己解析提示词",
          prompt_text: "@Keepa-亚马逊价格历史，{{美国站}}，查询ASIN:{{B0D5MV1S5W}}",
          created_at: "2026-06-01T00:00:00Z",
          updated_at: "2026-06-01T00:00:00Z",
        },
      ],
      total: 1,
      page: 1,
      page_size: 100,
    });

    render(<PromptLibraryFallbackHarness />);

    fireEvent.click(screen.getByRole("button", { name: "提示词库" }));
    expect(await screen.findByPlaceholderText("搜索提示词")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("option", { name: "使用提示词 Fallback Keepa 模板" }));

    const editor = screen.getByTestId("task-composer-editor");
    await waitFor(() => {
      expect(screen.getByLabelText("数据源 Keepa-亚马逊价格历史")).toBeInTheDocument();
      expect(editor.querySelectorAll("[data-tool-token='true'][data-tool-id='keepa-price-history']")).toHaveLength(1);
      expect(Array.from(editor.querySelectorAll<HTMLElement>("[data-template-slot='true']")).map((slot) => slot.textContent)).toEqual([
        "美国站",
        "B0D5MV1S5W",
      ]);
      expect(editor.textContent).not.toContain("@Keepa-亚马逊价格历史");
      expect(editor.textContent).not.toContain("{{");
      expect(editor).not.toHaveTextContent("按 Tab 键补全");
    });
  });

  it("opens the create prompt dialog from the prompt library dropdown", async () => {
    mockPlatformAgent.current = {
      auth: { accessToken: "access-token" },
      authHydrated: true,
      openLogin: vi.fn(),
      withFreshToken: async (run) => {
        await run("fresh-token");
      },
    };
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
    mockCreateUserPrompt.mockResolvedValue({
      id: "prompt-new",
      group_id: null,
      group_name: null,
      title: "新提示词",
      description: "",
      prompt_text: "这是一条新提示词",
      created_at: "2026-06-01T00:00:00Z",
      updated_at: "2026-06-01T00:00:00Z",
    });

    renderComposer();

    fireEvent.click(screen.getByRole("button", { name: "提示词库" }));
    expect(await screen.findByRole("button", { name: "新建提示词" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "新建提示词" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText(/提示词/, { selector: "label" })).toBeInTheDocument();
    expect(within(dialog).queryByText(/提示词 prompt/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("为这个提示词起个名字吧"), {
      target: { value: "新提示词" },
    });
    expect(within(dialog).queryByRole("button", { name: "提示词库" })).not.toBeInTheDocument();
    const promptEditor = within(dialog).getByTestId("task-composer-editor");
    promptEditor.textContent = "这是一条新提示词";
    fireEvent.input(promptEditor);
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(mockCreateUserPrompt).toHaveBeenCalledWith("fresh-token", {
        title: "新提示词",
        prompt_text: "这是一条新提示词",
        group_id: null,
      });
    });
    expect(mockListUserPrompts).toHaveBeenCalledTimes(2);
  });

  it("saves a new prompt with datasource markers after accepting template completion", async () => {
    mockPlatformAgent.current = {
      auth: { accessToken: "access-token" },
      authHydrated: true,
      openLogin: vi.fn(),
      withFreshToken: async (run) => {
        await run("fresh-token");
      },
    };
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
      {
        id: "source-menu-keepa-test",
        name: "Keepa",
        sort_order: 1,
      },
    ]);
    mockFetchHomePromptRecommendations.mockImplementation(async (categoryId: string) => {
      if (categoryId !== "source-menu-keepa-test") return [];
      return [
        {
          id: "source-card-keepa-search",
          title: "Keepa 搜索模板",
          description: "用于构建数据源菜单",
          prompt: "@Keepa-亚马逊-商品搜索 亚马逊美国站,搜索关键词 Sports Water Bottles",
          meta: "",
          capability_ids: ["keepa"],
          replay_run_id: null,
          replay_share_id: null,
          sort_order: 1,
        },
      ];
    });
    mockCreateUserPrompt.mockResolvedValue({
      id: "prompt-new",
      group_id: null,
      group_name: null,
      title: "Keepa补全提示词",
      description: "",
      prompt_text: "@Keepa-亚马逊-商品搜索 亚马逊美国站,搜索关键词 Sports Water Bottles",
      created_at: "2026-06-01T00:00:00Z",
      updated_at: "2026-06-01T00:00:00Z",
    });

    renderComposer();

    fireEvent.click(screen.getByRole("button", { name: "提示词库" }));
    expect(await screen.findByRole("button", { name: "新建提示词" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "新建提示词" }));

    const dialog = await screen.findByRole("dialog");
    fireEvent.change(screen.getByPlaceholderText("为这个提示词起个名字吧"), {
      target: { value: "Keepa补全提示词" },
    });

    const promptEditor = within(dialog).getByTestId("task-composer-editor");
    fireEvent.click(within(dialog).getByRole("button", { name: /@数据源/ }));
    const listbox = await screen.findByRole("listbox", { name: "数据源列表" });
    fireEvent.click(within(listbox).getByRole("option", { name: /Keepa-亚马逊-商品搜索/ }));

    await waitFor(() => {
      expect(within(dialog).getByLabelText("数据源 Keepa-亚马逊-商品搜索")).toBeInTheDocument();
      expect(promptEditor).toHaveTextContent("按 Tab 键补全");
    });

    fireEvent.keyDown(promptEditor, { key: "Tab" });

    await waitFor(() => {
      expect(promptEditor).toHaveTextContent("亚马逊美国站");
      expect(promptEditor).toHaveTextContent("Sports Water Bottles");
      expect(promptEditor.querySelectorAll("[data-template-slot='true']")).toHaveLength(4);
      expect(promptEditor).not.toHaveTextContent("按 Tab 键补全");
    });

    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(mockCreateUserPrompt).toHaveBeenCalledWith("fresh-token", {
        title: "Keepa补全提示词",
        prompt_text: expect.stringContaining("@Keepa-亚马逊-商品搜索"),
        group_id: null,
      });
    });
    const savedPrompt = mockCreateUserPrompt.mock.calls.at(-1)?.[1]?.prompt_text;
    expect(savedPrompt).toContain("亚马逊美国站");
    expect(savedPrompt).toContain("Sports Water Bottles");
    expect(savedPrompt).not.toContain("{{");
  });

  it("shows completion for the Keepa product detail source", async () => {
    renderProductDetailComposerWithSelectedSource();

    const editor = screen.getByTestId("task-composer-editor");
    await waitFor(() => {
      expect(editor).toHaveTextContent("按 Tab 键补全");
      expect(editor).toHaveTextContent("查询 ASIN");
      expect(editor).toHaveTextContent("商品详情");
    });
  });
});
