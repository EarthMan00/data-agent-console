"use client";

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { Loader2 } from "lucide-react";

import { openAuthorizedUtf8TextStream } from "@/lib/agent-api/client";
import { CsvIncrementalParser, pickDelimiterFromFirstCsvLine } from "@/lib/csv-incremental-parser";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

const INITIAL_DATA_ROWS = 50;
const PAGE_SIZE = 100;
const MAX_DISPLAY_ROWS = 25_000;

type LazyCsvArtifactTableProps = {
  downloadApi: string;
  withFreshToken: (run: (token: string) => Promise<void>) => Promise<void>;
  /** 右侧任务栏：占满中间区域高度；表头单行 …；单元格最多 3 行换行后 …；title 悬停全文 */
  sidePanel?: boolean;
};

function mergeCsvRowsIntoState(
  rows: string[][],
  headerRef: MutableRefObject<string[] | null>,
  dataRef: MutableRefObject<string[][]>,
) {
  let h = headerRef.current;
  const d = dataRef.current;
  for (const r of rows) {
    if (!h) {
      h = r;
      headerRef.current = h;
    } else {
      d.push(r);
    }
  }
}

function ingestRows(
  parser: CsvIncrementalParser,
  chunk: string,
  header: string[] | null,
  data: string[][],
): string[] | null {
  let nextHeader = header;
  const newRows = parser.push(chunk);
  for (const r of newRows) {
    if (!nextHeader) {
      nextHeader = r;
    } else {
      data.push(r);
    }
  }
  return nextHeader;
}

/** 侧栏：列宽上限 300；表头单行 …；单元格 line-clamp 放在内层，避免 td 设 -webkit-box 破坏表格列布局 */
const headerClamp =
  "max-w-[300px] min-w-0 !whitespace-nowrap !break-normal overflow-hidden text-ellipsis align-top";
const bodyCellSidePanelTd = "max-w-[300px] min-w-0 align-top p-0";
const bodyCellSidePanelInner =
  "block min-w-0 max-w-full whitespace-normal break-words px-3 py-2 text-xs leading-snug line-clamp-3";
const bodyCellDefault =
  "max-w-[300px] min-w-0 !whitespace-nowrap !break-normal overflow-hidden text-ellipsis align-top";

