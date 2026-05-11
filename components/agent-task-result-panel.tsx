"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Ellipsis, Menu, Star, X } from "lucide-react";

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

export type AgentTaskSubtaskTab = {
  taskId: string;
  /** 例如「步骤 2」 */
  label: string;
};

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
  /** 编排多步且多步有表格类结果时：底部 Excel 式 sheet 页签（调用方保证后执行的在前面） */
  subtaskResultTabs?: AgentTaskSubtaskTab[];
  activeSubtaskTaskId?: string | null;
  onSubtaskSelect?: (taskId: string) => void;
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

/** 底部横向 Excel / Google Sheets 风格工作表标签条 */
function ExcelStyleSheetTabBar({
  tabs,
  activeId,
  onSelect,
  dense,
}: {
  tabs: { id: string; label: string }[];
  activeId: string | null;
  onSelect: (id: string) => void;
  /** 同一轮下还存在「子任务」底栏时，文件层略紧凑 */
  dense?: boolean;
}) {
  const [sheetMenuOpen, setSheetMenuOpen] = useState(false);

  if (tabs.length <= 1) return null;

  return (
    <div className="flex shrink-0 items-stretch border-t border-[#dadce0] bg-[#f1f3f4]">
      <Popover open={sheetMenuOpen} onOpenChange={setSheetMenuOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex h-9 w-9 shrink-0 items-center justify-center border-r border-[#dadce0] text-[#5f6368] transition hover:bg-black/[0.06]"
            aria-label="全部工作表"
          >
            <Menu className="h-4 w-4" strokeWidth={2} />
          </button>
        </PopoverTrigger>
        <PopoverContent side="top" align="start" className="w-[min(100vw-2rem,17rem)] p-1">
          <div className="max-h-[min(60vh,320px)] overflow-y-auto">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                className={cn(
                  "flex w-full rounded-md px-2 py-2 text-left text-[13px] transition",
                  activeId === t.id
                    ? "bg-[#e6f4ea] font-medium text-[#15803d]"
                    : "text-[#3c4043] hover:bg-[#e8eaed]",
                )}
                onClick={() => {
                  onSelect(t.id);
                  setSheetMenuOpen(false);
                }}
              >
                <span className="line-clamp-3">{t.label}</span>
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
      <div
        className="flex min-h-9 min-w-0 flex-1 items-end gap-0 overflow-x-auto px-0.5"
        role="tablist"
        aria-label="工作表"
      >
        {tabs.map((t) => {
          const active = activeId === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onSelect(t.id)}
              className={cn(
                "relative shrink-0 px-3 pb-2 pt-1.5 text-left leading-tight transition",
                dense ? "text-[12px]" : "text-[13px]",
                active ? "font-medium text-[#15803d]" : "text-[#5f6368] hover:bg-black/[0.04]",
              )}
            >
              <span className="line-clamp-1 max-w-[min(220px,40vw)]">{t.label}</span>
              {active ? (
                <span
                  className="absolute bottom-0 left-2 right-2 h-[3px] rounded-t-[2px] bg-[#15803d]"
                  aria-hidden
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
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
  subtaskResultTabs,
  activeSubtaskTaskId,
  onSubtaskSelect,
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

  const showSubtaskSheetBar = Boolean(subtaskResultTabs && subtaskResultTabs.length > 1 && onSubtaskSelect);

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

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-3 pt-2">
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

        {/* Excel 式底部 sheet：截图同款浅灰条 + 绿色激活下划线；多子任务时栏在最底，其上方可为同任务多文件 */}
        <div className="flex shrink-0 flex-col shadow-[0_-1px_0_#dadce0]">
          {useSheetUi && sheets.length > 1 ? (
            <ExcelStyleSheetTabBar
              tabs={sheets.map((s) => ({ id: s.id, label: s.label }))}
              activeId={activeSheet?.id ?? null}
              onSelect={(id) => setActiveSheetId(id)}
              dense={showSubtaskSheetBar}
            />
          ) : null}
          {showSubtaskSheetBar ? (
            <ExcelStyleSheetTabBar
              tabs={subtaskResultTabs!.map((t) => ({ id: t.taskId, label: t.label }))}
              activeId={activeSubtaskTaskId ?? null}
              onSelect={(id) => onSubtaskSelect!(id)}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
