import { describe, expect, it } from "vitest";

import { inferAttachmentType, sanitizeObjective } from "@/lib/agent-attachments";

describe("attachments and source helpers", () => {
  it("sanitizes inline datasource mentions from objectives", () => {
    expect(sanitizeObjective("请分析 @seller-sprite 美国站评论 @google")).toBe("请分析 美国站评论");
  });

  it("preserves line breaks in multiline objectives", () => {
    expect(sanitizeObjective("Line one\nLine two\n\nLine three")).toBe("Line one\nLine two\n\nLine three");
  });

  it("preserves paragraph breaks while stripping datasource mentions", () => {
    expect(
      sanitizeObjective("Analyze @seller-sprite top listings\n\nCompare review trends @google"),
    ).toBe("Analyze top listings\n\nCompare review trends");
  });

  it("infers attachment file types from extension", () => {
    expect(inferAttachmentType("report.pdf")).toBe("pdf");
    expect(inferAttachmentType("voice.m4a")).toBe("audio");
    expect(inferAttachmentType("deck.pptx")).toBe("ppt");
    expect(inferAttachmentType("image.png")).toBe("image");
    expect(inferAttachmentType("unknown.bin")).toBe("txt");
  });
});
