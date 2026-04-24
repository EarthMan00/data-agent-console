/**
 * 与 Python `scheduled_task_schedule.compute_next_run_at` 对齐的「首次下次执行」计算（本机本地时区）。
 * 仅用于创建表单校验，实际以后端为准。
 */
import type { UserScheduledTaskCreateBody } from "./agent-api/types";

function parseHhmmToHM(s: string): { h: number; m: number } {
  const p = (s || "").trim().split(":");
  const h = p[0] != null && p[0] !== "" ? Math.min(23, Math.max(0, parseInt(p[0], 10) || 0)) : 0;
  const m = p[1] != null && p[1] !== "" ? Math.min(59, Math.max(0, parseInt(p[1], 10) || 0)) : 0;
  return { h, m };
}

/** Python weekday: 周一=0 … 周日=6 */
function pyWeekday(d: Date): number {
  const w = d.getDay();
  return w === 0 ? 6 : w - 1;
}

/**
 * 从当前时刻起，取半小时间隔列表中第一个不早于「此刻」的项；跨日取次日 00:00。
 * 如 09:54 → 10:00，09:00:00 → 09:00，23:50 → 00:00。
 */
export function defaultNearestHalfHourHhmm(timeOptions: readonly string[], now: Date = new Date()): string {
  const nowS = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds() + now.getMilliseconds() / 1000;
  for (const t of timeOptions) {
    const [hh, mm] = t.split(":").map((n) => parseInt(n, 10));
    const slotS = hh * 3600 + mm * 60;
    if (slotS >= nowS) return t;
  }
  return timeOptions[0] ?? "09:00";
}

function formatYmdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * 不重复（once）且无「执行日期」时：用本地**今天**的日历日与所选时刻组成一次任务。
 * 若该时刻不晚于当前时间，则与后端一样视为已过期/无下次；**不会**自动改到「明天」。
 */
export function runOnceDateYmdImpliedToday(now: Date = new Date()): string {
  return formatYmdLocal(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
}

/**
 * 计算若今日刻启动任务、当前配置下首次可执行时间；不可执行则 `null`。
 * `after` 缺省为「现在」，与 initial_next_run 一致（after=None → now）。
 */
export function computeNextRunForCreateBody(
  body: Pick<
    UserScheduledTaskCreateBody,
    "recurrence" | "time_hhmm" | "weekday" | "day_of_month" | "run_once_date"
  >,
  after: Date = new Date(),
): Date | null {
  const now = after;
  const { h, m: min } = parseHhmmToHM(body.time_hhmm);
  const { recurrence } = body;

  if (recurrence === "once") {
    const raw = body.run_once_date?.trim();
    if (!raw) return null;
    const parts = raw.split("-").map((x) => parseInt(x, 10));
    if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return null;
    const y = parts[0]!;
    const mo = parts[1]!;
    const d = parts[2]!;
    const dt = new Date(y, mo - 1, d, h, min, 0, 0);
    if (dt.getTime() <= now.getTime()) return null;
    return dt;
  }

  if (recurrence === "daily") {
    const todayRun = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, min, 0, 0);
    if (todayRun.getTime() > now.getTime()) return todayRun;
    return new Date(todayRun.getTime() + 24 * 60 * 60 * 1000);
  }

  if (recurrence === "weekly") {
    let wd = body.weekday;
    if (wd == null || wd < 0 || wd > 6) wd = pyWeekday(now);
    for (let i = 0; i < 8; i++) {
      const d0 = new Date(now);
      d0.setDate(now.getDate() + i);
      d0.setHours(0, 0, 0, 0);
      if (pyWeekday(d0) !== wd) continue;
      const cand = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate(), h, min, 0, 0);
      if (cand.getTime() > now.getTime()) return cand;
    }
    return null;
  }

  if (recurrence === "monthly") {
    let dom = body.day_of_month ?? 1;
    dom = Math.max(1, Math.min(31, dom));
    let y = now.getFullYear();
    let m0 = now.getMonth() + 1; // 1-12, for calendar math use Date(y, m, 0)
    for (let k = 0; k < 24; k++) {
      const lastDay = new Date(y, m0, 0).getDate();
      const useDay = Math.min(dom, lastDay);
      const cand = new Date(y, m0 - 1, useDay, h, min, 0, 0);
      if (cand.getTime() > now.getTime()) return cand;
      if (m0 === 12) {
        y += 1;
        m0 = 1;
      } else {
        m0 += 1;
      }
    }
    return null;
  }

  return null;
}
