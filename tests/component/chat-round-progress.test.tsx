import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ChatRoundProgress } from "@/components/agent-workspace/chat-round-progress";
import type { ChatRoundStatus, ChatRoundStep } from "@/lib/agent-api/types";

const STATUS_COPY: Array<[ChatRoundStatus, string]> = [
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
  it.each(STATUS_COPY.filter(([status]) => status !== "EXECUTING"))(
    "keeps %s available without rendering redundant status copy",
    (status, copy) => {
    const { unmount } = render(<ChatRoundProgress status={status} steps={[]} />);
    const marker = screen.getByTestId("chat-round-progress");
    expect(marker).toHaveAttribute("data-round-status", status);
    expect(marker).toHaveAttribute("aria-hidden", "true");
    expect(marker).toHaveClass("sr-only");
    expect(marker).not.toHaveTextContent(copy);
    unmount();
    },
  );

  it("shows the execution card as soon as execution starts before plan rows arrive", () => {
    const view = render(<ChatRoundProgress status="EXECUTING" steps={[]} />);

    expect(screen.getByText("任务执行")).toBeInTheDocument();
    expect(screen.getByTestId("execution-steps-pending")).toBeInTheDocument();
    expect(screen.queryByText("我正在思考，请等我一下～")).not.toBeInTheDocument();

    view.rerender(
      <ChatRoundProgress
        status="EXECUTING"
        steps={[step({ status: "PENDING", label: "在亚马逊美国站搜索关键词 cup，获取排名前三的爆品信息" })]}
      />,
    );
    expect(screen.queryByTestId("execution-steps-pending")).not.toBeInTheDocument();
    expect(screen.getByText("在亚马逊美国站搜索关键词 cup，获取排名前三的爆品信息")).toBeInTheDocument();
  });

  it("does not show the result entry card while another step is still executing", () => {
    render(
      <ChatRoundProgress
        status="EXECUTING"
        steps={[
          step({
            step_id: "completed-data",
            status: "SUCCESS",
            artifacts: [
              {
                artifact_id: "completed-artifact",
                artifact_type: "csv",
                original_name: "completed.csv",
                download_api: "/api/artifacts/completed-artifact/download",
              },
            ],
          }),
          step({
            step_id: "running-report",
            step_index: 1,
            status: "RUNNING",
            artifacts: [],
          }),
        ]}
      />,
    );

    expect(screen.queryByTestId("agent-result-section")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("chat-round-step")).toHaveLength(2);
  });

  it("restores the task execution card, elapsed timer, and expand interaction", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-07T04:00:05Z"));
    try {
      const view = render(
        <ChatRoundProgress
          status="EXECUTING"
          startedAt="2026-08-07T04:00:00Z"
          steps={[step({ status: "RUNNING", label: "采集亚马逊商品数据" })]}
        />,
      );

      expect(screen.getByText("任务执行")).toBeInTheDocument();
      expect(screen.getByTestId("execution-runtime-tag")).toHaveTextContent("已等待 0 分 0 秒");
      expect(screen.getByRole("button", { name: "收起任务执行" })).toHaveAttribute(
        "aria-expanded",
        "true",
      );
      expect(screen.getByText("采集亚马逊商品数据")).toBeInTheDocument();

      act(() => vi.advanceTimersByTime(1000));
      expect(screen.getByTestId("execution-runtime-tag")).toHaveTextContent("已等待 0 分 1 秒");

      view.rerender(
        <ChatRoundProgress
          status="EXECUTING"
          startedAt="2026-08-07T04:00:06Z"
          steps={[step({ status: "RUNNING", label: "采集亚马逊商品数据" })]}
        />,
      );
      expect(screen.getByTestId("execution-runtime-tag")).toHaveTextContent("已等待 0 分 1 秒");

      fireEvent.click(screen.getByRole("button", { name: "收起任务执行" }));
      expect(screen.getByRole("button", { name: "展开任务执行" })).toHaveAttribute(
        "aria-expanded",
        "false",
      );
      expect(screen.queryByText("采集亚马逊商品数据")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
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

    fireEvent.click(screen.getByRole("button", { name: /展开任务/ }));

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
    const onOpenStepResult = vi.fn();
    render(
      <ChatRoundProgress
        status="PARTIAL_SUCCESS"
        onOpenStepResult={onOpenStepResult}
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

    fireEvent.click(screen.getByRole("button", { name: /展开任务/ }));

    expect(screen.getByTestId("chat-round-progress")).toHaveAttribute("data-round-status", "PARTIAL_SUCCESS");
    expect(screen.getByTestId("chat-round-progress")).not.toHaveTextContent("已完成部分结果");
    expect(screen.getByText("任务结果")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "查看" }));
    expect(onOpenStepResult).toHaveBeenCalledWith(expect.objectContaining({ step_id: "data" }));
    expect(screen.getByRole("button", { name: "收起" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "收起" }));
    expect(screen.getByRole("button", { name: "查看" })).toBeInTheDocument();
    expect(screen.queryByText("result")).not.toBeInTheDocument();
    expect(screen.getByText("生成分析报告")).toBeInTheDocument();
    expect(screen.getAllByText("未完成").length).toBeGreaterThan(0);
    expect(document.body).not.toHaveTextContent("run_linkfox_task");
    expect(document.body).not.toHaveTextContent("commerce_data.collect");
    expect(document.body).not.toHaveTextContent("不应作为成功展示");
    expect(document.body).not.toHaveTextContent("已创建");
  });

  it("keeps the result summary card synchronized with the side panel", () => {
    const onOpenStepResult = vi.fn();
    const onCloseStepResult = vi.fn();
    const resultStep = step({
      step_id: "data",
      label: "在亚马逊美国站搜索关键词“cup”，获取排名前三的爆品信息",
      artifacts: [
        {
          artifact_id: "12ca8e0d-5977-42cf-b92d-c0d4e998ac9f",
          artifact_type: "csv",
          original_name: "result.csv",
          download_api: "/api/artifacts/12ca8e0d-5977-42cf-b92d-c0d4e998ac9f/download",
        },
      ],
    });

    const view = render(
      <ChatRoundProgress
        status="SUCCEEDED"
        steps={[resultStep]}
        openedStepId={null}
        onOpenStepResult={onOpenStepResult}
        onCloseStepResult={onCloseStepResult}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "查看" }));
    expect(onOpenStepResult).toHaveBeenCalledWith(resultStep);

    view.rerender(
      <ChatRoundProgress
        status="SUCCEEDED"
        steps={[resultStep]}
        openedStepId={resultStep.step_id}
        onOpenStepResult={onOpenStepResult}
        onCloseStepResult={onCloseStepResult}
      />,
    );
    expect(screen.getByRole("button", { name: "收起" })).toBeInTheDocument();

    view.rerender(
      <ChatRoundProgress
        status="SUCCEEDED"
        steps={[resultStep]}
        openedStepId={null}
        onOpenStepResult={onOpenStepResult}
        onCloseStepResult={onCloseStepResult}
      />,
    );
    expect(screen.getByRole("button", { name: "查看" })).toBeInTheDocument();
  });
});
