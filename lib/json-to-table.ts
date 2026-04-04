/** 将 JSON 文本解析为表格数据（用于任务产物预览） */
export type JsonTableData = {
  columns: string[];
  rows: string[][];
};

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function parseJsonToTableData(text: string): JsonTableData | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  let data: unknown;
  try {
    data = JSON.parse(trimmed) as unknown;
  } catch {
    const line = trimmed.split(/\r?\n/).find((l) => l.trim());
    if (!line) return null;
    try {
      data = JSON.parse(line) as unknown;
    } catch {
      return null;
    }
  }

  if (data == null) return null;

  if (Array.isArray(data)) {
    if (data.length === 0) return { columns: ["（空数组）"], rows: [] };
    const allObjects =
      data.every((x) => x !== null && typeof x === "object" && !Array.isArray(x));
    if (allObjects) {
      const keys = [...new Set(data.flatMap((o) => Object.keys(o as object)))];
      const columns = keys.length > 0 ? keys : ["值"];
      const rows = data.map((o) =>
        columns.map((k) => cellText((o as Record<string, unknown>)[k])),
      );
      return { columns, rows };
    }
    return { columns: ["值"], rows: data.map((x) => [cellText(x)]) };
  }

  if (typeof data === "object") {
    const o = data as Record<string, unknown>;
    const keys = Object.keys(o);
    if (keys.length === 0) return { columns: ["键", "值"], rows: [] };
    return { columns: ["键", "值"], rows: keys.map((k) => [k, cellText(o[k])]) };
  }

  return { columns: ["值"], rows: [[cellText(data)]] };
}
