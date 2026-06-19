import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AliceHomePage } from "@/components/alice-home-page";
import { workspaceActions } from "@/lib/workspace-store";

const replace = vi.fn();
const platformAgentMock = vi.hoisted(() => ({
  auth: { accessToken: "token", userId: "u1" },
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
  withFreshToken: vi.fn(),
}));
const shellStateMock = vi.hoisted(() => ({
  refreshHistoryNow: vi.fn(),
  setActiveSessionTitle: vi.fn(),
  upsertOptimisticHistorySession: vi.fn(),
}));

vi.mock("@/components/agent-workspace", () => ({
  AgentWorkspace: () => <div>agent workspace</div>,
}));

vi.mock("@/components/ui/flickering-grid", () => ({
  FlickeringGrid: () => <div data-testid="flickering-grid" />,
}));

vi.mock("@/components/alice-shell", () => ({
  AliceShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useAliceShellState: () => shellStateMock,
}));

vi.mock("@/components/platform-agent-provider", () => ({
  useOptionalPlatformAgent: () => platformAgentMock,
}));

vi.mock("@/lib/agent-runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agent-runtime")>();
  return {
    ...actual,
    isAgentRuntimeConfigured: () => true,
    isPlatformBackendEnabled: () => true,
  };
});

vi.mock("@/lib/agent-api/home-prompts", () => ({
  fetchHomePromptRecommendations: vi.fn(() => Promise.resolve([])),
  fetchPublicPromptCategories: vi.fn(() => Promise.resolve([])),
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

describe("home attachments", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    replace.mockClear();
    platformAgentMock.beginNewHomeTaskSession.mockResolvedValue("session-home");
    platformAgentMock.setActivePlatformSession.mockClear();
    shellStateMock.refreshHistoryNow.mockClear();
    shellStateMock.setActiveSessionTitle.mockClear();
    shellStateMock.upsertOptimisticHistorySession.mockClear();
  });

  it("starts the first task with only attachments still visible in the home composer", async () => {
    const startPlatformTask = vi.spyOn(workspaceActions, "startPlatformTask").mockReturnValue("run-home");
    const first = new File(["aad"], "AAD_SSO_Vendor_Implementation_Guide.md", { type: "text/markdown" });
    const second = new File(["dump"], "LocalDumps.reg", { type: "application/octet-stream" });
    const third = new File(["cards"], "agent_linkfox_all_category_cards.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const { container } = render(<AliceHomePage />);
    const editor = screen.getByTestId("task-composer-editor");
    await userEvent.click(editor);
    await userEvent.type(editor, "分析一下附件");

    const fileInput = container.querySelector<HTMLInputElement>("input[type='file']");
    expect(fileInput).not.toBeNull();
    fireEvent.change(fileInput!, { target: { files: [first, second, third] } });

    await waitFor(() => {
      expect(screen.getByText("AAD_SSO_Vendor_Implementation_Guide.md")).toBeInTheDocument();
      expect(screen.getByText("LocalDumps.reg")).toBeInTheDocument();
      expect(screen.getByText("agent_linkfox_all_category_cards.xlsx")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByLabelText("删除附件 AAD_SSO_Vendor_Implementation_Guide.md"));
    await userEvent.click(screen.getByLabelText("删除附件 LocalDumps.reg"));
    await userEvent.click(screen.getByTestId("task-composer-submit"));

    await waitFor(() => {
      expect(startPlatformTask).toHaveBeenCalledTimes(1);
    });
    expect(startPlatformTask).toHaveBeenCalledWith(
      expect.objectContaining({
        pendingFiles: [third],
      }),
    );
  });
});
