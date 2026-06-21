import { describe, expect, it } from "vitest";

import {
  appendToComposerDraft,
  composerDraftContainsSuggestion,
  createComposerPrefillStorageValue,
  parseDatasourceMentions,
  removeFromComposerDraft,
} from "@/lib/composer-prefill";
import { homeDataSourceItems } from "@/lib/home-capability-items";

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
    const parsed = parseDatasourceMentions(
      "1、使用@亚马逊前端搜索这个工具：帮我在美国亚马逊站搜索 women's pullover sweater",
      homeDataSourceItems,
    );

    expect(parsed.selectedSourceIds).toEqual(["amazon"]);
    expect(parsed.sourcePlacements).toEqual([{ sourceId: "amazon", offset: 4 }]);
    expect(parsed.text).toBe("1、使用这个工具：帮我在美国亚马逊站搜索 women's pullover sweater");
    expect(parsed.text).not.toContain("@亚马逊前端搜索");
  });

  it("matches static Chinese @ aliases when prompt datasource ids are API capability ids", () => {
    const dynamicItems = homeDataSourceItems.map((item) =>
      item.id === "keepa-price-history" ? { ...item, label: "keepa-price-history" } : item,
    );
    const parsed = parseDatasourceMentions(
      "Keepa-亚马逊价格历史 @Keepa-亚马逊价格历史，美国站，查询ASIN:B0D5MV1S5W，过去365天数据",
      dynamicItems,
    );

    expect(parsed.selectedSourceIds).toEqual(["keepa-price-history"]);
    expect(parsed.sourcePlacements).toEqual([
      { sourceId: "keepa-price-history", offset: "Keepa-亚马逊价格历史 ".length },
    ]);
    expect(parsed.text).toContain("Keepa-亚马逊价格历史 ，美国站，查询ASIN:B0D5MV1S5W");
    expect(parsed.text).not.toContain("@Keepa-亚马逊价格历史");
  });

  it("matches dynamic datasource labels inside completion templates", () => {
    const dynamicItems = [
      {
        id: "sif-asin-traffic-source",
        label: "SIF-ASIN流量来源",
        promptHint: "流量来源分析",
        parentId: "sif-group",
        parentLabel: "Sif数据分析工具",
        accent: "var(--color-accent-sif)",
        icon: "store",
      },
    ];
    const parsed = parseDatasourceMentions(
      "1.@SIF-ASIN流量来源: 在{{美国站}}查询ASIN为：{{B0C6CLB49N}}的流量来源。",
      dynamicItems,
    );

    expect(parsed.selectedSourceIds).toEqual(["sif-asin-traffic-source"]);
    expect(parsed.sourcePlacements).toEqual([{ sourceId: "sif-asin-traffic-source", offset: 2 }]);
    expect(parsed.text).toBe("1.: 在{{美国站}}查询ASIN为：{{B0C6CLB49N}}的流量来源。");
    expect(parsed.text).not.toContain("@SIF-ASIN流量来源");
  });

  it("serializes composer prefill with the provided dynamic datasource items", () => {
    const dynamicItems = [
      {
        id: "backend-dynamic-keepa-tool",
        label: "后端动态Keepa工具",
        promptHint: "动态 Keepa 搜索",
        parentId: "source-keepa",
        parentLabel: "Keepa",
        accent: "var(--color-accent-keepa)",
        icon: "line-chart",
      },
    ];

    const raw = createComposerPrefillStorageValue("@后端动态Keepa工具 查询运动水杯", dynamicItems);
    const parsed = JSON.parse(raw);

    expect(parsed.text).toBe("查询运动水杯");
    expect(parsed.selectedSourceIds).toEqual(["backend-dynamic-keepa-tool"]);
  });

  it("keeps unmatched @ text as plain user input", () => {
    const parsed = parseDatasourceMentions("使用@不存在工具这个工具：继续保留原文", homeDataSourceItems);

    expect(parsed.selectedSourceIds).toEqual([]);
    expect(parsed.sourcePlacements).toEqual([]);
    expect(parsed.text).toBe("使用@不存在工具这个工具：继续保留原文");
  });
});
