import { describe, expect, it } from "vitest";

import {
  favoriteCardPreviewText,
  favoritePreviewLooksLikeSource,
  summarizeFavoriteSnapshot,
  summarizeFavoritePreviewText,
} from "@/lib/favorite-card-preview";

const htmlReport = `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <style>body { font-family: Arial; background: #fff; }</style>
    <script>const raw = "not report";</script>
    <title>历史销量分析报告</title>
  </head>
  <body>
    <h1>历史销量分析报告</h1>
    <h2>亚马逊美国站 B0DD4GFNNG 过去12个月销量趋势</h2>
    <p><strong>核心发现：</strong>销量波动剧烈，6个月前达到销量高峰。</p>
    <li>近期销量低迷，过去3个月内月销量在100-200件之间徘徊。</li>
  </body>
</html>`;

describe("favorite card preview text", () => {
  it("extracts a readable report summary from html instead of source code", () => {
    const summary = summarizeFavoritePreviewText(htmlReport);

    expect(summary).toContain("历史销量分析报告");
    expect(summary).toContain("亚马逊美国站 B0DD4GFNNG 过去12个月销量趋势");
    expect(summary).toContain("销量波动剧烈");
    expect(summary).not.toContain("<!DOCTYPE");
    expect(summary).not.toContain("font-family");
    expect(summary).not.toContain("const raw");
  });

  it("uses favorite snapshot report content when list preview is only html source", () => {
    const summary = summarizeFavoriteSnapshot({
      version: 2,
      sheets: [
        {
          id: "report",
          label: "数据报告",
          primary_kind: "html",
          primary_text: htmlReport,
        },
      ],
      card_preview: "<!DOCTYPE html><html><head><style>body { color: #000; }</style>",
    });

    expect(summary).toContain("核心发现");
    expect(summary).not.toContain("DOCTYPE");
  });

  it("falls back to the title instead of showing code when only truncated source is available", () => {
    expect(favoritePreviewLooksLikeSource("<!DOCTYPE html><html><head><style>body {")).toBe(true);
    expect(
      favoriteCardPreviewText({
        cardPreview: "<!DOCTYPE html><html><head><style>body {",
        fallback: "收藏 · 数据报告",
      }),
    ).toBe("收藏 · 数据报告");
  });
});
