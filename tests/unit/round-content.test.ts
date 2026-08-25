import { describe, expect, test } from "vitest";

import { publicRoundContent } from "@/lib/agent-api/round-content";
import type { ChatRoundSnapshot } from "@/lib/agent-api/types";

function snapshot(overrides: Partial<ChatRoundSnapshot>): ChatRoundSnapshot {
  return {
    round_id: "00000000-0000-4000-8000-000000000001",
    session_id: "00000000-0000-4000-8000-000000000002",
    status: "FAILED",
    assistant_message_id: "00000000-0000-4000-8000-000000000003",
    content: "",
    last_event_seq: 3,
    steps: [],
    error_code: "PLANNING_FAILED",
    error_message: "暂时无法完成本轮规划，请稍后重试。",
    ...overrides,
  };
}

describe("publicRoundContent", () => {
  test("FAILED 且 content 为空时返回 sanitize 后的 error_message", () => {
    const result = publicRoundContent(snapshot({}));

    expect(result).toBe("暂时无法完成本轮规划，请稍后重试。");
  });

  test("FAILED 且 content 为空、error_message 为空时返回通用失败文案", () => {
    const result = publicRoundContent(snapshot({ error_message: null }));

    expect(result).toBe("暂时无法完成本轮任务，请稍后重试。");
  });

  test("CANCELLED 且 content 为空时返回取消文案", () => {
    const result = publicRoundContent(
      snapshot({ status: "CANCELLED", error_code: null, error_message: null }),
    );

    expect(result).toBe("任务已终止");
  });

  test("content 非空时优先返回 content，不回退到 error_message", () => {
    const result = publicRoundContent(
      snapshot({ content: "已完成 6 个 ASIN 的商品详情查询", status: "FAILED" }),
    );

    expect(result).toBe("已完成 6 个 ASIN 的商品详情查询");
  });

  test("非终态且 content 为空时返回空字符串", () => {
    const result = publicRoundContent(
      snapshot({ status: "PLANNING", error_code: null, error_message: null }),
    );

    expect(result).toBe("");
  });

  test("SUCCEEDED 且 content 为空时返回空字符串", () => {
    const result = publicRoundContent(
      snapshot({ status: "SUCCEEDED", error_code: null, error_message: null }),
    );

    expect(result).toBe("");
  });

  test("error_message 中的内部信息会被 sanitize", () => {
    const result = publicRoundContent(
      snapshot({
        error_message: "run_linkfox_task 调用失败，capability: commerce_data.collect",
      }),
    );

    expect(result).not.toContain("run_linkfox_task");
    expect(result).not.toContain("capability");
  });

  test("业务失败文案替换逻辑保留：content 含「已创建」时替换为「未能创建」", () => {
    const result = publicRoundContent(
      snapshot({
        status: "PARTIAL_SUCCESS",
        error_code: "BUSINESS_ACTION_FAILED",
        error_message: null,
        content: "已创建收藏，共 3 项",
      }),
    );

    expect(result).toBe("未能创建收藏，共 3 项");
  });
});
