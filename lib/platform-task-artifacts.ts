import type { PlatformTaskArtifactRef } from "@/lib/agent-events";

/** LinkFox 文本汇总；参与「是否有真实产物可预览」判定（CSV/JSON 另从 stdout 解析复制）。 */
export const LINKFOX_RESULT_RE = /^linkfox_result\.txt$/i;
/** ChatExcel 主产物：侧栏可解析其中 JSON + CSV 输出为表格 */
export const CHATEXCEL_RESULT_RE = /^chatexcel_result\.txt$/i;
const CSV_RE = /\.csv$/i;
const JSON_RE = /\.(json|jsonl)$/i;
const TABULAR_RE = /\.(csv|json|jsonl)$/i;

/** 右侧任务结果区不展示 linkfox 中间产物（保留 chatexcel_result.txt 供解析展示） */
export function filterArtifactsForTaskResultPanel(artifacts: PlatformTaskArtifactRef[]): PlatformTaskArtifactRef[] {
  return artifacts.filter((a) => !LINKFOX_RESULT_RE.test((a.original_name ?? "").trim()));
}

/** 是否存在可预览的表格/结构化文件（含 ChatExcel / LinkFox 文本产物） */
export function hasTabularTaskResultFiles(artifacts: PlatformTaskArtifactRef[] | undefined | null): boolean {
  if (!artifacts?.length) return false;
  if (artifacts.some((a) => CHATEXCEL_RESULT_RE.test((a.original_name ?? "").trim()))) return true;
  if (artifacts.some((a) => LINKFOX_RESULT_RE.test((a.original_name ?? "").trim()))) return true;
  return filterArtifactsForTaskResultPanel(artifacts).some((a) =>
    TABULAR_RE.test((a.original_name ?? "").trim()),
  );
}

/** 侧栏仅展示一个数据文件：优先 CSV，其次 JSON/JSONL，再次 chatexcel_result.txt */
export function pickPrimaryTaskDataArtifact(artifacts: PlatformTaskArtifactRef[]): PlatformTaskArtifactRef | null {
  const list = filterArtifactsForTaskResultPanel(artifacts);
  const csv = list.find((a) => CSV_RE.test((a.original_name ?? "").trim()));
  if (csv) return csv;
  const json = list.find((a) => JSON_RE.test((a.original_name ?? "").trim()));
  if (json) return json;
  const chatexcel = list.find((a) => CHATEXCEL_RESULT_RE.test((a.original_name ?? "").trim()));
  if (chatexcel) return chatexcel;
  const linkfoxTxt = artifacts.find((a) => LINKFOX_RESULT_RE.test((a.original_name ?? "").trim()));
  if (linkfoxTxt) return linkfoxTxt;
  return null;
}

/** @deprecated 使用 pickPrimaryTaskDataArtifact */
export function pickPrimaryCsvArtifact(artifacts: PlatformTaskArtifactRef[]): PlatformTaskArtifactRef | null {
  const p = pickPrimaryTaskDataArtifact(artifacts);
  if (!p) return null;
  return CSV_RE.test((p.original_name ?? "").trim()) ? p : null;
}
