import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { TaskComposer } from "@/components/task-composer";

function ComposerHarness({
  onToolSelect = vi.fn(),
  dataSourceGroups,
  dataSourceItems,
}: {
  onToolSelect?: (capabilityId: string) => void;
  dataSourceGroups?: Parameters<typeof TaskComposer>[0]["dataSourceGroups"];
  dataSourceItems?: Parameters<typeof TaskComposer>[0]["dataSourceItems"];
}) {
  const [value, setValue] = useState("");
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);

  return (
    <TaskComposer
      value={value}
      onValueChange={setValue}
      placeholder="输入任务"
      mode="普通模式"
      onModeChange={vi.fn()}
      selectedSourceIds={selectedSourceIds}
      dataSourceGroups={dataSourceGroups}
      dataSourceItems={dataSourceItems}
      onToolSelect={(capabilityId) => {
        onToolSelect(capabilityId);
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

describe("task composer data source menu", () => {
  it("uses first-level categories to navigate second-level datasource cards", async () => {
    const onToolSelect = vi.fn();
    render(<ComposerHarness onToolSelect={onToolSelect} />);

    await userEvent.click(screen.getByRole("button", { name: /@数据源/ }));

    const listbox = await screen.findByRole("listbox", { name: "数据源列表" });
    expect(listbox).toHaveStyle({ height: "360px" });
    expect(screen.getByTestId("task-composer-source-category-pane")).toHaveClass("h-full", "overflow-y-auto");
    expect(screen.getByTestId("task-composer-source-option-pane")).toHaveClass("h-full", "overflow-y-auto");
    const amazonCategory = within(listbox).getByRole("button", { name: "亚马逊前台" });
    await userEvent.click(amazonCategory);

    const amazonOption = within(listbox).getByRole("option", { name: /亚马逊前端搜索模拟/ });
    expect(amazonOption).toHaveAttribute("aria-selected", "true");

    fireEvent.pointerDown(amazonOption);
    await waitFor(() => expect(onToolSelect).toHaveBeenCalledWith("amazon"));
    expect(screen.getByLabelText("移除数据源 亚马逊前端搜索模拟")).toBeInTheDocument();
  });

  it("supports two-pane arrow-key navigation and Enter selection in the button popover", async () => {
    const onToolSelect = vi.fn();
    render(<ComposerHarness onToolSelect={onToolSelect} />);

    await userEvent.click(screen.getByRole("button", { name: /@数据源/ }));

    const listbox = await screen.findByRole("listbox", { name: "数据源列表" });
    const keepaCategory = within(listbox).getByRole("button", { name: "Keepa" });
    await waitFor(() => expect(keepaCategory).toHaveFocus());

    await userEvent.keyboard("{ArrowRight}");
    const keepaSearch = within(listbox).getByRole("option", { name: /Keepa-亚马逊-商品搜索/ });
    await waitFor(() => expect(keepaSearch).toHaveFocus());

    await userEvent.keyboard("{ArrowDown}");
    const keepaPriceHistory = within(listbox).getByRole("option", { name: /Keepa-亚马逊价格历史/ });
    await waitFor(() => expect(keepaPriceHistory).toHaveFocus());

    await userEvent.keyboard("{Enter}");

    await waitFor(() => expect(onToolSelect).toHaveBeenCalledWith("keepa-price-history"));
    expect(listbox).not.toBeInTheDocument();
  });

  it("opens the two-column datasource menu for a bare mention trigger", async () => {
    render(<ComposerHarness />);

    const editor = screen.getByTestId("task-composer-editor");
    await userEvent.click(editor);
    await userEvent.type(editor, "@");

    const mentionMenu = await screen.findByTestId("task-composer-mention-menu");
    expect(within(mentionMenu).getByText("@数据源")).toBeInTheDocument();
    expect(mentionMenu).toHaveStyle({ width: "760px" });
    expect(screen.getByTestId("task-composer-mention-category-pane")).toBeInTheDocument();
    expect(screen.getByTestId("task-composer-mention-option-pane")).toBeInTheDocument();
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

    fireEvent.keyDown(editor, { key: "ArrowDown" });
    const keepaCategory = within(mentionMenu).getByRole("button", { name: "Keepa" });
    await waitFor(() => expect(keepaCategory).toHaveFocus());

    fireEvent.keyDown(keepaCategory, { key: "ArrowDown" });
    const amazonCategory = within(mentionMenu).getByRole("button", { name: "亚马逊前台" });
    await waitFor(() => expect(amazonCategory).toHaveFocus());

    fireEvent.keyDown(amazonCategory, { key: "ArrowRight" });
    const amazonSearch = within(mentionMenu).getByRole("option", { name: /亚马逊前端搜索模拟/ });
    await waitFor(() => expect(amazonSearch).toHaveFocus());

    fireEvent.keyDown(amazonSearch, { key: "ArrowDown" });
    const amazonReview = within(mentionMenu).getByRole("option", { name: /亚马逊-商品评论/ });
    await waitFor(() => expect(amazonReview).toHaveFocus());

    fireEvent.keyDown(amazonReview, { key: "ArrowUp" });
    await waitFor(() => expect(amazonSearch).toHaveFocus());
    fireEvent.keyDown(amazonSearch, { key: "ArrowLeft" });
    await waitFor(() => expect(amazonCategory).toHaveFocus());

    fireEvent.keyDown(amazonCategory, { key: "ArrowRight" });
    await waitFor(() => expect(amazonSearch).toHaveFocus());
    fireEvent.keyDown(amazonSearch, { key: "Enter" });
    await waitFor(() => expect(onToolSelect).toHaveBeenCalledWith("amazon"));
    expect(screen.queryByTestId("task-composer-mention-menu")).not.toBeInTheDocument();
  });

  it("opens a lightweight filtered mention menu and inserts the selected second-level datasource", async () => {
    const onToolSelect = vi.fn();
    render(<ComposerHarness onToolSelect={onToolSelect} />);

    const editor = screen.getByTestId("task-composer-editor");
    await userEvent.click(editor);
    await userEvent.type(editor, "@亚马逊");

    const mentionMenu = await screen.findByTestId("task-composer-mention-menu");
    expect(within(mentionMenu).getByText("选择工具")).toBeInTheDocument();
    expect(mentionMenu).toHaveStyle({ width: "340px" });
    expect(screen.queryByTestId("task-composer-source-category-pane")).not.toBeInTheDocument();
    const option = within(mentionMenu).getByRole("option", { name: /亚马逊前台.*亚马逊前端搜索模拟/ });

    fireEvent.pointerDown(option);

    await waitFor(() => expect(onToolSelect).toHaveBeenCalledWith("amazon"));
    expect(screen.queryByTestId("task-composer-mention-menu")).not.toBeInTheDocument();
    expect(screen.getByLabelText("移除数据源 亚马逊前端搜索模拟")).toBeInTheDocument();
  });

  it("searches after a typed mention query and selects the filtered result with Enter", async () => {
    const onToolSelect = vi.fn();
    render(<ComposerHarness onToolSelect={onToolSelect} />);

    const editor = screen.getByTestId("task-composer-editor");
    await userEvent.click(editor);
    await userEvent.type(editor, "@评论");

    const mentionMenu = await screen.findByTestId("task-composer-mention-menu");
    expect(within(mentionMenu).getByText("选择工具")).toBeInTheDocument();
    expect(within(mentionMenu).getByRole("option", { name: /亚马逊前台.*亚马逊-商品评论/ })).toBeInTheDocument();

    await userEvent.keyboard("{Enter}");

    await waitFor(() => expect(onToolSelect).toHaveBeenCalledWith("amazon-review"));
    expect(screen.queryByTestId("task-composer-mention-menu")).not.toBeInTheDocument();
  });

  it("accepts a selected datasource prompt template with Tab and renders variable chips", async () => {
    const onToolSelect = vi.fn();
    render(<ComposerHarness onToolSelect={onToolSelect} />);

    await userEvent.click(screen.getByRole("button", { name: /@数据源/ }));

    const listbox = await screen.findByRole("listbox", { name: "数据源列表" });
    const keepaSearch = within(listbox).getByRole("option", { name: /Keepa-亚马逊-商品搜索/ });
    fireEvent.pointerDown(keepaSearch);

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

  it("cycles selected datasource prompt templates and accepts the currently visible query", async () => {
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
    fireEvent.pointerDown(within(listbox).getByRole("option", { name: /多模板数据源/ }));

    const editor = screen.getByTestId("task-composer-editor");
    await waitFor(() => {
      expect(editor).toHaveTextContent("第一条查询");
      expect(editor).toHaveTextContent("按 Tab 键补全");
    });

    await waitFor(
      () => {
        expect(editor).toHaveTextContent("第二条查询");
      },
      { timeout: 5000 },
    );

    fireEvent.keyDown(editor, { key: "Tab" });

    await waitFor(() => {
      expect(editor).toHaveTextContent("第二条查询");
      expect(editor).toHaveTextContent("ASIN");
      expect(editor).not.toHaveTextContent("按 Tab 键补全");
      expect(editor.querySelectorAll("[data-template-slot='true']")).toHaveLength(1);
    });
  }, 10000);
});
