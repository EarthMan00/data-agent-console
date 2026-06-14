"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileJson, Table } from "@/components/ui/tabler-icons";

import { ChatexcelArtifactPreview } from "@/components/chatexcel-artifact-preview";
import { LazyCsvArtifactTable } from "@/components/lazy-csv-artifact-table";
import { fetchAuthorizedText } from "@/lib/agent-api/client";
import type { PlatformTaskArtifactRef } from "@/lib/agent-events";
import { parseChatexcelArtifactText } from "@/lib/chatexcel-artifact";
import { parseJsonToTableData } from "@/lib/json-to-table";
import { CHATEXCEL_RESULT_RE } from "@/lib/platform-task-artifacts";

function extOf(name: string) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

function tryFormatJson(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return text;
  try {
    return JSON.stringify(JSON.parse(trimmed) as unknown, null, 2);
  } catch {
    /* jsonl or invalid */
  }
  const lines = trimmed.split(/\r?\n/).filter(Boolean);
  if (lines.length <= 1) return text;
  const formatted: string[] = [];
  for (const line of lines.slice(0, 200)) {
    try {
      formatted.push(JSON.stringify(JSON.parse(line) as unknown, null, 2));
    } catch {
      formatted.push(line);
    }
  }
  if (lines.length > 200) {
    formatted.push(`\n… 共 ${lines.length} 行，仅展示前 200 行`);
  }
  return formatted.join("\n\n---\n\n");
}

