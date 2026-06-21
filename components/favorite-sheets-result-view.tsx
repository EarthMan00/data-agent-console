"use client";

import { useMemo, useState } from "react";

import { FavoriteSnapshotView } from "@/components/favorite-snapshot-view";
import { InlineJsonArtifactBlock } from "@/components/task-result-sheet-body";
import { LazyCsvArtifactTable } from "@/components/lazy-csv-artifact-table";
import type { FavoriteSheetSnapshotRow } from "@/lib/build-favorite-snapshot";
import { cn } from "@/lib/utils";

function favoriteSheetSupportsTableCodeToggle(s: FavoriteSheetSnapshotRow): boolean {
  return Boolean(s.csv_text && s.json_text);
}

function defaultViewModeForFavoriteSheet(sheet: FavoriteSheetSnapshotRow | undefined): "table" | "code" {
  if (sheet?.json_text && !sheet.csv_text) return "code";
  return "table";
}

function FavoriteSheetPane({
  sheet,
  viewMode,
  title,
}: {
  sheet: FavoriteSheetSnapshotRow | undefined;
  viewMode: "table" | "code";
  title?: string;
}) {
  if (!sheet) {
    return <p className="text-body leading-6 text-text-secondary">暂无可展示内容。</p>;
  }

  if (sheet.primary_pdf_placeholder && sheet.primary_kind === "pdf") {
    return (
      <FavoriteSnapshotView
        snapshot={{
          version: 1,
          result_kind: "pdf",
          original_name: sheet.primary_original_name ?? "",
          card_preview: "",
          content_text: "",
        }}
        title={title}
      />
    );
  }

  if (sheet.csv_text && sheet.json_text) {
    if (viewMode === "table") {
      return <LazyCsvArtifactTable inlineUtf8Text={sheet.csv_text} sidePanel />;
    }
    return <InlineJsonArtifactBlock text={sheet.json_text} />;
  }

  if (sheet.csv_text) {
    return <LazyCsvArtifactTable inlineUtf8Text={sheet.csv_text} sidePanel />;
  }

  if (sheet.json_text) {
    return <InlineJsonArtifactBlock text={sheet.json_text} />;
  }

  if (sheet.primary_text != null && sheet.primary_kind) {
    return (
      <FavoriteSnapshotView
        snapshot={{
          version: 1,
          result_kind: sheet.primary_kind,
          content_text: sheet.primary_text,
          original_name: sheet.primary_original_name ?? "",
          card_preview: "",
        }}
        title={title}
      />
    );
  }

  return <p className="text-body leading-6 text-text-secondary">暂无可展示内容。</p>;
}

export function FavoriteSheetsResultView({
  snapshot,
  title,
}: {
  snapshot: Record<string, unknown>;
  title?: string;
}) {
  const sheets = useMemo(() => {
    const v = snapshot.version;
    const raw = snapshot.sheets;
    if (v !== 2 || !Array.isArray(raw) || raw.length === 0) return null;
    return raw as FavoriteSheetSnapshotRow[];
  }, [snapshot]);

  const [activeSheetId, setActiveSheetId] = useState("");
  const [viewMode, setViewMode] = useState<"table" | "code">("table");

  const activeSheet = useMemo(() => {
    if (!sheets?.length) return undefined;
    return sheets.find((s) => s.id === activeSheetId) ?? sheets[0];
  }, [sheets, activeSheetId]);
  const showTableCodeToggle = Boolean(activeSheet && favoriteSheetSupportsTableCodeToggle(activeSheet));
  const effectiveViewMode = showTableCodeToggle ? viewMode : defaultViewModeForFavoriteSheet(activeSheet);

  if (!sheets) {
    return (
      <div className="p-4">
        <FavoriteSnapshotView snapshot={snapshot} title={title} />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {showTableCodeToggle ? (
        <div className="flex shrink-0 flex-col gap-1 border-b border-border bg-surface-gradient px-3 py-2">
          <div className="flex items-start justify-end gap-2">
            <div className="mr-1 flex rounded-control border border-border bg-border-subtle/80 p-0.5">
              <button
                type="button"
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition",
                  viewMode === "table"
                    ? "bg-bg-surface text-primary shadow-sm"
                    : "text-text-secondary hover:text-text-secondary",
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
                    ? "bg-bg-surface text-primary shadow-sm"
                    : "text-text-secondary hover:text-text-secondary",
                )}
                onClick={() => setViewMode("code")}
              >
                代码
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-3 pb-2",
          showTableCodeToggle ? "pt-2" : "pt-3",
        )}
      >
        <FavoriteSheetPane sheet={activeSheet} viewMode={effectiveViewMode} title={title} />
      </div>

      {sheets.length > 1 ? (
        <div className="flex shrink-0 gap-1 overflow-x-auto border-t border-border bg-bg-surface px-2 py-2">
          {sheets.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setActiveSheetId(s.id);
                setViewMode(defaultViewModeForFavoriteSheet(s));
              }}
              className={cn(
                "shrink-0 rounded-lg px-3 py-2 text-left text-xs transition",
                activeSheet?.id === s.id
                  ? "border-b-2 border-primary font-medium text-primary"
                  : "border-b-2 border-transparent text-text-secondary hover:bg-fill-hover",
              )}
            >
              <span className="line-clamp-2 max-w-52">{s.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
