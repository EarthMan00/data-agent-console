import { describe, expect, it } from "vitest";

import { streamSanitizeDeltaClient } from "@/lib/strip-model-thinking";

describe("streamSanitizeDeltaClient", () => {
  it("keeps previous visible text when strip shrinks display", () => {
    const prev = "美加市场保温杯选品需要关注";
    const raw = `${prev}<think>内部推理中`;
    const { display, delta } = streamSanitizeDeltaClient(prev, raw);
    expect(display).toBe(prev);
    expect(delta).toBe("");
  });
});
