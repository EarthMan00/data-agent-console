import { describe, expect, it } from "vitest";

import {
  formatLinkfoxClarificationForStream,
  linkfoxClarificationBodyForDisplay,
  parseLinkfoxShareUrl,
  resolveLinkfoxShareUrl,
  sanitizeClarificationForUserDisplay,
  splitClarificationForDisplay,
} from "@/lib/linkfox-clarification";

describe("linkfox-clarification", () => {
  it("parses ShareURL from result text", () => {
    const text = "Status: finished\nShareURL: https://agent.linkfox.com/share/abc\n";
    expect(parseLinkfoxShareUrl(text)).toBe("https://agent.linkfox.com/share/abc");
  });

  it("prefers meta.share_url", () => {
    expect(
      resolveLinkfoxShareUrl({ share_url: "https://meta.example" }, "ShareURL: https://file.example"),
    ).toBe("https://meta.example");
  });

  it("sanitizes tool branding from clarification text", () => {
    const raw =
      "--- LinkFox 说明 ---\n请确认关键词：insulated tumbler\n\n请在 LinkFox 对话中继续补充信息：\nhttps://agent.linkfox.com/share/x";
    const out = sanitizeClarificationForUserDisplay(raw);
    expect(out).toContain("insulated tumbler");
    expect(out).not.toContain("LinkFox");
    expect(out).not.toContain("agent.linkfox.com");
  });

  it("formats stream text without external links", () => {
    const out = formatLinkfoxClarificationForStream("请补充类目。", "https://agent.linkfox.com/share/x");
    expect(out).toBe("请补充类目。");
    expect(linkfoxClarificationBodyForDisplay(out, "https://agent.linkfox.com/share/x")).toBe("请补充类目。");
  });

  it("splits bullet keywords for clickable chips", () => {
    const raw = `请确认关键词：\n* insulated tumbler\n* vacuum flask`;
    const { leading, suggestions } = splitClarificationForDisplay(raw);
    expect(leading).toContain("请确认关键词");
    expect(suggestions).toEqual(["insulated tumbler", "vacuum flask"]);
  });
});
