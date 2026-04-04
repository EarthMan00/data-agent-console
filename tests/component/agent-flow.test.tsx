import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AgentWorkspace } from "@/components/agent-workspace";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("runId=run-default"),
  usePathname: () => "/",
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock("@tdesign-react/aigc", () => ({
  ChatAttachments: ({ items }: { items: Array<{ name: string }> }) => (
    <div>{items.map((item) => item.name).join("、")}</div>
  ),
}));

describe("agent flow", () => {
  it("renders the current /agent structure with summary bar, result section, and preview", () => {
    render(<AgentWorkspace />);

    expect(screen.getByTestId("agent-user-input-card")).toBeInTheDocument();
    expect(screen.getByTestId("agent-split-section")).toBeInTheDocument();
    expect(screen.getByTestId("agent-execution-summary-bar")).toBeInTheDocument();
    expect(screen.getByTestId("agent-result-section")).toBeInTheDocument();
    expect(screen.getByTestId("agent-preview-panel")).toBeInTheDocument();
  });

  it("expands the execution card when clicking the summary bar", () => {
    render(<AgentWorkspace />);

    fireEvent.click(screen.getByTestId("agent-execution-summary-bar"));
    expect(screen.getByTestId("agent-execution-panel")).toBeInTheDocument();
    expect(screen.getByTestId("agent-execution-panel")).not.toHaveTextContent("调用工具");
    expect(screen.getByTestId("agent-execution-panel")).toContainHTML("亚马逊");
  });
});
