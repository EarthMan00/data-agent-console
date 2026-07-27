import type { PlatformTaskArtifactRef } from "@/lib/agent-events";
import { stripInternalToolNamesForUi } from "@/lib/strip-internal-tool-names";

/** Alice 内部文本汇总（右侧 sheet 不展示，仅用于其它逻辑兼容） */
export const ALICE_INTERNAL_RESULT_RE = /^linkfox_result\.txt$/i;
/** ChatExcel 主日志文件 */
export const CHATEXCEL_RESULT_RE = /^chatexcel_result\.txt$/i;
/** 所有工具输出的 *_result.txt：不在结果 sheet 中展示 */
export const TASK_RESULT_TXT_RE = /_result\.txt$/i;
const LINKFOX_REPORT_NAME_RE = /^linkfox_report\.html$/i;
const DATA_REPORT_NAME_RE = /^data_report\.html$/i;
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

const ZIP_ARTIFACT_RE = /\.zip$/i;

/** 任务级打包下载纳入的产物（与后端 api_tasks 过滤规则对齐，排除 zip 与 *_result.txt） */
export function listDownloadableTaskArtifacts(artifacts: PlatformTaskArtifactRef[]): PlatformTaskArtifactRef[] {
  return filterArtifactsForTaskResultPanel(artifacts).filter(
    (a) => !ZIP_ARTIFACT_RE.test((a.original_name ?? "").trim()),
  );
}

/** 是否存在可预览的表格/结构化文件（不含 *_result.txt） */
export function hasTabularTaskResultFiles(artifacts: PlatformTaskArtifactRef[] | undefined | null): boolean {
  if (!artifacts?.length) return false;
  return filterArtifactsForTaskResultPanel(artifacts).some((a) =>
    TABULAR_RE.test((a.original_name ?? "").trim()),
  );
}

/** 是否展示「任务结果」入口卡片：仅看是否存在可预览的结果文件，与任务成功/失败无关。 */
export function shouldShowTaskResultEntryCard(
  bundles: { artifacts: PlatformTaskArtifactRef[] }[],
  extraArtifacts?: PlatformTaskArtifactRef[] | null,
): boolean {
  if (bundles.some((b) => hasTabularTaskResultFiles(b.artifacts))) return true;
  return hasTabularTaskResultFiles(extraArtifacts);
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

function basenameOnly(name: string): string {
  const n = (name ?? "").trim();
  const parts = n.split(/[/\\]/);
  return parts[parts.length - 1] ?? n;
}

const FORBIDDEN_ARTIFACT_NAME_TOKEN_RE =
  /(?:^|[^a-z0-9])(?:tool(?:_?name)?|capability|operation|raw(?:_?args?)?|provider|credential|token|secret|api[_-]?key)(?:$|[^a-z0-9])/i;
const FORBIDDEN_ARTIFACT_ASSIGNMENT_RE =
  /(?:tool(?:_?name)?|capability|operation|raw(?:_?args?)?|provider|credential|token|secret|api[_-]?key)\s*[:=]/i;

function artifactExtensionForUi(originalName: string, artifactType?: string): string {
  const base = basenameOnly(originalName);
  const match = base.match(/\.([a-z0-9]{1,10})$/i);
  if (match?.[1]) return `.${match[1].toLowerCase()}`;
  const type = (artifactType ?? "").trim().toLowerCase();
  return /^(?:csv|json|jsonl|md|markdown|html|htm|pdf|zip|txt)$/.test(type)
    ? `.${type}`
    : "";
}

function safeArtifactStemForUi(originalName: string): string {
  const base = basenameOnly(originalName);
  const stem = base.replace(/\.[^.]+$/, "") || base;
  const neutral = stripInternalToolNamesForUi(stem).trim();
  if (
    !neutral ||
    FORBIDDEN_ARTIFACT_NAME_TOKEN_RE.test(neutral) ||
    FORBIDDEN_ARTIFACT_ASSIGNMENT_RE.test(neutral)
  ) {
    return "结果";
  }
  const safe = neutral
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s{2,}/g, " ")
    .replace(/^[.\s-]+|[.\s-]+$/g, "")
    .trim();
  return safe || "结果";
}

/** 结果 Tab / 卡片等 UI 展示用文件名（不含内部工具品牌词） */
export function artifactDisplayLabelForUi(originalName: string): string {
  const base = basenameOnly(originalName);
  if (LINKFOX_REPORT_NAME_RE.test(base) || DATA_REPORT_NAME_RE.test(base)) {
    return "数据报告";
  }
  if (ALICE_INTERNAL_RESULT_RE.test(base) || CHATEXCEL_RESULT_RE.test(base)) {
    return "任务日志";
  }
  return safeArtifactStemForUi(base);
}

/** 单文件下载时的建议保存名 */
export function artifactDownloadNameForUi(originalName: string, artifactType?: string): string {
  const base = basenameOnly(originalName);
  if (LINKFOX_REPORT_NAME_RE.test(base) || DATA_REPORT_NAME_RE.test(base)) {
    return "数据报告.html";
  }
  const ext = artifactExtensionForUi(base, artifactType);
  const label = artifactDisplayLabelForUi(base);
  return `${label}${ext}`;
}

/** Keep only public artifact identity/routing fields and a safe basename. */
export function projectTaskArtifactForUi(
  artifact: PlatformTaskArtifactRef,
): PlatformTaskArtifactRef {
  return {
    artifact_id: artifact.artifact_id,
    artifact_type: artifact.artifact_type,
    original_name: artifactDownloadNameForUi(artifact.original_name, artifact.artifact_type),
    download_api: artifact.download_api,
  };
}

export function projectTaskArtifactsForUi(
  artifacts: PlatformTaskArtifactRef[],
): PlatformTaskArtifactRef[] {
  return artifacts.map(projectTaskArtifactForUi);
}
