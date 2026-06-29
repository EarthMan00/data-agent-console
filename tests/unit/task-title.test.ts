import { describe, expect, it } from "vitest";

import type { TaskResponse } from "@/lib/agent-api/types";
import { taskDisplayName } from "@/lib/agent-api/task-title";

function buildTask(overrides?: Partial<TaskResponse>): TaskResponse {
  return {
    task_id: "task-12345678",
    tool_name: "skill_task",
    status: "SUCCESS",
    started_at: "2026-06-27T17:11:20.767Z",
    zip_download_api: null,
    events: [],
    artifacts: [],
    finished_at: "2026-06-27T17:12:38.914Z",
    ...overrides,
  };
}

describe("taskDisplayName", () => {
  it("prefers decomposed_single_step over the augmented model message", () => {
    const task = buildTask({
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
    });

    expect(taskDisplayName(task, 200)).toBe(
      "在亚马逊搜索“cup”，获取综合排名前三的商品信息，包括标题、价格、评分、排名等关键数据",
    );
  });

  it("extracts the original user message from an augmented prompt when no decomposed step exists", () => {
    const task = buildTask({
      request_payload: {
        message: [
          "【会话附件状态】请结合用户消息自行判断是否需要使用附件。",
          "仅当用户明确要求读取/分析附件或本轮有新上传时，才调用 ChatExcel。",
          "当前会话无已上传附件。",
          "",
          "【用户消息】",
          "查看结果数据详情，并生成分析报告",
        ].join("\n"),
      },
    });

    expect(taskDisplayName(task, 200)).toBe("查看结果数据详情，并生成分析报告");
  });
});
