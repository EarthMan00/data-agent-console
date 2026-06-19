import { describe, expect, it } from "vitest";

import {
  formatAliceClarificationForStream,
  aliceClarificationBodyForDisplay,
  parseAliceShareUrl,
  resolveAliceShareUrl,
  sanitizeClarificationForUserDisplay,
  splitClarificationForDisplay,
} from "@/lib/alice-clarification";

describe("alice-clarification", () => {
  it("parses ShareURL from result text", () => {
    const text = "Status: finished\nShareURL: https://agent.linkfox.com/share/abc\n";
    expect(parseAliceShareUrl(text)).toBe("https://agent.linkfox.com/share/abc");
  });

  it("prefers meta.share_url", () => {
    expect(
      resolveAliceShareUrl({ share_url: "https://meta.example" }, "ShareURL: https://file.example"),
    ).toBe("https://meta.example");
  });

  it("sanitizes tool branding from clarification text", () => {
    const raw =
      "--- Alice 说明 ---\n请确认关键词：insulated tumbler\n\n请在 LinkFox 对话中继续补充信息：\nhttps://agent.linkfox.com/share/x";
    const out = sanitizeClarificationForUserDisplay(raw);
    expect(out).toContain("insulated tumbler");
    expect(out).not.toContain("LinkFox");
    expect(out).not.toContain("agent.linkfox.com");
  });

  it("formats stream text without external links", () => {
    const out = formatAliceClarificationForStream("请补充类目。", "https://agent.linkfox.com/share/x");
    expect(out).toBe("请补充类目。");
    expect(aliceClarificationBodyForDisplay(out, "https://agent.linkfox.com/share/x")).toBe("请补充类目。");
  });

  it("splits bullet keywords for clickable chips", () => {
    const raw = `请确认关键词：\n* insulated tumbler\n* vacuum flask`;
    const { leading, suggestions } = splitClarificationForDisplay(raw);
    expect(leading).toContain("请确认关键词");
    expect(suggestions).toEqual(["insulated tumbler", "vacuum flask"]);
  });

  it("splits inline numbered clarification options", () => {
    const raw =
      "执行前需要确认一个筛选条件：是否只保留 FBA 且评分高于 4.3 的商品？ 1. 只保留 FBA 且评分高于 4.3 2. 保留全部配送方式，先按销量排序 3. 额外加入价格区间分组";
    const { leading, suggestions } = splitClarificationForDisplay(raw);
    expect(leading).toBe("执行前需要确认一个筛选条件：是否只保留 FBA 且评分高于 4.3 的商品？");
    expect(suggestions).toEqual([
      "只保留 FBA 且评分高于 4.3",
      "保留全部配送方式，先按销量排序",
      "额外加入价格区间分组",
    ]);
  });
});
