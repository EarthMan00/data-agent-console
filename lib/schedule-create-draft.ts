import type { ResultPushBlock } from "@/components/schedule-result-push";
import type { ScheduleKind } from "./schedule-payloads";

const DRAFT_KEY = "alice:scheduleCreateDraftV1";
const TRIAL_META_KEY = "alice:scheduleTrialMetaV2";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

export type ScheduleTrialMetaV2 = {
  v: 2;
  sessionId: string;
  roundId: string;
  sendKind: "queued";
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

export function saveScheduleTrialMeta(m: ScheduleTrialMetaV2): void {
  try {
    sessionStorage.setItem(TRIAL_META_KEY, JSON.stringify(m));
  } catch {
    /* ignore */
  }
}

export function loadScheduleTrialMeta(): ScheduleTrialMetaV2 | null {
  try {
    const raw = sessionStorage.getItem(TRIAL_META_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const p = value as Record<string, unknown>;
    if (
      Object.keys(p).sort().join(",") !== "roundId,sendKind,sessionId,v" ||
      p.v !== 2 ||
      p.sendKind !== "queued" ||
      typeof p.sessionId !== "string" ||
      !UUID_RE.test(p.sessionId) ||
      typeof p.roundId !== "string" ||
      !UUID_RE.test(p.roundId)
    ) {
      return null;
    }
    return {
      v: 2,
      sessionId: p.sessionId,
      roundId: p.roundId,
      sendKind: "queued",
    };
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
