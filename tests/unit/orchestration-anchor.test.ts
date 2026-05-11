import { describe, expect, it } from "vitest";

import type { SessionMessageItem } from "@/lib/agent-api/types";
import {
  displayLabelForIndexedSubtask,
  isUnhelpfulApiTaskLabel,
  mergeBundlesIntoPlatformSnapshots,
  pickBestOrchestrationAnchor,
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

describe("isUnhelpfulApiTaskLabel / displayLabelForIndexedSubtask", () => {
  it("将 hash:os: 等 key_hint 视为无展示意义", () => {
    expect(isUnhelpfulApiTaskLabel("hash:os:e64f58ae8")).toBe(true);
    expect(isUnhelpfulApiTaskLabel("查询关键词数据")).toBe(false);
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
