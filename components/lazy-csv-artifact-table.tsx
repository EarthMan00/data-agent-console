"use client";

import { useCallback, useEffect, useRef, useState, type MutableRefObject, type UIEvent } from "react";
import { Loader2 } from "@/components/ui/tabler-icons";

import { openAuthorizedUtf8TextStream } from "@/lib/agent-api/client";
import { CsvIncrementalParser, pickDelimiterFromFirstCsvLine } from "@/lib/csv-incremental-parser";
import { TableDataCellContent } from "@/components/table-data-cell-content";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { shouldRenderTableCellAsImage } from "@/lib/table-image-url-cell";
import { cn } from "@/lib/utils";

const INITIAL_DATA_ROWS = 50;
const PAGE_SIZE = 100;
const MAX_DISPLAY_ROWS = 25_000;
const SIDE_PANEL_COLUMN_MIN_WIDTH = 96;
const SIDE_PANEL_COLUMN_MAX_WIDTH = 340;

type LazyCsvArtifactTableProps = {
  downloadApi?: string;
  withFreshToken?: (run: (token: string) => Promise<void>) => Promise<void>;
  /** 已内联的 CSV 全文（收藏快照等场景），与 downloadApi 二选一 */
  inlineUtf8Text?: string;
  /** 右侧任务栏：占满中间区域高度；表头单行 …；单元格最多 3 行换行后 …；title 悬停全文 */
  sidePanel?: boolean;
  onScrollStateChange?: (scrolled: boolean) => void;
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

/** 侧栏：表头单行 …；单元格 line-clamp 放在内层，避免 td 设 -webkit-box 破坏表格列布局 */
const headerClamp =
  "h-11 min-w-0 !whitespace-nowrap !break-normal overflow-hidden border-r border-border-subtle p-0 align-middle last:border-r-0";
const bodyCellSidePanelTd = "min-w-0 align-top p-0";
const bodyCellSidePanelInner =
  "block min-w-0 max-w-full whitespace-normal break-words px-3 py-2 text-xs leading-snug line-clamp-3";
const bodyCellDefault =
  "max-w-panel-sm min-w-0 !whitespace-nowrap !break-normal overflow-hidden text-ellipsis align-top";

function sidePanelColumnWidth(header: string | undefined, index: number): number {
  const label = (header ?? "").trim().toLowerCase();
  if (/^(位置|序号|rank|index|position)$/i.test(label)) return 68;
  if (label === "asin") return 168;
  if (/(链接|link|url|地址)/i.test(label)) return 300;
  if (/(标题|title)/i.test(label)) return 180;
  if (/(标签|选项|分类|category|label|tag)/i.test(label)) return 300;
  const base = Math.max(SIDE_PANEL_COLUMN_MIN_WIDTH, Math.min(SIDE_PANEL_COLUMN_MAX_WIDTH, (header?.length ?? 8) * 14 + 56));
  return index === 0 ? Math.min(base, 120) : base;
}

export function LazyCsvArtifactTable({
  downloadApi,
  withFreshToken,
  inlineUtf8Text,
  sidePanel,
  onScrollStateChange,
}: LazyCsvArtifactTableProps) {
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
    if (inlineUtf8Text !== undefined) {
      aliveRef.current = true;
      parserRef.current = null;
      headerRef.current = null;
      dataRef.current = [];
      readerRef.current = null;
      setInitLoading(true);
      setError(null);
      setStreamDone(false);
      setHitCap(false);

      try {
        const normalized = inlineUtf8Text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
        if (!normalized.trim()) {
          setError("CSV 为空");
          setInitLoading(false);
          return;
        }
        const firstNl = normalized.indexOf("\n");
        const firstLine = firstNl >= 0 ? normalized.slice(0, firstNl) : normalized;
        const delimiter = pickDelimiterFromFirstCsvLine(firstLine.replace(/\r$/, ""));
        const parser = new CsvIncrementalParser(delimiter);
        const emitted = parser.push(normalized);
        mergeCsvRowsIntoState(emitted, headerRef, dataRef);
        const tail = parser.end();
        mergeCsvRowsIntoState(tail, headerRef, dataRef);
        if (dataRef.current.length > MAX_DISPLAY_ROWS) {
          dataRef.current = dataRef.current.slice(0, MAX_DISPLAY_ROWS);
          setHitCap(true);
        }
        flushUi();
        setStreamDone(true);
        setInitLoading(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setInitLoading(false);
      }

      return () => {
        aliveRef.current = false;
      };
    }

    if (!downloadApi || !withFreshToken) {
      return;
    }

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
  }, [inlineUtf8Text, downloadApi, withFreshToken, closeReader, pumpRows, flushUi]);

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

  const handleScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    onScrollStateChange?.(event.currentTarget.scrollTop > 0);
  }, [onScrollStateChange]);

  useEffect(() => () => onScrollStateChange?.(false), [onScrollStateChange]);

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
  const sidePanelColumnWidths = sidePanel
    ? Array.from({ length: colCount }, (_, i) => sidePanelColumnWidth(header?.[i], i))
    : [];
  const sidePanelTableMinWidth = sidePanelColumnWidths.reduce((sum, width) => sum + width, 0);

  if (error) {
    return <p className={cn("text-caption text-danger", !sidePanel && "mt-3")}>{error}</p>;
  }

  if (initLoading) {
    return (
      <div className={cn("flex items-center gap-2 text-caption text-text-secondary", !sidePanel && "mt-3")}>
        <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden />
        正在加载 CSV（首屏懒加载）…
      </div>
    );
  }

  if (!header && dataRows.length === 0) {
    return <p className={cn("text-caption text-text-tertiary", !sidePanel && "mt-3")}>CSV 为空或无法解析表头。</p>;
  }

  const outerMaxH = sidePanel ? "min-h-0 flex-1 max-h-full" : "max-h-artifact-table";

  return (
    <div
      className={cn(
        "flex w-full min-w-0 flex-col rounded-control border border-border-subtle bg-bg-surface",
        outerMaxH,
        !sidePanel && "mt-3",
      )}
    >
      <div ref={scrollRootRef} className="min-h-0 min-w-0 flex-1 overflow-auto" onScroll={handleScroll}>
        <Table
          data-testid="lazy-csv-table"
          className={sidePanel ? "w-full table-fixed" : "w-max min-w-full max-w-full table-auto"}
          style={sidePanel ? { minWidth: `${sidePanelTableMinWidth}px` } : undefined}
        >
          {sidePanel ? (
            <colgroup>
              {sidePanelColumnWidths.map((width, i) => (
                <col key={`col-${i}`} style={{ width: `${width}px` }} />
              ))}
            </colgroup>
          ) : null}
          {header ? (
            <TableHeader className="sticky top-0 z-layer-base bg-bg-subtle shadow-none">
              <TableRow className="border-border-subtle hover:bg-transparent">
                {header.map((h, i) => (
                  <TableHead key={`h-${i}`} className={headerClamp} title={h}>
                    <span className="block min-w-0 max-w-full overflow-hidden text-ellipsis px-3 py-2">
                      {h}
                    </span>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
          ) : null}
          <TableBody>
            {dataRows.map((row, ri) => (
              <TableRow key={`r-${ri}`} className="border-border-subtle hover:bg-bg-subtle">
                {Array.from({ length: colCount }, (_, ci) => {
                  const cell = row[ci] ?? "";
                  const columnHeader = header?.[ci];
                  return (
                    <TableCell
                      key={`c-${ri}-${ci}`}
                      className={sidePanel ? bodyCellSidePanelTd : bodyCellDefault}
                      title={shouldRenderTableCellAsImage(columnHeader, cell) ? undefined : cell}
                    >
                      <TableDataCellContent
                        value={cell}
                        columnHeader={columnHeader}
                        sidePanel={sidePanel}
                        textClassName={sidePanel ? bodyCellSidePanelInner : undefined}
                      />
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
                  className="h-10 border-0 py-2 text-center text-caption text-text-disabled"
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
            "shrink-0 border-t border-border px-3 py-2 text-caption text-text-secondary",
            hitCap && "bg-warning-bg text-warning",
          )}
        >
          {hitCap
            ? `已加载前 ${MAX_DISPLAY_ROWS.toLocaleString()} 行，避免页面过重；完整数据请使用顶部下载按钮。`
            : `已加载全部共 ${dataRows.length.toLocaleString()} 行数据。`}
        </div>
      ) : null}
    </div>
  );
}
