/**
 * 与 parseCsvLoose 规则一致的增量解析器，用于分块解码流式 CSV 时保持引号/换行状态。
 * `delimiter` 默认为 `,`；设为 `\t` 可解析制表符分隔（TSV）。
 */
export class CsvIncrementalParser {
  private row: string[] = [];
  private cell = "";
  private inQuotes = false;
  private emittedRowCount = 0;
  /** 引号内末尾单独的 `"` 需与下一 chunk 首字符拼成 `""` 或字段结束符，暂挂起 */
  private quoteCarry = "";

  constructor(private readonly delimiter: string = ",") {
    if (delimiter.length !== 1) {
      throw new Error("CsvIncrementalParser: delimiter must be a single character");
    }
  }

  /** 处理一段文本，返回本段内新完成的行（每行为单元格数组） */
  push(fragment: string): string[][] {
    const text = this.quoteCarry + fragment;
    this.quoteCarry = "";
    const out: string[][] = [];

    for (let i = 0; i < text.length; i++) {
      const c = text[i]!;

      if (this.inQuotes) {
        if (c === '"') {
          const next = text[i + 1];
          if (next === '"') {
            this.cell += '"';
            i += 1;
          } else if (next === undefined) {
            this.quoteCarry = '"';
            return out;
          } else {
            this.inQuotes = false;
          }
        } else {
          this.cell += c;
        }
        continue;
      }

      if (c === '"') {
        this.inQuotes = true;
        continue;
      }
      if (c === this.delimiter) {
        this.row.push(this.cell);
        this.cell = "";
        continue;
      }
      if (c === "\n") {
        this.row.push(this.cell);
        this.cell = "";
        this.flushRow(out);
        continue;
      }
      if (c === "\r") {
        if (text[i + 1] === "\n") i += 1;
        this.row.push(this.cell);
        this.cell = "";
        this.flushRow(out);
        continue;
      }
      this.cell += c;
    }
    return out;
  }

  /** 输入流结束时调用，刷出最后一行（与 parseCsvLoose 末尾 pushCell + 非空行逻辑一致） */
  end(): string[][] {
    const out: string[][] = [];
    if (this.quoteCarry) {
      if (this.inQuotes && this.quoteCarry === '"') {
        this.inQuotes = false;
      } else if (this.inQuotes) {
        this.cell += this.quoteCarry;
      }
      this.quoteCarry = "";
    }
    this.row.push(this.cell);
    this.cell = "";
    if (this.row.some((x) => x.length > 0)) {
      out.push(this.row);
      this.emittedRowCount += 1;
    }
    this.row = [];
    return out;
  }

  private flushRow(out: string[][]) {
    const row = this.row;
    this.row = [];
    if (row.length > 1 || (row.length === 1 && row[0] !== "") || this.emittedRowCount > 0) {
      out.push(row);
      this.emittedRowCount += 1;
    }
  }
}

/** 根据首行（不含换行）粗判分隔符：TSV 数据行用 Tab，表头仍可能被正确分列。 */
export function pickDelimiterFromFirstCsvLine(line: string): string {
  const trimmed = line.replace(/\r$/, "");
  if (!trimmed) return ",";
  const tabCols = trimmed.split("\t").length;
  const commaCols = trimmed.split(",").length;
  if (tabCols > commaCols) return "\t";
  return ",";
}
