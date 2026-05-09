"use client";

import { useEffect, useMemo, useState } from "react";

import { FavoriteSnapshotView } from "@/components/favorite-snapshot-view";
import { InlineJsonArtifactBlock } from "@/components/task-result-sheet-body";
import { LazyCsvArtifactTable } from "@/components/lazy-csv-artifact-table";
import type { FavoriteSheetSnapshotRow } from "@/lib/build-favorite-snapshot";
import { cn } from "@/lib/utils";

function favoriteSheetSupportsTableCodeToggle(s: FavoriteSheetSnapshotRow): boolean {
  return Boolean(s.csv_text && s.json_text);
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
    return <p className="text-[13px] leading-6 text-[#64748b]">暂无可展示内容。</p>;
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

  return <p className="text-[13px] leading-6 text-[#64748b]">暂无可展示内容。</p>;
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

  useEffect(() => {
    if (!sheets?.length) return;
    setActiveSheetId((cur) => {
      if (cur && sheets.some((s) => s.id === cur)) return cur;
      return sheets[0]!.id;
    });
  }, [sheets]);

  const activeSheet = useMemo(() => {
    if (!sheets?.length) return undefined;
    return sheets.find((s) => s.id === activeSheetId) ?? sheets[0];
  }, [sheets, activeSheetId]);

  useEffect(() => {
    const sh = activeSheet;
    if (!sh) return;
    if (sh.csv_text && sh.json_text) setViewMode("table");
    else if (sh.json_text && !sh.csv_text) setViewMode("code");
    else setViewMode("table");
  }, [activeSheet]);

  if (!sheets) {
    return (
      <div className="p-4">
        <FavoriteSnapshotView snapshot={snapshot} title={title} />
      </div>
    );
  }

  const showTableCodeToggle = Boolean(activeSheet && favoriteSheetSupportsTableCodeToggle(activeSheet));

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {showTableCodeToggle ? (
        <div className="flex shrink-0 flex-col gap-1 border-b border-[#e5e7eb] bg-[linear-gradient(180deg,#fafafa,#f4f4f5)] px-3 py-2">
          <div className="flex items-start justify-end gap-2">
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
          </div>
        </div>
      ) : null}

      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-3 pb-2",
          showTableCodeToggle ? "pt-2" : "pt-3",
        )}
      >
        <FavoriteSheetPane sheet={activeSheet} viewMode={viewMode} title={title} />
      </div>

      {sheets.length > 1 ? (
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
