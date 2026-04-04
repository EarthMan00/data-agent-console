"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import { ChatexcelArtifactPreview } from "@/components/chatexcel-artifact-preview";
import { LazyCsvArtifactTable } from "@/components/lazy-csv-artifact-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fetchAuthorizedText } from "@/lib/agent-api/client";
import type { PlatformTaskArtifactRef } from "@/lib/agent-events";
import { parseChatexcelArtifactText } from "@/lib/chatexcel-artifact";
import { parseJsonToTableData } from "@/lib/json-to-table";
import { CHATEXCEL_RESULT_RE } from "@/lib/platform-task-artifacts";

function extOf(name: string) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

const jsonHeaderClamp =
  "max-w-[300px] min-w-0 !whitespace-nowrap !break-normal overflow-hidden text-ellipsis align-top";
const jsonBodyCellTd = "max-w-[300px] min-w-0 align-top p-0";
const jsonBodyCellInner =
  "block min-w-0 max-w-full whitespace-normal break-words px-3 py-2 text-xs leading-snug line-clamp-3";

function JsonArtifactDataTable({ columns, rows }: { columns: string[]; rows: string[][] }) {
  const colCount = Math.max(1, columns.length);
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[10px] border border-[#e5e7eb] bg-white">
      <div className="min-h-0 min-w-0 flex-1 overflow-auto">
        <Table className="w-max min-w-full max-w-full table-auto" data-testid="lazy-json-table">
          {columns.length > 0 ? (
            <TableHeader className="sticky top-0 z-[1] bg-[#f8fafc] shadow-[0_1px_0_#e5e7eb]">
              <TableRow className="border-[#e5e7eb] hover:bg-transparent">
                {columns.map((c, i) => (
                  <TableHead key={`jh-${i}`} className={jsonHeaderClamp} title={c}>
                    {c}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
          ) : null}
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colCount} className="text-[12px] text-[#64748b]">
                  （无数据行）
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row, ri) => (
                <TableRow key={`jr-${ri}`} className="hover:bg-[#fafafa]">
                  {Array.from({ length: colCount }, (_, ci) => {
                    const v = row[ci] ?? "";
                    return (
                      <TableCell key={`jc-${ri}-${ci}`} className={jsonBodyCellTd} title={v}>
                        <span className={jsonBodyCellInner}>{v}</span>
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

type TaskSingleDataArtifactPreviewProps = {
  artifact: PlatformTaskArtifactRef;
  withFreshToken: (run: (token: string) => Promise<void>) => Promise<void>;
};

export function TaskSingleDataArtifactPreview({ artifact, withFreshToken }: TaskSingleDataArtifactPreviewProps) {
  const ext = extOf(artifact.original_name);
  const isCsv = ext === "csv";
  const isJson = ext === "json" || ext === "jsonl";
  const isChatexcel = CHATEXCEL_RESULT_RE.test((artifact.original_name ?? "").trim());

  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!isCsv);

  const load = useCallback(async () => {
    if (isCsv) return;
    setLoading(true);
    setError(null);
    try {
      await withFreshToken(async (token) => {
        const body = await fetchAuthorizedText(token, artifact.download_api);
        setText(body);
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [artifact.download_api, isCsv, withFreshToken]);

  useEffect(() => {
    if (!isCsv) void load();
  }, [isCsv, load]);

  const jsonTable = useMemo(() => {
    if (!isJson || text == null) return null;
    return parseJsonToTableData(text);
  }, [isJson, text]);

  const chatexcelModel = useMemo(() => {
    if (!isChatexcel || text == null) return null;
    return parseChatexcelArtifactText(text);
  }, [isChatexcel, text]);

  if (isCsv) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <LazyCsvArtifactTable
          downloadApi={artifact.download_api}
          withFreshToken={withFreshToken}
          sidePanel
        />
      </div>
    );
  }

  if (error) {
    return <p className="text-[12px] text-[#b91c1c]">{error}</p>;
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[12px] text-[#64748b]">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
        正在加载…
      </div>
    );
  }

  if (isChatexcel && chatexcelModel) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <ChatexcelArtifactPreview model={chatexcelModel} />
      </div>
    );
  }

  if (jsonTable && (jsonTable.rows.length > 0 || jsonTable.columns.length > 0)) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <JsonArtifactDataTable columns={jsonTable.columns} rows={jsonTable.rows} />
      </div>
    );
  }

  return <p className="text-[12px] text-[#64748b]">无法将 JSON 解析为表格。</p>;
}
