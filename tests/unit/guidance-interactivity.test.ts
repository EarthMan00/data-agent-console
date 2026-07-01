import { describe, expect, it } from "vitest";

import type { SessionMessageItem } from "@/lib/agent-api/types";
import {
  buildPostTaskGuidanceLeadingByMessageId,
  resolveInteractiveGuidanceMessageId,
  resolveInteractiveGuidanceRoundId,
  resolveRoundPostTaskGuidanceContent,
  resolveRoundTaskOutcomeSummary,
  shouldDeferPostTaskGuidanceToStepsBubble,
  shouldDeferTaskTerminatedToStepsBubble,
  shouldRenderGuidanceBubbleAtMessage,
  shouldSuppressPlainAssistantBubbleForGuidance,
  shouldSuppressStandaloneTaskResultCard,
} from "@/lib/guidance-interactivity";
import { buildTaskCompletionSummary } from "@/lib/task-chat-summary";

function guidanceMsg(id: string, index: number, kind = "post_task_guidance"): SessionMessageItem {
  return {
    id,
    role: "assistant",
    content: "【接下来您可以】\n1. 重新发送完整需求",
    created_at: new Date(Date.UTC(2026, 5, 20, index)).toISOString(),
    message_index: index,
    meta: { kind },
  };
}

function userMsg(id: string, index: number): SessionMessageItem {
  return {
    id,
    role: "user",
    content: "继续",
    created_at: new Date(Date.UTC(2026, 5, 20, index)).toISOString(),
    message_index: index,
    meta: {},
  };
}

describe("resolveInteractiveGuidanceMessageId", () => {
  it("returns latest guidance when no user message follows", () => {
    const messages = [guidanceMsg("g1", 1), guidanceMsg("g2", 3)];
    expect(resolveInteractiveGuidanceMessageId(messages)).toBe("g2");
  });

  it("returns null when user message follows latest guidance", () => {
    const messages = [guidanceMsg("g1", 1), guidanceMsg("g2", 3), userMsg("u1", 5)];
    expect(resolveInteractiveGuidanceMessageId(messages)).toBeNull();
  });

  it("includes synthetic terminated anchor", () => {
    const messages = [guidanceMsg("steps", 1), userMsg("u0", 2)];
    expect(
      resolveInteractiveGuidanceMessageId(messages, { syntheticTerminatedMessageId: "steps" }),
    ).toBeNull();
  });

  it("returns synthetic anchor when it is the latest and no user follows", () => {
    const messages = [userMsg("u0", 0), { ...guidanceMsg("steps", 1), meta: { kind: "task_execution_steps" } }];
    expect(
      resolveInteractiveGuidanceMessageId(messages, { syntheticTerminatedMessageId: "steps" }),
    ).toBe("steps");
  });

  it("prefers steps anchor over task_terminated when guidance is mounted on steps bubble", () => {
    const messages: SessionMessageItem[] = [
      userMsg("u0", 0),
      {
        id: "steps",
        role: "assistant",
        content: "（以下为该轮任务的执行步骤记录）",
        created_at: new Date(Date.UTC(2026, 5, 20, 1)).toISOString(),
        message_index: 1,
        meta: {
          kind: "task_execution_steps",
          task_id: "task-1",
          steps: [{ id: "s1", label: "在亚马逊搜索 cup", status: "error" }],
        },
      },
      {
        id: "terminated",
        role: "assistant",
        content: "任务已终止，当前执行已停止。\n\n【接下来您可以】\n1. 重新发送完整需求",
        created_at: new Date(Date.UTC(2026, 5, 20, 2)).toISOString(),
        message_index: 2,
        meta: { kind: "task_terminated", task_id: "task-1" },
      },
    ];
    expect(
      resolveInteractiveGuidanceMessageId(messages, { syntheticTerminatedMessageId: "steps" }),
    ).toBe("steps");
  });
});

