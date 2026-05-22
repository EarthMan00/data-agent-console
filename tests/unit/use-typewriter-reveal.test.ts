import { describe, expect, it } from "vitest";

import { takeChars } from "@/lib/use-typewriter-reveal";

describe("typewriter utils", () => {
  it("takeChars respects unicode code points", () => {
    expect(takeChars("你好世界", 2)).toBe("你好");
    expect(takeChars("你好世界", 4)).toBe("你好世界");
  });
});
