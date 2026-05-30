import { describe, expect, it } from "vitest";

import { sanitizeClarificationForUserDisplay } from "@/lib/linkfox-clarification";

describe("session linkfox clarification parsing", () => {
  it("sanitizes persisted clarification content", () => {
    const raw =
      "Status: finished\nShareURL: https://agent.linkfox.com/share/x\n\n--- LinkFox 说明 ---\n请问您是否需要调整您的分析方案？";
    expect(sanitizeClarificationForUserDisplay(raw)).toContain("调整");
    expect(sanitizeClarificationForUserDisplay(raw)).not.toContain("ShareURL");
  });
});