function ArtifactJsonTable({ columns, rows }: { columns: string[]; rows: string[][] }) {
  const colCount = Math.max(1, columns.length);
  return (
    <div className="mt-3 max-h-80 overflow-auto rounded-control border border-border bg-bg-surface">
      <table className="w-full min-w-80 border-collapse text-left text-caption">
        {columns.length > 0 ? (
          <thead>
            <tr className="border-b border-border">
              {columns.map((c) => (
                <th
                  key={c}
                  className="max-w-sidebar-admin whitespace-pre-wrap break-words border-r border-border bg-bg-subtle px-2 py-2 text-left font-medium text-text-secondary"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
        ) : null}
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={colCount} className="px-2 py-3 text-text-secondary">
                （无数据行）
              </td>
            </tr>
          ) : (
            rows.map((row, ri) => (
              <tr key={`jr-${ri}`} className="border-b border-border-subtle">
                {columns.map((_, ci) => (
                  <td
                    key={`jc-${ri}-${ci}`}
                    className="max-w-sidebar-admin whitespace-pre-wrap break-words border-r border-border-subtle px-2 py-1.5 align-top text-text-secondary"
                  >
                    {row[ci] ?? ""}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

type TaskArtifactPreviewsProps = {
  artifacts: PlatformTaskArtifactRef[];
  withFreshToken?: (run: (token: string) => Promise<void>) => Promise<void>;
};

function ArtifactCard({
  artifact,
  withFreshToken,
}: {
  artifact: PlatformTaskArtifactRef;
  withFreshToken?: (run: (token: string) => Promise<void>) => Promise<void>;
}) {
  const ext = extOf(artifact.original_name);
  const isChatexcelName = CHATEXCEL_RESULT_RE.test((artifact.original_name ?? "").trim());
  const mode =
    ext === "csv"
      ? "csv"
      : isChatexcelName
        ? "chatexcel"
        : ext === "json" || ext === "jsonl"
          ? "json"
          : ext === "txt" || ext === "log"
            ? "text"
            : "binary";
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(mode !== "binary" && mode !== "csv");

  const load = useCallback(async () => {
    if (mode === "binary" || mode === "csv" || !withFreshToken) {
      setLoading(false);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await withFreshToken(async (token) => {
        const body = await fetchAuthorizedText(token, artifact.download_api);
        setText(body);
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setText(null);
    } finally {
      setLoading(false);
    }
  }, [artifact.download_api, mode, withFreshToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const jsonTable = useMemo(() => {
    if (mode !== "json" || text == null) return null;
    return parseJsonToTableData(text);
  }, [mode, text]);

  const jsonFallback = useMemo(() => {
    if (mode !== "json" || text == null) return null;
    return tryFormatJson(text);
  }, [mode, text]);

  const chatexcelModel = useMemo(() => {
    if (mode !== "chatexcel" || text == null) return null;
    return parseChatexcelArtifactText(text);
  }, [mode, text]);

  return (
    <div className="rounded-card border border-border bg-bg-subtle p-4">
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {mode === "csv" ? (
            <Table className="h-4 w-4 shrink-0 text-link" aria-hidden />
          ) : mode === "chatexcel" ? (
            <Table className="h-4 w-4 shrink-0 text-success" aria-hidden />
          ) : mode === "json" ? (
            <FileJson className="h-4 w-4 shrink-0 text-link" aria-hidden />
          ) : mode === "text" ? (
            <FileJson className="h-4 w-4 shrink-0 text-success" aria-hidden />
          ) : (
            <FileJson className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden />
          )}
          <div className="min-w-0">
            <div className="truncate text-body font-semibold text-foreground">{artifact.original_name}</div>
            <div className="text-caption text-text-tertiary">{artifact.artifact_type}</div>
          </div>
        </div>
      </div>

      {!withFreshToken ? (
        <p className="mt-3 text-caption text-text-tertiary">未登录时无法拉取平台文件内容。</p>
      ) : mode === "csv" ? (
        <LazyCsvArtifactTable downloadApi={artifact.download_api} withFreshToken={withFreshToken!} />
      ) : loading ? (
        <p className="mt-3 text-caption text-text-tertiary">正在读取文件内容…</p>
      ) : error ? (
        <p className="mt-3 text-caption text-danger">{error}</p>
      ) : mode === "chatexcel" && chatexcelModel ? (
        <div className="mt-3 min-h-50">
          <ChatexcelArtifactPreview model={chatexcelModel} />
        </div>
      ) : mode === "json" && jsonTable ? (
        <ArtifactJsonTable columns={jsonTable.columns} rows={jsonTable.rows} />
      ) : mode === "json" && jsonFallback != null ? (
        <pre className="mt-3 max-h-80 overflow-auto rounded-control border border-border bg-code-bg p-3 text-caption leading-5 text-code-text">
          {jsonFallback}
        </pre>
      ) : mode === "binary" ? (
        <p className="mt-3 text-caption text-text-tertiary">该文件类型不在页面内预览；若有 CSV 可使用侧栏底部「下载 CSV」。</p>
      ) : mode === "text" && text != null && text.length > 0 ? (
        <pre className="mt-3 max-h-80 overflow-auto rounded-control border border-border bg-bg-surface p-3 text-caption leading-5 text-text-secondary">
          {text.slice(0, 120_000)}
          {text.length > 120_000 ? "\n…（内容过长已截断）" : ""}
        </pre>
      ) : text != null && text.length > 0 ? (
        <pre className="mt-3 max-h-60 overflow-auto rounded-control border border-border bg-bg-surface p-3 text-caption leading-5 text-text-secondary">
          {text.slice(0, 120_000)}
          {text.length > 120_000 ? "\n…（内容过长已截断）" : ""}
        </pre>
      ) : (
        <p className="mt-3 text-caption text-text-tertiary">文件为空或无法解析为表格/JSON。</p>
      )}
    </div>
  );
}

export function TaskArtifactPreviews({ artifacts, withFreshToken }: TaskArtifactPreviewsProps) {
  if (!artifacts.length) return null;

  return (
    <div className="shrink-0 space-y-3 border-b border-border bg-artifact-gradient px-5 py-4">
      <div className="text-caption font-semibold uppercase tracking-label text-text-secondary">任务产出文件</div>
      <div className="space-y-3">
        {artifacts.map((a) => (
          <ArtifactCard key={a.artifact_id} artifact={a} withFreshToken={withFreshToken} />
        ))}
      </div>
    </div>
  );
}
