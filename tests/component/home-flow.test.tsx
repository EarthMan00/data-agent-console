import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MoreDataHomePage } from "@/components/more-data-home-page";

const replace = vi.fn();

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

describe("home flow", () => {
  it("keeps prompt cards stable when selecting datasource tokens", async () => {
    render(<MoreDataHomePage />);

    const initialCount = screen.getAllByLabelText(/^打开示例任务 /).length;
    const editor = screen.getByTestId("task-composer-editor");
    editor.textContent = "@";
    fireEvent.input(editor);

    const mentionMenu = await screen.findByTestId("task-composer-mention-menu");
    const option = within(mentionMenu).getByRole("button", { name: /Keepa/ });
    fireEvent.mouseDown(option);

    await waitFor(() => {
      expect(screen.getByLabelText("移除数据源 Keepa")).toBeInTheDocument();
    });
    expect(screen.getAllByLabelText(/^打开示例任务 /)).toHaveLength(initialCount);
  });

  it("opens the sample task dialog with replay and use actions", async () => {
    render(<MoreDataHomePage />);

    fireEvent.click(screen.getAllByLabelText(/^打开示例任务 /)[0]);

    await waitFor(() => {
      expect(screen.getByText("提示词(Prompt)")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "查看回放" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "使用" })).toBeInTheDocument();
  });
});