export function LazyCsvArtifactTable({ downloadApi, withFreshToken, sidePanel }: LazyCsvArtifactTableProps) {
  const [header, setHeader] = useState<string[] | null>(null);
  const [dataRows, setDataRows] = useState<string[][]>([]);
  const [initLoading, setInitLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamDone, setStreamDone] = useState(false);
  const [hitCap, setHitCap] = useState(false);

  const readerRef = useRef<ReadableStreamDefaultReader<string> | null>(null);
  const parserRef = useRef<CsvIncrementalParser | null>(null);
  const headerRef = useRef<string[] | null>(null);
  const dataRef = useRef<string[][]>([]);
  const loadMoreInFlight = useRef(false);
  const sentinelRef = useRef<HTMLTableCellElement | null>(null);
  const scrollRootRef = useRef<HTMLDivElement | null>(null);
  const aliveRef = useRef(true);

  const closeReader = useCallback(() => {
    void readerRef.current?.cancel().catch(() => {});
    readerRef.current = null;
  }, []);

  const flushUi = useCallback(() => {
    if (!aliveRef.current) return;
    setHeader(headerRef.current ? [...headerRef.current] : null);
    setDataRows([...dataRef.current]);
  }, []);

  /**
   * 自当前 reader 再解析出至少 targetExtra 条「数据行」（不含表头），或读到流结束。
   */
  const pumpRows = useCallback(
    async (targetExtra: number): Promise<void> => {
      const reader = readerRef.current;
      const parser = parserRef.current;
      if (!reader || !parser) return;

      const startLen = dataRef.current.length;

      while (dataRef.current.length - startLen < targetExtra) {
        if (dataRef.current.length >= MAX_DISPLAY_ROWS) {
          if (aliveRef.current) {
            setHitCap(true);
            setStreamDone(true);
          }
          closeReader();
          break;
        }

        const { done, value } = await reader.read();
        if (done) {
          const tail = parser.end();
          mergeCsvRowsIntoState(tail, headerRef, dataRef);
          if (aliveRef.current) setStreamDone(true);
          readerRef.current = null;
          break;
        }

        if (value) {
          const hBefore = headerRef.current;
          const newH = ingestRows(parser, value, hBefore, dataRef.current);
          if (newH !== hBefore) headerRef.current = newH;
        }
      }

      flushUi();
    },
    [closeReader, flushUi],
  );

  useEffect(() => {
    let cancelled = false;
    aliveRef.current = true;
    parserRef.current = null;
    headerRef.current = null;
    dataRef.current = [];
    readerRef.current = null;
    setInitLoading(true);
    setError(null);
    setStreamDone(false);
    setHitCap(false);

    void withFreshToken(async (token) => {
      try {
        const reader = await openAuthorizedUtf8TextStream(token, downloadApi);
        if (cancelled) {
          void reader.cancel();
          return;
        }

        const MAX_PREFIX = 512 * 1024;
        let buffer = "";
        let streamDone = false;
        while (!streamDone && buffer.length < MAX_PREFIX && !buffer.includes("\n")) {
          const { done, value } = await reader.read();
          streamDone = done;
          if (value) buffer += value;
        }

        const nl = buffer.indexOf("\n");
        const firstLineRaw = nl >= 0 ? buffer.slice(0, nl) : buffer;
        const firstLine = firstLineRaw.replace(/\r$/, "");
        const delimiter = pickDelimiterFromFirstCsvLine(firstLine);
        parserRef.current = new CsvIncrementalParser(delimiter);

        const newHeader = ingestRows(parserRef.current, buffer, null, dataRef.current);
        headerRef.current = newHeader;

        if (streamDone) {
          const tail = parserRef.current.end();
          mergeCsvRowsIntoState(tail, headerRef, dataRef);
          readerRef.current = null;
          if (aliveRef.current && !cancelled) {
            setStreamDone(true);
            setInitLoading(false);
          }
          flushUi();
          return;
        }

        readerRef.current = reader;
        await pumpRows(INITIAL_DATA_ROWS);
        if (!cancelled && aliveRef.current) {
          setInitLoading(false);
        }
      } catch (e) {
        if (!cancelled && aliveRef.current) {
          setError(e instanceof Error ? e.message : String(e));
          setInitLoading(false);
        }
      }
    });

    return () => {
      cancelled = true;
      aliveRef.current = false;
      closeReader();
    };
  }, [downloadApi, withFreshToken, closeReader, pumpRows, flushUi]);

  const onLoadMore = useCallback(async () => {
    if (streamDone || hitCap || initLoading || loadMoreInFlight.current) return;
    if (!readerRef.current) return;
    loadMoreInFlight.current = true;
    setLoadingMore(true);
    try {
      await pumpRows(PAGE_SIZE);
    } finally {
      loadMoreInFlight.current = false;
      setLoadingMore(false);
    }
  }, [streamDone, hitCap, initLoading, pumpRows]);

  useEffect(() => {
    if (initLoading || streamDone || hitCap) return;
    const el = sentinelRef.current;
    const root = scrollRootRef.current;
    if (!el) return;

    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          void onLoadMore();
        }
      },
      { root: root ?? undefined, rootMargin: "80px", threshold: 0 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [initLoading, streamDone, hitCap, onLoadMore, dataRows.length]);

  const colCount = Math.max(1, header?.length ?? (dataRows[0]?.length ?? 1));

  if (error) {
    return <p className={cn("text-[12px] text-[#b91c1c]", !sidePanel && "mt-3")}>{error}</p>;
  }

  if (initLoading) {
    return (
      <div className={cn("flex items-center gap-2 text-[12px] text-[#64748b]", !sidePanel && "mt-3")}>
        <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden />
        正在加载 CSV（首屏懒加载）…
      </div>
    );
  }

  if (!header && dataRows.length === 0) {
    return <p className={cn("text-[12px] text-[#6b7280]", !sidePanel && "mt-3")}>CSV 为空或无法解析表头。</p>;
  }

  const outerMaxH = sidePanel ? "min-h-0 flex-1 max-h-full" : "max-h-[min(70vh,560px)]";

  return (
    <div
      className={cn(
        "flex w-full min-w-0 flex-col rounded-[10px] border border-[#e5e7eb] bg-white",
        outerMaxH,
        !sidePanel && "mt-3",
      )}
    >
      <div ref={scrollRootRef} className="min-h-0 min-w-0 flex-1 overflow-auto">
        <Table data-testid="lazy-csv-table" className="w-max min-w-full max-w-full table-auto">
          {header ? (
            <TableHeader className="sticky top-0 z-[1] bg-[#f8fafc] shadow-[0_1px_0_#e5e7eb]">
              <TableRow className="border-[#e5e7eb] hover:bg-transparent">
                {header.map((h, i) => (
                  <TableHead key={`h-${i}`} className={headerClamp} title={h}>
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
          ) : null}
          <TableBody>
            {dataRows.map((row, ri) => (
              <TableRow key={`r-${ri}`} className="hover:bg-[#fafafa]">
                {Array.from({ length: colCount }, (_, ci) => {
                  const cell = row[ci] ?? "";
                  return (
                    <TableCell
                      key={`c-${ri}-${ci}`}
                      className={sidePanel ? bodyCellSidePanelTd : bodyCellDefault}
                      title={cell}
                    >
                      {sidePanel ? (
                        <span className={bodyCellSidePanelInner}>{cell}</span>
                      ) : (
                        cell
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
            {!streamDone && !hitCap ? (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  ref={sentinelRef}
                  colSpan={colCount}
                  className="h-10 border-0 py-2 text-center text-[11px] text-[#94a3b8]"
                >
                  {loadingMore ? (
                    <span className="inline-flex items-center justify-center gap-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      加载更多…
                    </span>
                  ) : (
                    "滑动到底部自动加载更多"
                  )}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
      {!sidePanel && (hitCap || streamDone) && dataRows.length > 0 ? (
        <div
          className={cn(
            "shrink-0 border-t border-[#e5e7eb] px-3 py-2 text-[11px] text-[#64748b]",
            hitCap && "bg-amber-50 text-amber-950",
          )}
        >
          {hitCap
            ? `已加载前 ${MAX_DISPLAY_ROWS.toLocaleString()} 行，避免页面过重；完整数据请使用侧栏「下载 CSV」。`
            : `已加载全部共 ${dataRows.length.toLocaleString()} 行数据。`}
        </div>
      ) : null}
    </div>
  );
}
