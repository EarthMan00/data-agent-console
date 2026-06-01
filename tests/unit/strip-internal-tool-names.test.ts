import { describe, expect, it } from "vitest";

import { stripInternalToolNamesForUi } from "@/lib/strip-internal-tool-names";

describe("stripInternalToolNamesForUi", () => {
  it("removes LinkFox and ChatExcel from runtime hints", () => {
    expect(stripInternalToolNamesForUi("LinkFox 数据查询中 · 已等待 1 分 6 秒")).toBe(
      "数据查询中 · 已等待 1 分 6 秒",
    );
    expect(stripInternalToolNamesForUi("ChatExcel 处理中 · 已等待 0 分 3 秒")).toBe(
      "处理中 · 已等待 0 分 3 秒",
    );
  });

  it("removes bracketed internal tool ids", () => {
    expect(stripInternalToolNamesForUi("[run_linkfox_task] 查询竞品")).toBe("查询竞品");
  });
});
