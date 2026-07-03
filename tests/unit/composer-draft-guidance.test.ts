import { describe, expect, it } from "vitest";

import {
  appendToComposerDraft,
  composerDraftContainsSuggestion,
  createComposerPrefillStorageValue,
  insertDatasourceMentions,
  parseDatasourceMentions,
  parseComposerPrefillStorageValue,
  removeFromComposerDraft,
} from "@/lib/composer-prefill";
import { homeDataSourceItems } from "@/lib/home-capability-items";
import type { HomeCapabilityItem } from "@/lib/home-capability-items";

function requireHomeDataSource(id: string) {
  const source = homeDataSourceItems.find((item) => item.id === id);
  if (!source) throw new Error(`Missing home datasource fixture: ${id}`);
  return source;
}

function makeDataSourceItem(overrides: Partial<HomeCapabilityItem> & Pick<HomeCapabilityItem, "id" | "label">): HomeCapabilityItem {
  return {
    promptHint: "测试工具",
    parentId: "test-group",
    parentLabel: "测试分组",
    accent: "var(--color-primary)",
    icon: "grid",
    ...overrides,
  };
}

describe("composer draft guidance helpers", () => {
  it("append and remove suggestion lines", () => {
    const a = "已有内容";
    const b = "引导建议一";
    const draft = appendToComposerDraft(a, b);
    expect(composerDraftContainsSuggestion(draft, b)).toBe(true);
    expect(removeFromComposerDraft(draft, b)).toBe("已有内容");
  });

  it("does not append duplicate suggestion line", () => {
    const b = "引导建议一";
    const once = appendToComposerDraft("", b);
    expect(appendToComposerDraft(once, b)).toBe(once);
  });

  it("removes suggestion when draft only contains it", () => {
    const only = "仅引导";
    expect(removeFromComposerDraft(only, only)).toBe("");
  });

  it("removes middle suggestion line", () => {
    const draft = ["第一行", "引导建议", "第三行"].join("\n");
    expect(removeFromComposerDraft(draft, "引导建议")).toBe(["第一行", "第三行"].join("\n"));
  });
});

describe("composer datasource mention parser", () => {
  it("turns matched inline @ aliases into datasource selections", () => {
    const source = requireHomeDataSource("amazon");
    const parsed = parseDatasourceMentions(
      `1、使用@${source.label}这个工具：帮我在美国亚马逊站搜索 women's pullover sweater`,
      homeDataSourceItems,
    );

    expect(parsed.selectedSourceIds).toEqual([source.id]);
    expect(parsed.sourcePlacements).toEqual([{ sourceId: source.id, offset: 4 }]);
    expect(parsed.text).toBe("1、使用这个工具：帮我在美国亚马逊站搜索 women's pullover sweater");
    expect(parsed.text).not.toContain(`@${source.label}`);
  });

  it("matches static Chinese @ aliases when prompt datasource ids are API capability ids", () => {
    const source = requireHomeDataSource("keepa-price-history");
    const dynamicItems = homeDataSourceItems.map((item) =>
      item.id === source.id ? { ...item, label: item.id } : item,
    );
    const parsed = parseDatasourceMentions(
      `${source.label} @${source.label}，美国站，查询ASIN:B0D5MV1S5W，过去365天数据`,
      dynamicItems,
    );

    expect(parsed.selectedSourceIds).toEqual([source.id]);
    expect(parsed.sourcePlacements).toEqual([
      { sourceId: source.id, offset: `${source.label} `.length },
    ]);
    expect(parsed.text).toContain(`${source.label} ，美国站，查询ASIN:B0D5MV1S5W`);
    expect(parsed.text).not.toContain(`@${source.label}`);
  });

  it("falls back to static datasource aliases when dynamic datasource items are not loaded yet", () => {
    const source = requireHomeDataSource("amazon");
    const parsed = parseDatasourceMentions(
      `@${source.label}这个工具：帮我在美国亚马逊站搜索 travel pillow`,
      [],
    );

    expect(parsed.selectedSourceIds).toEqual([source.id]);
    expect(parsed.sourcePlacements).toEqual([{ sourceId: source.id, offset: 0 }]);
    expect(parsed.text).toBe("这个工具：帮我在美国亚马逊站搜索 travel pillow");
  });

  it("matches dynamic datasource labels inside completion templates", () => {
    const source = makeDataSourceItem({ id: "dynamic-analysis-source", label: "动态分析工具" });
    const dynamicItems = [
      source,
    ];
    const parsed = parseDatasourceMentions(
      `1.@${source.label}: 在{{美国站}}查询ASIN为：{{B0C6CLB49N}}的流量来源。`,
      dynamicItems,
    );

    expect(parsed.selectedSourceIds).toEqual([source.id]);
    expect(parsed.sourcePlacements).toEqual([{ sourceId: source.id, offset: 2 }]);
    expect(parsed.text).toBe("1.: 在{{美国站}}查询ASIN为：{{B0C6CLB49N}}的流量来源。");
    expect(parsed.text).not.toContain(`@${source.label}`);
  });

  it("serializes composer prefill with the provided dynamic datasource items", () => {
    const source = makeDataSourceItem({ id: "backend-dynamic-source", label: "后端动态工具" });
    const dynamicItems = [source];

    const raw = createComposerPrefillStorageValue(`@${source.label} 查询运动水杯`, dynamicItems);
    const parsed = JSON.parse(raw);

    expect(parsed.text).toBe("查询运动水杯");
    expect(parsed.selectedSourceIds).toEqual([source.id]);
  });

  it("inserts datasource mentions at stored placements instead of always prefixing them", () => {
    const source = makeDataSourceItem({ id: "placed-dynamic-source", label: "定位工具" });

    expect(
      insertDatasourceMentions(
        "先查询 再总结",
        [source.id],
        [{ sourceId: source.id, offset: "先查询 ".length }],
        [source],
      ),
    ).toBe(`先查询 @${source.label} 再总结`);
  });

  it("keeps unmatched @ text as plain user input", () => {
    const parsed = parseDatasourceMentions("使用@不存在工具这个工具：继续保留原文", homeDataSourceItems);

    expect(parsed.selectedSourceIds).toEqual([]);
    expect(parsed.sourcePlacements).toEqual([]);
    expect(parsed.text).toBe("使用@不存在工具这个工具：继续保留原文");
  });

  it("decodes escaped unicode literals before hydrating composer prefill text", () => {
    const raw = JSON.stringify({
      text: "\\u9700\\u8981\\u5206\\u6790\\u4e9a\\u9a6c\\u900a\\u7684\\u6d41\\u91cf\\u6765\\u6e90\\uff1f\\n\\u8bf7\\u7ee7\\u7eed",
      selectedSourceIds: [],
      sourcePlacements: [],
    });

    const parsed = parseComposerPrefillStorageValue(raw, homeDataSourceItems);

    expect(parsed.text).toBe("需要分析亚马逊的流量来源？\n请继续");
  });
});
