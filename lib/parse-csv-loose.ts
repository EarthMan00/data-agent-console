/**
 * 宽松 CSV 解析：支持双引号包裹字段与 "" 转义，用于任务产物预览。
 */
export function parseCsvLoose(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const len = text.length;

  const pushCell = () => {
    row.push(cell);
    cell = "";
  };

  const pushRow = () => {
    if (row.length > 1 || (row.length === 1 && row[0] !== "") || rows.length > 0) {
      rows.push(row);
    }
    row = [];
  };

  for (let i = 0; i < len; i++) {
    const c = text[i]!;

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += c;
      }
      continue;
    }

    // RFC4180：仅字段开头的 " 表示进入引号字段；行中非起始的 " 视为字面量
    if (c === '"') {
      if (cell.length === 0) {
        inQuotes = true;
        continue;
      }
      cell += c;
      continue;
    }
    if (c === ",") {
      pushCell();
      continue;
    }
    if (c === "\n") {
      pushCell();
      pushRow();
      continue;
    }
    if (c === "\r") {
      if (text[i + 1] === "\n") i += 1;
      pushCell();
      pushRow();
      continue;
    }
    cell += c;
  }

  pushCell();
  if (row.some((x) => x.length > 0)) {
    rows.push(row);
  }

  return rows;
}
