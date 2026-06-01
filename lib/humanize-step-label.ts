/** 任务拆分/执行步骤：将 raw JSON 或绝对路径转为用户可读文案。 */

import { stripInternalToolNamesForUi } from "@/lib/strip-internal-tool-names";

function finalizeStepUiLabel(text: string): string {
  const out = stripInternalToolNamesForUi((text || "").trim());
  return out || "执行当前步骤";
}

function tryParseJsonObject(text: string): Record<string, unknown> | null {
  const raw = text.trim();
  if (!raw.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function basenameFromPath(value: string): string {
  const raw = value.trim().replace(/\\/g, "/");
  if (!raw) return "";
  const name = raw.split("/").pop() ?? raw;
  const underscore = name.indexOf("_");
  if (underscore >= 32 && underscore < name.length - 1) {
    return name.slice(underscore + 1);
  }
  return name;
}

function isUuidishFragment(value: string): boolean {
  const inner = value.trim();
  return /^[0-9a-f][0-9a-f-]{7,}$/i.test(inner) || inner.endsWith("...");
}

function collapseBracketedAttachmentInner(inner: string): string {
  const name = (inner || "").trim();
  if (!name) return "已上传的附件";
  const base = basenameFromPath(name);
  if (base.includes(".") && !isUuidishFragment(base)) return `「${base}」`;
  if (name.includes(".") && !isUuidishFragment(name)) return `「${name}」`;
  if (isUuidishFragment(name) || isUuidishFragment(base)) return "已上传的附件";
  return `「${name}」`;
}

function normalizeAttachmentPhrasing(text: string): string {
  return text
    .replace(/分析附件\s+已上传的附件/g, "分析已上传的附件")
    .replace(/处理附件\s+已上传的附件/g, "处理已上传的附件")
    .replace(/读取附件\s+已上传的附件/g, "读取已上传的附件");
}

function collapseUuidishAttachmentLabel(text: string): string {
  let out = text.replace(/「([^」]*)」/g, (_match, inner: string) =>
    collapseBracketedAttachmentInner(inner),
  );
  out = out.replace(/\[([^\]]+)\]/g, (_match, inner: string) => collapseBracketedAttachmentInner(inner));
  return normalizeAttachmentPhrasing(out);
}

function replaceEmbeddedPaths(text: string): string {
  const winPath = /[A-Za-z]:\\[^\s"'<>|]+/gi;
  const unixPath = /(?:\/(?:Users|home|tmp|var)\/)[^\s"'<>|]+/gi;
  const sub = (path: string) => {
    const name = basenameFromPath(path);
    if (!name.includes(".") && isUuidishFragment(name)) return "已上传的附件";
    return `「${name}」`;
  };
  let out = text.replace(winPath, (m) => sub(m));
  out = out.replace(unixPath, (m) => sub(m));
  out = out.replace(/分析文件\s*/g, "分析附件");
  out = out.replace(/处理文件\s*/g, "处理附件");
  out = out.replace(/读取文件\s*/g, "读取附件");
  return out.trim();
}

function humanizeProseWithPaths(text: string): string | null {
  const hasPath =
    /[A-Za-z]:\\/.test(text) ||
    /\/(?:Users|home|tmp|var)\//.test(text) ||
    text.includes("session_attachments");
  if (!hasPath) return null;

  const fileMatch = text.match(/([^\\/\s"'<>|]+\.(?:xlsx|xls|xlsm|csv|tsv|json|jsonl))/i);
  if (fileMatch) {
    const name = basenameFromPath(fileMatch[1]!);
    if (/报告/.test(text)) return `分析附件「${name}」并生成报告`;
    if (/分析|处理|读取|解析/.test(text)) return `分析附件「${name}」`;
    return `处理附件「${name}」`;
  }

  const cleaned = replaceEmbeddedPaths(text);
  if (cleaned !== text) {
    return collapseUuidishAttachmentLabel(cleaned);
  }
  return null;
}

export function humanizeStepLabelForUi(instruction: string): string {
  let text = (instruction || "").trim();
  if (text.startsWith("调用工具：")) {
    text = text.slice("调用工具：".length).trim();
  }

  const parsed = tryParseJsonObject(text);
  if (parsed) {
    const action = String(parsed.action ?? "").trim();
    const fp = String(
      parsed.file_path ?? parsed.excel_path ?? (Array.isArray(parsed.excel_paths) ? parsed.excel_paths[0] : "") ?? "",
    ).trim();
    const name = basenameFromPath(fp);
    const query = String(parsed.query ?? "").trim();

    if (action === "generate_report" || action === "generate_intelligence_report") {
      if (query && query.length <= 100) return finalizeStepUiLabel(query);
      if (name) return finalizeStepUiLabel(`分析附件「${name}」并生成报告`);
      return finalizeStepUiLabel("基于附件表格生成分析报告");
    }
    if (action === "read_excel_metadata" || action === "read_metadata" || action === "read_excel") {
      if (name) return finalizeStepUiLabel(`读取附件「${name}」的表结构与字段信息`);
      return finalizeStepUiLabel("读取附件 Excel 的表结构与字段信息");
    }
    if (action === "merge_keyword_table") return finalizeStepUiLabel("合并关键词表并计算价值打分");
    if (action === "run_excel_code") {
      if (name) return finalizeStepUiLabel(`对附件「${name}」执行数据处理`);
      return finalizeStepUiLabel("对表格数据执行清洗与分析");
    }
    if (name) return finalizeStepUiLabel(`处理附件「${name}」`);
    if (action) return finalizeStepUiLabel(`执行数据处理（${action}）`);
  }

  const prose = humanizeProseWithPaths(text);
  if (prose) return finalizeStepUiLabel(prose);

  return finalizeStepUiLabel(collapseUuidishAttachmentLabel(text));
}
