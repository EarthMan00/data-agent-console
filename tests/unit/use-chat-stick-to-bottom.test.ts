import { describe, expect, it } from "vitest";

/** 与 hook 内逻辑一致，便于单测 */
function isPinnedToBottom(scrollHeight: number, scrollTop: number, clientHeight: number, thresholdPx: number) {
  return scrollHeight - scrollTop - clientHeight <= thresholdPx;
}

describe("useChatStickToBottom pinning", () => {
  it("treats near-bottom as pinned", () => {
    expect(isPinnedToBottom(1000, 952, 48, 48)).toBe(true);
    expect(isPinnedToBottom(1000, 900, 48, 48)).toBe(false);
  });
});
