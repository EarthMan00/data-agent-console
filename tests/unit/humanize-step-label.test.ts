import { describe, expect, it } from "vitest";

import { humanizeStepLabelForUi } from "@/lib/humanize-step-label";

describe("humanizeStepLabelForUi", () => {
  it("converts read_excel_metadata JSON to friendly text", () => {
    const raw = JSON.stringify({
      action: "read_excel_metadata",
      file_path:
        "C:\\Users\\EDY\\AppData\\Local\\Alice\\Jobs\\session_attachments\\a\\b\\uuid_linkfox_agent_cards.xlsx",
    });
    const out = humanizeStepLabelForUi(raw);
    expect(out).toContain("linkfox_agent_cards.xlsx");
    expect(out).not.toContain("read_excel_metadata");
  });

  it("strips windows path from prose instruction", () => {
    const out = humanizeStepLabelForUi(
      "分析文件 C:\\Users\\EDY\\AppData\\Local\\Alice\\Jobs\\session_attachments\\a\\b\\uuid_demo.xlsx",
    );
    expect(out).toContain("demo.xlsx");
    expect(out).not.toContain("C:\\Users");
  });

  it("collapses square-bracket uuid fragments in historical labels", () => {
    const out = humanizeStepLabelForUi("分析附件 [21d5a568-150c-42d...]");
    expect(out).toBe("分析已上传的附件");
    expect(out).not.toContain("21d5a568");
  });
});
