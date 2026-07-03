import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TaskComposer } from "@/components/task-composer";
import type { ComposerSourcePlacement } from "@/lib/composer-prefill";

afterEach(() => {
  cleanup();
});

function ComposerHarness({
  onToolSelect = vi.fn(),
  onSourceRemove = vi.fn(),
  onSubmit = vi.fn(),
  dataSourceGroups,
  dataSourceItems,
}: {
  onToolSelect?: (capabilityId: string) => void;
  onSourceRemove?: (capabilityId: string) => void;
  onSubmit?: () => void;
  dataSourceGroups?: Parameters<typeof TaskComposer>[0]["dataSourceGroups"];
  dataSourceItems?: Parameters<typeof TaskComposer>[0]["dataSourceItems"];
}) {
  const [value, setValue] = useState("");
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [sourcePlacements, setSourcePlacements] = useState<ComposerSourcePlacement[]>([]);

  return (
    <TaskComposer
      value={value}
      onValueChange={setValue}
      placeholder="输入任务"
      mode="普通模式"
      onModeChange={vi.fn()}
      selectedSourceIds={selectedSourceIds}
      sourcePlacements={sourcePlacements}
      onSourcePlacementsChange={setSourcePlacements}
      dataSourceGroups={dataSourceGroups}
      dataSourceItems={dataSourceItems}
      onToolSelect={(capabilityId) => {
        onToolSelect(capabilityId);
        setSelectedSourceIds((current) => (current.includes(capabilityId) ? current : [...current, capabilityId]));
      }}
      onSourceRemove={(capabilityId) => {
        onSourceRemove(capabilityId);
        setSelectedSourceIds((current) => current.filter((id) => id !== capabilityId));
        setSourcePlacements((current) => current.filter((placement) => placement.sourceId !== capabilityId));
      }}
      onFilesSelected={vi.fn()}
      onSubmit={onSubmit}
    />
  );
}

function PositionedSourcesHarness({
  onToolSelect = vi.fn(),
  onSourceRemove = vi.fn(),
}: {
  onToolSelect?: (capabilityId: string) => void;
  onSourceRemove?: (capabilityId: string) => void;
}) {
  const middleText = "努力思考，选择适合以下场景的工具，";
  const [value, setValue] = useState(`${middleText}帮我处理excel`);
  const [selectedSourceIds, setSelectedSourceIds] = useState(["keepa", "amazon"]);
  const [sourcePlacements, setSourcePlacements] = useState<ComposerSourcePlacement[]>([
    { sourceId: "keepa", offset: 0 },
    { sourceId: "amazon", offset: middleText.length },
  ]);

  return (
    <TaskComposer
      value={value}
      onValueChange={setValue}
      placeholder="输入任务"
      mode="普通模式"
      onModeChange={vi.fn()}
      selectedSourceIds={selectedSourceIds}
      sourcePlacements={sourcePlacements}
      onSourcePlacementsChange={setSourcePlacements}
      onToolSelect={(capabilityId) => {
        onToolSelect(capabilityId);
        setSelectedSourceIds((current) => (current.includes(capabilityId) ? current : [...current, capabilityId]));
      }}
      onSourceRemove={(capabilityId) => {
        onSourceRemove(capabilityId);
        setSelectedSourceIds((current) => current.filter((id) => id !== capabilityId));
        setSourcePlacements((current) => current.filter((placement) => placement.sourceId !== capabilityId));
      }}
      onFilesSelected={vi.fn()}
      onSubmit={vi.fn()}
    />
  );
}

