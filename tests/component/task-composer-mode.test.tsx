import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { TaskComposer } from "@/components/task-composer";

function ModeHarness() {
  const [mode, setMode] = useState<"普通模式" | "报告模式">("普通模式");
  return (
    <TaskComposer
      value=""
      onValueChange={() => undefined}
      placeholder="输入任务"
      mode={mode}
      onModeChange={setMode}
      selectedSourceIds={[]}
      onToolSelect={() => undefined}
      onSourceRemove={() => undefined}
      onFilesSelected={() => undefined}
      onSubmit={() => undefined}
    />
  );
}

describe("TaskComposer report mode selector", () => {
  it("opens the mode popover and reports the selected 报告模式", () => {
    render(<ModeHarness />);

    const trigger = screen.getByTestId("task-composer-mode-trigger");
    expect(trigger).toHaveTextContent("普通模式");

    fireEvent.click(trigger);

    const reportOption = screen.getByRole("button", { name: "报告模式" });
    expect(reportOption).toBeVisible();

    fireEvent.click(reportOption);
    expect(trigger).toHaveTextContent("报告模式");
  });

  it("keeps the mode popover options limited to 普通模式 and 报告模式", () => {
    const onModeChange = vi.fn();
    render(
      <TaskComposer
        value=""
        onValueChange={() => undefined}
        placeholder="输入任务"
        mode="普通模式"
        onModeChange={onModeChange}
        selectedSourceIds={[]}
        onToolSelect={() => undefined}
        onSourceRemove={() => undefined}
        onFilesSelected={() => undefined}
        onSubmit={() => undefined}
      />,
    );

    fireEvent.click(screen.getByTestId("task-composer-mode-trigger"));
    expect(screen.getByRole("button", { name: "普通模式" })).toBeVisible();
    expect(screen.getByRole("button", { name: "报告模式" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "深度模式" })).toBeNull();
  });
});
