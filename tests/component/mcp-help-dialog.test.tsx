import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { McpHelpDialog } from "@/components/mcp-help-dialog";


describe("MCP 使用帮助弹窗", () => {
  it("展示 Codex 与 WorkBuddy 的接入配置", () => {
    render(<McpHelpDialog open onOpenChange={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "MCP 使用帮助" })).toBeInTheDocument();
    expect(screen.getByText(/安装 MCP 到 Codex/)).toBeInTheDocument();
    expect(screen.getByText(/安装 MCP 到 WorkBuddy/)).toBeInTheDocument();
    expect(screen.getByText(/安装 MCP 到 Claude/)).toBeInTheDocument();
    expect(screen.getByText(/\[mcp_servers.data-agent\]/)).toBeInTheDocument();
    expect(screen.getAllByText(/"mcpServers"/).length).toBeGreaterThanOrEqual(2);
  });
});
