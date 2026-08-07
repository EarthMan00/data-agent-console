"use client";

import { useCallback, useEffect, useMemo, useState, type UIEvent } from "react";
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
import {
  artifactDownloadNameForUi,
  filterArtifactsForTaskResultPanel,
  listDownloadableTaskArtifacts,
  pickPrimaryTaskDataArtifact,
  projectTaskArtifactsForUi,
  resultLabelForUi,
} from "@/lib/platform-task-artifacts";
import {
  buildTaskResultSheets,
  downloadTargetForSheet,
  sheetSupportsTableCodeToggle,
  type TaskResultSheet,
} from "@/lib/task-result-sheets";
import { cn } from "@/lib/utils";

export type AgentTaskResultGroup = {
  /** Stable step identity used to keep the selected result tab in sync. */
  id: string;
  /** Public step name used when Durable Round artifacts have anonymous names. */
  label: string;
  artifacts: PlatformTaskArtifactRef[];
};

type AgentTaskResultPanelProps = {
  onClose: () => void;
  artifacts?: PlatformTaskArtifactRef[];
  /** All result-bearing steps in the current Round. */
  resultGroups?: AgentTaskResultGroup[];
  /** Step whose result should be selected when the panel opens or changes. */
  activeResultGroupId?: string | null;
  withFreshToken?: (run: (token: string) => Promise<void>) => Promise<void>;
  /** 收藏身份独立于 Round artifact 的 owner-scoped 下载地址。 */
  favoriteSourceTaskId?: string | null;
  /** 任务状态（如 FAILED / SUCCESS） */
  taskStatus?: string | null;
  /** 已公开化的步骤名称，用于匿名 Round 产物的可读命名。 */
  resultLabel?: string | null;
};

function safeFilename(name: string | undefined, fallback: string) {
  const n = (name ?? "").trim();
  if (!n) return fallback;
  const base = n.split(/[/\\]/).pop() ?? n;
  return base || fallback;
}

