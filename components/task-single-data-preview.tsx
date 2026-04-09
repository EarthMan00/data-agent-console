"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";

import { ChatexcelArtifactPreview } from "@/components/chatexcel-artifact-preview";
import { LazyCsvArtifactTable } from "@/components/lazy-csv-artifact-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fetchAuthorizedText } from "@/lib/agent-api/client";
import type { PlatformTaskArtifactRef } from "@/lib/agent-events";
import { parseChatexcelArtifactText } from "@/lib/chatexcel-artifact";
import { parseJsonToTableData } from "@/lib/json-to-table";
import { CHATEXCEL_RESULT_RE, LINKFOX_RESULT_RE } from "@/lib/platform-task-artifacts";

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
  const isMd = ext === "md" || ext === "markdown";
  const isHtml = ext === "html" || ext === "htm";
  const isPdf = ext === "pdf";
  const isChatexcel = CHATEXCEL_RESULT_RE.test((artifact.original_name ?? "").trim());
  const isLinkfoxResult = LINKFOX_RESULT_RE.test((artifact.original_name ?? "").trim());

  const needsTextFetch = !isCsv && !isPdf;
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(needsTextFetch);

  const load = useCallback(async () => {
    if (isCsv || isPdf) return;
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
  }, [artifact.download_api, isCsv, isPdf, withFreshToken]);

  useEffect(() => {
    if (needsTextFetch) void load();
  }, [needsTextFetch, load]);

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

  if (isPdf) {
    return (
      <p className="text-[12px] leading-relaxed text-[#64748b]">
        PDF 文件无法在侧栏内嵌预览，请使用下方「下载文件」在本地查看。
      </p>
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

  if (isLinkfoxResult && text != null) {
    return (
      <pre className="min-h-0 min-w-0 flex-1 overflow-auto whitespace-pre-wrap break-words rounded-[10px] border border-[#e5e7eb] bg-[#f8fafc] p-3 text-[12px] leading-relaxed text-[#31405a]">
        {text}
      </pre>
    );
  }

  if (isHtml && text != null) {
    return (
      <iframe
        title="HTML 预览"
        sandbox=""
        className="min-h-[280px] w-full flex-1 rounded-[10px] border border-[#e5e7eb] bg-white"
        srcDoc={text}
      />
    );
  }

  if (isMd && text != null) {
    return (
      <div className="min-h-0 min-w-0 flex-1 overflow-auto rounded-[10px] border border-[#e5e7eb] bg-white px-3 py-2 text-[13px] leading-relaxed text-[#31405a] [&_h1]:mb-2 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:mt-3 [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:mb-1 [&_h3]:mt-2 [&_h3]:text-[13px] [&_h3]:font-semibold [&_li]:my-0.5 [&_p]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_code]:rounded [&_code]:bg-[#f1f5f9] [&_code]:px-1 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-[#f8fafc] [&_pre]:p-2 [&_table]:w-full [&_th]:border [&_th]:border-[#e5e7eb] [&_th]:bg-[#f8fafc] [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_td]:border [&_td]:border-[#e5e7eb] [&_td]:px-2 [&_td]:py-1">
        <ReactMarkdown>{text}</ReactMarkdown>
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
