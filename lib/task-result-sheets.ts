import type { PlatformTaskArtifactRef } from "@/lib/agent-events";
import { filterArtifactsForTaskResultPanel } from "@/lib/platform-task-artifacts";

const CSV_RE = /\.csv$/i;
const JSON_RE = /\.(json|jsonl)$/i;

function basenameOnly(name: string): string {
  const n = (name ?? "").trim();
  const parts = n.split(/[/\\]/);
  return parts[parts.length - 1] ?? n;
}

function stem(name: string): string {
  const b = basenameOnly(name);
  const i = b.lastIndexOf(".");
  return (i >= 0 ? b.slice(0, i) : b).toLowerCase();
}

/**
 * 将文件名 stem 规范化为「逻辑结果键」，用于把同一结果的 CSV 与 JSON（文件名前缀不同）合并为一页。
 * 例如：`2026042910-搜索cup_页1` 与 `result_2_搜索cup_页1` → 均为 `搜索cup_页1`。
 */
function normalizeResultPairKey(filename: string): string {
  let s = stem(filename);
  // result_2_xxx → xxx（工具链常见命名）
  s = s.replace(/^result_\d+_/i, "");
  // 2026042910-xxx → xxx（日期/时间戳前缀）
  s = s.replace(/^\d+-/, "");
  return s.trim();
}

function labelFromFilename(name: string): string {
  return basenameOnly(name).replace(/\.[^.]+$/, "") || basenameOnly(name) || "结果";
}

export type TaskResultSheet = {
  id: string;
  label: string;
  csv?: PlatformTaskArtifactRef;
  json?: PlatformTaskArtifactRef;
  /** Markdown/HTML/PDF/chatexcel 等单文件 */
  primary?: PlatformTaskArtifactRef;
  /** 用于排序：对应产物在过滤后列表中的最大下标，越大表示越新 */
  sortKey: number;
};

/**
 * 将任务产物拆成多个「结果页」：
 * - CSV 与「同一逻辑结果」的 JSON 合并为一页（表格/代码切换）；配对除精确同名外，还对齐去掉
 *   `result_\d+_`、前导 `数字-` 时间戳后的 stem。
 * - 其余类型各占一页；未配对 JSON 单独成页。
 * - 多步编排合并产物时：应先按子任务执行顺序拼接 artifacts（step0 … stepN-1），使「后执行」的子任务
 *   文件排在列表更后面 → sortKey 更大 → 排序后 tab 更靠前。
 * 排序：sortKey 降序。
 */
export function buildTaskResultSheets(artifacts: PlatformTaskArtifactRef[] | undefined | null): TaskResultSheet[] {
  const filtered = filterArtifactsForTaskResultPanel(artifacts ?? []);
  if (filtered.length === 0) return [];

  const indexOf = (id: string) => filtered.findIndex((a) => a.artifact_id === id);

  const csvs = filtered.filter((a) => CSV_RE.test((a.original_name ?? "").trim()));
  const jsons = filtered.filter((a) => JSON_RE.test((a.original_name ?? "").trim()));
  const usedJsonIds = new Set<string>();
  const sheets: TaskResultSheet[] = [];

  for (const csv of csvs) {
    const exact = stem(csv.original_name);
    const fuzzy = normalizeResultPairKey(csv.original_name);
    const jsonMatch = jsons.find((j) => {
      if (usedJsonIds.has(j.artifact_id)) return false;
      const nj = stem(j.original_name);
      const fj = normalizeResultPairKey(j.original_name);
      return nj === exact || fj === fuzzy;
    });
    if (jsonMatch) usedJsonIds.add(jsonMatch.artifact_id);
    const sortKey = Math.max(
      indexOf(csv.artifact_id),
      jsonMatch ? indexOf(jsonMatch.artifact_id) : -1,
    );
    const tabLabel =
      jsonMatch && fuzzy.length > 0 ? fuzzy : labelFromFilename(csv.original_name);
    sheets.push({
      id: csv.artifact_id,
      label: tabLabel,
      csv,
      json: jsonMatch,
      sortKey,
    });
  }

  for (const j of jsons) {
    if (usedJsonIds.has(j.artifact_id)) continue;
    sheets.push({
      id: j.artifact_id,
      label: labelFromFilename(j.original_name),
      json: j,
      sortKey: indexOf(j.artifact_id),
    });
  }

  for (const a of filtered) {
    if (CSV_RE.test((a.original_name ?? "").trim())) continue;
    if (JSON_RE.test((a.original_name ?? "").trim())) continue;
    sheets.push({
      id: a.artifact_id,
      label: labelFromFilename(a.original_name ?? "结果"),
      primary: a,
      sortKey: indexOf(a.artifact_id),
    });
  }

  sheets.sort((a, b) => b.sortKey - a.sortKey);
  return sheets;
}

/** 当前页是否同时具备 CSV 与 JSON（用于展示表格/代码切换） */
export function sheetSupportsTableCodeToggle(sheet: TaskResultSheet): boolean {
  return Boolean(sheet.csv && sheet.json);
}

export function downloadTargetForSheet(
  sheet: TaskResultSheet,
  viewMode: "table" | "code",
): PlatformTaskArtifactRef | null {
  if (sheet.primary) return sheet.primary;
  if (sheet.csv && sheet.json) {
    return viewMode === "table" ? sheet.csv : sheet.json;
  }
  if (sheet.csv) return sheet.csv;
  if (sheet.json) return sheet.json;
  return null;
}
