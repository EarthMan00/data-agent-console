import type { PlatformTaskArtifactRef } from "@/lib/agent-events";

/** LinkFox 文本汇总（右侧 sheet 不展示，仅用于其它逻辑兼容） */
export const LINKFOX_RESULT_RE = /^linkfox_result\.txt$/i;
/** ChatExcel 主日志文件 */
export const CHATEXCEL_RESULT_RE = /^chatexcel_result\.txt$/i;
/** 所有工具输出的 *_result.txt：不在结果 sheet 中展示 */
export const TASK_RESULT_TXT_RE = /_result\.txt$/i;
const CSV_RE = /\.csv$/i;
const JSON_RE = /\.(json|jsonl)$/i;
const MD_RE = /\.(md|markdown)$/i;
const HTML_RE = /\.(html|htm)$/i;
const PDF_RE = /\.pdf$/i;
/** 侧栏可展示或下载的任务数据/报告类文件 */
const TABULAR_RE = /\.(csv|json|jsonl|md|markdown|html|htm|pdf)$/i;

/** 右侧任务结果区不展示任何 *_result.txt（真实表格/报告见 CSV、JSON、PDF 等） */
export function filterArtifactsForTaskResultPanel(artifacts: PlatformTaskArtifactRef[]): PlatformTaskArtifactRef[] {
  return artifacts.filter((a) => !TASK_RESULT_TXT_RE.test((a.original_name ?? "").trim()));
}

/** 是否存在可预览的表格/结构化文件（不含 *_result.txt） */
export function hasTabularTaskResultFiles(artifacts: PlatformTaskArtifactRef[] | undefined | null): boolean {
  if (!artifacts?.length) return false;
  return filterArtifactsForTaskResultPanel(artifacts).some((a) =>
    TABULAR_RE.test((a.original_name ?? "").trim()),
  );
}

/** 侧栏仅展示一个主文件：优先 Markdown/HTML/PDF 报告，其次 CSV，再次 JSON（不含 *_result.txt） */
export function pickPrimaryTaskDataArtifact(artifacts: PlatformTaskArtifactRef[]): PlatformTaskArtifactRef | null {
  const list = filterArtifactsForTaskResultPanel(artifacts);
  const md = list.find((a) => MD_RE.test((a.original_name ?? "").trim()));
  if (md) return md;
  const html = list.find((a) => HTML_RE.test((a.original_name ?? "").trim()));
  if (html) return html;
  const pdf = list.find((a) => PDF_RE.test((a.original_name ?? "").trim()));
  if (pdf) return pdf;
  const csv = list.find((a) => CSV_RE.test((a.original_name ?? "").trim()));
  if (csv) return csv;
  const json = list.find((a) => JSON_RE.test((a.original_name ?? "").trim()));
  if (json) return json;
  return null;
}

/** @deprecated 使用 pickPrimaryTaskDataArtifact */
export function pickPrimaryCsvArtifact(artifacts: PlatformTaskArtifactRef[]): PlatformTaskArtifactRef | null {
  const p = pickPrimaryTaskDataArtifact(artifacts);
  if (!p) return null;
  return CSV_RE.test((p.original_name ?? "").trim()) ? p : null;
}