describe("shouldRenderGuidanceBubbleAtMessage", () => {
  it("renders only the latest guidance within the same user turn", () => {
    const messages = [
      userMsg("u0", 0),
      guidanceMsg("g1", 1),
      guidanceMsg("g2", 2),
    ];
    expect(shouldRenderGuidanceBubbleAtMessage(messages, 1)).toBe(false);
    expect(shouldRenderGuidanceBubbleAtMessage(messages, 2)).toBe(true);
  });

  it("prefers dedicated post_task_guidance over embedded guidance in the same turn", () => {
    const messages = [
      userMsg("u0", 0),
      {
        id: "legacy",
        role: "assistant" as const,
        content: "任务已完成\n\n【接下来您可以】\n1. 旧版内嵌引导",
        created_at: new Date(Date.UTC(2026, 5, 20, 1)).toISOString(),
        message_index: 1,
        meta: { task_id: "task-1" },
      },
      guidanceMsg("dedicated", 2),
    ];
    expect(shouldRenderGuidanceBubbleAtMessage(messages, 1)).toBe(false);
    expect(shouldRenderGuidanceBubbleAtMessage(messages, 2)).toBe(true);
  });

  it("keeps guidance from earlier turns visible", () => {
    const messages = [
      userMsg("u0", 0),
      guidanceMsg("g1", 1),
      userMsg("u1", 2),
      guidanceMsg("g2", 3),
    ];
    expect(shouldRenderGuidanceBubbleAtMessage(messages, 1)).toBe(true);
    expect(shouldRenderGuidanceBubbleAtMessage(messages, 3)).toBe(true);
  });
});

describe("resolveInteractiveGuidanceRoundId", () => {
  it("returns last round with guidance when no later rounds", () => {
    const rounds = [
      { roundId: "r1", postTaskGuidance: "【接下来您可以】\n1. A" },
      { roundId: "r2", postTaskGuidance: "【接下来您可以】\n1. B" },
    ];
    expect(resolveInteractiveGuidanceRoundId(rounds)).toBe("r2");
  });

  it("returns null when a later round exists", () => {
    const rounds = [
      { roundId: "r1", postTaskGuidance: "【接下来您可以】\n1. A" },
      { roundId: "r2", postTaskGuidance: "【接下来您可以】\n1. B" },
      { roundId: "r3", postTaskGuidance: null },
    ];
    expect(resolveInteractiveGuidanceRoundId(rounds)).toBeNull();
  });

  it("returns null when supplemental user messages exist on last guidance round", () => {
    const rounds = [
      {
        roundId: "r1",
        postTaskGuidance: "【接下来您可以】\n1. A",
        supplementalUserMessages: [{ text: "补充" }],
      },
    ];
    expect(resolveInteractiveGuidanceRoundId(rounds)).toBeNull();
  });
});

describe("shouldSuppressPlainAssistantBubbleForGuidance", () => {
  it("suppresses dedicated and embedded guidance source messages", () => {
    expect(shouldSuppressPlainAssistantBubbleForGuidance({ kind: "none" })).toBe(false);
    expect(shouldSuppressPlainAssistantBubbleForGuidance({ kind: "dedicated" })).toBe(true);
    expect(shouldSuppressPlainAssistantBubbleForGuidance({ kind: "embedded" })).toBe(true);
  });
});

