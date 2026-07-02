import { afterEach, describe, expect, it, vi } from "vitest";

import { getAgentHttpApiBase, isAgentApiProxyEnabled } from "@/lib/agent-api/config";

describe("agent api config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses same-origin proxy by default during development when origin is missing", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_AGENT_API_USE_PROXY", "");
    vi.stubEnv("NEXT_PUBLIC_AGENT_API_ORIGIN", "");

    expect(isAgentApiProxyEnabled()).toBe(true);
    expect(getAgentHttpApiBase()).toBe("/agent-platform");
  });

  it("keeps explicit direct mode strict when origin is missing", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_AGENT_API_USE_PROXY", "0");
    vi.stubEnv("NEXT_PUBLIC_AGENT_API_ORIGIN", "");

    expect(isAgentApiProxyEnabled()).toBe(false);
    expect(() => getAgentHttpApiBase()).toThrow(
      "NEXT_PUBLIC_AGENT_API_ORIGIN is required unless NEXT_PUBLIC_AGENT_API_USE_PROXY=1",
    );
  });

  it("still requires explicit backend configuration in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_AGENT_API_USE_PROXY", "");
    vi.stubEnv("NEXT_PUBLIC_AGENT_API_ORIGIN", "");

    expect(isAgentApiProxyEnabled()).toBe(false);
    expect(() => getAgentHttpApiBase()).toThrow(
      "NEXT_PUBLIC_AGENT_API_ORIGIN is required unless NEXT_PUBLIC_AGENT_API_USE_PROXY=1",
    );
  });

  it("uses direct origin when it is configured", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_AGENT_API_USE_PROXY", "");
    vi.stubEnv("NEXT_PUBLIC_AGENT_API_ORIGIN", "http://agent.test/");

    expect(isAgentApiProxyEnabled()).toBe(false);
    expect(getAgentHttpApiBase()).toBe("http://agent.test");
  });
});
