import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { adminCreatePlan, adminPatchPlan } from "@/lib/agent-api/client";

describe("admin plan client", () => {
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

  it("omits retired tool_allowlist when creating plans", async () => {
    type CreatePlanBody = Parameters<typeof adminCreatePlan>[1];
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () =>
        JSON.stringify({
          plan: {
            id: "plan-1",
            code: "premium",
            name: "Premium",
            level: 1,
            can_use_tools: true,
            features: {},
            user_count: 0,
            created_at: null,
          },
        }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const createBody = {
      code: "premium",
      name: "Premium",
      can_use_tools: true,
      tool_allowlist: ["skills.run_linkfox_task"],
      features: {},
    } as unknown as CreatePlanBody;

    await adminCreatePlan("token-1", createBody);

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      code: "premium",
      name: "Premium",
      can_use_tools: true,
      features: {},
    });
    expect(body).not.toHaveProperty("tool_allowlist");
  });

  it("omits retired tool_allowlist when patching plans", async () => {
    type PatchPlanBody = Parameters<typeof adminPatchPlan>[2];
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () =>
        JSON.stringify({
          plan: {
            id: "plan-1",
            code: "premium",
            name: "Premium",
            level: 1,
            can_use_tools: true,
            features: {},
            user_count: 0,
            created_at: null,
          },
        }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const patchBody = {
      can_use_tools: false,
      tool_allowlist: ["skills.run_linkfox_task"],
    } as unknown as PatchPlanBody;

    await adminPatchPlan("token-1", "plan-1", patchBody);

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      can_use_tools: false,
    });
    expect(body).not.toHaveProperty("tool_allowlist");
  });
});
