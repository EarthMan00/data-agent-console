import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AgentWorkspace } from "@/components/agent-workspace";

const SESSION_ID = "f4159ee9-c863-41c8-9c1b-ffbfa193917f";
const routeState = vi.hoisted(() => ({ query: "" }));
const router = vi.hoisted(() => ({ replace: vi.fn() }));
const platformWorkspace = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams(routeState.query),
}));

vi.mock("@/components/agent-workspace/platform-session-agent-workspace", () => ({
  PlatformSessionAgentWorkspace: (props: Record<string, unknown>) => {
    platformWorkspace(props);
    return <div data-testid="platform-session-workspace">{String(props.sessionId)}</div>;
  },
}));

describe("AgentWorkspace route boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeState.query = "";
  });

  it("renders the durable platform Session workspace for a real sessionId", () => {
    routeState.query = `sessionId=${SESSION_ID}&scheduleTrial=1`;

    render(<AgentWorkspace />);

    expect(screen.getByTestId("platform-session-workspace")).toHaveTextContent(SESSION_ID);
    expect(platformWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: SESSION_ID, scheduleTrial: true }),
    );
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("redirects /agent without a Session to the homepage", async () => {
    render(<AgentWorkspace />);

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/"));
    expect(platformWorkspace).not.toHaveBeenCalled();
  });

  it("redirects a legacy runId route and never mounts local execution", async () => {
    routeState.query = "runId=run-e2e-missing";

    render(<AgentWorkspace />);

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/"));
    expect(platformWorkspace).not.toHaveBeenCalled();
  });
});
