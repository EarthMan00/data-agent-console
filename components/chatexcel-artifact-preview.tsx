"use client";

import type { ChatexcelPreviewModel } from "@/lib/chatexcel-artifact";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const chip =
  "inline-flex items-center rounded-md border border-border bg-bg-subtle px-2 py-0.5 text-caption text-text-secondary";

function ChatexcelTable({ columns, rows }: { columns: string[]; rows: string[][] }) {
  const colCount = Math.max(1, columns.length);
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-control border border-border bg-bg-surface">
      <div className="min-h-0 min-w-0 flex-1 overflow-auto">
        <Table className="w-max min-w-full max-w-full table-auto" data-testid="chatexcel-preview-table">
          {columns.length > 0 ? (
            <TableHeader className="sticky top-0 z-layer-base bg-success-bg shadow-hairline">
              <TableRow className="border-border hover:bg-transparent">
                {columns.map((c, i) => (
                  <TableHead
                    key={`cx-${i}`}
                    className="h-12 max-w-72 min-w-0 !whitespace-nowrap !break-normal align-middle px-3 pb-3 pt-3 text-left text-caption font-semibold text-success"
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
                <TableCell colSpan={colCount} className="text-caption text-text-secondary">
                  （无数据行）
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row, ri) => (
                <TableRow key={`cxr-${ri}`} className="hover:bg-bg-subtle">
                  {Array.from({ length: colCount }, (_, ci) => {
                    const v = row[ci] ?? "";
                    return (
                      <TableCell
                        key={`cxc-${ri}-${ci}`}
                        className="max-w-72 min-w-0 align-top p-0 text-caption"
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
        <p className="text-caption text-warning">{model.parseWarning}</p>
      ) : null}

      {!model.ok ? (
        <div className="rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-caption text-danger">
          {model.errorType ? <span className="font-mono text-caption text-danger">[{model.errorType}] </span> : null}
          {model.error ?? "工具执行失败"}
        </div>
      ) : null}

      {model.table && (model.table.columns.length > 0 || model.table.rows.length > 0) ? (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col pt-1">
          <p className="mb-1 text-caption font-medium uppercase tracking-wide text-text-secondary">
            结果输出（CSV 解析）
          </p>
          <ChatexcelTable columns={model.table.columns} rows={model.table.rows} />
        </div>
      ) : null}

      {model.jsonFallback ? (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <p className="mb-1 text-caption font-medium text-text-secondary">结构化 JSON</p>
          <pre className="max-h-artifact-tall min-h-0 overflow-auto rounded-control border border-border bg-code-bg p-3 text-caption leading-5 text-code-text">
            {model.jsonFallback}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
