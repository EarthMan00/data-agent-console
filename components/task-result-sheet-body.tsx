"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import { LazyCsvArtifactTable } from "@/components/lazy-csv-artifact-table";
import { TaskSingleDataArtifactPreview } from "@/components/task-single-data-preview";
import { fetchAuthorizedText } from "@/lib/agent-api/client";
import type { PlatformTaskArtifactRef } from "@/lib/agent-events";
import type { TaskResultSheet } from "@/lib/task-result-sheets";

function tryFormatJson(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return text;
  try {
    return JSON.stringify(JSON.parse(trimmed) as unknown, null, 2);
  } catch {
    /* jsonl */
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

function JsonCodeBlock({
  downloadApi,
  withFreshToken,
}: {
  downloadApi: string;
  withFreshToken: (run: (token: string) => Promise<void>) => Promise<void>;
}) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await withFreshToken(async (token) => {
        const body = await fetchAuthorizedText(token, downloadApi);
        setText(body);
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setText(null);
    } finally {
      setLoading(false);
    }
  }, [downloadApi, withFreshToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const formatted = useMemo(() => (text != null ? tryFormatJson(text) : ""), [text]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-[13px] text-[#64748b]">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
        正在加载 JSON…
      </div>
    );
  }
  if (error) {
    return <p className="py-4 text-[13px] text-red-600">{error}</p>;
  }
  return (
    <pre className="min-h-0 min-w-0 flex-1 overflow-auto rounded-[10px] border border-[#e5e7eb] bg-[#0f172a] p-3 text-[12px] leading-relaxed text-[#e2e8f0]">
      {formatted}
    </pre>
  );
}

/** 收藏快照等内联 JSON 文本，与任务结果「代码」模式同样式 */
export function InlineJsonArtifactBlock({ text }: { text: string }) {
  const formatted = useMemo(() => tryFormatJson(text), [text]);
  return (
    <pre className="min-h-0 min-w-0 flex-1 overflow-auto rounded-[10px] border border-[#e5e7eb] bg-[#0f172a] p-3 text-[12px] leading-relaxed text-[#e2e8f0]">
      {formatted}
    </pre>
  );
}

type TaskResultSheetBodyProps = {
  sheet: TaskResultSheet;
  viewMode: "table" | "code";
  withFreshToken: (run: (token: string) => Promise<void>) => Promise<void>;
};

export function TaskResultSheetBody({ sheet, viewMode, withFreshToken }: TaskResultSheetBodyProps) {
  if (sheet.primary) {
    return <TaskSingleDataArtifactPreview artifact={sheet.primary} withFreshToken={withFreshToken} />;
  }

  if (sheet.csv && sheet.json) {
    if (viewMode === "table") {
      return (
        <LazyCsvArtifactTable downloadApi={sheet.csv.download_api} withFreshToken={withFreshToken} sidePanel />
      );
    }
    return <JsonCodeBlock downloadApi={sheet.json.download_api} withFreshToken={withFreshToken} />;
  }

  if (sheet.csv) {
    return <LazyCsvArtifactTable downloadApi={sheet.csv.download_api} withFreshToken={withFreshToken} sidePanel />;
  }

  if (sheet.json) {
    return <JsonCodeBlock downloadApi={sheet.json.download_api} withFreshToken={withFreshToken} />;
  }

  return <p className="text-[13px] text-[#64748b]">暂无可展示内容。</p>;
}
