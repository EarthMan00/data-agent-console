import { describe, expect, it } from "vitest";

import { buildPlatformStepTimeline } from "@/components/execution-steps-monitor";
import type { PlatformSubtaskSnapshot, TaskExecutionStep } from "@/lib/agent-events";

function step(
  id: string,
  order: number,
  label: string,
  status: TaskExecutionStep["status"],
): TaskExecutionStep {
  return { id, order, label, status };
}

function snap(stepIndex: number, taskId: string): PlatformSubtaskSnapshot {
  return {
    stepIndex,
    stepId: `s-${stepIndex}`,
    label: `L${stepIndex}`,
    taskId,
    outcome: "success",
    taskStatus: "SUCCESS",
    artifacts: [],
    zipDownloadApi: null,
  };
}

describe("buildPlatformStepTimeline", () => {
  it("只展示当前步骤的执行卡片（第一步 running）", () => {
    const steps = [step("a", 0, "A", "running"), step("b", 1, "B", "pending")];
    const items = buildPlatformStepTimeline(steps, undefined);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "executing", stepIndex: 0, total: 2 });
  });

  it("第一步完成后为结果卡片，第二步为执行卡片", () => {
    const steps = [step("a", 0, "A", "done"), step("b", 1, "B", "running")];
    const items = buildPlatformStepTimeline(steps, [snap(0, "t0")]);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ kind: "result", snap: { taskId: "t0" } });
    expect(items[1]).toMatchObject({ kind: "executing", stepIndex: 1 });
  });

  it("终态但尚无快照时插入 result_pending", () => {
    const steps = [step("a", 0, "A", "done"), step("b", 1, "B", "pending")];
    const items = buildPlatformStepTimeline(steps, undefined);
    expect(items[0]).toMatchObject({ kind: "result_pending", stepIndex: 0, status: "done" });
    expect(items[1]).toMatchObject({ kind: "executing", stepIndex: 1 });
  });

  it("全部完成且均有快照时仅结果链", () => {
    const steps = [step("a", 0, "A", "done"), step("b", 1, "B", "done")];
    const items = buildPlatformStepTimeline(steps, [snap(0, "t0"), snap(1, "t1")]);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ kind: "result" });
    expect(items[1]).toMatchObject({ kind: "result", snap: { taskId: "t1" } });
  });
});
