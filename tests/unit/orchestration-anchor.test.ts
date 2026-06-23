import { describe, expect, it } from "vitest";

import type { SessionMessageItem } from "@/lib/agent-api/types";
import {
  alignStepStatusesWithOrchestrationBundles,
  alignStepsWithBundlesForReplay,
  buildBundleDownloadApiForPanel,
  buildPlatformSubtasksForExecutionSteps,
  displayLabelForIndexedSubtask,
  isUnhelpfulApiTaskLabel,
  mergeBundlesIntoPlatformSnapshots,
  pickBestOrchestrationAnchor,
  resolveAnchorForPanelFromMessageMeta,
  resolvePanelAnchorForStepsMessage,
} from "@/lib/merge-orchestration-task-artifacts";
import type { TaskExecutionStep } from "@/lib/agent-events";

function assistant(
  id: string,
  meta: Record<string, unknown>,
): SessionMessageItem {
  return {
    id,
    role: "assistant",
    content: "",
    created_at: new Date().toISOString(),
    message_index: 0,
    meta,
  };
}

describe("pickBestOrchestrationAnchor", () => {
  it("优先选用含多步子任务 ID 的完成消息，而非仅 task_id 的步骤进度消息", () => {
    const messages: SessionMessageItem[] = [
      assistant("a", {
        kind: "task_execution_steps",
        task_id: "parent-only",
        steps: [{ id: "s1", label: "1", status: "done" }],
      }),
      assistant("b", {
        task_id: "step-last",
        orchestration_step_task_ids: ["t1", "t2", "t3"],
      }),
    ];
    const anchor = pickBestOrchestrationAnchor(messages);
    expect(anchor?.messageId).toBe("b");
    expect(anchor?.bundleTaskIds).toEqual(["t1", "t2", "t3"]);
    expect(anchor?.primaryTaskId).toBe("step-last");
  });
});

describe("resolveAnchorForPanelFromMessageMeta", () => {
  it("从单条 completion 消息解析 task_id，不含会话级回退", () => {
    const anchor = resolveAnchorForPanelFromMessageMeta({
      task_id: "6e4eb5b6-0593-4a25-83f4-4d23f8666e86",
      has_artifacts: true,
    });
    expect(anchor?.primaryTaskId).toBe("6e4eb5b6-0593-4a25-83f4-4d23f8666e86");
    expect(anchor?.bundleTaskIds).toEqual(["6e4eb5b6-0593-4a25-83f4-4d23f8666e86"]);
    expect(anchor?.orchestrationId).toBeNull();
  });

  it("从编排完成消息解析本消息内的 step task ids 与 orchestration_id", () => {
    const anchor = resolveAnchorForPanelFromMessageMeta({
      task_id: "cf0d16f8-aafd-47ce-a220-ba081fdc1a6b",
      orchestration_id: "orch-round-2",
      orchestration_step_task_ids: [
        "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        "cf0d16f8-aafd-47ce-a220-ba081fdc1a6b",
      ],
    });
    expect(anchor?.primaryTaskId).toBe("cf0d16f8-aafd-47ce-a220-ba081fdc1a6b");
    expect(anchor?.bundleTaskIds).toEqual([
      "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      "cf0d16f8-aafd-47ce-a220-ba081fdc1a6b",
    ]);
    expect(anchor?.orchestrationId).toBe("orch-round-2");
  });

  it("两轮任务的 anchor 互不含对方 task_id", () => {
    const round1 = resolveAnchorForPanelFromMessageMeta({
      task_id: "6e4eb5b6-0593-4a25-83f4-4d23f8666e86",
    });
    const round2 = resolveAnchorForPanelFromMessageMeta({
      task_id: "cf0d16f8-aafd-47ce-a220-ba081fdc1a6b",
    });
    expect(round1?.primaryTaskId).not.toBe(round2?.primaryTaskId);
    expect(round1?.bundleTaskIds ?? []).not.toContain(round2!.primaryTaskId);
  });
});

describe("resolvePanelAnchorForStepsMessage", () => {
  it("从同 orchestration 的完成消息补全 task_execution_steps 缺失的多步 task ids", () => {
    const messages: SessionMessageItem[] = [
      assistant("steps", {
        kind: "task_execution_steps",
        task_id: "cf0d16f8-aafd-47ce-a220-ba081fdc1a6b",
        orchestration_id: "orch-round-2",
        steps: [{ id: "s1", label: "1", status: "pending" }],
      }),
      assistant("done", {
        task_id: "cf0d16f8-aafd-47ce-a220-ba081fdc1a6b",
        orchestration_id: "orch-round-2",
        orchestration_step_task_ids: [
          "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
          "cf0d16f8-aafd-47ce-a220-ba081fdc1a6b",
        ],
      }),
    ];
    const anchor = resolvePanelAnchorForStepsMessage(messages, {
      kind: "task_execution_steps",
      task_id: "cf0d16f8-aafd-47ce-a220-ba081fdc1a6b",
      orchestration_id: "orch-round-2",
    });
    expect(anchor?.bundleTaskIds).toEqual([
      "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      "cf0d16f8-aafd-47ce-a220-ba081fdc1a6b",
    ]);
    expect(anchor?.orchestrationId).toBe("orch-round-2");
  });
});

