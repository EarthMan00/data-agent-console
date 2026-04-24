import type { Report, TaskRun } from "@/lib/workspace-store";

export function upsertRunCollection(runs: TaskRun[], nextRun: TaskRun) {
  const exists = runs.some((run) => run.id === nextRun.id);
  if (!exists) return [nextRun, ...runs];
  return runs.map((run) => (run.id === nextRun.id ? nextRun : run));
}

export function upsertReportCollection(reports: Report[], nextReport: Report) {
  const exists = reports.some((report) => report.id === nextReport.id);
  if (!exists) return [nextReport, ...reports];
  return reports.map((report) => (report.id === nextReport.id ? nextReport : report));
}
