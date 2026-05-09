"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Ellipsis, Star, X } from "lucide-react";

import { TaskResultSheetBody } from "@/components/task-result-sheet-body";
import { TaskSingleDataArtifactPreview } from "@/components/task-single-data-preview";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  createUserFavorite,
  deleteUserFavorite,
  downloadAuthorizedFile,
  formatAgentApiErrorForUser,
  getFavoriteByTask,
} from "@/lib/agent-api/client";
import type { PlatformTaskArtifactRef } from "@/lib/agent-events";
import { buildFavoriteSnapshotFromArtifacts } from "@/lib/build-favorite-snapshot";
import { pickPrimaryTaskDataArtifact } from "@/lib/platform-task-artifacts";
import {
  buildTaskResultSheets,
  downloadTargetForSheet,
  sheetSupportsTableCodeToggle,
  type TaskResultSheet,
} from "@/lib/task-result-sheets";
import { cn } from "@/lib/utils";

type AgentTaskResultPanelProps = {
  onClose: () => void;
  artifacts?: PlatformTaskArtifactRef[];
  withFreshToken?: (run: (token: string) => Promise<void>) => Promise<void>;
  bundleDownloadApi?: string | null;
  bundleDownloadName?: string | null;
  zipDownloadApi?: string | null;
  taskId?: string | null;
  /** 展示「最后生成时间」 */
  resultGeneratedAt?: string | null;
};

