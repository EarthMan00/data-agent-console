"use client";

import type { ChatexcelPreviewModel } from "@/lib/chatexcel-artifact";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const chip =
  "inline-flex items-center rounded-md border border-[#e5e7eb] bg-[#f8fafc] px-2 py-0.5 text-[11px] text-[#475569]";

function ChatexcelTable({ columns, rows }: { columns: string[]; rows: string[][] }) {
  const colCount = Math.max(1, columns.length);
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[10px] border border-[#e5e7eb] bg-white">
      <div className="min-h-0 min-w-0 flex-1 overflow-auto">
        <Table className="w-max min-w-full max-w-full table-auto" data-testid="chatexcel-preview-table">
          {columns.length > 0 ? (
            <TableHeader className="sticky top-0 z-[1] bg-[#f0fdf4] shadow-[0_1px_0_#e5e7eb]">
              <TableRow className="border-[#e5e7eb] hover:bg-transparent">
                {columns.map((c, i) => (
                  <TableHead
                    key={`cx-${i}`}
                    className="max-w-[280px] min-w-0 !whitespace-nowrap !break-normal text-left text-[11px] font-semibold text-[#166534]"
                    title={c}
                  >
                    {c || `列 ${i + 1}`}
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
                <TableRow key={`cxr-${ri}`} className="hover:bg-[#fafafa]">
                  {Array.from({ length: colCount }, (_, ci) => {
                    const v = row[ci] ?? "";
                    return (
                      <TableCell
                        key={`cxc-${ri}-${ci}`}
                        className="max-w-[280px] min-w-0 align-top p-0 text-[11px]"
                        title={v}
                      >
                        <span className="block min-w-0 max-w-full whitespace-normal break-words px-3 py-1.5 leading-snug">
                          {v}
                        </span>
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

type ChatexcelArtifactPreviewProps = {
  model: ChatexcelPreviewModel;
};

export function ChatexcelArtifactPreview({ model }: ChatexcelArtifactPreviewProps) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {model.action ? <span className={chip}>action: {model.action}</span> : null}
        <span className={chip}>{model.ok ? "ok: true" : "ok: false"}</span>
        {model.executionTimeSec != null ? (
          <span className={chip}>耗时: {model.executionTimeSec.toFixed(3)}s</span>
        ) : null}
        {model.fileLabel ? <span className={chip}>文件: {model.fileLabel}</span> : null}
      </div>

      {model.parseWarning ? (
        <p className="text-[12px] text-[#b45309]">{model.parseWarning}</p>
      ) : null}

      {!model.ok && model.error ? (
        <div className="rounded-[8px] border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800">
          {model.errorType ? <span className="font-mono text-[11px] text-red-600">[{model.errorType}] </span> : null}
          {model.error}
        </div>
      ) : null}

      {model.table && (model.table.columns.length > 0 || model.table.rows.length > 0) ? (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col pt-1">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-[#64748b]">
            结果输出（CSV 解析）
          </p>
          <ChatexcelTable columns={model.table.columns} rows={model.table.rows} />
        </div>
      ) : null}

      {model.jsonFallback ? (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <p className="mb-1 text-[11px] font-medium text-[#64748b]">结构化 JSON</p>
          <pre className="max-h-[min(60vh,480px)] min-h-0 overflow-auto rounded-[10px] border border-[#e5e7eb] bg-[#0f172a] p-3 text-[11px] leading-5 text-[#e2e8f0]">
            {model.jsonFallback}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
