import { describe, expect, it } from "vitest";

import {
  buildUserMessageAttachmentsFromFiles,
  formatUserAttachmentSize,
  parseUserMessageAttachments,
} from "@/lib/user-message-attachments";

describe("user-message-attachments", () => {
  it("formats attachment size labels", () => {
    expect(formatUserAttachmentSize(620)).toBe("620B");
    expect(formatUserAttachmentSize(1024)).toBe("1.00KB");
    expect(formatUserAttachmentSize(3.56 * 1024 * 1024)).toBe("3.56MB");
  });

  it("builds attachment items from files", () => {
    const file = new File(["hello"], "notes.txt", { type: "text/plain" });
    expect(buildUserMessageAttachmentsFromFiles([file])).toEqual([
      { name: "notes.txt", size: file.size, extension: "txt" },
    ]);
  });

  it("parses attachment meta from session messages", () => {
    const parsed = parseUserMessageAttachments({
      attachments: [{ name: "demo.xlsx", size: 1234, extension: "xlsx" }],
    });
    expect(parsed).toEqual([{ name: "demo.xlsx", size: 1234, extension: "xlsx" }]);
  });
});
