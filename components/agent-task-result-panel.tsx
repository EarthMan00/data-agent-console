"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Menu, Star, X } from "@/components/ui/tabler-icons";

import { AutoToast } from "@/components/auto-toast";
import { TaskResultSheetBody } from "@/components/task-result-sheet-body";
import { TaskSingleDataArtifactPreview } from "@/components/task-single-data-preview";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  createUserFavorite,
  deleteUserFavorite,
  downloadAuthorizedFile,
  getFavoriteByTask,
} from "@/lib/agent-api/client";
import type { PlatformTaskArtifactRef } from "@/lib/agent-events";
import { buildFavoriteSnapshotFromArtifacts } from "@/lib/build-favorite-snapshot";
import { artifactDownloadNameForUi, listDownloadableTaskArtifacts, pickPrimaryTaskDataArtifact } from "@/lib/platform-task-artifacts";
import { humanizeTaskErrorMessage } from "@/lib/platform-task-error-copy";
import {
  buildTaskResultSheets,
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
  /** 任务失败时的错误信息 */
  errorMessage?: string | null;
  /** 任务状态（如 FAILED / SUCCESS） */
  taskStatus?: string | null;
};

const FRONTEND_MOCK_TOKEN = "__frontend_mock_token__";

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
    <div className="flex min-w-0 shrink-0 items-stretch border-t border-border bg-fill-hover">
      <Popover open={sheetMenuOpen} onOpenChange={setSheetMenuOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex h-9 w-9 shrink-0 items-center justify-center border-r border-border text-text-secondary transition hover:bg-fill-hover"
            aria-label="全部工作表"
          >
            <Menu className="h-4 w-4" strokeWidth={2} />
          </button>
        </PopoverTrigger>
        <PopoverContent side="top" align="start" className="w-responsive-popover-md p-1">
          <div className="max-h-agent-result overflow-y-auto">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                className={cn(
                  "flex w-full rounded-md px-2 py-2 text-left text-body transition",
                  activeId === t.id
                    ? "bg-success-bg font-medium text-success"
                    : "text-foreground hover:bg-fill-hover",
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
        className="flex min-h-9 min-w-0 flex-1 items-end gap-0 overflow-x-auto overflow-y-hidden px-0.5"
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
                dense ? "text-caption" : "text-body",
                active ? "font-medium text-success" : "text-text-secondary hover:bg-fill-hover",
              )}
            >
              <span className="line-clamp-1 max-w-task-label-fluid">{t.label}</span>
              {active ? (
                <span
                  className="absolute bottom-0 left-2 right-2 h-1 rounded-t-xs bg-success"
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
  errorMessage,
  taskStatus,
}: AgentTaskResultPanelProps) {
  const tid = (taskId ?? "").trim();
  const sheets = useMemo(() => buildTaskResultSheets(artifacts ?? []), [artifacts]);
  const fallbackPrimary = pickPrimaryTaskDataArtifact(artifacts ?? []);
  const useSheetUi = sheets.length > 0;
  const displayErrorMessage = useMemo(
    () => humanizeTaskErrorMessage(errorMessage ?? ""),
    [errorMessage],
  );

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
  const downloadableArtifacts = useMemo(
    () => listDownloadableTaskArtifacts(artifacts ?? []),
    [artifacts],
  );

  /** 多文件打包：编排多步且正在查看某一子任务时只打该任务，否则用整轮 bundle */
  const multiFileDownloadPath = useMemo(() => {
    if (subtaskResultTabs && subtaskResultTabs.length > 1 && tid) {
      return `/api/tasks/${encodeURIComponent(tid)}/download`;
    }
    return bundleDownloadPath ?? (tid ? `/api/tasks/${encodeURIComponent(tid)}/download` : null);
  }, [bundleDownloadPath, subtaskResultTabs, tid]);

  const downloadCurrent = useCallback(() => {
    if (!withFreshToken) return;

    if (downloadableArtifacts.length > 1) {
      if (!multiFileDownloadPath) return;
      void withFreshToken(async (token) => {
        const name = (bundleDownloadName ?? "").trim() || `${tid || "task"}.zip`;
        await downloadAuthorizedFile(token, multiFileDownloadPath, name);
      });
      return;
    }

    if (downloadableArtifacts.length === 1) {
      const target = downloadableArtifacts[0]!;
      void withFreshToken(async (token) => {
        await downloadAuthorizedFile(
          token,
          target.download_api,
          safeFilename(artifactDownloadNameForUi(target.original_name), "download"),
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
    bundleDownloadName,
    bundleDownloadPath,
    downloadableArtifacts,
    multiFileDownloadPath,
    tid,
    withFreshToken,
  ]);

  const canDownloadTop = Boolean(
    withFreshToken &&
      (downloadableArtifacts.length > 0 || bundleDownloadPath),
  );

  const primaryForFavorite = fallbackPrimary;

  const [favorited, setFavorited] = useState(false);
  const [favoriteId, setFavoriteId] = useState<string | null>(null);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastVariant, setToastVariant] = useState<"default" | "error">("default");

  const showToast = useCallback((message: string, variant: "default" | "error" = "default") => {
    setToastVariant(variant);
    setToastMessage(message);
  }, []);

  const refreshFavoriteState = useCallback(async () => {
    if (!withFreshToken || !tid) return;
    try {
      await withFreshToken(async (token) => {
        if (token === FRONTEND_MOCK_TOKEN) return;
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
      showToast("当前无可收藏的结果文件。", "error");
      return;
    }
    setFavoriteBusy(true);
    try {
      if (favorited && favoriteId) {
        await withFreshToken(async (token) => {
          if (token === FRONTEND_MOCK_TOKEN) return;
          await deleteUserFavorite(token, favoriteId);
        });
        setFavorited(false);
        setFavoriteId(null);
        showToast("已取消收藏");
        return;
      }
      const built = await buildFavoriteSnapshotFromArtifacts(withFreshToken, {
        artifacts: artifacts ?? [],
      });
      let createdFavoriteId: string | null = null;
      await withFreshToken(async (token) => {
        if (token === FRONTEND_MOCK_TOKEN) {
          createdFavoriteId = `mock-favorite-${tid}`;
          return;
        }
        const created = await createUserFavorite(token, {
          title: built.title,
          source_task_id: tid,
          snapshot: built.snapshot,
          copy_artifact_id: built.copy_artifact_id ?? null,
        });
        createdFavoriteId = created.id || null;
      });
      setFavorited(true);
      setFavoriteId(createdFavoriteId);
      showToast("收藏成功，可前往收藏夹查看");
    } catch {
      showToast("收藏失败，请稍后重试", "error");
    } finally {
      setFavoriteBusy(false);
    }
  };

  const dateLine = formatResultDate(resultGeneratedAt ?? undefined);

  const showSubtaskSheetBar = Boolean(subtaskResultTabs && subtaskResultTabs.length > 1 && onSubtaskSelect);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col bg-bg-surface" data-testid="agent-preview-panel">
      <AutoToast
        message={toastMessage}
        variant={toastVariant}
        onDismiss={() => {
          setToastMessage(null);
          setToastVariant("default");
        }}
        durationMs={2200}
      />
      <div className="flex shrink-0 flex-col gap-1 border-b border-border bg-bg-surface px-3 py-2 sm:px-4">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-body font-medium text-foreground">任务执行结果</div>
            {dateLine ? (
              <div className="mt-0.5 text-caption text-text-tertiary">最后生成时间：{dateLine}</div>
            ) : null}
          </div>
          <div className="flex max-w-agent-panel-controls shrink-0 flex-wrap items-center justify-end gap-1 sm:max-w-none">
            {showTableCodeToggle ? (
              <div className="mr-1 flex rounded-control border border-border bg-fill-hover p-0.5">
                <button
                  type="button"
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition",
                    viewMode === "table"
                      ? "bg-bg-surface text-foreground shadow-none"
                      : "text-text-tertiary hover:text-foreground",
                  )}
                  onClick={() => setViewMode("table")}
                >
                  表格
                </button>
                <button
                  type="button"
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition",
                    viewMode === "code"
                      ? "bg-bg-surface text-foreground shadow-none"
                      : "text-text-tertiary hover:text-foreground",
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
                className="h-8 w-8 rounded-control text-text-tertiary"
                onClick={() => downloadCurrent()}
              >
                <Download className="h-4 w-4" />
              </Button>
            ) : null}
            <Button
              type="button"
              aria-label={favorited ? "取消收藏报告" : "收藏报告"}
              variant="outline"
              size="sm"
              disabled={favoriteBusy || !tid}
              className="h-8 shrink-0 gap-1.5 rounded-control border-border bg-bg-surface px-2.5 text-xs text-foreground hover:bg-fill-hover"
              onClick={() => void toggleFavorite()}
            >
              <Star
                className={cn(
                  "h-4 w-4 shrink-0",
                  favorited ? "fill-warning text-warning" : "text-text-tertiary",
                )}
              />
              <span>{favorited ? "取消收藏" : "收藏报告"}</span>
            </Button>
            <Button
              type="button"
              aria-label="关闭任务结果"
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-control text-text-tertiary"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {(taskStatus === "FAILED" && displayErrorMessage) ? (
          <div className="shrink-0 border-b border-danger-border bg-danger-bg px-3 py-3 sm:px-4">
            <div className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0 text-sm font-semibold text-danger">执行失败</span>
            </div>
            <p className="mt-1.5 whitespace-pre-wrap text-body leading-relaxed text-danger">
              {displayErrorMessage}
            </p>
          </div>
        ) : null}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto px-3 pt-2 sm:px-4">
          {withFreshToken && useSheetUi && activeSheet ? (
            <TaskResultSheetBody sheet={activeSheet} viewMode={viewMode} withFreshToken={withFreshToken} />
          ) : withFreshToken && !useSheetUi && fallbackPrimary ? (
            <TaskSingleDataArtifactPreview artifact={fallbackPrimary} withFreshToken={withFreshToken} />
          ) : taskStatus === "FAILED" ? (
            <p className="text-body leading-6 text-text-secondary">
              任务未产生可展示的数据文件（CSV/JSON 等），详情请查看上方错误信息。
            </p>
          ) : (
            <p className="text-body leading-6 text-text-secondary">
              暂无数据或报告类结果文件（CSV/JSON/Markdown/HTML/PDF 等）可展示。
            </p>
          )}
        </div>

        {/* Excel 式底部 sheet：截图同款浅灰条 + 绿色激活下划线；多子任务时栏在最底，其上方可为同任务多文件 */}
        <div className="flex shrink-0 flex-col shadow-hairline">
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