function effectiveBundleDownloadPath(p: {
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

function safeFilename(name: string | undefined, fallback: string) {
  const n = (name ?? "").trim();
  if (!n) return fallback;
  const base = n.split(/[/\\]/).pop() ?? n;
  return base || fallback;
}

function formatResultDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function AgentTaskResultPanel({
  onClose,
  artifacts,
  withFreshToken,
  bundleDownloadApi,
  bundleDownloadName,
  zipDownloadApi,
  taskId,
  resultGeneratedAt,
}: AgentTaskResultPanelProps) {
  const tid = (taskId ?? "").trim();
  const sheets = useMemo(() => buildTaskResultSheets(artifacts ?? []), [artifacts]);
  const fallbackPrimary = pickPrimaryTaskDataArtifact(artifacts ?? []);
  const useSheetUi = sheets.length > 0;

  const [activeSheetId, setActiveSheetId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"table" | "code">("table");

  useEffect(() => {
    if (sheets.length === 0) {
      setActiveSheetId(null);
      return;
    }
    setActiveSheetId((cur) => {
      if (cur && sheets.some((s) => s.id === cur)) return cur;
      return sheets[0]!.id;
    });
  }, [sheets]);

  const activeSheet: TaskResultSheet | null = useMemo(() => {
    if (!useSheetUi) return null;
    const hit = sheets.find((s) => s.id === activeSheetId);
    return hit ?? sheets[0] ?? null;
  }, [sheets, activeSheetId, useSheetUi]);

  useEffect(() => {
    const sh =
      (activeSheetId && sheets.find((s) => s.id === activeSheetId)) ?? sheets[0] ?? null;
    if (!sh) return;
    setViewMode(sh.csv ? "table" : "code");
  }, [activeSheetId, sheets]);

  const showTableCodeToggle = Boolean(activeSheet && sheetSupportsTableCodeToggle(activeSheet));

  const bundleDownloadPath = effectiveBundleDownloadPath({ bundleDownloadApi, zipDownloadApi, taskId });

  const downloadCurrent = useCallback(() => {
    if (!withFreshToken) return;
    if (useSheetUi && activeSheet) {
      const target = downloadTargetForSheet(activeSheet, viewMode);
      if (target) {
        void withFreshToken(async (token) => {
          const name = safeFilename(target.original_name, "download");
          await downloadAuthorizedFile(token, target.download_api, name);
        });
        return;
      }
    }
    if (!useSheetUi && fallbackPrimary) {
      void withFreshToken(async (token) => {
        await downloadAuthorizedFile(
          token,
          fallbackPrimary.download_api,
          safeFilename(fallbackPrimary.original_name, "download"),
        );
      });
      return;
    }
    if (bundleDownloadPath) {
      void withFreshToken(async (token) => {
        const name =
          (bundleDownloadName ?? "").trim() ||
          (bundleDownloadPath.includes("task_ids=") ? `${tid || "task"}.zip` : "download");
        await downloadAuthorizedFile(token, bundleDownloadPath, name);
      });
    }
  }, [
    activeSheet,
    bundleDownloadName,
    bundleDownloadPath,
    fallbackPrimary,
    tid,
    useSheetUi,
    viewMode,
    withFreshToken,
  ]);

  const canDownloadTop = Boolean(
    withFreshToken &&
      ((useSheetUi && activeSheet && downloadTargetForSheet(activeSheet, viewMode)) ||
        (!useSheetUi && fallbackPrimary) ||
        bundleDownloadPath),
  );

  const primaryForFavorite = fallbackPrimary;

  const [favorited, setFavorited] = useState(false);
  const [favoriteId, setFavoriteId] = useState<string | null>(null);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const refreshFavoriteState = useCallback(async () => {
    if (!withFreshToken || !tid) return;
    try {
      await withFreshToken(async (token) => {
        const r = await getFavoriteByTask(token, tid);
        setFavorited(r.favorited);
        setFavoriteId(r.favorite_id);
      });
    } catch {
      setFavorited(false);
      setFavoriteId(null);
    }
  }, [tid, withFreshToken]);

  useEffect(() => {
    void refreshFavoriteState();
  }, [refreshFavoriteState]);

  const toggleFavorite = async () => {
    if (!withFreshToken || !tid || !primaryForFavorite) {
      setNotice("当前无可收藏的结果文件。");
      return;
    }
    setFavoriteBusy(true);
    setNotice("");
    try {
      if (favorited && favoriteId) {
        await withFreshToken(async (token) => {
          await deleteUserFavorite(token, favoriteId);
        });
        setFavorited(false);
        setFavoriteId(null);
        setNotice("已取消收藏。");
        return;
      }
      const built = await buildFavoriteSnapshotFromArtifacts(withFreshToken, {
        artifacts: artifacts ?? [],
      });
      await withFreshToken(async (token) => {
        await createUserFavorite(token, {
          title: built.title,
          source_task_id: tid,
          snapshot: built.snapshot,
          copy_artifact_id: built.copy_artifact_id ?? null,
        });
      });
      await refreshFavoriteState();
      setNotice("已加入收藏夹。");
    } catch (e) {
      setNotice(formatAgentApiErrorForUser(e));
    } finally {
      setFavoriteBusy(false);
    }
  };

  const dateLine = formatResultDate(resultGeneratedAt ?? undefined);

  return (
    <div className="flex h-full min-h-0 flex-col bg-white" data-testid="agent-preview-panel">
      <div className="flex shrink-0 flex-col gap-1 border-b border-[#e5e7eb] bg-[linear-gradient(180deg,#fafafa,#f4f4f5)] px-3 py-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium text-[#1f2421]">任务执行结果</div>
            {dateLine ? (
              <div className="mt-0.5 text-[11px] text-[#8b9490]">最后生成时间：{dateLine}</div>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
            {showTableCodeToggle ? (
              <div className="mr-1 flex rounded-[10px] border border-[#e5e7eb] bg-[#ececec]/80 p-0.5">
                <button
                  type="button"
                  className={cn(
                    "rounded-[8px] px-2.5 py-1 text-xs font-medium transition",
                    viewMode === "table"
                      ? "bg-white text-[#15803d] shadow-sm"
                      : "text-[#64748b] hover:text-[#334155]",
                  )}
                  onClick={() => setViewMode("table")}
                >
                  表格
                </button>
                <button
                  type="button"
                  className={cn(
                    "rounded-[8px] px-2.5 py-1 text-xs font-medium transition",
                    viewMode === "code"
                      ? "bg-white text-[#15803d] shadow-sm"
                      : "text-[#64748b] hover:text-[#334155]",
                  )}
                  onClick={() => setViewMode("code")}
                >
                  代码
                </button>
              </div>
            ) : null}
            {canDownloadTop ? (
              <Button
                type="button"
                aria-label="下载当前结果"
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-[10px] text-[#64748b]"
                onClick={() => downloadCurrent()}
              >
                <Download className="h-4 w-4" />
              </Button>
            ) : null}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  aria-label="更多"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-[10px] text-[#64748b]"
                >
                  <Ellipsis className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-52 p-1">
                <button
                  type="button"
                  disabled={favoriteBusy || !tid}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-[#f4f4f5] disabled:opacity-50"
                  onClick={() => void toggleFavorite()}
                >
                  <Star className={`h-4 w-4 shrink-0 ${favorited ? "fill-amber-400 text-amber-500" : ""}`} />
                  {favorited ? "取消收藏" : "收藏报告"}
                </button>
              </PopoverContent>
            </Popover>
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
        </div>
      </div>

      {notice ? (
        <div className="border-b border-[#ececec] bg-[#fafaf9] px-3 py-2 text-xs text-[#78716c]">{notice}</div>
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-3 pb-2 pt-2">
        {withFreshToken && useSheetUi && activeSheet ? (
          <TaskResultSheetBody sheet={activeSheet} viewMode={viewMode} withFreshToken={withFreshToken} />
        ) : withFreshToken && !useSheetUi && fallbackPrimary ? (
          <TaskSingleDataArtifactPreview artifact={fallbackPrimary} withFreshToken={withFreshToken} />
        ) : (
          <p className="text-[13px] leading-6 text-[#64748b]">
            暂无数据或报告类结果文件（CSV/JSON/Markdown/HTML/PDF/ChatExcel）可展示。
          </p>
        )}
      </div>

      {useSheetUi && sheets.length > 1 ? (
        <div className="flex shrink-0 gap-1 overflow-x-auto border-t border-[#e5e7eb] bg-white px-2 py-2">
          {sheets.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setActiveSheetId(s.id)}
              className={cn(
                "shrink-0 rounded-lg px-3 py-2 text-left text-xs transition",
                activeSheet?.id === s.id
                  ? "border-b-2 border-[#16a34a] font-medium text-[#15803d]"
                  : "border-b-2 border-transparent text-[#64748b] hover:bg-[#f4f4f5]",
              )}
            >
              <span className="line-clamp-2 max-w-[200px]">{s.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
