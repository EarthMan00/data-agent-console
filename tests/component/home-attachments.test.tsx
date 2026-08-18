import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AliceHomePage } from "@/components/alice-home-page";

const replace = vi.fn();
const createInitialChatRound = vi.hoisted(() => vi.fn());
const safeRandomUUID = vi.hoisted(() => vi.fn(() => "a62430bc-1417-4b95-9432-937b331a7d7a"));
const platformAgentMock = vi.hoisted(() => ({
  auth: { accessToken: "token", userId: "u1" },
  authHydrated: true,
  authValidated: true,
  platformSessionId: null,
  openLogin: vi.fn(),
  closeLogin: vi.fn(),
  loginWithPassword: vi.fn(),
  logout: vi.fn(),
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

vi.mock("@/components/alice-shell", () => ({
  AliceShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useAliceShellState: () => shellStateMock,
}));

vi.mock("@/components/platform-agent-provider", () => ({
  useOptionalPlatformAgent: () => platformAgentMock,
}));

vi.mock("@/lib/agent-api/chat-rounds", () => ({ createInitialChatRound }));

vi.mock("@/lib/random-uuid", () => ({ safeRandomUUID }));

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
    createInitialChatRound.mockReset();
    safeRandomUUID.mockClear();
    createInitialChatRound.mockResolvedValue({
      session_id: "f4159ee9-c863-41c8-9c1b-ffbfa193917f",
      round_id: "3da8ff9a-95e2-4f9e-9788-7fda3d450fe7",
      assistant_message_id: "46aa60a5-64dd-471d-adfe-9856a3ee17c5",
      status: "QUEUED",
      last_event_seq: 1,
    });
    platformAgentMock.withFreshToken.mockReset();
    platformAgentMock.withFreshToken.mockImplementation(
      async (run: (token: string) => Promise<unknown>) => run("token"),
    );
    platformAgentMock.setActivePlatformSession.mockClear();
    shellStateMock.refreshHistoryNow.mockClear();
    shellStateMock.setActiveSessionTitle.mockClear();
    shellStateMock.upsertOptimisticHistorySession.mockClear();
  });

  it("uploads only the still-visible files in the single initial Round request", async () => {
    const first = new File(["aad"], "AAD_SSO_Vendor_Implementation_Guide.md", { type: "text/markdown" });
    const second = new File(["dump"], "LocalDumps.reg", { type: "application/octet-stream" });
    const third = new File(["cards"], "agent_linkfox_all_category_cards.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const { container } = render(<AliceHomePage />);
    const editor = screen.getByTestId("task-composer-editor");
    await userEvent.click(editor);
    await userEvent.type(editor, "analyze attachments");

    const fileInput = container.querySelector<HTMLInputElement>("input[type='file']");
    expect(fileInput).not.toBeNull();
    fireEvent.change(fileInput!, { target: { files: [first, second, third] } });

    await waitFor(() => {
      expect(screen.getByText("AAD_SSO_Vendor_Implementation_Guide.md")).toBeInTheDocument();
      expect(screen.getByText("LocalDumps.reg")).toBeInTheDocument();
      expect(screen.getByText("agent_linkfox_all_category_cards.xlsx")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByLabelText(/AAD_SSO_Vendor_Implementation_Guide\.md/));
    await userEvent.click(screen.getByLabelText(/LocalDumps\.reg/));
    await userEvent.click(screen.getByTestId("task-composer-submit"));

    await waitFor(() => {
      expect(createInitialChatRound).toHaveBeenCalledTimes(1);
    });
    expect(createInitialChatRound).toHaveBeenCalledWith(
      "token",
      "analyze attachments",
      "a62430bc-1417-4b95-9432-937b331a7d7a",
      [third],
      "normal",
    );
    expect(replace).toHaveBeenCalledWith(
      "/agent?sessionId=f4159ee9-c863-41c8-9c1b-ffbfa193917f",
    );
  });

  it("reuses identity only for the same ordered File object references", async () => {
    const first = new File(["first payload"], "payload.csv", {
      type: "text/csv",
      lastModified: 1234,
    });
    const changed = new File(["other payload"], "payload.csv", {
      type: "text/csv",
      lastModified: 1234,
    });
    expect(changed).not.toBe(first);
    expect([changed.name, changed.size, changed.type, changed.lastModified]).toEqual([
      first.name,
      first.size,
      first.type,
      first.lastModified,
    ]);
    safeRandomUUID.mockReset();
    safeRandomUUID
      .mockReturnValueOnce("a62430bc-1417-4b95-9432-937b331a7d7a")
      .mockReturnValue("0743332a-89e5-423c-9278-6f62262ab7c2");
    createInitialChatRound
      .mockRejectedValueOnce(new Error("first response lost"))
      .mockRejectedValueOnce(new Error("second response lost"))
      .mockResolvedValueOnce({
        session_id: "f4159ee9-c863-41c8-9c1b-ffbfa193917f",
        round_id: "3da8ff9a-95e2-4f9e-9788-7fda3d450fe7",
        assistant_message_id: "46aa60a5-64dd-471d-adfe-9856a3ee17c5",
        status: "QUEUED",
        last_event_seq: 1,
      });

    const { container } = render(<AliceHomePage />);
    const editor = screen.getByTestId("task-composer-editor");
    await userEvent.click(editor);
    await userEvent.type(editor, "compare file identity");
    const fileInput = container.querySelector<HTMLInputElement>("input[type='file']")!;
    fireEvent.change(fileInput, { target: { files: [first] } });
    await screen.findByText("payload.csv");

    await userEvent.click(screen.getByTestId("task-composer-submit"));
    await waitFor(() => expect(createInitialChatRound).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByTestId("task-composer-submit"));
    await waitFor(() => expect(createInitialChatRound).toHaveBeenCalledTimes(2));
    expect(createInitialChatRound.mock.calls[1]?.[1]).toBe(createInitialChatRound.mock.calls[0]?.[1]);
    expect(createInitialChatRound.mock.calls[1]?.[3]?.[0]).toBe(createInitialChatRound.mock.calls[0]?.[3]?.[0]);
    expect(createInitialChatRound.mock.calls[0]?.[2]).toBe("a62430bc-1417-4b95-9432-937b331a7d7a");
    expect(createInitialChatRound.mock.calls[1]?.[2]).toBe("a62430bc-1417-4b95-9432-937b331a7d7a");

    await userEvent.click(screen.getByLabelText(/payload\.csv/));
    fireEvent.change(fileInput, { target: { files: [changed] } });
    await screen.findByText("payload.csv");
    await userEvent.click(screen.getByTestId("task-composer-submit"));
    await waitFor(() => expect(createInitialChatRound).toHaveBeenCalledTimes(3));

    expect(createInitialChatRound.mock.calls[2]?.[2]).toBe("0743332a-89e5-423c-9278-6f62262ab7c2");
    expect(createInitialChatRound.mock.calls[2]?.[3]).toEqual([changed]);
    expect(safeRandomUUID).toHaveBeenCalledTimes(2);
  });
});
