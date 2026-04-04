/**
 * 解析 chatexcel_result.txt：前置为 runtime 导入日志，正文为单行或多行 JSON。
 */

export type ChatexcelPreviewTable = { columns: string[]; rows: string[][] };

export type ChatexcelPreviewModel = {
  ok: boolean;
  action?: string;
  error?: string;
  errorType?: string;
  executionTimeSec?: number;
  fileLabel?: string;
  table: ChatexcelPreviewTable | null;
  /** 无法抽表格时展示格式化 JSON（已剔除冗长 output 时可截断） */
  jsonFallback: string | null;
  parseWarning?: string;
};

/** 从整段文本中截取首个 `{` 起的 JSON（ChatExcel CLI 会在 JSON 前打印 ✓ 日志行） */
export function extractChatexcelPayloadJson(raw: string): unknown | null {
  const idx = raw.indexOf("{");
  if (idx < 0) return null;
  const tail = raw.slice(idx).trim();
  try {
    return JSON.parse(tail) as unknown;
  } catch {
    return null;
  }
}

/** RFC4180 风格单行解析（支持双引号包裹、转义 ""） */
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let i = 0;
  let inQuotes = false;
  while (i < line.length) {
    const c = line[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cur += c;
      i += 1;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (c === ",") {
      out.push(cur);
      cur = "";
      i += 1;
      continue;
    }
    cur += c;
    i += 1;
  }
  out.push(cur);
  return out;
}

export function parseCsvTextToTable(text: string): ChatexcelPreviewTable | null {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return null;
  const rowCells = lines.map(parseCsvLine);
  const width = Math.max(...rowCells.map((r) => r.length), 0);
  if (width === 0) return null;
  const normalized = rowCells.map((r) => {
    const copy = [...r];
    while (copy.length < width) copy.push("");
    return copy;
  });
  const header = normalized[0]!.map((c) => c.trim());
  const rows = normalized.slice(1).map((r) => r.map((c) => c.trim()));
  return { columns: header, rows };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function dataframeLikeToTable(obj: Record<string, unknown>): ChatexcelPreviewTable | null {
  if (obj.type !== "DataFrame" && obj.type !== "Series") return null;
  const cols = obj.columns;
  const data = obj.data;
  if (!Array.isArray(cols) || !Array.isArray(data)) return null;
  const colNames = cols.map((c) => String(c));
  const rows: string[][] = [];
  for (const item of data) {
    if (item !== null && typeof item === "object" && !Array.isArray(item)) {
      rows.push(colNames.map((k) => String((item as Record<string, unknown>)[k] ?? "")));
    } else {
      rows.push([String(item)]);
    }
  }
  return { columns: colNames, rows };
}

const MAX_OUTPUT_PREVIEW_LEN = 200_000;

/** 将 chatexcel_result.txt 全文转为侧栏预览模型 */
export function parseChatexcelArtifactText(raw: string): ChatexcelPreviewModel {
  const parsed = extractChatexcelPayloadJson(raw);
  if (parsed == null) {
    return {
      ok: false,
      table: null,
      jsonFallback: null,
      parseWarning: "未找到有效 JSON（应以「{」开头）。",
    };
  }

  if (!isRecord(parsed)) {
    return {
      ok: false,
      table: null,
      jsonFallback: JSON.stringify(parsed, null, 2),
      parseWarning: "根节点不是 JSON 对象。",
    };
  }

  const ok = Boolean(parsed.ok);
  const action = typeof parsed.action === "string" ? parsed.action : undefined;
  const err = typeof parsed.error === "string" ? parsed.error : undefined;
  const errorType = typeof parsed.error_type === "string" ? parsed.error_type : undefined;

  const inner = parsed.result;
  let table: ChatexcelPreviewTable | null = null;
  let jsonFallback: string | null = null;

  if (isRecord(inner)) {
    const out = inner.output;
    if (typeof out === "string" && out.trim()) {
      const slice = out.length > MAX_OUTPUT_PREVIEW_LEN ? out.slice(0, MAX_OUTPUT_PREVIEW_LEN) : out;
      table = parseCsvTextToTable(slice);
    }

    const res = inner.result;
    if (!table && isRecord(res)) {
      table = dataframeLikeToTable(res);
    }

    if (!table) {
      const slim = { ...inner };
      if (typeof slim.output === "string" && slim.output.length > 8000) {
        const truncated = slim.output;
        slim.output = `${truncated.slice(0, 8000)}\n…（output 已截断，共 ${truncated.length} 字符）`;
      }
      jsonFallback = JSON.stringify({ ok, action, result: slim }, null, 2);
    }
  } else {
    jsonFallback = JSON.stringify(parsed, null, 2);
  }

  const executionTimeSec =
    isRecord(inner) && typeof inner.execution_time === "number" ? inner.execution_time : undefined;

  let fileLabel: string | undefined;
  if (isRecord(inner) && isRecord(inner.file_info)) {
    const n = inner.file_info.name;
    if (typeof n === "string" && n) fileLabel = n;
  }

  return {
    ok,
    action,
    error: err,
    errorType,
    executionTimeSec,
    fileLabel,
    table,
    jsonFallback: table ? null : jsonFallback,
  };
}
