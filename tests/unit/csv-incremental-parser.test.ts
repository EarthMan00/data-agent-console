import { describe, expect, it } from "vitest";

import { CsvIncrementalParser, pickDelimiterFromFirstCsvLine } from "@/lib/csv-incremental-parser";
import { parseCsvLoose } from "@/lib/parse-csv-loose";

function parseViaChunks(full: string, chunkSizes: number[], delimiter = ",") {
  const p = new CsvIncrementalParser(delimiter);
  const out: string[][] = [];
  let offset = 0;
  for (const size of chunkSizes) {
    const chunk = full.slice(offset, offset + size);
    offset += size;
    out.push(...p.push(chunk));
  }
  out.push(...p.end());
  return out;
}

function randomChunks(len: number, seed: number) {
  const sizes: number[] = [];
  let s = seed;
  let pos = 0;
  while (pos < len) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const step = 1 + (s % 17);
    sizes.push(Math.min(step, len - pos));
    pos += Math.min(step, len - pos);
  }
  return sizes;
}

describe("pickDelimiterFromFirstCsvLine", () => {
  it("chooses tab for TSV header", () => {
    expect(pickDelimiterFromFirstCsvLine("h1\th2\th3")).toBe("\t");
  });

  it("chooses comma for normal CSV header", () => {
    expect(pickDelimiterFromFirstCsvLine("h1,h2,h3")).toBe(",");
  });
});

describe("CsvIncrementalParser", () => {
  it("parses TSV when delimiter is tab", () => {
    const tsv = "h1\th2\nv1\tv2\n";
    expect(parseViaChunks(tsv, [2, 1, 100], "\t")).toEqual([
      ["h1", "h2"],
      ["v1", "v2"],
    ]);
  });

  it("matches parseCsvLoose for trivial CSV", () => {
    const csv = "a,b,c\n1,2,3\n";
    expect(parseViaChunks(csv, [2, 1, 100])).toEqual(parseCsvLoose(csv));
  });

  it("matches parseCsvLoose with quoted fields and embedded newlines", () => {
    const csv = `col1,col2\n"hello""world","line1\nline2"\nx,y\n`;
    const expected = parseCsvLoose(csv);
    for (let seed = 0; seed < 8; seed += 1) {
      const sizes = randomChunks(csv.length, seed + 3);
      expect(parseViaChunks(csv, sizes)).toEqual(expected);
    }
  });

  it("matches parseCsvLoose on multiline file without trailing newline", () => {
    const csv = `h1,h2\nv1,"q,o"`;
    expect(parseViaChunks(csv, [1, 1, 1, 1, 20])).toEqual(parseCsvLoose(csv));
  });
});
