import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  adminActivateAlicePersona,
  adminCreateAlicePersona,
  adminListAlicePersonas,
} from "@/lib/agent-api/client";

describe("admin persona client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.stubEnv("NEXT_PUBLIC_AGENT_API_ORIGIN", "http://agent.test");
    vi.stubEnv("NEXT_PUBLIC_AGENT_API_USE_PROXY", "0");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("lists Alice persona templates from the admin endpoint", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => JSON.stringify({ personas: [] }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await adminListAlicePersonas("token-1");

    expect(fetchMock).toHaveBeenCalledWith("http://agent.test/admin/personas", {
      headers: { Authorization: "Bearer token-1" },
    });
  });

  it("creates a persona template by cloning the current active template", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => JSON.stringify({ persona: { id: "p1" } }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await adminCreateAlicePersona("token-1", {
      name: "广告诊断 Alice",
      description: "优化广告诊断语气",
    });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://agent.test/admin/personas");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      name: "广告诊断 Alice",
      description: "优化广告诊断语气",
    });
  });

  it("activates a template without sending editable prompt content", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => JSON.stringify({ persona: { id: "p1", is_active: true } }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await adminActivateAlicePersona("token-1", "p1");

    expect(fetchMock).toHaveBeenCalledWith("http://agent.test/admin/personas/p1/activate", {
      method: "POST",
      headers: { Authorization: "Bearer token-1" },
    });
  });
});