function placeCaretInTextNode(textNode: Text, offset: number) {
  const range = document.createRange();
  range.setStart(textNode, offset);
  range.collapse(true);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function placeCaretAfterElement(element: Element) {
  const range = document.createRange();
  range.setStartAfter(element);
  range.collapse(true);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function placeCaretAtElementEnd(element: Element) {
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function selectElement(element: Element) {
  const range = document.createRange();
  range.selectNode(element);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function setEditorText(editor: HTMLElement, text: string) {
  editor.textContent = text;
  const textNode = editor.firstChild;
  if (textNode instanceof Text) {
    placeCaretInTextNode(textNode, text.length);
  }
  fireEvent.input(editor);
}

function mockElementClientRect(element: Element, rect: Partial<DOMRect>) {
  const resolvedRect = {
    bottom: 40,
    height: 40,
    left: 100,
    right: 420,
    top: 0,
    width: 320,
    x: 100,
    y: 0,
    toJSON: () => ({}),
    ...rect,
  } as DOMRect;
  Object.defineProperty(element, "getClientRects", {
    configurable: true,
    value: () => [resolvedRect],
  });
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => resolvedRect,
  });
}

const MENU_INTERACTION_TIMEOUT_MS = 10000;

describe("task composer data source menu", () => {
  it("covers the composer input box core keyboard and datasource scenarios", async () => {
    const user = userEvent.setup();

    const submit = vi.fn();
    render(<ComposerHarness onSubmit={submit} />);
    let editor = screen.getByTestId("task-composer-editor");
    expect(screen.getByText("输入任务")).toBeInTheDocument();
    expect(screen.getByTestId("task-composer-submit")).toBeDisabled();

    await user.click(editor);
    setEditorText(editor, "需要分析库存");
    await waitFor(() => expect(screen.getByTestId("task-composer-submit")).toBeEnabled());
    fireEvent.keyDown(editor, { key: "Enter" });
    expect(submit).toHaveBeenCalledTimes(1);

    cleanup();

    const buttonSelect = vi.fn();
    const buttonRemove = vi.fn();
    render(<ComposerHarness onToolSelect={buttonSelect} onSourceRemove={buttonRemove} />);
    const trigger = screen.getByRole("button", { name: /@数据源/ });
    await user.click(trigger);

    let listbox = await screen.findByRole("listbox", { name: "数据源列表" });
    const keepaSearch = within(listbox).getByRole("option", { name: /Keepa-亚马逊-商品搜索/ });
    const keepaProductDetail = within(listbox).getByRole("option", { name: /Keepa-亚马逊-商品详情/ });
    expect(keepaSearch).toHaveAttribute("aria-selected", "false");
    expect(keepaProductDetail).toHaveAttribute("aria-selected", "false");

    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(buttonSelect).not.toHaveBeenCalled();
    expect(screen.getByRole("listbox", { name: "数据源列表" })).toBeInTheDocument();

    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    await waitFor(() => expect(keepaSearch).toHaveFocus());
    fireEvent.keyDown(keepaSearch, { key: "ArrowDown" });
    await waitFor(() => expect(keepaProductDetail).toHaveFocus());
    fireEvent.keyDown(keepaProductDetail, { key: "Enter" });

    await waitFor(() => expect(buttonSelect).toHaveBeenCalledWith("keepa-product-detail"));
    expect(buttonSelect).not.toHaveBeenCalledWith("keepa");
    expect(await screen.findByLabelText("数据源 Keepa-亚马逊-商品详情")).toBeInTheDocument();

    editor = screen.getByTestId("task-composer-editor");
    fireEvent.keyDown(editor, { key: "Backspace" });
    expect(buttonRemove).not.toHaveBeenCalled();
    expect(screen.getByLabelText("数据源 Keepa-亚马逊-商品详情")).toBeInTheDocument();

    cleanup();

    render(<ComposerHarness />);
    editor = screen.getByTestId("task-composer-editor");
    await user.click(editor);
    setEditorText(editor, "@");

    let mentionMenu = await screen.findByTestId("task-composer-mention-menu");
    expect(mentionMenu).toHaveClass("z-modal-floating");
    expect(mentionMenu).not.toHaveClass("z-composer-menu");
    expect(screen.getByTestId("task-composer-mention-category-pane")).toBeInTheDocument();
    expect(screen.getByTestId("task-composer-mention-option-pane")).toBeInTheDocument();
    expect(editor).toHaveFocus();

    const mentionKeepaSearch = within(mentionMenu).getByRole("option", { name: /Keepa-亚马逊-商品搜索/ });
    const mentionKeepaProductDetail = within(mentionMenu).getByRole("option", { name: /Keepa-亚马逊-商品详情/ });
    await waitFor(() => expect(mentionKeepaSearch).toHaveAttribute("aria-selected", "true"));
    fireEvent.keyDown(editor, { key: "ArrowDown" });
    await waitFor(() => expect(mentionKeepaProductDetail).toHaveFocus());
    fireEvent.keyDown(mentionKeepaProductDetail, { key: "ArrowUp" });
    await waitFor(() => expect(mentionKeepaSearch).toHaveFocus());
    fireEvent.keyDown(mentionKeepaSearch, { key: "Escape" });
    await waitFor(() => expect(screen.queryByTestId("task-composer-mention-menu")).not.toBeInTheDocument());

    cleanup();

    const filteredSelect = vi.fn();
    render(<ComposerHarness onToolSelect={filteredSelect} />);
    editor = screen.getByTestId("task-composer-editor");
    await user.click(editor);
    setEditorText(editor, "@亚马逊前端");

    mentionMenu = await screen.findByTestId("task-composer-mention-menu");
    const getSearchOption = () => within(mentionMenu).getByRole("option", { name: /亚马逊前台.*亚马逊前端搜索模拟/ });
    const getDetailOption = () => within(mentionMenu).getByRole("option", { name: /亚马逊前台.*亚马逊前端-商品详情/ });
    expect(getSearchOption()).toHaveAttribute("aria-selected", "false");
    expect(getDetailOption()).toHaveAttribute("aria-selected", "false");

    fireEvent.keyDown(editor, { key: "Enter" });
    expect(filteredSelect).not.toHaveBeenCalled();
    expect(screen.getByTestId("task-composer-mention-menu")).toBeInTheDocument();

    fireEvent.keyDown(editor, { key: "ArrowUp" });
    await waitFor(() => expect(getDetailOption()).toHaveAttribute("aria-selected", "true"));
    fireEvent.keyDown(editor, { key: "Enter" });

    await waitFor(() => expect(filteredSelect).toHaveBeenCalledWith("amazon-product-detail"));
    expect(filteredSelect).not.toHaveBeenCalledWith("amazon");

    cleanup();

    render(<ComposerHarness />);
    await user.click(screen.getByRole("button", { name: /@数据源/ }));
    listbox = await screen.findByRole("listbox", { name: "数据源列表" });
    fireEvent.click(within(listbox).getByRole("option", { name: /Keepa-亚马逊-商品搜索/ }));

    editor = screen.getByTestId("task-composer-editor");
    await waitFor(() => expect(editor).toHaveTextContent("按 Tab 键补全"));
    fireEvent.keyDown(editor, { key: "Tab" });

    await waitFor(() => {
      expect(editor).toHaveTextContent("亚马逊美国站,搜索关键词");
      expect(editor).toHaveTextContent("Sports Water Bottles");
      expect(editor).not.toHaveTextContent("{{");
      expect(editor.querySelectorAll("[data-template-slot='true']")).toHaveLength(4);
    });
  }, 20000);

  it("renders prefilled datasource tokens at their original query position", () => {
    render(
      <TaskComposer
        value="Keepa-亚马逊价格历史 ，美国站，查询ASIN:B0D5MV1S5W"
        onValueChange={vi.fn()}
        placeholder="输入任务"
        mode="普通模式"
        onModeChange={vi.fn()}
        selectedSourceIds={["keepa-price-history"]}
        sourcePlacements={[{ sourceId: "keepa-price-history", offset: "Keepa-亚马逊价格历史 ".length }]}
        onToolSelect={vi.fn()}
        onSourceRemove={vi.fn()}
        onFilesSelected={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    const editor = screen.getByTestId("task-composer-editor");
    const childSummary = Array.from(editor.childNodes).map((node) => {
      if (node.nodeType === Node.TEXT_NODE) return { type: "text", text: node.textContent ?? "" };
      const element = node as HTMLElement;
      return { type: "tag", sourceId: element.dataset.toolId ?? "", text: element.textContent ?? "" };
    });
    const sourceTagIndex = childSummary.findIndex((item) => item.type === "tag" && item.sourceId === "keepa-price-history");

    expect(sourceTagIndex).toBeGreaterThan(0);
    expect(childSummary.slice(0, sourceTagIndex).map((item) => item.text).join("")).toBe("Keepa-亚马逊价格历史 ");
    expect(screen.getByLabelText("数据源 Keepa-亚马逊价格历史")).toBeInTheDocument();
    expect(editor).not.toHaveTextContent("按 Tab 键补全");
  }, MENU_INTERACTION_TIMEOUT_MS);

  it("keeps a manually selected datasource at the current caret position", async () => {
    render(<ComposerHarness />);

    const editor = screen.getByTestId("task-composer-editor");
    await userEvent.click(editor);
    setEditorText(editor, "前 后");
    await waitFor(() => expect(editor).toHaveTextContent("前 后"));
    placeCaretInTextNode(editor.firstChild as Text, "前 ".length);

    const trigger = screen.getByRole("button", { name: /@数据源/ });
    fireEvent.pointerDown(trigger);
    window.getSelection()?.removeAllRanges();
    fireEvent.click(trigger);
    const listbox = await screen.findByRole("listbox", { name: "数据源列表" });
    fireEvent.click(within(listbox).getByRole("option", { name: /Keepa-亚马逊价格历史/ }));

    await waitFor(() => expect(screen.getByLabelText("数据源 Keepa-亚马逊价格历史")).toBeInTheDocument());
    await waitFor(() => expect(editor).toHaveTextContent("按 Tab 键补全"));
    const childSummary = Array.from(editor.childNodes).map((node) => {
      if (node.nodeType === Node.TEXT_NODE) return { type: "text", text: node.textContent ?? "" };
      const element = node as HTMLElement;
      return { type: "tag", sourceId: element.dataset.toolId ?? "", text: element.textContent ?? "" };
    });
    const sourceTagIndex = childSummary.findIndex((item) => item.type === "tag" && item.sourceId === "keepa-price-history");

    expect(sourceTagIndex).toBeGreaterThan(0);
    expect(childSummary.slice(0, sourceTagIndex).map((item) => item.text).join("")).toBe("前 ");
    expect(childSummary.slice(sourceTagIndex + 1).map((item) => item.text).join("")).toContain(" 后");

    fireEvent.keyDown(editor, { key: "Tab" });

    await waitFor(() => {
      expect(editor).not.toHaveTextContent("按 Tab 键补全");
      expect(editor.querySelectorAll("[data-template-slot='true']").length).toBeGreaterThan(0);
    });
    const acceptedChildSummary = Array.from(editor.childNodes).map((node) => {
      if (node.nodeType === Node.TEXT_NODE) return { type: "text", text: node.textContent ?? "" };
      const element = node as HTMLElement;
      return { type: "tag", sourceId: element.dataset.toolId ?? "", text: element.textContent ?? "" };
    });
    const acceptedSourceTagIndex = acceptedChildSummary.findIndex((item) => item.type === "tag" && item.sourceId === "keepa-price-history");
    expect(acceptedSourceTagIndex).toBeGreaterThan(0);
    expect(acceptedChildSummary.slice(0, acceptedSourceTagIndex).map((item) => item.text).join("")).toBe("前 ");
  }, MENU_INTERACTION_TIMEOUT_MS);

  it("syncs deleted and undo-restored datasource tokens without moving them to the front", async () => {
    const onSourceRemove = vi.fn();
    const onToolSelect = vi.fn();
    render(<PositionedSourcesHarness onSourceRemove={onSourceRemove} onToolSelect={onToolSelect} />);

    const editor = screen.getByTestId("task-composer-editor");
    const getEditorSourceIds = () =>
      Array.from(editor.querySelectorAll<HTMLElement>("[data-tool-token='true'][data-tool-id]")).map(
        (node) => node.dataset.toolId,
      );

    const amazonToken = await screen.findByLabelText("数据源 亚马逊前端搜索模拟");
    expect(getEditorSourceIds()).toEqual(["keepa", "amazon"]);

    amazonToken.remove();
    fireEvent.input(editor);

    await waitFor(() => expect(onSourceRemove).toHaveBeenCalledWith("amazon"));
    await waitFor(() => expect(screen.queryByLabelText("数据源 亚马逊前端搜索模拟")).not.toBeInTheDocument());
    expect(getEditorSourceIds()).toEqual(["keepa"]);
    expect(editor.querySelector<HTMLElement>("[data-tool-token='true']")?.dataset.toolId).toBe("keepa");

    const textNode = Array.from(editor.childNodes).find(
      (node): node is Text => node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").includes("帮我处理excel"),
    );
    expect(textNode).toBeDefined();
    const afterNode = textNode!.splitText("努力思考，选择适合以下场景的工具，".length);
    editor.insertBefore(amazonToken, afterNode);
    fireEvent.input(editor);

    await waitFor(() => expect(onToolSelect).toHaveBeenCalledWith("amazon"));
    await waitFor(() => expect(screen.getByLabelText("数据源 亚马逊前端搜索模拟")).toBeInTheDocument());
    expect(getEditorSourceIds()).toEqual(["keepa", "amazon"]);
  }, MENU_INTERACTION_TIMEOUT_MS);

  it("uses the native undoable edit command when deleting selected datasource tokens", async () => {
    const originalExecCommand = document.execCommand;
    const onSourceRemove = vi.fn();
    render(<PositionedSourcesHarness onSourceRemove={onSourceRemove} />);

    const editor = screen.getByTestId("task-composer-editor");
    const amazonToken = await screen.findByLabelText("数据源 亚马逊前端搜索模拟");
    selectElement(amazonToken);
    const execCommand = vi.fn((command: string) => {
      if (command !== "delete") return false;
      amazonToken.remove();
      return true;
    });
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: execCommand,
    });

    try {
      fireEvent.keyDown(editor, { key: "Backspace" });

      expect(execCommand).toHaveBeenCalledWith("delete");
      await waitFor(() => expect(onSourceRemove).toHaveBeenCalledWith("amazon"));
    } finally {
      Object.defineProperty(document, "execCommand", {
        configurable: true,
        value: originalExecCommand,
      });
    }
  }, MENU_INTERACTION_TIMEOUT_MS);

  it("supports keyboard undo and redo for typed composer text", async () => {
    render(<ComposerHarness />);

    const editor = screen.getByTestId("task-composer-editor");
    await userEvent.click(editor);
    setEditorText(editor, "第一版内容");
    await waitFor(() => expect(editor).toHaveTextContent("第一版内容"));
    setEditorText(editor, "第二版内容");
    await waitFor(() => expect(editor).toHaveTextContent("第二版内容"));

    fireEvent.keyDown(editor, { key: "z", metaKey: true });

    await waitFor(() => expect(editor).toHaveTextContent("第一版内容"));

    fireEvent.keyDown(editor, { key: "z", metaKey: true, shiftKey: true });

    await waitFor(() => expect(editor).toHaveTextContent("第二版内容"));
  });

  it("supports keyboard undo and redo for selected datasource tokens", async () => {
    const onToolSelect = vi.fn();
    const onSourceRemove = vi.fn();
    render(<ComposerHarness onToolSelect={onToolSelect} onSourceRemove={onSourceRemove} />);

    await userEvent.click(screen.getByRole("button", { name: /@数据源/ }));

    const listbox = await screen.findByRole("listbox", { name: "数据源列表" });
    fireEvent.click(within(listbox).getByRole("option", { name: /Keepa-亚马逊-商品搜索/ }));

    const editor = screen.getByTestId("task-composer-editor");
    await waitFor(() => expect(onToolSelect).toHaveBeenCalledWith("keepa"));
    await waitFor(() => expect(screen.getByLabelText("数据源 Keepa-亚马逊-商品搜索")).toBeInTheDocument());

    fireEvent.keyDown(editor, { key: "z", metaKey: true });

    await waitFor(() => expect(onSourceRemove).toHaveBeenCalledWith("keepa"));
    await waitFor(() => expect(screen.queryByLabelText("数据源 Keepa-亚马逊-商品搜索")).not.toBeInTheDocument());

    fireEvent.keyDown(editor, { key: "z", metaKey: true, shiftKey: true });

    await waitFor(() => expect(onToolSelect).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByLabelText("数据源 Keepa-亚马逊-商品搜索")).toBeInTheDocument());
  }, MENU_INTERACTION_TIMEOUT_MS);

  it("uses first-level categories to navigate second-level datasource cards", async () => {
    const onToolSelect = vi.fn();
    render(<ComposerHarness onToolSelect={onToolSelect} />);

    await userEvent.click(screen.getByRole("button", { name: /@数据源/ }));

    const listbox = await screen.findByRole("listbox", { name: "数据源列表" });
    const popover = listbox.parentElement as HTMLElement;
    expect(within(popover).queryByText("@数据源")).not.toBeInTheDocument();
    expect(popover).toHaveClass("z-modal-floating");
    expect(popover).toHaveClass("overflow-hidden", "rounded-popover");
    expect(listbox).toHaveStyle({ height: "360px" });
    expect(screen.getByTestId("task-composer-source-category-pane")).toHaveClass("h-full", "overflow-y-auto");
    const sourceOptionPane = screen.getByTestId("task-composer-source-option-pane");
    expect(sourceOptionPane).toHaveClass("h-full", "overflow-y-auto");
    const sourceSectionHeading = within(sourceOptionPane).getAllByTestId("task-composer-source-section-heading")[0];
    expect(sourceSectionHeading).toHaveClass("mb-2");
    expect(sourceSectionHeading).not.toHaveClass("sticky");
    const amazonCategory = within(listbox).getByRole("button", { name: "亚马逊前台" });
    await userEvent.click(amazonCategory);

    const amazonOption = within(listbox).getByRole("option", { name: /亚马逊前端搜索模拟/ });
    expect(amazonOption).toHaveAttribute("aria-selected", "true");

    fireEvent.click(amazonOption);
    await waitFor(() => expect(onToolSelect).toHaveBeenCalledWith("amazon"));
    const sourceToken = screen.getByLabelText("数据源 亚马逊前端搜索模拟");
    expect(sourceToken).toBeInTheDocument();
    expect(sourceToken).toHaveTextContent("亚马逊前端搜索模拟");
    expect(sourceToken).toHaveClass("bg-bg-surface", "text-foreground");
    expect(sourceToken.className).toContain("before:content-['@']");
    expect(sourceToken.className).not.toContain("arcoblue");
  }, MENU_INTERACTION_TIMEOUT_MS);

  it("does not remove a datasource when its token is clicked", async () => {
    const onSourceRemove = vi.fn();
    render(<ComposerHarness onSourceRemove={onSourceRemove} />);

    await userEvent.click(screen.getByRole("button", { name: /@数据源/ }));

    const listbox = await screen.findByRole("listbox", { name: "数据源列表" });
    fireEvent.click(within(listbox).getByRole("option", { name: /Keepa-亚马逊-商品搜索/ }));

    const sourceToken = await screen.findByLabelText("数据源 Keepa-亚马逊-商品搜索");
    await userEvent.click(sourceToken);

    expect(onSourceRemove).not.toHaveBeenCalled();
    expect(screen.getByLabelText("数据源 Keepa-亚马逊-商品搜索")).toBeInTheDocument();
  }, MENU_INTERACTION_TIMEOUT_MS);

  it("keeps a newly selected datasource visible before the parent state syncs", async () => {
    const onToolSelect = vi.fn();
    render(
      <TaskComposer
        value=""
        onValueChange={vi.fn()}
        placeholder="输入任务"
        mode="普通模式"
        onModeChange={vi.fn()}
        selectedSourceIds={[]}
        onToolSelect={onToolSelect}
        onSourceRemove={vi.fn()}
        onFilesSelected={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /@数据源/ }));

    const listbox = await screen.findByRole("listbox", { name: "数据源列表" });
    fireEvent.click(within(listbox).getByRole("option", { name: /热门视频与达人线索/ }));

    await waitFor(() => expect(onToolSelect).toHaveBeenCalledWith("tiktok"));
    expect(screen.getByLabelText("数据源 热门视频与达人线索")).toBeInTheDocument();
    expect(screen.queryByText("输入任务")).not.toBeInTheDocument();
  }, MENU_INTERACTION_TIMEOUT_MS);

  it("renders each selected datasource token once", () => {
    render(
      <TaskComposer
        value=""
        onValueChange={vi.fn()}
        placeholder="输入任务"
        mode="普通模式"
        onModeChange={vi.fn()}
        selectedSourceIds={["keepa", "keepa"]}
        onToolSelect={vi.fn()}
        onSourceRemove={vi.fn()}
        onFilesSelected={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getAllByLabelText("数据源 Keepa-亚马逊-商品搜索")).toHaveLength(1);
  });

  it("does not open the mention menu when clicking existing plain text with @", async () => {
    render(
      <TaskComposer
        value="已有 @亚马逊前端 文本"
        onValueChange={vi.fn()}
        placeholder="输入任务"
        mode="普通模式"
        onModeChange={vi.fn()}
        selectedSourceIds={[]}
        onToolSelect={vi.fn()}
        onSourceRemove={vi.fn()}
        onFilesSelected={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    const editor = screen.getByTestId("task-composer-editor");
    await waitFor(() => expect(editor).toHaveTextContent("已有 @亚马逊前端 文本"));
    await userEvent.click(editor);

    expect(screen.queryByTestId("task-composer-mention-menu")).not.toBeInTheDocument();
  });

  it("supports two-pane arrow-key navigation and Enter selection in the button popover", async () => {
    const onToolSelect = vi.fn();
    render(<ComposerHarness onToolSelect={onToolSelect} />);

    const trigger = screen.getByRole("button", { name: /@数据源/ });
    await userEvent.click(trigger);

    const listbox = await screen.findByRole("listbox", { name: "数据源列表" });
    const keepaSearch = within(listbox).getByRole("option", { name: /Keepa-亚马逊-商品搜索/ });
    const keepaProductDetail = within(listbox).getByRole("option", { name: /Keepa-亚马逊-商品详情/ });
    const keepaPriceHistory = within(listbox).getByRole("option", { name: /Keepa-亚马逊价格历史/ });
    expect(keepaSearch).toHaveAttribute("aria-selected", "false");
    expect(keepaProductDetail).toHaveAttribute("aria-selected", "false");

    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(onToolSelect).not.toHaveBeenCalled();
    expect(screen.getByRole("listbox", { name: "数据源列表" })).toBeInTheDocument();

    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    await waitFor(() => expect(keepaSearch).toHaveFocus());

    fireEvent.keyDown(keepaSearch, { key: "ArrowDown" });
    await waitFor(() => expect(keepaProductDetail).toHaveFocus());

    fireEvent.keyDown(keepaProductDetail, { key: "ArrowDown" });
    await waitFor(() => expect(keepaPriceHistory).toHaveFocus());

    fireEvent.keyDown(keepaPriceHistory, { key: "ArrowUp" });
    await waitFor(() => expect(keepaProductDetail).toHaveFocus());

    fireEvent.keyDown(keepaProductDetail, { key: "Enter" });

    await waitFor(() => expect(onToolSelect).toHaveBeenCalledWith("keepa-product-detail"));
    expect(onToolSelect).not.toHaveBeenCalledWith("keepa");
    expect(listbox).not.toBeInTheDocument();
  }, MENU_INTERACTION_TIMEOUT_MS);

  it("moves through the button datasource menu with Tab without selecting", async () => {
    const onToolSelect = vi.fn();
    render(<ComposerHarness onToolSelect={onToolSelect} />);

    const trigger = screen.getByRole("button", { name: /@数据源/ });
    await userEvent.click(trigger);

    const listbox = await screen.findByRole("listbox", { name: "数据源列表" });
    const keepaSearch = within(listbox).getByRole("option", { name: /Keepa-亚马逊-商品搜索/ });
    fireEvent.keyDown(trigger, { key: "Tab" });
    await waitFor(() => expect(keepaSearch).toHaveFocus());

    fireEvent.keyDown(keepaSearch, { key: "Tab" });
    const keepaProductDetail = within(listbox).getByRole("option", { name: /Keepa-亚马逊-商品详情/ });
    await waitFor(() => expect(keepaProductDetail).toHaveFocus());
    expect(onToolSelect).not.toHaveBeenCalled();

    fireEvent.keyDown(keepaProductDetail, { key: "Tab", shiftKey: true });
    await waitFor(() => expect(keepaSearch).toHaveFocus());
    expect(onToolSelect).not.toHaveBeenCalled();
  }, MENU_INTERACTION_TIMEOUT_MS);

  it("opens the two-column datasource menu for a bare mention trigger", async () => {
    render(<ComposerHarness />);

    const editor = screen.getByTestId("task-composer-editor");
    await userEvent.click(editor);
    await userEvent.type(editor, "@");

    const mentionMenu = await screen.findByTestId("task-composer-mention-menu");
    expect(within(mentionMenu).queryByText("@数据源")).not.toBeInTheDocument();
    expect(mentionMenu).toHaveClass("overflow-hidden");
    expect(mentionMenu).toHaveStyle({ width: "760px" });
    expect(screen.getByTestId("task-composer-mention-category-pane")).toBeInTheDocument();
    const mentionOptionPane = screen.getByTestId("task-composer-mention-option-pane");
    expect(mentionOptionPane).toBeInTheDocument();
    const mentionSectionHeading = within(mentionOptionPane).getAllByTestId("task-composer-source-section-heading")[0];
    expect(mentionSectionHeading).toHaveClass("mb-2");
    expect(mentionSectionHeading).not.toHaveClass("sticky");
    expect(within(mentionMenu).getByRole("button", { name: "Keepa" })).toBeInTheDocument();
    expect(within(mentionMenu).getByRole("option", { name: /Keepa-亚马逊-商品搜索/ })).toBeInTheDocument();
  });

  it("keeps the bare mention menu editable, then supports category and card keyboard navigation", async () => {
    const onToolSelect = vi.fn();
    render(<ComposerHarness onToolSelect={onToolSelect} />);

    const editor = screen.getByTestId("task-composer-editor");
    await userEvent.click(editor);
    await userEvent.type(editor, "@");

    const mentionMenu = await screen.findByTestId("task-composer-mention-menu");
    expect(editor).toHaveFocus();

    const keepaSearch = within(mentionMenu).getByRole("option", { name: /Keepa-亚马逊-商品搜索/ });
    const keepaProductDetail = within(mentionMenu).getByRole("option", { name: /Keepa-亚马逊-商品详情/ });
    await waitFor(() => expect(keepaSearch).toHaveAttribute("aria-selected", "true"));

    fireEvent.keyDown(editor, { key: "ArrowDown" });
    await waitFor(() => expect(keepaProductDetail).toHaveFocus());

    fireEvent.keyDown(keepaProductDetail, { key: "ArrowDown" });
    const keepaPriceHistory = within(mentionMenu).getByRole("option", { name: /Keepa-亚马逊价格历史/ });
    await waitFor(() => expect(keepaPriceHistory).toHaveFocus());

    fireEvent.keyDown(keepaPriceHistory, { key: "ArrowRight" });
    const amazonSearch = within(mentionMenu).getByRole("option", { name: /亚马逊前端搜索模拟/ });
    await waitFor(() => expect(amazonSearch).toHaveFocus());

    fireEvent.keyDown(amazonSearch, { key: "ArrowDown" });
    const amazonProductDetail = within(mentionMenu).getByRole("option", { name: /亚马逊前端-商品详情/ });
    await waitFor(() => expect(amazonProductDetail).toHaveFocus());

    fireEvent.keyDown(amazonProductDetail, { key: "ArrowDown" });
    const amazonReview = within(mentionMenu).getByRole("option", { name: /亚马逊-商品评论/ });
    await waitFor(() => expect(amazonReview).toHaveFocus());

    fireEvent.keyDown(amazonReview, { key: "ArrowUp" });
    await waitFor(() => expect(amazonProductDetail).toHaveFocus());

    fireEvent.keyDown(amazonProductDetail, { key: "ArrowUp" });
    await waitFor(() => expect(amazonSearch).toHaveFocus());

    fireEvent.keyDown(amazonSearch, { key: "ArrowLeft" });
    await waitFor(() => expect(keepaPriceHistory).toHaveFocus());

    fireEvent.keyDown(keepaPriceHistory, { key: "ArrowRight" });
    await waitFor(() => expect(amazonSearch).toHaveFocus());

    fireEvent.keyDown(amazonSearch, { key: "Enter" });
    await waitFor(() => expect(onToolSelect).toHaveBeenCalledWith("amazon"));
    expect(screen.queryByTestId("task-composer-mention-menu")).not.toBeInTheDocument();
  }, MENU_INTERACTION_TIMEOUT_MS);

  it("keeps moving through bare mention options when arrow keys stay on the editor", async () => {
    render(<ComposerHarness />);

    const editor = screen.getByTestId("task-composer-editor");
    await userEvent.click(editor);
    await userEvent.type(editor, "@");

    const mentionMenu = await screen.findByTestId("task-composer-mention-menu");
    const keepaSearch = within(mentionMenu).getByRole("option", { name: /Keepa-亚马逊-商品搜索/ });
    const keepaProductDetail = within(mentionMenu).getByRole("option", { name: /Keepa-亚马逊-商品详情/ });
    await waitFor(() => expect(keepaSearch).toHaveAttribute("aria-selected", "true"));

    fireEvent.keyDown(editor, { key: "ArrowDown" });
    await waitFor(() => expect(keepaProductDetail).toHaveFocus());

    fireEvent.keyDown(editor, { key: "ArrowUp" });
    await waitFor(() => expect(keepaSearch).toHaveFocus());
  }, MENU_INTERACTION_TIMEOUT_MS);

  it("moves through the bare mention datasource menu with Tab and selects only on Enter", async () => {
    const onToolSelect = vi.fn();
    render(<ComposerHarness onToolSelect={onToolSelect} />);

    const editor = screen.getByTestId("task-composer-editor");
    await userEvent.click(editor);
    await userEvent.type(editor, "@");

    const mentionMenu = await screen.findByTestId("task-composer-mention-menu");
    fireEvent.keyDown(editor, { key: "Tab" });
    const keepaSearch = within(mentionMenu).getByRole("option", { name: /Keepa-亚马逊-商品搜索/ });
    await waitFor(() => expect(keepaSearch).toHaveFocus());
    expect(onToolSelect).not.toHaveBeenCalled();

    fireEvent.keyDown(keepaSearch, { key: "Tab" });
    const keepaProductDetail = within(mentionMenu).getByRole("option", { name: /Keepa-亚马逊-商品详情/ });
    await waitFor(() => expect(keepaProductDetail).toHaveFocus());
    expect(onToolSelect).not.toHaveBeenCalled();

    fireEvent.keyDown(keepaProductDetail, { key: "Enter" });
    await waitFor(() => expect(onToolSelect).toHaveBeenCalledWith("keepa-product-detail"));
    expect(screen.queryByTestId("task-composer-mention-menu")).not.toBeInTheDocument();
  });

  it("opens a lightweight filtered mention menu and inserts the selected second-level datasource", async () => {
    const onToolSelect = vi.fn();
    render(<ComposerHarness onToolSelect={onToolSelect} />);

    const editor = screen.getByTestId("task-composer-editor");
    await userEvent.click(editor);
    setEditorText(editor, "@亚马逊");

    const mentionMenu = await screen.findByTestId("task-composer-mention-menu");
    expect(within(mentionMenu).getByText("选择工具")).toBeInTheDocument();
    expect(mentionMenu).toHaveStyle({ width: "340px" });
    expect(screen.queryByTestId("task-composer-source-category-pane")).not.toBeInTheDocument();
    const option = await waitFor(() =>
      within(mentionMenu).getByRole("option", { name: /亚马逊前台.*亚马逊前端搜索模拟/ }),
    );

    fireEvent.click(option);

    await waitFor(() => expect(onToolSelect).toHaveBeenCalledWith("amazon"));
    expect(screen.queryByTestId("task-composer-mention-menu")).not.toBeInTheDocument();
    expect(screen.getByLabelText("数据源 亚马逊前端搜索模拟")).toBeInTheDocument();
  });

  it("searches after a typed mention query and selects the filtered result with Enter", async () => {
    const onToolSelect = vi.fn();
    render(<ComposerHarness onToolSelect={onToolSelect} />);

    const editor = screen.getByTestId("task-composer-editor");
    await userEvent.click(editor);
    setEditorText(editor, "@评论");

    const mentionMenu = await screen.findByTestId("task-composer-mention-menu");
    expect(within(mentionMenu).getByText("选择工具")).toBeInTheDocument();
    const option = within(mentionMenu).getByRole("option", { name: /亚马逊前台.*亚马逊-商品评论/ });
    expect(option).toBeInTheDocument();

    fireEvent.keyDown(editor, { key: "ArrowDown" });
    await waitFor(() =>
      expect(within(mentionMenu).getByRole("option", { name: /亚马逊前台.*亚马逊-商品评论/ })).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );
    fireEvent.keyDown(editor, { key: "Enter" });

    await waitFor(() => expect(onToolSelect).toHaveBeenCalledWith("amazon-review"));
    expect(screen.queryByTestId("task-composer-mention-menu")).not.toBeInTheDocument();
  });

  it("moves through filtered mention results with arrow keys and selects the active result", async () => {
    const onToolSelect = vi.fn();
    render(<ComposerHarness onToolSelect={onToolSelect} />);

    const editor = screen.getByTestId("task-composer-editor");
    await userEvent.click(editor);
    setEditorText(editor, "@亚马逊前端");

    await screen.findByTestId("task-composer-mention-menu");
    const getMentionMenu = () => screen.getByTestId("task-composer-mention-menu");
    const getSearchOption = () => within(getMentionMenu()).getByRole("option", { name: /亚马逊前台.*亚马逊前端搜索模拟/ });
    const getDetailOption = () => within(getMentionMenu()).getByRole("option", { name: /亚马逊前台.*亚马逊前端-商品详情/ });
    const searchOption = getSearchOption();
    const detailOption = getDetailOption();
    expect(searchOption).toHaveAttribute("aria-selected", "false");
    expect(detailOption).toHaveAttribute("aria-selected", "false");

    fireEvent.keyDown(editor, { key: "Enter" });
    expect(onToolSelect).not.toHaveBeenCalled();
    expect(screen.getByTestId("task-composer-mention-menu")).toBeInTheDocument();

    fireEvent.keyDown(editor, { key: "ArrowUp" });
    await waitFor(() => {
      expect(getDetailOption()).toHaveAttribute("aria-selected", "true");
      expect(getSearchOption()).toHaveAttribute("aria-selected", "false");
    });

    fireEvent.keyDown(editor, { key: "Enter" });

    await waitFor(() => expect(onToolSelect).toHaveBeenCalledWith("amazon-product-detail"));
    expect(onToolSelect).not.toHaveBeenCalledWith("amazon");
    expect(screen.queryByTestId("task-composer-mention-menu")).not.toBeInTheDocument();
  });

  it("excludes template-body-only matches when filtered mention results have datasource name matches", async () => {
    const onToolSelect = vi.fn();
    const customGroups: Parameters<typeof TaskComposer>[0]["dataSourceGroups"] = [
      {
        id: "amazon-group",
        label: "亚马逊前台",
        accent: "var(--color-accent-amazon)",
        icon: "amazon",
        items: [
          {
            id: "amazon",
            label: "亚马逊前端搜索模拟",
            promptHint: "全域覆盖",
            parentId: "amazon-group",
            parentLabel: "亚马逊前台",
            accent: "var(--color-accent-amazon)",
            icon: "amazon",
          },
          {
            id: "amazon-product-detail",
            label: "亚马逊前端-商品详情",
            promptHint: "商品详情",
            parentId: "amazon-group",
            parentLabel: "亚马逊前台",
            accent: "var(--color-accent-amazon)",
            icon: "amazon",
          },
        ],
      },
      {
        id: "alibaba-group",
        label: "店雷达(1688)",
        accent: "var(--color-accent-alibaba)",
        icon: "alibaba",
        items: [
          {
            id: "alibaba-noisy-template",
            label: "店雷达-1688选品库",
            promptHint: "货源筛选",
            promptTemplate: "先用亚马逊前端搜索模拟验证市场，再查询1688货源",
            parentId: "alibaba-group",
            parentLabel: "店雷达(1688)",
            accent: "var(--color-accent-alibaba)",
            icon: "alibaba",
          },
        ],
      },
    ];
    const customItems = customGroups.flatMap((group) => group.items);
    render(<ComposerHarness onToolSelect={onToolSelect} dataSourceGroups={customGroups} dataSourceItems={customItems} />);

    const editor = screen.getByTestId("task-composer-editor");
    await userEvent.click(editor);
    setEditorText(editor, "@亚马逊前端");

    const mentionMenu = await screen.findByTestId("task-composer-mention-menu");
    expect(within(mentionMenu).getByRole("option", { name: /亚马逊前台.*亚马逊前端搜索模拟/ })).toBeInTheDocument();
    expect(within(mentionMenu).getByRole("option", { name: /亚马逊前台.*亚马逊前端-商品详情/ })).toBeInTheDocument();
    expect(within(mentionMenu).queryByRole("option", { name: /店雷达.*1688选品库/ })).not.toBeInTheDocument();

    fireEvent.keyDown(editor, { key: "ArrowUp" });
    await waitFor(() =>
      expect(within(mentionMenu).getByRole("option", { name: /亚马逊前台.*亚马逊前端-商品详情/ })).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );
    fireEvent.keyDown(editor, { key: "Enter" });

    await waitFor(() => expect(onToolSelect).toHaveBeenCalledWith("amazon-product-detail"));
    expect(onToolSelect).not.toHaveBeenCalledWith("alibaba-noisy-template");
  });

  it("does not remove the selected datasource from a plain Backspace press when the token is not selected", async () => {
    const onSourceRemove = vi.fn();
    render(
      <TaskComposer
        value=""
        onValueChange={vi.fn()}
        placeholder="输入任务"
        mode="普通模式"
        onModeChange={vi.fn()}
        selectedSourceIds={["keepa"]}
        onToolSelect={vi.fn()}
        onSourceRemove={onSourceRemove}
        onFilesSelected={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("数据源 Keepa-亚马逊-商品搜索")).toBeInTheDocument();
    const editor = screen.getByTestId("task-composer-editor");
    await userEvent.click(editor);
    fireEvent.keyDown(editor, { key: "Backspace" });

    expect(onSourceRemove).not.toHaveBeenCalled();
  });

  it("accepts a selected datasource prompt template with Tab and renders variable chips", async () => {
    const onToolSelect = vi.fn();
    render(<ComposerHarness onToolSelect={onToolSelect} />);

    await userEvent.click(screen.getByRole("button", { name: /@数据源/ }));

    const listbox = await screen.findByRole("listbox", { name: "数据源列表" });
    const keepaSearch = within(listbox).getByRole("option", { name: /Keepa-亚马逊-商品搜索/ });
    fireEvent.click(keepaSearch);

    const editor = screen.getByTestId("task-composer-editor");
    await waitFor(() => {
      expect(editor).toHaveTextContent("按 Tab 键补全");
    });

    fireEvent.keyDown(editor, { key: "Tab" });

    await waitFor(() => {
      expect(editor).toHaveTextContent("亚马逊美国站,搜索关键词");
      expect(editor).toHaveTextContent("Sports Water Bottles");
      expect(editor).not.toHaveTextContent("{{");
      expect(editor.querySelectorAll("[data-template-slot='true']")).toHaveLength(4);
      expect(editor.querySelector("[data-template-slot='true']")).not.toHaveAttribute("contenteditable", "false");
      expect(editor.querySelector("[data-template-slot='true']")).toHaveClass("cursor-text", "mx-1");
    });
  });

  it("shows datasource template completion after actively selecting a datasource after existing text", async () => {
    render(<ComposerHarness />);

    const editor = screen.getByTestId("task-composer-editor");
    await userEvent.click(editor);
    await userEvent.type(editor, "是是是");

    await userEvent.click(screen.getByRole("button", { name: /@数据源/ }));

    const listbox = await screen.findByRole("listbox", { name: "数据源列表" });
    fireEvent.click(within(listbox).getByRole("option", { name: /Keepa-亚马逊价格历史/ }));

    await waitFor(() => {
      expect(editor).toHaveTextContent("是是是");
      expect(screen.getByLabelText("数据源 Keepa-亚马逊价格历史")).toBeInTheDocument();
    });

    await waitFor(() => expect(editor).toHaveTextContent("按 Tab 键补全"));

    fireEvent.keyDown(editor, { key: "Tab" });

    await waitFor(() => {
      expect(editor).toHaveTextContent("是是是");
      expect(editor).not.toHaveTextContent("按 Tab 键补全");
      expect(editor.querySelectorAll("[data-template-slot='true']").length).toBeGreaterThan(0);
    });
  });

  it("keeps the caret after the selected datasource when clicking its template ghost", async () => {
    render(<ComposerHarness />);

    await userEvent.click(screen.getByRole("button", { name: /@数据源/ }));

    const listbox = await screen.findByRole("listbox", { name: "数据源列表" });
    fireEvent.click(within(listbox).getByRole("option", { name: /Keepa-亚马逊价格历史/ }));

    const editor = screen.getByTestId("task-composer-editor");
    const ghost = await waitFor(() => {
      const node = editor.querySelector<HTMLElement>("[data-template-ghost='true']");
      expect(node).toBeInTheDocument();
      return node!;
    });
    const token = screen.getByLabelText("数据源 Keepa-亚马逊价格历史");
    const ghostIndex = Array.from(editor.childNodes).indexOf(ghost);

    const range = document.createRange();
    range.setStartBefore(token);
    range.collapse(true);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);

    mockElementClientRect(ghost, { left: 120, right: 520, top: 8, bottom: 40, width: 400, height: 32, x: 120, y: 8 });
    fireEvent.mouseDown(editor, { button: 0, clientX: 240, clientY: 24 });

    const selection = window.getSelection();
    expect(selection?.rangeCount).toBe(1);
    const nextRange = selection?.getRangeAt(0);
    expect(nextRange?.startContainer).toBe(editor);
    expect(nextRange?.startOffset).toBe(ghostIndex);
  });

  it("keeps a second datasource placement after accepting the first datasource template", async () => {
    render(<ComposerHarness />);

    await userEvent.click(screen.getByRole("button", { name: /@数据源/ }));
    let listbox = await screen.findByRole("listbox", { name: "数据源列表" });
    fireEvent.click(within(listbox).getByRole("option", { name: /Keepa-亚马逊-商品搜索/ }));

    const editor = screen.getByTestId("task-composer-editor");
    await waitFor(() => expect(editor).toHaveTextContent("按 Tab 键补全"));
    fireEvent.keyDown(editor, { key: "Tab" });
    await waitFor(() => {
      expect(editor).not.toHaveTextContent("按 Tab 键补全");
      expect(editor.querySelectorAll("[data-template-slot='true']").length).toBeGreaterThan(0);
    });

    placeCaretAtElementEnd(editor);
    const trigger = screen.getByRole("button", { name: /@数据源/ });
    fireEvent.pointerDown(trigger);
    window.getSelection()?.removeAllRanges();
    fireEvent.click(trigger);
    listbox = await screen.findByRole("listbox", { name: "数据源列表" });
    fireEvent.click(within(listbox).getByRole("option", { name: /Keepa-亚马逊价格历史/ }));

    await waitFor(() => expect(editor).toHaveTextContent("按 Tab 键补全"));
    const childSummary = Array.from(editor.childNodes).map((node) => {
      if (node.nodeType === Node.TEXT_NODE) return { type: "text", text: node.textContent ?? "" };
      const element = node as HTMLElement;
      return { type: "tag", sourceId: element.dataset.toolId ?? "", text: element.textContent ?? "" };
    });
    const firstTagIndex = childSummary.findIndex((item) => item.type === "tag");
    const secondTagIndex = childSummary.findIndex((item) => item.type === "tag" && item.sourceId === "keepa-price-history");

    expect(firstTagIndex).toBeGreaterThanOrEqual(0);
    expect(secondTagIndex).toBeGreaterThan(firstTagIndex);
  });

  it("accepts datasource template completion after selecting a filtered mention result", async () => {
    const onToolSelect = vi.fn();
    render(<ComposerHarness onToolSelect={onToolSelect} />);

    const editor = screen.getByTestId("task-composer-editor");
    await userEvent.click(editor);
    setEditorText(editor, "@价格历史");

    const mentionMenu = await screen.findByTestId("task-composer-mention-menu");
    const priceHistoryOption = within(mentionMenu).getByRole("option", { name: /Keepa.*亚马逊价格历史/ });
    expect(priceHistoryOption).toHaveAttribute("aria-selected", "false");

    fireEvent.keyDown(editor, { key: "ArrowDown" });
    await waitFor(() => expect(priceHistoryOption).toHaveAttribute("aria-selected", "true"));
    fireEvent.keyDown(editor, { key: "Enter" });

    await waitFor(() => expect(onToolSelect).toHaveBeenCalledWith("keepa-price-history"));
    await waitFor(() => {
      expect(screen.getByLabelText("数据源 Keepa-亚马逊价格历史")).toBeInTheDocument();
      expect(editor).toHaveTextContent("按 Tab 键补全");
      expect(editor).toHaveTextContent("过去{{12个月}}价格历史记录");
    });

    fireEvent.keyDown(editor, { key: "Tab" });

    await waitFor(() => {
      expect(editor).toHaveTextContent("亚马逊美国站");
      expect(editor).toHaveTextContent("B0DD4GFNNG");
      expect(editor).toHaveTextContent("过去12个月价格历史记录");
      expect(editor.querySelectorAll("[data-template-slot='true']")).toHaveLength(3);
      expect(editor).not.toHaveTextContent("{{");
      expect(editor).not.toHaveTextContent("按 Tab 键补全");
    });
  });

  it("matches datasource mentions embedded inside an accepted completion template", async () => {
    const customDataSourceGroups: Parameters<typeof TaskComposer>[0]["dataSourceGroups"] = [
      {
        id: "sif-group",
        label: "Sif数据分析工具",
        accent: "var(--color-accent-sif)",
        icon: "store",
        items: [
          {
            id: "sif-asin-traffic-source",
            label: "SIF-ASIN流量来源",
            promptHint: "流量来源分析",
            promptTemplate:
              "1.@SIF-ASIN流量来源: 在{{美国站}}查询ASIN为：{{B0C6CLB49N}}的流量来源。\n2.统计主要关键词的搜索热度。\n3.分析该竞品主要靠广告驱动还是自然流量驱动。",
            parentId: "sif-group",
            parentLabel: "Sif数据分析工具",
            accent: "var(--color-accent-sif)",
            icon: "store",
          },
        ],
      },
    ];
    const customDataSourceItems = customDataSourceGroups.flatMap((group) => group.items);

    render(
      <ComposerHarness
        dataSourceGroups={customDataSourceGroups}
        dataSourceItems={customDataSourceItems}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /@数据源/ }));
    const listbox = await screen.findByRole("listbox", { name: "数据源列表" });
    fireEvent.click(within(listbox).getByRole("option", { name: /SIF-ASIN流量来源/ }));

    const editor = screen.getByTestId("task-composer-editor");
    await waitFor(() => {
      expect(editor).toHaveTextContent("SIF-ASIN流量来源");
      expect(editor).not.toHaveTextContent("@SIF-ASIN流量来源");
      expect(editor).toHaveTextContent("按 Tab 键补全");
    });

    fireEvent.keyDown(editor, { key: "Tab" });

    await waitFor(() => {
      const sourceToken = screen.getByLabelText("数据源 SIF-ASIN流量来源");
      expect(sourceToken).toBeInTheDocument();
      expect(editor.querySelectorAll("[data-tool-token='true'][data-tool-id='sif-asin-traffic-source']")).toHaveLength(1);
      expect(
        Array.from(editor.childNodes)
          .filter((node) => node.nodeType === Node.TEXT_NODE)
          .map((node) => node.textContent ?? "")
          .join(""),
      ).not.toContain("@SIF-ASIN流量来源");
      expect(sourceToken.previousSibling?.textContent).toBe("1.");
      expect(sourceToken.nextSibling?.textContent).toMatch(/^: 在/);
      expect(editor).toHaveTextContent("查询ASIN为");
      expect(editor.querySelectorAll("[data-template-slot='true']")).toHaveLength(2);
      expect(editor).not.toHaveTextContent("{{");
      expect(editor).not.toHaveTextContent("按 Tab 键补全");
    });
  });

  it("adds secondary datasource tokens when an accepted completion template references another datasource", async () => {
    const onToolSelect = vi.fn();
    const customDataSourceGroups: Parameters<typeof TaskComposer>[0]["dataSourceGroups"] = [
      {
        id: "custom-group",
        label: "组合工具",
        accent: "var(--color-primary)",
        icon: "grid",
        items: [
          {
            id: "primary-source",
            label: "主数据源",
            promptHint: "主流程",
            promptTemplate: "先用@辅助数据源 查询{{关键词}}，再汇总输出",
            parentId: "custom-group",
            parentLabel: "组合工具",
            accent: "var(--color-primary)",
            icon: "grid",
          },
          {
            id: "secondary-source",
            label: "辅助数据源",
            promptHint: "辅助查询",
            parentId: "custom-group",
            parentLabel: "组合工具",
            accent: "var(--color-primary)",
            icon: "grid",
          },
        ],
      },
    ];
    const customDataSourceItems = customDataSourceGroups.flatMap((group) => group.items);

    render(
      <ComposerHarness
        onToolSelect={onToolSelect}
        dataSourceGroups={customDataSourceGroups}
        dataSourceItems={customDataSourceItems}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /@数据源/ }));
    const listbox = await screen.findByRole("listbox", { name: "数据源列表" });
    fireEvent.click(within(listbox).getByRole("option", { name: /主数据源/ }));

    const editor = screen.getByTestId("task-composer-editor");
    await waitFor(() => {
      expect(editor).toHaveTextContent("@辅助数据源");
      expect(editor).toHaveTextContent("按 Tab 键补全");
    });

    fireEvent.keyDown(editor, { key: "Tab" });

    await waitFor(() => {
      expect(onToolSelect).toHaveBeenCalledWith("primary-source");
      expect(onToolSelect).toHaveBeenCalledWith("secondary-source");
      const tokenIds = Array.from(editor.querySelectorAll<HTMLElement>("[data-tool-token='true'][data-tool-id]")).map(
        (node) => node.dataset.toolId,
      );
      expect(tokenIds).toEqual(["primary-source", "secondary-source"]);
      expect(screen.getByLabelText("数据源 主数据源")).toBeInTheDocument();
      const secondaryToken = screen.getByLabelText("数据源 辅助数据源");
      expect(secondaryToken).toBeInTheDocument();
      expect(secondaryToken.previousSibling?.textContent).toContain("先用");
      expect(secondaryToken.nextSibling?.textContent).toMatch(/^ 查询/);
      expect(
        Array.from(editor.childNodes)
          .filter((node) => node.nodeType === Node.TEXT_NODE)
          .map((node) => node.textContent ?? "")
          .join(""),
      ).not.toContain("@辅助数据源");
      expect(editor.querySelectorAll("[data-template-slot='true']")).toHaveLength(1);
      expect(editor).not.toHaveTextContent("{{");
      expect(editor).not.toHaveTextContent("按 Tab 键补全");
    });
  });

  it("keeps a template chip when deleting its last character, then removes it on the next delete", async () => {
    render(<ComposerHarness />);

    await userEvent.click(screen.getByRole("button", { name: /@数据源/ }));

    const listbox = await screen.findByRole("listbox", { name: "数据源列表" });
    fireEvent.click(within(listbox).getByRole("option", { name: /Keepa-亚马逊-商品搜索/ }));

    const editor = screen.getByTestId("task-composer-editor");
    await waitFor(() => {
      expect(editor).toHaveTextContent("按 Tab 键补全");
    });

    fireEvent.keyDown(editor, { key: "Tab" });

    const siteSlot = await waitFor(() => {
      const slot = editor.querySelector<HTMLElement>("[data-template-slot='true']");
      expect(slot).toBeInTheDocument();
      return slot!;
    });
    siteSlot.textContent = "站";
    placeCaretInTextNode(siteSlot.firstChild as Text, 1);

    fireEvent.keyDown(editor, { key: "Backspace" });

    expect(siteSlot.isConnected).toBe(true);
    expect(siteSlot.dataset.empty).toBe("true");
    expect(siteSlot.textContent).toBe("\u200b");

    fireEvent.keyDown(editor, { key: "Backspace" });

    expect(siteSlot.isConnected).toBe(false);
    expect(editor.querySelectorAll("[data-template-slot='true']")).toHaveLength(3);
  });

  it("keeps a template chip when deleting from the adjacent caret position", async () => {
    render(<ComposerHarness />);

    await userEvent.click(screen.getByRole("button", { name: /@数据源/ }));

    const listbox = await screen.findByRole("listbox", { name: "数据源列表" });
    fireEvent.click(within(listbox).getByRole("option", { name: /Keepa-亚马逊-商品搜索/ }));

    const editor = screen.getByTestId("task-composer-editor");
    await waitFor(() => {
      expect(editor).toHaveTextContent("按 Tab 键补全");
    });

    fireEvent.keyDown(editor, { key: "Tab" });

    const siteSlot = await waitFor(() => {
      const slot = editor.querySelector<HTMLElement>("[data-template-slot='true']");
      expect(slot).toBeInTheDocument();
      return slot!;
    });
    siteSlot.textContent = "站";
    placeCaretAfterElement(siteSlot);

    fireEvent.keyDown(editor, { key: "Backspace" });

    expect(siteSlot.isConnected).toBe(true);
    expect(siteSlot.dataset.empty).toBe("true");
    expect(siteSlot.textContent).toBe("\u200b");

    fireEvent.keyDown(editor, { key: "Backspace" });

    expect(siteSlot.isConnected).toBe(false);
    expect(editor.querySelectorAll("[data-template-slot='true']")).toHaveLength(3);
  });

  it("accepts the visible selected datasource prompt template", async () => {
    const customDataSourceGroups: Parameters<typeof TaskComposer>[0]["dataSourceGroups"] = [
      {
        id: "custom-group",
        label: "自定义",
        accent: "var(--color-primary)",
        icon: "grid",
        items: [
          {
            id: "multi-template-tool",
            label: "多模板数据源",
            promptHint: "自定义",
            promptTemplate: "第一条查询 {{关键词}}",
            promptTemplates: ["第一条查询 {{关键词}}", "第二条查询 {{ASIN}}"],
            parentId: "custom-group",
            parentLabel: "自定义",
            accent: "var(--color-primary)",
            icon: "grid",
          },
        ],
      },
    ];
    const customDataSourceItems = customDataSourceGroups.flatMap((group) => group.items);

    render(
      <ComposerHarness
        dataSourceGroups={customDataSourceGroups}
        dataSourceItems={customDataSourceItems}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /@数据源/ }));
    const listbox = await screen.findByRole("listbox", { name: "数据源列表" });
    fireEvent.click(within(listbox).getByRole("option", { name: /多模板数据源/ }));

    const editor = screen.getByTestId("task-composer-editor");
    await waitFor(() => {
      expect(editor).toHaveTextContent("第一条查询");
      expect(editor).toHaveTextContent("按 Tab 键补全");
    });

    fireEvent.keyDown(editor, { key: "Tab" });

    await waitFor(() => {
      expect(editor).toHaveTextContent("第一条查询");
      expect(editor).toHaveTextContent("关键词");
      expect(editor).not.toHaveTextContent("按 Tab 键补全");
      expect(editor.querySelectorAll("[data-template-slot='true']")).toHaveLength(1);
    });
  });

  it("pastes clipboard images as composer attachments", async () => {
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:composer-preview"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });

	    const onAttachmentsChange = vi.fn();
	    const onFilesSelected = vi.fn();
	    const onSubmit = vi.fn();

    try {
      render(
        <TaskComposer
          value=""
          onValueChange={vi.fn()}
          placeholder="输入任务"
          mode="普通模式"
          onModeChange={vi.fn()}
          selectedSourceIds={[]}
          onToolSelect={vi.fn()}
          onSourceRemove={vi.fn()}
	          onFilesSelected={onFilesSelected}
	          onAttachmentsChange={onAttachmentsChange}
	          onSubmit={onSubmit}
	        />,
	      );
      onAttachmentsChange.mockClear();

      const editor = screen.getByTestId("task-composer-editor");
      const image = new File(["image-bytes"], "", { type: "image/png" });
      fireEvent.paste(editor, {
        clipboardData: {
          getData: vi.fn(() => ""),
          items: [{ kind: "file", type: "image/png", getAsFile: () => image }],
          files: [],
        },
      });

      await waitFor(() => {
        expect(onAttachmentsChange).toHaveBeenLastCalledWith([
          expect.objectContaining({ name: "pasted-image-1.png", type: "image/png" }),
        ]);
      });
	      expect(onFilesSelected).not.toHaveBeenCalled();
	      expect(screen.getByText("pasted-image-1.png")).toBeInTheDocument();
	      expect(screen.getByLabelText("图片预览 pasted-image-1.png")).toBeInTheDocument();
	      expect(screen.getByTestId("task-composer-submit")).toBeDisabled();
	      await userEvent.click(screen.getByTestId("task-composer-submit"));
	      expect(onSubmit).not.toHaveBeenCalled();
	      expect(screen.getByText("pasted-image-1.png")).toBeInTheDocument();
	    } finally {
      Object.defineProperty(URL, "createObjectURL", {
        configurable: true,
        value: originalCreateObjectURL,
      });
      Object.defineProperty(URL, "revokeObjectURL", {
        configurable: true,
        value: originalRevokeObjectURL,
      });
    }
  });

  it("uses the native undoable edit command for pasted text", () => {
    const originalExecCommand = document.execCommand;
    const onValueChange = vi.fn();

    render(
      <TaskComposer
        value=""
        onValueChange={onValueChange}
        placeholder="输入任务"
        mode="普通模式"
        onModeChange={vi.fn()}
        selectedSourceIds={[]}
        onToolSelect={vi.fn()}
        onSourceRemove={vi.fn()}
        onFilesSelected={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    const editor = screen.getByTestId("task-composer-editor");
    const execCommand = vi.fn((_command: string, _showUi?: boolean, value?: string) => {
      editor.textContent = value ?? "";
      return true;
    });
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: execCommand,
    });

    try {
      fireEvent.paste(editor, {
        clipboardData: {
          getData: (type: string) => (type === "text/plain" ? "需要分析库存" : ""),
          items: [],
          files: [],
        },
      });

      expect(execCommand).toHaveBeenCalledWith("insertText", false, "需要分析库存");
      expect(onValueChange).toHaveBeenLastCalledWith("需要分析库存");
    } finally {
      Object.defineProperty(document, "execCommand", {
        configurable: true,
        value: originalExecCommand,
      });
    }
  });
});
