import type { UserScheduledTaskCreateBody } from "./agent-api/types";

export const SCHEDULE_KINDS = ["每天", "每周", "每月", "不重复"] as const;
export type ScheduleKind = (typeof SCHEDULE_KINDS)[number];

export function toHhmm(s: string) {
  const p = s.trim().split(":");
  const h = p[0] != null && p[0] !== "" ? Math.min(23, Math.max(0, parseInt(p[0], 10) || 0)) : 9;
  const m = p[1] != null && p[1] !== "" ? Math.min(59, Math.max(0, parseInt(p[1], 10) || 0)) : 0;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** 多选周/多选日会在服务端拆成多条任务（单条只支持一个 weekday 或 day_of_month） */
export function buildCreatePayloads(
  title: string,
  prompt: string,
  groupId: string | null,
  taskEnabled: boolean,
  kind: ScheduleKind,
  timeValue: string,
  weekdays: Set<number>,
  monthDays: Set<number>,
  runOnceDate: string,
): UserScheduledTaskCreateBody[] {
  const time_hhmm = toHhmm(timeValue);
  const base: Pick<UserScheduledTaskCreateBody, "title" | "prompt_text" | "group_id" | "enabled" | "time_hhmm"> = {
    title,
    prompt_text: prompt,
    group_id: groupId,
    enabled: taskEnabled,
    time_hhmm,
  };
  if (kind === "每天") {
    return [{ ...base, recurrence: "daily" }];
  }
  if (kind === "每周") {
    return Array.from(weekdays)
      .sort((a, b) => a - b)
      .map(
        (weekday): UserScheduledTaskCreateBody => ({
          ...base,
          recurrence: "weekly",
          weekday,
        }),
      );
  }
  if (kind === "每月") {
    return Array.from(monthDays)
      .sort((a, b) => a - b)
      .map(
        (day_of_month): UserScheduledTaskCreateBody => ({
          ...base,
          recurrence: "monthly",
          day_of_month,
        }),
      );
  }
  return [{ ...base, recurrence: "once", run_once_date: runOnceDate.trim() || null }];
}
