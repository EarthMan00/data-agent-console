"use client";

import { useMemo } from "react";
import ReactMarkdown from "react-markdown";

import { ChatexcelArtifactPreview } from "@/components/chatexcel-artifact-preview";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { parseChatexcelArtifactText } from "@/lib/chatexcel-artifact";
import { parseJsonToTableData } from "@/lib/json-to-table";

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
        <Table className="w-max min-w-full max-w-full table-auto">
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
              )))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export function FavoriteSnapshotView({
  snapshot,
  title,
}: {
  snapshot: Record<string, unknown>;
  title?: string;
}) {
  const kind = typeof snapshot.result_kind === "string" ? snapshot.result_kind.toLowerCase() : "";
  const content_text = typeof snapshot.content_text === "string" ? snapshot.content_text : "";

  const jsonTable = useMemo(() => {
    if (kind !== "json" || !content_text) return null;
    return parseJsonToTableData(content_text);
  }, [kind, content_text]);

  const chatexcelModel = useMemo(() => {
    if (kind !== "chatexcel" || !content_text) return null;
    return parseChatexcelArtifactText(content_text);
  }, [kind, content_text]);

  if (kind === "file" || kind === "pdf") {
    return (
      <div className="space-y-3 px-4 py-6 text-sm text-[#64748b]">
        <p>
          {kind === "pdf" ? "PDF 报告已保存副本。" : "文件已保存副本。"}
          {typeof snapshot.original_name === "string" ? `（${snapshot.original_name}）` : ""}
        </p>
        <p className="text-xs">请使用「下载报告」在本地查看完整内容。</p>
      </div>
    );
  }

  if (kind === "html" && content_text) {
    return (
      <iframe
        title={title ?? "HTML 预览"}
        sandbox=""
        className="min-h-[400px] w-full flex-1 rounded-[10px] border border-[#e5e7eb] bg-white"
        srcDoc={content_text}
      />
    );
  }

  if (kind === "md" && content_text) {
    return (
      <div className="min-h-0 min-w-0 flex-1 overflow-auto rounded-[10px] border border-[#e5e7eb] bg-white px-3 py-2 text-[13px] leading-relaxed text-[#31405a] [&_h1]:mb-2 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:mt-3 [&_h2]:text-sm [&_h2]:font-semibold [&_li]:my-0.5 [&_p]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_code]:rounded [&_code]:bg-[#f1f5f9] [&_code]:px-1 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-[#f8fafc] [&_pre]:p-2 [&_table]:w-full [&_th]:border [&_th]:border-[#e5e7eb] [&_th]:bg-[#f8fafc] [&_th]:px-2 [&_th]:py-1 [&_td]:border [&_td]:border-[#e5e7eb] [&_td]:px-2 [&_td]:py-1">
        <ReactMarkdown>{content_text}</ReactMarkdown>
      </div>
    );
  }

  if (kind === "linkfox" && content_text) {
    return (
      <pre className="min-h-0 min-w-0 flex-1 overflow-auto whitespace-pre-wrap break-words rounded-[10px] border border-[#e5e7eb] bg-[#f8fafc] p-3 text-[12px] leading-relaxed text-[#31405a]">
        {content_text}
      </pre>
    );
  }

  if (kind === "chatexcel" && chatexcelModel) {
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

  if (kind === "csv" && content_text) {
    const lines = content_text.split(/\r?\n/).filter((l) => l.length > 0);
    const rows = lines.slice(0, 400).map((line) => line.split(","));
    return (
      <div className="min-h-0 min-w-0 flex-1 overflow-auto rounded-[10px] border border-[#e5e7eb] bg-white">
        <table className="w-full border-collapse text-left text-[13px]">
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={`cs-${rowIndex}`} className="border-b border-[#e5eaf2]">
                {row.map((cell, cellIndex) => (
                  <td
                    key={`c-${rowIndex}-${cellIndex}`}
                    className={`border-r border-[#e5eaf2] px-3 py-2 align-top ${
                      rowIndex === 0 ? "bg-[#f8fafc] font-medium text-[#313734]" : "bg-white text-[#6d7c91]"
                    }`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (content_text) {
    return (
      <pre className="min-h-0 min-w-0 flex-1 overflow-auto whitespace-pre-wrap break-words rounded-[10px] border border-[#e5e7eb] bg-white p-3 text-[12px] text-[#31405a]">
        {content_text}
      </pre>
    );
  }

  return <p className="px-4 py-8 text-sm text-[#64748b]">无法展示该收藏的快照内容。</p>;
}
