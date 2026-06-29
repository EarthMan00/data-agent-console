import { describe, expect, it } from "vitest";

import type { TaskResponse } from "@/lib/agent-api/types";
import { buildTaskCompletionSummary } from "@/lib/task-chat-summary";

function task(overrides?: Partial<TaskResponse>): TaskResponse {
  return {
    task_id: "task-12345678",
    tool_name: "skill_task",
    status: "SUCCESS",
    started_at: "2026-06-27T17:11:20.767Z",
    zip_download_api: null,
    events: [],
    artifacts: [],
    finished_at: "2026-06-27T17:12:38.914Z",
    request_payload: {
      message: "亚马逊搜索cup并返回排名前三的爆品信息",
    },
    ...overrides,
  };
}

describe("buildTaskCompletionSummary", () => {
  it("returns a user-facing success summary instead of mechanical metadata lines", () => {
    const summary = buildTaskCompletionSummary(
      task({
        request_payload: {
          message: [
            "【会话附件状态】请结合用户消息自行判断是否需要使用附件。",
            "当前会话无已上传附件。",
            "",
            "【用户消息】",
            "亚马逊搜索cup并返回排名前三的爆品信息",
          ].join("\n"),
          decomposed_single_step: "在亚马逊搜索“cup”，获取综合排名前三的商品信息，包括标题、价格、评分、排名等关键数据",
        },
        response_summary: {
          tool_output_files: ["result.csv", "result.json"],
        },
        artifacts: [
          {
            artifact_id: "artifact-1",
            artifact_type: "csv",
            original_name: "result.csv",
            download_api: "/api/test/artifact-1",
          },
        ],
      }),
    );

    expect(summary).toContain("这轮已经完成");
    expect(summary).toContain("在亚马逊搜索“cup”");
    expect(summary).toContain("结果数据已整理好");
    expect(summary).not.toContain("任务：");
    expect(summary).not.toContain("状态：");
    expect(summary).not.toContain("完成时间：");
    expect(summary).not.toContain("会话附件状态");
  });

  it("returns a user-facing failure summary with the reason", () => {
    const summary = buildTaskCompletionSummary(
      task({
        status: "FAILED",
        error_message: "生成失败，请检查管理后台模型配置或网络连接后重试",
        request_payload: {
          message: "查看结果数据详情，并生成分析报告",
        },
      }),
    );

    expect(summary).toContain("这轮没有完成");
    expect(summary).toContain("查看结果数据详情，并生成分析报告");
    expect(summary).toContain("生成失败");
    expect(summary).not.toContain("任务：");
    expect(summary).not.toContain("状态：失败");
  });
});
