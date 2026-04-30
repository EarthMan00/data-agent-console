"use client";

import { Download, X } from "lucide-react";

import { TaskSingleDataArtifactPreview } from "@/components/task-single-data-preview";
import { Button } from "@/components/ui/button";
import { downloadAuthorizedFile } from "@/lib/agent-api/client";
import type { PlatformTaskArtifactRef } from "@/lib/agent-events";
import { pickPrimaryTaskDataArtifact } from "@/lib/platform-task-artifacts";

type AgentTaskResultPanelProps = {
  onClose: () => void;
  artifacts?: PlatformTaskArtifactRef[];
  withFreshToken?: (run: (token: string) => Promise<void>) => Promise<void>;
  /** 多步整体下载（如 /api/tasks/download?...） */
  bundleDownloadApi?: string | null;
  bundleDownloadName?: string | null;
  /** 主会话 run 上同步的下载 API（如平台轮次写入的 zip 或聚合 URL） */
  zipDownloadApi?: string | null;
  /** 回退：单任务级 /api/tasks/{id}/download */
  taskId?: string | null;
};

function effectiveDownloadPath(p: {
  bundleDownloadApi?: string | null;
  zipDownloadApi?: string | null;
  taskId?: string | null;
}): string | null {
  const a = (p.bundleDownloadApi ?? "").trim();
  if (a) return a;
  const z = (p.zipDownloadApi ?? "").trim();
  if (z) return z;
  const tid = (p.taskId ?? "").trim();
  if (tid) return `/api/tasks/${encodeURIComponent(tid)}/download`;
  return null;
}

export function AgentTaskResultPanel({
  onClose,
  artifacts,
  withFreshToken,
  bundleDownloadApi,
  bundleDownloadName,
  zipDownloadApi,
  taskId,
}: AgentTaskResultPanelProps) {
  const primary = pickPrimaryTaskDataArtifact(artifacts ?? []);
  const downloadPath = effectiveDownloadPath({ bundleDownloadApi, zipDownloadApi, taskId });
  const canDownload = Boolean(withFreshToken && downloadPath);

  return (
    <div className="flex h-full min-h-0 flex-col bg-white text-[#31405a]" data-testid="agent-preview-panel">
      <div className="flex shrink-0 justify-end border-b border-[#e5e7eb] px-3 py-2">
        <Button
          type="button"
          aria-label="关闭任务结果"
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-[10px] text-[#64748b]"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pb-2 pt-1">
        {primary && withFreshToken ? (
          <TaskSingleDataArtifactPreview artifact={primary} withFreshToken={withFreshToken} />
        ) : (
          <p className="text-[13px] leading-6 text-[#64748b]">
            暂无数据或报告类结果文件（CSV/JSON/Markdown/HTML/PDF/ChatExcel）可展示。
          </p>
        )}
      </div>

      {canDownload ? (
        <div className="flex shrink-0 justify-end border-t border-[#e5e7eb] bg-[#fafafa] px-3 py-3">
          <Button
            type="button"
            variant="default"
            size="sm"
            className="h-9 gap-2 text-xs"
            onClick={() =>
              void withFreshToken!(async (token) => {
                const name =
                  (bundleDownloadName ?? "").trim() ||
                  ((downloadPath ?? "").includes("task_ids=") ? `${(taskId ?? "task").trim() || "task"}.zip` : "download");
                await downloadAuthorizedFile(token, downloadPath!, name);
              })
            }
          >
            <Download className="h-4 w-4" />
            下载全部文件
          </Button>
        </div>
      ) : null}
    </div>
  );
}
