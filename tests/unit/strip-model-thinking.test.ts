import { describe, expect, it } from "vitest";

import {
  resolveAssistantBodyForUi,
  stripModelThinkingForUi,
  streamSanitizeDeltaClient,
} from "@/lib/strip-model-thinking";

describe("stripModelThinkingForUi", () => {
  it("preserves inline code segments", () => {
    const raw = "请使用 `A` 和 `B` 两个字段";
    expect(stripModelThinkingForUi(raw)).toBe("请使用 `A` 和 `B` 两个字段");
  });

  it("does not strip tool names (handled by stripInternalToolNamesForUi at display layer)", () => {
    expect(stripModelThinkingForUi("LinkFox 已返回数据")).toBe("LinkFox 已返回数据");
  });
});

describe("resolveAssistantBodyForUi", () => {
  it("strips internal tool names from assistant visible text", () => {
    expect(resolveAssistantBodyForUi("LinkFox 已返回数据", false)).toBe("已返回数据");
  });
});

describe("streamSanitizeDeltaClient", () => {
  it("keeps previous visible text when strip shrinks display", () => {
    const prev = "美加市场保温杯选品需要关注";
    const raw = `${prev}<think>内部推理中`;
    const { display, delta } = streamSanitizeDeltaClient(prev, raw);
    expect(display).toBe(prev);
    expect(delta).toBe("");
  });

  it("strips tool names from streamed display", () => {
    const { display } = streamSanitizeDeltaClient("", "LinkFox 数据查询中");
    expect(display).toBe("数据查询中");
  });
});
