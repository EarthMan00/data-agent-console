import type { ResultPushBlock } from "@/components/schedule-result-push";
import type { ScheduleKind } from "./schedule-payloads";

const DRAFT_KEY = "linkfox:scheduleCreateDraftV1";
const TRIAL_META_KEY = "linkfox:scheduleTrialMetaV1";

export type ScheduleCreateDraftV1 = {
  v: 1;
  title: string;
  prompt: string;
  taskEnabled: boolean;
  scheduleKind: ScheduleKind;
  timeHhmm: string;
  /** 与 Set 序列化一致 */
  selectedWeekdayValues: number[];
  selectedMonthDayValues: number[];
  runOnceDate: string;
  groupId: string | null;
  resultPushBlocks: ResultPushBlock[];
  createGroupIdFromUrl: string;
  /** 非空表示在编辑已有任务，试跑后「保存」应 PATCH 该 id，而非新建 */
  editingTaskId?: string | null;
};

export type ScheduleTrialSendState =
  /** 已建会话、等待 agent 页发首条（不阻塞导航） */
  | "pending"
  /** 首条已发出，等接口/历史同步 */
  | "in_flight"
  | "accepted"
  | "completed"
  | "blocked"
  | "unknown";

export type ScheduleTrialMetaV1 = {
  v: 1;
  sessionId: string;
  taskId: string | null;
  sendKind: ScheduleTrialSendState;
  /**
   * POST /chat/.../send 202 的 execution_steps 文案，用于在会话 message.meta 仍无 task_execution_steps 时
   * 与首页「任务拆分 / 任务执行」同构展示。
   */
  executionStepLabels?: string[] | null;
};

export function saveScheduleCreateDraft(d: Omit<ScheduleCreateDraftV1, "v">): void {
  try {
    const payload: ScheduleCreateDraftV1 = { v: 1, ...d };
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function loadScheduleCreateDraft(): ScheduleCreateDraftV1 | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as ScheduleCreateDraftV1;
    if (p.v !== 1) return null;
    return p;
  } catch {
    return null;
  }
}

export function clearScheduleCreateDraft(): void {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

export function saveScheduleTrialMeta(m: ScheduleTrialMetaV1): void {
  try {
    sessionStorage.setItem(TRIAL_META_KEY, JSON.stringify(m));
  } catch {
    /* ignore */
  }
}

export function loadScheduleTrialMeta(): ScheduleTrialMetaV1 | null {
  try {
    const raw = sessionStorage.getItem(TRIAL_META_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as ScheduleTrialMetaV1;
    if (p.v !== 1) return null;
    return p;
  } catch {
    return null;
  }
}

export function clearScheduleTrialMeta(): void {
  try {
    sessionStorage.removeItem(TRIAL_META_KEY);
  } catch {
    /* ignore */
  }
}

export function clearScheduleTrialStorage(): void {
  clearScheduleCreateDraft();
  clearScheduleTrialMeta();
}

/**
 * 试跑首条发送：从 pending 原子地改为 in_flight，避免双 effect / Strict 下重复发。
 * 已非 pending 时返回 null（含已 in_flight / 已完成等）。
 */
export function tryClaimScheduleTrialFirstSend(targetSessionId: string): ScheduleTrialMetaV1 | null {
  const m = loadScheduleTrialMeta();
  if (!m || m.v !== 1) return null;
  if (m.sessionId !== targetSessionId) return null;
  if (m.sendKind !== "pending") return null;
  const next: ScheduleTrialMetaV1 = { ...m, sendKind: "in_flight" };
  saveScheduleTrialMeta(next);
  return next;
}

export function isScheduleTrialAwaitingFirstMessage(sessionId: string, m: ScheduleTrialMetaV1 | null = loadScheduleTrialMeta()): boolean {
  if (!m || m.sessionId !== sessionId) return false;
  return m.sendKind === "pending" || m.sendKind === "in_flight";
}
