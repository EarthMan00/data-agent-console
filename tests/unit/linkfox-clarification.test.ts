import { describe, expect, it } from "vitest";

import {
  formatLinkfoxClarificationForStream,
  linkfoxClarificationBodyForDisplay,
  parseLinkfoxShareUrl,
  resolveLinkfoxShareUrl,
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

  it("formats stream markdown with link", () => {
    const out = formatLinkfoxClarificationForStream("请补充类目。", "https://agent.linkfox.com/share/x");
    expect(out).toContain("[在 LinkFox 中继续补充](https://agent.linkfox.com/share/x)");
    expect(linkfoxClarificationBodyForDisplay(out, "https://agent.linkfox.com/share/x")).not.toContain(
      "https://agent.linkfox.com/share/x",
    );
  });
});
