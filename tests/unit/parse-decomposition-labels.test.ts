import { describe, expect, it } from "vitest";

import {
  extractDecompositionLabelsFromMessages,
  parseDecompositionLabelsFromContent,
} from "@/lib/parse-decomposition-labels";
import type { SessionMessageItem } from "@/lib/agent-api/types";

describe("parseDecompositionLabelsFromContent", () => {
  it("parses numbered steps from multi-step decomposition text", () => {
    const content =
      "已拆解为 2 个执行步骤（工具由模型指定），将按顺序依次完成。\n" +
      "1. [run_linkfox_task] 在亚马逊搜索 cup\n" +
      "2. [run_chatexcel_task] 生成分析报告";
    expect(parseDecompositionLabelsFromContent(content)).toEqual([
      "在亚马逊搜索 cup",
      "生成分析报告",
    ]);
  });

  it("returns empty for unrelated assistant text", () => {
    expect(parseDecompositionLabelsFromContent("多步任务已全部完成")).toEqual([]);
  });
});

describe("extractDecompositionLabelsFromMessages", () => {
  it("reads labels from the first matching assistant message", () => {
    const messages: SessionMessageItem[] = [
      {
        id: "u1",
        role: "user",
        content: "query",
        created_at: "",
        message_index: 0,
      },
      {
        id: "a1",
        role: "assistant",
        content:
          "已拆解为 1 个执行步骤。\n1. [run_linkfox_task] 搜索商品",
        created_at: "",
        message_index: 1,
      },
    ];
    expect(extractDecompositionLabelsFromMessages(messages)).toEqual(["搜索商品"]);
  });
});
