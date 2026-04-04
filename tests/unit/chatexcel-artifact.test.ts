import { describe, expect, it } from "vitest";

import {
  extractChatexcelPayloadJson,
  parseChatexcelArtifactText,
  parseCsvLine,
  parseCsvTextToTable,
} from "@/lib/chatexcel-artifact";

describe("parseCsvLine", () => {
  it("handles quoted commas", () => {
    expect(parseCsvLine(`a,"b,c",d`)).toEqual(["a", "b,c", "d"]);
  });
});

describe("parseChatexcelArtifactText", () => {
  it("strips log prefix and parses result.output as CSV table", () => {
    const payload = {
      ok: true,
      action: "run_excel_code",
      result: {
        success: true,
        output: "关键词,mentions\r\nfoo,1\r\nbar,2",
      },
    };
    const raw = `✓ 成功导入模块: x\n${JSON.stringify(payload, null, 2)}`;
    const m = parseChatexcelArtifactText(raw);
    expect(m.ok).toBe(true);
    expect(m.action).toBe("run_excel_code");
    expect(m.table?.columns).toEqual(["关键词", "mentions"]);
    expect(m.table?.rows).toEqual([
      ["foo", "1"],
      ["bar", "2"],
    ]);
  });
});

describe("extractChatexcelPayloadJson", () => {
  it("returns null when no brace", () => {
    expect(extractChatexcelPayloadJson("no json")).toBeNull();
  });
});

describe("parseCsvTextToTable", () => {
  it("uses first row as header", () => {
    const t = parseCsvTextToTable("A,B\n1,2\n3,4");
    expect(t?.columns).toEqual(["A", "B"]);
    expect(t?.rows).toEqual([
      ["1", "2"],
      ["3", "4"],
    ]);
  });
});
