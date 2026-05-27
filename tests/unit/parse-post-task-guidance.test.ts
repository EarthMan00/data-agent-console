import { describe, expect, it } from "vitest";

import {
  parsePostTaskGuidanceSuggestions,
  resolvePostTaskGuidancePresentation,
  sanitizePostTaskGuidanceSuggestion,
  splitEmbeddedPostTaskGuidance,
} from "@/lib/parse-post-task-guidance";
import type { SessionMessageItem } from "@/lib/agent-api/types";

describe("parsePostTaskGuidanceSuggestions", () => {
  it("parses numbered list from server guidance", () => {
    const raw = [
      "1. 查看 CSV 数据详情，用 ChatExcel 生成分析报告",
      "2. 搜索其他关键词的亚马逊数据",
      "3. 用 TikTok 或 eBay 搜索同款商品价格对比",
    ].join("\n");
    expect(parsePostTaskGuidanceSuggestions(raw)).toEqual([
      "查看结果数据详情，并生成分析报告",
      "搜索其他关键词的亚马逊数据",
      "用 TikTok 或 eBay 搜索同款商品价格对比",
    ]);
  });

  it("strips title prefix when present", () => {
    expect(
      parsePostTaskGuidanceSuggestions("【接下来您可以】\n1. 继续分析竞品"),
    ).toEqual(["继续分析竞品"]);
  });

  it("splits embedded guidance from legacy combined assistant text", () => {
    const split = splitEmbeddedPostTaskGuidance(
      "任务：demo\n状态：成功\n\n【接下来您可以】\n1. 继续分析\n2. 换关键词",
    );
    expect(split.leading).toContain("任务：demo");
    expect(split.guidanceBlock).toContain("继续分析");
    const pres = resolvePostTaskGuidancePresentation({
      id: "m1",
      role: "assistant",
      content: `任务：demo\n\n【接下来您可以】\n1. 继续分析`,
      created_at: new Date().toISOString(),
      message_index: 0,
      meta: {},
    } satisfies SessionMessageItem);
    expect(pres.kind).toBe("embedded");
  });

  it("sanitizes tool names and file formats in stored guidance", () => {
    expect(sanitizePostTaskGuidanceSuggestion("查看CSV数据详情，用ChatExcel生成分析报告")).toBe(
      "查看结果数据详情，并生成分析报告",
    );
    const parsed = parsePostTaskGuidanceSuggestions(
      "1. 查看CSV数据详情，用ChatExcel生成分析报告\n2. 搜索其他关键词的亚马逊数据",
    );
    expect(parsed[0]).toBe("查看结果数据详情，并生成分析报告");
    expect(parsed[1]).not.toMatch(/CSV|ChatExcel/i);
  });
});
