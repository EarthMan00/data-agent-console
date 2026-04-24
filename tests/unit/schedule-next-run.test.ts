import { describe, expect, it } from "vitest";

import { computeNextRunForCreateBody, defaultNearestHalfHourHhmm, runOnceDateYmdImpliedToday } from "@/lib/schedule-next-run";

const HALF = (() => {
  const o: string[] = [];
  for (let h = 0; h < 24; h++) {
    o.push(`${String(h).padStart(2, "0")}:00`);
    o.push(`${String(h).padStart(2, "0")}:30`);
  }
  return o;
})();

describe("defaultNearestHalfHourHhmm", () => {
  it("09:54 -> 10:00", () => {
    const now = new Date(2026, 3, 22, 9, 54, 0, 0);
    expect(defaultNearestHalfHourHhmm(HALF, now)).toBe("10:00");
  });
  it("整点 09:00:00 取 09:00", () => {
    const now = new Date(2026, 3, 22, 9, 0, 0, 0);
    expect(defaultNearestHalfHourHhmm(HALF, now)).toBe("09:00");
  });
});

describe("computeNextRunForCreateBody once", () => {
  it("当天时刻已过则 null", () => {
    const after = new Date(2026, 3, 22, 9, 57, 0, 0);
    const d = computeNextRunForCreateBody(
      { recurrence: "once", time_hhmm: "09:30", run_once_date: "2026-04-22" },
      after,
    );
    expect(d).toBeNull();
  });
  it("当天时刻未过则可算", () => {
    const after = new Date(2026, 3, 22, 9, 20, 0, 0);
    const d = computeNextRunForCreateBody(
      { recurrence: "once", time_hhmm: "09:30", run_once_date: "2026-04-22" },
      after,
    );
    expect(d).not.toBeNull();
  });
});

describe("不重复(once) 隐含今天", () => {
  it("今天+未来时刻 可排程", () => {
    const after = new Date(2026, 3, 22, 7, 0, 0, 0);
    const d = computeNextRunForCreateBody(
      { recurrence: "once", time_hhmm: "10:00", run_once_date: runOnceDateYmdImpliedToday(after) },
      after,
    );
    expect(d).not.toBeNull();
  });
  it("今天+已过去时刻 与后端一样无下次", () => {
    const after = new Date(2026, 3, 22, 9, 57, 0, 0);
    const d = computeNextRunForCreateBody(
      { recurrence: "once", time_hhmm: "04:00", run_once_date: runOnceDateYmdImpliedToday(after) },
      after,
    );
    expect(d).toBeNull();
  });
});
