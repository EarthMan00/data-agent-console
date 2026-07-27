import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ChatRoundProgress } from "@/components/agent-workspace/chat-round-progress";
import type { ChatRoundStatus, ChatRoundStep } from "@/lib/agent-api/types";

const COPY: Array<[ChatRoundStatus, string]> = [
  ["QUEUED", "正在准备"],
  ["PLANNING", "正在理解需求并制定执行计划"],
  ["GENERATING", "正在生成回答"],
  ["EXECUTING", "正在执行任务"],
  ["WAITING_INPUT", "需要补充信息"],
  ["CANCEL_REQUESTED", "正在停止"],
  ["SUCCEEDED", "已完成"],
  ["PARTIAL_SUCCESS", "已完成部分结果"],
  ["FAILED", "未完成"],
  ["CANCELLED", "已停止"],
];

function step(overrides: Partial<ChatRoundStep>): ChatRoundStep {
  return {
    step_id: "step-1",
    step_index: 0,
    label: "创建业务记录",
    status: "SUCCESS",
    task_id: null,
    artifacts: [],
    evidence: null,
    error_code: null,
    error_message: null,
    ...overrides,
  };
}

describe("ChatRoundProgress", () => {
  it.each(COPY)("maps %s to the exact public copy", (status, copy) => {
    const { unmount } = render(<ChatRoundProgress status={status} steps={[]} />);
    expect(screen.getByTestId("chat-round-status")).toHaveTextContent(copy);
    unmount();
  });

  it("renders only allowlisted schedule and favorite evidence", () => {
    render(
      <ChatRoundProgress
        status="SUCCEEDED"
        steps={[
          step({
            step_id: "schedule",
            step_index: 0,
            label: "创建每日监控",
            evidence: {
              scheduled_task_id: "d8d4064e-530c-48b3-a643-ad9ff21251d5",
              title: "每日竞品检查",
              time_hhmm: "09:30",
              next_run_at: "2026-07-28T01:30:00Z",
              recurrence: "daily",
              capability: "scheduled_task.create",
              tool_name: "run_linkfox_task",
              raw_args: { credential: "secret" },
            },
          }),
          step({
            step_id: "favorite",
            step_index: 1,
            label: "保存选品",
            evidence: {
              favorite_id: "362a1685-e81f-4f8c-a2c1-514bbecc2ed5",
              selected_count: 2,
              asins: ["B000000001", "B000000002"],
              source_task_id: "internal-task",
              operation: "favorite_snapshot.create",
            },
          }),
        ]}
      />,
    );

    expect(screen.getByText(/每日竞品检查/)).toBeInTheDocument();
    expect(screen.getByText(/09:30/)).toBeInTheDocument();
    expect(screen.getByText(/d8d4064e-530c-48b3-a643-ad9ff21251d5/)).toBeInTheDocument();
    expect(screen.getByText(/已选 2 项/)).toBeInTheDocument();
    expect(screen.getByText(/B000000001、B000000002/)).toBeInTheDocument();
    expect(screen.getByText(/362a1685-e81f-4f8c-a2c1-514bbecc2ed5/)).toBeInTheDocument();

    const dom = document.body.textContent ?? "";
    for (const forbidden of [
      "run_linkfox_task",
      "run_chatexcel_task",
      "commerce_data.collect",
      "scheduled_task.create",
      "favorite_snapshot.create",
      "capability",
      "tool_name",
      "raw_args",
      "credential",
      "source_task_id",
      "recurrence",
    ]) {
      expect(dom).not.toContain(forbidden);
    }
  });

  it("shows public artifacts and partial success boundaries without exposing internal labels", () => {
    render(
      <ChatRoundProgress
        status="PARTIAL_SUCCESS"
        steps={[
          step({
            step_id: "data",
            label: "run_linkfox_task commerce_data.collect",
            artifacts: [
              {
                artifact_id: "12ca8e0d-5977-42cf-b92d-c0d4e998ac9f",
                artifact_type: "csv",
                original_name: "result.csv",
                download_api: "/api/artifacts/12ca8e0d-5977-42cf-b92d-c0d4e998ac9f/download",
              },
            ],
          }),
          step({
            step_id: "report",
            step_index: 1,
            label: "生成分析报告",
            status: "FAILED",
            evidence: {
              scheduled_task_id: "d8d4064e-530c-48b3-a643-ad9ff21251d5",
              title: "不应作为成功展示",
            },
          }),
        ]}
      />,
    );

    expect(screen.getByText("已完成部分结果")).toBeInTheDocument();
    expect(screen.getByText("result")).toBeInTheDocument();
    expect(screen.getByText("生成分析报告")).toBeInTheDocument();
    expect(screen.getAllByText("未完成").length).toBeGreaterThan(0);
    expect(document.body).not.toHaveTextContent("run_linkfox_task");
    expect(document.body).not.toHaveTextContent("commerce_data.collect");
    expect(document.body).not.toHaveTextContent("不应作为成功展示");
    expect(document.body).not.toHaveTextContent("已创建");
  });
});