/** 底部横向 Excel / Google Sheets 风格工作表标签条 */
function ExcelStyleSheetTabBar({
  tabs,
  activeId,
  onSelect,
}: {
  tabs: { id: string; label: string }[];
  activeId: string | null;
  onSelect: (id: string) => void;
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
                    ? "bg-fill-active font-medium text-primary"
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
                "text-body",
                active ? "font-medium text-primary" : "text-text-secondary hover:bg-fill-hover",
              )}
            >
              <span className="line-clamp-1 max-w-task-label-fluid">{t.label}</span>
              {active ? (
                <span
                  className="absolute bottom-0 left-2 right-2 h-1 rounded-t-xs bg-primary"
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
  resultGroups,
  activeResultGroupId,
  withFreshToken,
  favoriteSourceTaskId,
  taskStatus,
  resultLabel,
}: AgentTaskResultPanelProps) {
  const favoriteIdentity = (favoriteSourceTaskId ?? "").trim();
  const sourceGroups = useMemo<AgentTaskResultGroup[]>(() => {
    if (resultGroups && resultGroups.length > 0) return resultGroups;
    return artifacts && artifacts.length > 0
      ? [
          {
            id: "default",
            label: resultLabel ?? "",
            artifacts,
          },
        ]
      : [];
  }, [artifacts, resultGroups, resultLabel]);

  const projectedGroups = useMemo(
    () =>
      sourceGroups
        .map((group) => ({
          ...group,
          artifacts: projectTaskArtifactsForUi(
            filterArtifactsForTaskResultPanel(group.artifacts),
            { displayLabel: group.label },
          ),
        }))
        .filter((group) => group.artifacts.length > 0),
    [sourceGroups],
  );

  const publicArtifacts = useMemo(
    () => projectedGroups.flatMap((group) => group.artifacts),
    [projectedGroups],
  );

  const sheets = useMemo(() => {
    if (projectedGroups.length <= 1) {
      return buildTaskResultSheets(publicArtifacts);
    }

    // Build each step independently so identically named files from two
    // steps cannot be paired across groups. The offset preserves the existing
    // newest-result-first ordering once the groups are combined.
    const GROUP_SORT_OFFSET = 100_000;
    return projectedGroups
      .flatMap((group, groupIndex) => {
        const groupSheets = buildTaskResultSheets(group.artifacts);
        return groupSheets.map((sheet) => ({
          ...sheet,
          label:
            groupSheets.length === 1 && group.label.trim()
              ? resultLabelForUi(group.label)
              : sheet.label,
          sortKey: groupIndex * GROUP_SORT_OFFSET + sheet.sortKey,
        }));
      })
      .sort((left, right) => right.sortKey - left.sortKey);
  }, [projectedGroups, publicArtifacts]);

  const preferredSheetId = useMemo(() => {
    if (!activeResultGroupId) return null;
    const group = projectedGroups.find((item) => item.id === activeResultGroupId);
    if (!group) return null;
    const groupArtifactIds = new Set(group.artifacts.map((artifact) => artifact.artifact_id));
    return (
      sheets.find(
        (sheet) =>
          groupArtifactIds.has(sheet.id) ||
          (sheet.csv?.artifact_id ? groupArtifactIds.has(sheet.csv.artifact_id) : false) ||
          (sheet.json?.artifact_id ? groupArtifactIds.has(sheet.json.artifact_id) : false) ||
          (sheet.primary?.artifact_id ? groupArtifactIds.has(sheet.primary.artifact_id) : false),
      )?.id ?? null
    );
  }, [activeResultGroupId, projectedGroups, sheets]);

  const fallbackPrimary = useMemo(
    () => pickPrimaryTaskDataArtifact(publicArtifacts),
    [publicArtifacts],
  );
  const useSheetUi = sheets.length > 0;
  const taskFailed = (taskStatus ?? "").toUpperCase() === "FAILED";

  const [activeSheetId, setActiveSheetId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"table" | "code">("table");

  useEffect(() => {
    if (sheets.length === 0) {
      setActiveSheetId(null);
      return;
    }
    setActiveSheetId((cur) => {
      if (preferredSheetId && sheets.some((s) => s.id === preferredSheetId)) {
        return preferredSheetId;
      }
      if (cur && sheets.some((s) => s.id === cur)) return cur;
      return sheets[0]!.id;
    });
  }, [preferredSheetId, sheets]);

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

  const downloadableArtifacts = useMemo(
    () => listDownloadableTaskArtifacts(publicArtifacts),
    [publicArtifacts],
  );

  const activeArtifactDownloadTarget = useMemo(() => {
    const target = activeSheet ? downloadTargetForSheet(activeSheet, viewMode) : fallbackPrimary;
    if (!target) return downloadableArtifacts[0] ?? null;
    return (
      downloadableArtifacts.find((artifact) => artifact.artifact_id === target.artifact_id) ??
      downloadableArtifacts[0] ??
      null
    );
  }, [activeSheet, downloadableArtifacts, fallbackPrimary, viewMode]);

  const downloadCurrent = useCallback(() => {
    if (!withFreshToken || !activeArtifactDownloadTarget) return;
    void withFreshToken(async (token) => {
      await downloadAuthorizedFile(
        token,
        activeArtifactDownloadTarget.download_api,
        safeFilename(
          artifactDownloadNameForUi(
            activeArtifactDownloadTarget.original_name,
            activeArtifactDownloadTarget.artifact_type,
          ),
          "download",
        ),
      );
    });
  }, [
    activeArtifactDownloadTarget,
    withFreshToken,
  ]);

  const canDownloadTop = Boolean(withFreshToken && activeArtifactDownloadTarget);

  const primaryForFavorite = fallbackPrimary;

  const [favorited, setFavorited] = useState(false);
  const [favoriteId, setFavoriteId] = useState<string | null>(null);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastVariant, setToastVariant] = useState<"default" | "error">("default");
  const [contentScrolled, setContentScrolled] = useState(false);

  const showToast = useCallback((message: string, variant: "default" | "error" = "default") => {
    setToastVariant(variant);
    setToastMessage(message);
  }, []);

  const refreshFavoriteState = useCallback(async () => {
    if (!withFreshToken || !favoriteIdentity) return;
    try {
      await withFreshToken(async (token) => {
        const r = await getFavoriteByTask(token, favoriteIdentity);
        setFavorited(r.favorited);
        setFavoriteId(r.favorite_id);
      });
    } catch {
      setFavorited(false);
      setFavoriteId(null);
    }
  }, [favoriteIdentity, withFreshToken]);

  useEffect(() => {
    void refreshFavoriteState();
  }, [refreshFavoriteState]);

  const toggleFavorite = async () => {
    if (!withFreshToken || !favoriteIdentity || !primaryForFavorite) {
      showToast("当前无可收藏的结果文件。", "error");
      return;
    }
    setFavoriteBusy(true);
    try {
      if (favorited && favoriteId) {
        await withFreshToken(async (token) => {
          await deleteUserFavorite(token, favoriteId);
        });
        setFavorited(false);
        setFavoriteId(null);
        showToast("已取消收藏");
        return;
      }
      const built = await buildFavoriteSnapshotFromArtifacts(withFreshToken, {
        artifacts: publicArtifacts,
      });
      let createdFavoriteId: string | null = null;
      await withFreshToken(async (token) => {
        const created = await createUserFavorite(token, {
          title: built.title,
          source_task_id: favoriteIdentity,
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

  const handleContentScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    setContentScrolled(event.currentTarget.scrollTop > 0);
  }, []);

  useEffect(() => {
    setContentScrolled(false);
  }, [activeSheet?.id, taskStatus]);

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
      <div
        data-testid="agent-result-panel-header"
        className="relative z-layer-base flex shrink-0 flex-col gap-1 bg-bg-surface px-3 py-2 sm:px-4"
        style={{
          boxShadow: contentScrolled ? "0 1px 0 var(--color-border-1)" : "none",
        }}
      >
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-body font-medium text-foreground">任务执行结果</div>
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
              disabled={favoriteBusy || !favoriteIdentity}
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
        <div
          data-testid="agent-result-scroll-region"
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto px-3 pt-2 sm:px-4"
          onScroll={handleContentScroll}
        >
          {withFreshToken && useSheetUi && activeSheet ? (
            <TaskResultSheetBody
              sheet={activeSheet}
              viewMode={viewMode}
              withFreshToken={withFreshToken}
              onPreviewScrollChange={setContentScrolled}
            />
          ) : withFreshToken && !useSheetUi && fallbackPrimary ? (
            <TaskSingleDataArtifactPreview
              artifact={fallbackPrimary}
              withFreshToken={withFreshToken}
              onPreviewScrollChange={setContentScrolled}
            />
          ) : taskFailed ? (
            <p className="text-body leading-6 text-text-secondary">
              任务未产生可展示的数据文件（CSV/JSON 等），详情请查看上方错误信息。
            </p>
          ) : (
            <p className="text-body leading-6 text-text-secondary">
              暂无数据或报告类结果文件（CSV/JSON/Markdown/HTML/PDF 等）可展示。
            </p>
          )}
        </div>

        {/* Excel 式底部 sheet：浅灰条 + 主色激活下划线。 */}
        <div className="flex shrink-0 flex-col shadow-hairline">
          {useSheetUi && sheets.length > 1 ? (
            <ExcelStyleSheetTabBar
              tabs={sheets.map((s) => ({ id: s.id, label: s.label }))}
              activeId={activeSheet?.id ?? null}
              onSelect={(id) => setActiveSheetId(id)}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
