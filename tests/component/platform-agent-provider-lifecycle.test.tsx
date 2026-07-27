import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  PlatformAgentProvider,
  useOptionalPlatformAgent,
} from "@/components/platform-agent-provider";
import {
  saveAgentSession,
  savePlatformSessionId,
} from "@/lib/agent-api/session";

const api = vi.hoisted(() => ({
  createSession: vi.fn(),
  releaseSession: vi.fn(),
  login: vi.fn(),
  logoutPlatformAuth: vi.fn(),
  refreshAccessToken: vi.fn(),
  checkAccessToken: vi.fn(),
}));
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => router }));

vi.mock("@/lib/agent-api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/agent-api/client")>("@/lib/agent-api/client");
  return {
    ...actual,
    createSession: api.createSession,
    releaseSession: api.releaseSession,
    login: api.login,
    logoutPlatformAuth: api.logoutPlatformAuth,
    refreshAccessToken: api.refreshAccessToken,
    checkAccessToken: api.checkAccessToken,
  };
});

function LifecycleProbe() {
  const agent = useOptionalPlatformAgent();
  if (!agent?.authHydrated) return <div>hydrating</div>;
  return (
    <div>
      <output data-testid="context-keys">{Object.keys(agent).sort().join(",")}</output>
      <output data-testid="selected-session">{agent.platformSessionId ?? "none"}</output>
      <button type="button" onClick={() => agent.setActivePlatformSession("a27ab89a-74bc-43f0-bb15-bb3b8387635e")}>select</button>
      <button type="button" onClick={() => agent.clearActivePlatformSession()}>new conversation</button>
      <button type="button" onClick={() => void agent.loginWithPassword("sensen", "secret")}>login</button>
      <button type="button" onClick={() => void agent.logout()}>logout</button>
    </div>
  );
}

describe("PlatformAgentProvider local-only Session selection lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    saveAgentSession({
      accessToken: "old-token",
      refreshToken: "refresh-token",
      userId: "user-old",
      displayName: "Old User",
    });
    savePlatformSessionId("f4159ee9-c863-41c8-9c1b-ffbfa193917f");
    api.login.mockResolvedValue({
      access_token: "new-token",
      refresh_token: "new-refresh",
      user_id: "user-new",
      username: "sensen",
    });
    api.logoutPlatformAuth.mockResolvedValue(undefined);
    api.refreshAccessToken.mockRejectedValue(new Error("no cookie session"));
    api.checkAccessToken.mockResolvedValue({ valid: true, user_id: "user-old", username: "Old User" });
  });

  it("exposes no empty-Session creation methods and selection/new conversation stay local", async () => {
    render(<PlatformAgentProvider><LifecycleProbe /></PlatformAgentProvider>);
    await screen.findByRole("button", { name: "select" });

    expect(screen.getByTestId("context-keys")).not.toHaveTextContent("beginNewHomeTaskSession");
    expect(screen.getByTestId("context-keys")).not.toHaveTextContent("ensurePlatformSession");

    fireEvent.click(screen.getByRole("button", { name: "select" }));
    expect(screen.getByTestId("selected-session")).toHaveTextContent("a27ab89a-74bc-43f0-bb15-bb3b8387635e");
    fireEvent.click(screen.getByRole("button", { name: "new conversation" }));
    expect(screen.getByTestId("selected-session")).toHaveTextContent("none");

    expect(api.createSession).not.toHaveBeenCalled();
    expect(api.releaseSession).not.toHaveBeenCalled();
  });

  it("login and logout do not create, release, or cancel a durable execution", async () => {
    render(<PlatformAgentProvider><LifecycleProbe /></PlatformAgentProvider>);
    await screen.findByRole("button", { name: "login" });

    fireEvent.click(screen.getByRole("button", { name: "login" }));
    await waitFor(() => expect(api.login).toHaveBeenCalledWith("sensen", "secret"));
    fireEvent.click(screen.getByRole("button", { name: "select" }));
    fireEvent.click(screen.getByRole("button", { name: "logout" }));
    await waitFor(() => expect(api.logoutPlatformAuth).toHaveBeenCalledWith("new-token"));

    expect(api.createSession).not.toHaveBeenCalled();
    expect(api.releaseSession).not.toHaveBeenCalled();
  });
});
