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
};

export function AgentTaskResultPanel({ onClose, artifacts, withFreshToken }: AgentTaskResultPanelProps) {
  const primary = pickPrimaryTaskDataArtifact(artifacts ?? []);
  const canDownload = Boolean(primary && withFreshToken);

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
                const name = primary!.original_name?.trim() || "task-result";
                await downloadAuthorizedFile(token, primary!.download_api, name);
              })
            }
          >
            <Download className="h-4 w-4" />
            下载文件
          </Button>
        </div>
      ) : null}
    </div>
  );
}