describe("alignStepStatusesWithOrchestrationBundles / buildPlatformSubtasksForExecutionSteps", () => {
  it("有 bundle 的步骤在 meta 仍为 pending 时对齐为 done 并映射到正确 taskId", () => {
    const steps: TaskExecutionStep[] = [
      { id: "x0", label: "A", order: 1, status: "done", roundId: "r" },
      { id: "x1", label: "B", order: 2, status: "pending", roundId: "r" },
    ];
    const bundles = [
      { taskId: "task-a", stepIndex: 0, label: "A", artifacts: [], taskStatus: "SUCCESS", finishedAt: "2026-01-01T00:00:00Z" },
      { taskId: "task-b", stepIndex: 1, label: "B", artifacts: [], taskStatus: "SUCCESS", finishedAt: "2026-01-01T00:00:00Z" },
    ];
    const aligned = alignStepStatusesWithOrchestrationBundles(steps, bundles);
    expect(aligned[1]?.status).toBe("done");
    const snaps = buildPlatformSubtasksForExecutionSteps(steps, bundles);
    expect(snaps[1]!.taskId).toBe("task-b");
  });

  it("不使用上一轮任务的 bundle 将新追问的运行中步骤推断为 done", () => {
    const steps: TaskExecutionStep[] = [
      { id: "x0", label: "查询 computer desktop", order: 1, status: "running", roundId: "r2" },
    ];
    const staleBundles = [
      { taskId: "previous-task", stepIndex: 0, label: "上一轮结果", artifacts: [] },
    ];

    const aligned = alignStepStatusesWithOrchestrationBundles(steps, staleBundles, ["current-task"]);

    expect(aligned[0]?.status).toBe("running");
  });

  it("does not infer done from bundles while the subtask is still running", () => {
    const steps: TaskExecutionStep[] = [
      { id: "x0", label: "查询 cup", order: 1, status: "running", roundId: "r" },
    ];
    const bundles = [
      {
        taskId: "current-task",
        stepIndex: 0,
        label: "查询 cup",
        artifacts: [{ artifact_id: "a1", artifact_type: "log", original_name: "linkfox_result.txt", download_api: "/x" }],
        taskStatus: "RUNNING",
        finishedAt: null,
      },
    ];

    const aligned = alignStepStatusesWithOrchestrationBundles(steps, bundles, ["current-task"]);

    expect(aligned[0]?.status).toBe("running");
  });

  it("clears runtime fields when bundle terminal status aligns a running step to done", () => {
    const steps: TaskExecutionStep[] = [
      {
        id: "x0",
        label: "查询 cup",
        order: 1,
        status: "running",
        roundId: "r",
        runtimeHint: "运行中",
        runtimeStartedAt: "2026-06-22T10:00:00.000Z",
      },
    ];
    const bundles = [
      {
        taskId: "current-task",
        stepIndex: 0,
        label: "查询 cup",
        artifacts: [],
        taskStatus: "SUCCESS",
        finishedAt: "2026-06-22T10:02:00.000Z",
      },
    ];

    const aligned = alignStepsWithBundlesForReplay(steps, bundles, ["current-task"]);

    expect(aligned[0]?.status).toBe("done");
    expect(aligned[0]?.runtimeHint).toBeUndefined();
    expect(aligned[0]?.runtimeStartedAt).toBeUndefined();
  });
});

describe("buildBundleDownloadApiForPanel", () => {
  it("单任务下载 API", () => {
    const r = buildBundleDownloadApiForPanel("task-a", undefined);
    expect(r.api).toBe("/api/tasks/task-a/download");
    expect(r.name).toBeNull();
  });

  it("多任务聚合下载 API", () => {
    const r = buildBundleDownloadApiForPanel("task-a", ["t1", "t2"]);
    expect(r.api).toContain("task_ids=");
    expect(r.name).toBe("task-a.zip");
  });
});

describe("isUnhelpfulApiTaskLabel / displayLabelForIndexedSubtask", () => {
  it("将 hash:os: 等 key_hint 视为无展示意义", () => {
    expect(isUnhelpfulApiTaskLabel("hash:os:e64f58ae8")).toBe(true);
    expect(isUnhelpfulApiTaskLabel("查询关键词数据")).toBe(false);
    expect(isUnhelpfulApiTaskLabel("run_linkfox_task")).toBe(true);
  });

  it("有拆解步骤文案时优先用作 Sheet 名", () => {
    const steps: TaskExecutionStep[] = [
      { id: "a", label: "1）反查流量词", order: 1, status: "done", roundId: "r" },
    ];
    const name = displayLabelForIndexedSubtask(0, "hash:os:abc", steps);
    expect(name).toBe("反查流量词");
  });
});

describe("mergeBundlesIntoPlatformSnapshots", () => {
  it("为每一步生成快照，缺失 bundle 的步骤为空产物而非缺索引", () => {
    const steps: TaskExecutionStep[] = [
      { id: "x0", label: "A", order: 1, status: "done", roundId: "r" },
      { id: "x1", label: "B", order: 2, status: "done", roundId: "r" },
    ];
    const snaps = mergeBundlesIntoPlatformSnapshots(steps, [
      {
        taskId: "only-one",
        stepIndex: 0,
        label: "hint",
        artifacts: [],
      },
    ]);
    expect(snaps).toHaveLength(2);
    expect(snaps[0]!.taskId).toBe("only-one");
    expect(snaps[1]!.artifacts).toEqual([]);
    expect(snaps[1]!.taskId.startsWith("__no_task_")).toBe(true);
  });
});
