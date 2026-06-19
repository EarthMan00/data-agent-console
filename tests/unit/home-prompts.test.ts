import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchHomePromptRecommendations } from "@/lib/agent-api/home-prompts";

describe("fetchHomePromptRecommendations", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_AGENT_API_USE_PROXY", "0");
    vi.stubEnv("NEXT_PUBLIC_AGENT_API_ORIGIN", "http://agent.test");
    fetchMock = vi.fn(async () => (
      new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    ));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("sends capability filters as repeated query params", async () => {
    await fetchHomePromptRecommendations({
      capabilityIds: ["keepa-price-history", "", " web-search "],
    });

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.origin).toBe("http://agent.test");
    expect(requestUrl.pathname).toBe("/api/home-prompt-recommendations");
    expect(requestUrl.searchParams.getAll("capability_id")).toEqual([
      "keepa-price-history",
      "web-search",
    ]);
  });
});