describe("resolveRoundPostTaskGuidanceContent", () => {
  it("reads dedicated post_task_guidance in the same user turn", () => {
    const messages: SessionMessageItem[] = [
      userMsg("u1", 0),
      {
        id: "steps",
        role: "assistant",
        content: "（以下为该轮任务的执行步骤记录）",
        created_at: "2026-05-22T10:00:00Z",
        message_index: 1,
        meta: {
          kind: "task_execution_steps",
          task_id: "task-1",
          steps: [{ id: "s1", label: "分析", status: "done" }],
        },
      },
      guidanceMsg("g1", 2),
    ];
    const hit = resolveRoundPostTaskGuidanceContent(messages, 1, { taskId: "task-1" });
    expect(hit?.messageId).toBe("g1");
    expect(hit?.content).toContain("重新发送完整需求");
  });

  it("normalizes the matching task outcome summary as leading content for steps guidance", () => {
    const messages: SessionMessageItem[] = [
      userMsg("u1", 0),
      {
        id: "steps",
        role: "assistant",
        content: "（以下为该轮任务的执行步骤记录）",
        created_at: "2026-05-22T10:00:00Z",
        message_index: 1,
        meta: {
          kind: "task_execution_steps",
          task_id: "task-1",
          steps: [{ id: "s1", label: "分析", status: "error" }],
        },
      },
      {
        id: "summary",
        role: "assistant",
        content: "任务执行失败，可在右侧查看任务结果详情。",
        created_at: "2026-05-22T10:00:01Z",
        message_index: 2,
        meta: {
          task_id: "task-1",
          task_status: "FAILED",
          error_message: "network error",
        },
      },
      guidanceMsg("g1", 3),
    ];

    const hit = resolveRoundPostTaskGuidanceContent(messages, 1, { taskId: "task-1" });
    expect(hit?.messageId).toBe("g1");
    expect(hit?.leading).toBe("这轮没有完成“分析”。执行失败。原因：network error");
    expect(hit?.leadingMessageId).toBe("summary");
  });

  it("can merge a later task summary into an earlier dedicated guidance bubble", () => {
    const messages: SessionMessageItem[] = [
      userMsg("u1", 0),
      guidanceMsg("g1", 1),
      {
        id: "summary",
        role: "assistant",
        content: "任务已完成，可以在右侧查看本轮任务结果和 CSV 数据。",
        created_at: "2026-05-22T10:00:01Z",
        message_index: 2,
        meta: {
          task_id: "task-1",
          task_status: "SUCCESS",
          has_artifacts: true,
        },
      },
    ];

    const leadingByMessageId = buildPostTaskGuidanceLeadingByMessageId(messages);
    expect(leadingByMessageId.get("g1")).toEqual({
      text: "这轮已经完成“继续”。结果数据已整理好，右侧可以直接查看。",
      sourceMessageId: "summary",
    });
  });

  it("normalizes a persisted multi-step completion summary even when task_status metadata is missing", () => {
    const taskName = "Search Amazon for cup and capture the top three listings";
    const messages: SessionMessageItem[] = [
      {
        id: "u1",
        role: "user",
        content: taskName,
        created_at: "2026-05-22T10:00:00Z",
        message_index: 0,
        meta: {},
      },
      {
        id: "steps",
        role: "assistant",
        content: "running",
        created_at: "2026-05-22T10:00:01Z",
        message_index: 1,
        meta: {
          kind: "task_execution_steps",
          task_id: "task-root",
          orchestration_id: "orch-1",
          steps: [
            { id: "s1", label: "Collect the top three cup listings", status: "done" },
            { id: "s2", label: "Prepare the result handoff", status: "done" },
          ],
        },
      },
      {
        id: "summary",
        role: "assistant",
        content: "多步任务已全部完成，可以在右侧查看最后一步任务结果与数据。",
        created_at: "2026-05-22T10:00:02Z",
        message_index: 2,
        meta: {
          task_id: "task-final",
          has_artifacts: true,
        },
      },
      {
        id: "guidance",
        role: "assistant",
        content: "【接下来您可以】\n1. Review the output and generate a report",
        created_at: "2026-05-22T10:00:03Z",
        message_index: 3,
        meta: {
          kind: "post_task_guidance",
          task_id: "task-final",
        },
      },
    ];

    const hit = resolveRoundPostTaskGuidanceContent(messages, 1, { taskId: "task-root" });
    expect(hit?.messageId).toBe("guidance");
    expect(hit?.leading).toBe(
      buildTaskCompletionSummary({
        task_id: "task-final",
        tool_name: "skill_task",
        status: "SUCCESS",
        started_at: "2026-05-22T10:00:00Z",
        finished_at: "2026-05-22T10:00:02Z",
        artifacts: [
          {
            artifact_id: "artifact-1",
            artifact_type: "result",
            original_name: "top-cups.csv",
            download_api: "/api/tasks/task-final/artifacts/artifact-1/download",
          },
        ],
        events: [],
        zip_download_api: null,
        request_payload: {
          message: taskName,
        },
      } as never),
    );
    expect(hit?.leadingMessageId).toBe("summary");
  });

  it("finds the nearest task outcome summary for both steps and guidance anchors", () => {
    const messages: SessionMessageItem[] = [
      userMsg("u1", 0),
      {
        id: "steps",
        role: "assistant",
        content: "（以下为该轮任务的执行步骤记录）",
        created_at: "2026-05-22T10:00:00Z",
        message_index: 1,
        meta: {
          kind: "task_execution_steps",
          task_id: "task-1",
          steps: [{ id: "s1", label: "分析", status: "done" }],
        },
      },
      {
        id: "summary",
        role: "assistant",
        content: "任务已完成，可以在右侧查看本轮任务结果和 CSV 数据。",
        created_at: "2026-05-22T10:00:01Z",
        message_index: 2,
        meta: {
          task_id: "task-1",
          task_status: "SUCCESS",
          has_artifacts: true,
        },
      },
      guidanceMsg("g1", 3),
    ];

    expect(resolveRoundTaskOutcomeSummary(messages, 1, { taskId: "task-1" })).toEqual({
      text: "这轮已经完成“分析”。结果数据已整理好，右侧可以直接查看。",
      sourceMessageId: "summary",
    });
    expect(resolveRoundTaskOutcomeSummary(messages, 3, { taskId: "task-1" })).toEqual({
      text: "这轮已经完成“分析”。结果数据已整理好，右侧可以直接查看。",
      sourceMessageId: "summary",
    });
  });

  it("synthesizes the task outcome summary from the terminal task snapshot when the summary message has not reloaded yet", () => {
    const messages: SessionMessageItem[] = [
      userMsg("u1", 0),
      {
        id: "steps",
        role: "assistant",
        content: "running",
        created_at: "2026-05-22T10:00:00Z",
        message_index: 1,
        meta: {
          kind: "task_execution_steps",
          task_id: "task-1",
          steps: [{ id: "s1", label: "Search the top three cup listings", status: "done" }],
        },
      },
      guidanceMsg("g1", 2),
    ];

    expect(
      resolveRoundTaskOutcomeSummary(messages, 1, {
        taskId: "task-1",
        taskSnapshot: {
          task_id: "task-1",
          tool_name: "skill_task",
          status: "SUCCESS",
          started_at: "2026-05-22T10:00:00Z",
          finished_at: "2026-05-22T10:00:03Z",
          artifacts: [
            {
              artifact_id: "artifact-1",
              artifact_type: "result",
              original_name: "top-cups.csv",
              download_api: "/api/tasks/task-1/artifacts/artifact-1/download",
            },
          ],
          events: [],
          zip_download_api: null,
          request_payload: {
            message: "Search the top three cup listings",
          },
        } as never,
      }),
    ).toEqual({
      text: "这轮已经完成“Search the top three cup listings”。结果数据已整理好，右侧可以直接查看。",
      sourceMessageId: "task_outcome_task-1",
    });
  });

  it("defers standalone post_task_guidance when steps bubble should own guidance", () => {
    const messages: SessionMessageItem[] = [
      userMsg("u1", 0),
      {
        id: "steps",
        role: "assistant",
        content: "（以下为该轮任务的执行步骤记录）",
        created_at: "2026-05-22T10:00:00Z",
        message_index: 1,
        meta: {
          kind: "task_execution_steps",
          task_id: "task-1",
          steps: [{ id: "s1", label: "分析", status: "done" }],
        },
      },
      guidanceMsg("g1", 2),
    ];
    expect(shouldDeferPostTaskGuidanceToStepsBubble(messages, 2, "steps")).toBe(true);
    expect(shouldRenderGuidanceBubbleAtMessage(messages, 2)).toBe(true);
  });

  it("defers task_terminated guidance to the steps bubble in the same turn", () => {
    const messages: SessionMessageItem[] = [
      userMsg("u1", 0),
      {
        id: "steps",
        role: "assistant",
        content: "（以下为该轮任务的执行步骤记录）",
        created_at: "2026-05-22T10:00:00Z",
        message_index: 1,
        meta: {
          kind: "task_execution_steps",
          task_id: "task-1",
          steps: [{ id: "s1", label: "在亚马逊搜索 cup", status: "error" }],
        },
      },
      {
        id: "terminated",
        role: "assistant",
        content: "任务已终止，当前执行已停止。\n\n【接下来您可以】\n1. 重新发送完整需求",
        created_at: "2026-05-22T10:00:01Z",
        message_index: 2,
        meta: { kind: "task_terminated", task_id: "task-1" },
      },
    ];
    expect(shouldDeferTaskTerminatedToStepsBubble(messages, 2, "steps")).toBe(true);
    expect(shouldDeferTaskTerminatedToStepsBubble(messages, 1, "steps")).toBe(false);
    expect(resolveRoundPostTaskGuidanceContent(messages, 1, { taskId: "task-1" })).toBeNull();
  });

  it("suppresses standalone task result card on task_terminated when steps already owns it", () => {
    const messages: SessionMessageItem[] = [
      userMsg("u1", 0),
      {
        id: "steps",
        role: "assistant",
        content: "（以下为该轮任务的执行步骤记录）",
        created_at: "2026-05-22T10:00:00Z",
        message_index: 1,
        meta: {
          kind: "task_execution_steps",
          task_id: "task-1",
          steps: [{ id: "s1", label: "搜索", status: "error" }],
        },
      },
      {
        id: "terminated",
        role: "assistant",
        content: "任务已终止，当前执行已停止。",
        created_at: "2026-05-22T10:00:01Z",
        message_index: 2,
        meta: { kind: "task_terminated", task_id: "task-1" },
      },
    ];
    const cardIds = new Set(["steps"]);
    const visible = new Map([["steps", true]]);
    expect(
      shouldSuppressStandaloneTaskResultCard(messages, 2, {
        latestStepsMessageId: "steps",
        taskResultCardMessageIds: cardIds,
        taskResultEntryVisibleByMessageId: visible,
        deferTaskTerminatedToSteps: true,
      }),
    ).toBe(true);
    expect(
      shouldSuppressStandaloneTaskResultCard(messages, 1, {
        latestStepsMessageId: "steps",
        taskResultCardMessageIds: cardIds,
        taskResultEntryVisibleByMessageId: visible,
        deferTaskTerminatedToSteps: false,
      }),
    ).toBe(false);
  });
});
