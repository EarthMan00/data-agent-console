import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildDataSourceGroups,
  fetchDataSourceGroups,
  fetchDataSourceTools,
} from "@/lib/agent-api/data-sources";
import { setDataSourceMenu } from "@/lib/home-capability-items";

vi.mock("@/lib/agent-api/config", () => ({
  getAgentHttpApiBase: () => "http://test.local",
}));

describe("data source api client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setDataSourceMenu([]);
  });

  it("builds grouped menu from groups and tools payloads", () => {
    const groups = buildDataSourceGroups(
      [
        {
          id: "cat-1",
          name: "Keepa",
          sort_order: 1,
          icon: "keepa",
          accent: "var(--color-accent-keepa)",
        },
      ],
      [
        {
          id: "Keepa-亚马逊-商品搜索",
          category_id: "cat-1",
          category_name: "Keepa",
          label: "Keepa-亚马逊-商品搜索",
          prompt_hint: "逆向筛选、条件过滤",
          prompt_template: null,
          icon: "keepa",
          accent: "var(--color-accent-keepa)",
          sort_order: 1,
        },
      ],
    );

    expect(groups).toHaveLength(1);
    expect(groups[0]?.items[0]?.id).toBe("Keepa-亚马逊-商品搜索");
    expect(groups[0]?.items[0]?.parentLabel).toBe("Keepa");
  });

  it("fetches data source tools with optional category filter", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/data-source-tools?category_id=cat-1")) {
        return new Response(
          JSON.stringify({
            items: [
              {
                id: "Keepa-亚马逊-商品搜索",
                category_id: "cat-1",
                category_name: "Keepa",
                label: "Keepa-亚马逊-商品搜索",
                prompt_hint: "hint",
                prompt_template: null,
                icon: "keepa",
                accent: "var(--color-accent-keepa)",
                sort_order: 1,
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ items: [] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const items = await fetchDataSourceTools("cat-1");
    expect(items).toHaveLength(1);
    expect(items[0]?.label).toBe("Keepa-亚马逊-商品搜索");
  });

  it("fetches data source groups", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          groups: [
            {
              id: "cat-1",
              name: "Keepa",
              sort_order: 1,
              icon: "keepa",
              accent: "var(--color-accent-keepa)",
            },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const groups = await fetchDataSourceGroups();
    expect(groups).toHaveLength(1);
    expect(groups[0]?.name).toBe("Keepa");
  });
});
