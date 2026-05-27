import { describe, expect, it } from "vitest";

import {
  appendToComposerDraft,
  composerDraftContainsSuggestion,
  removeFromComposerDraft,
} from "@/lib/composer-prefill";

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
