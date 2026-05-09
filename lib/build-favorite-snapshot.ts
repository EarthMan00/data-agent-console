import { fetchAuthorizedText } from "@/lib/agent-api/client";
import type { PlatformTaskArtifactRef } from "@/lib/agent-events";
import { CHATEXCEL_RESULT_RE, LINKFOX_RESULT_RE } from "@/lib/platform-task-artifacts";
import { buildTaskResultSheets } from "@/lib/task-result-sheets";

const MAX_INLINE_CHARS = 1_500_000;

function extOf(name: string) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

export type BuildFavoriteSnapshotResult = {
  title: string;
  snapshot: Record<string, unknown>;
  /** PDF 等二进制：服务端从任务产物复制副本（仅单 PDF 收藏） */
  copy_artifact_id?: string;
};

/** 与任务结果「多 sheet」对齐的收藏快照行（version 2） */
export type FavoriteSheetSnapshotRow = {
  id: string;
  label: string;
  csv_text?: string;
  json_text?: string;
  primary_kind?: string;
  primary_text?: string;
  primary_original_name?: string;
  /** 多 sheet 场景下 PDF 仅存占位说明（服务端仅支持单个 copy 字段） */
  primary_pdf_placeholder?: boolean;
};

function cardPreviewFrom(text: string, limit = 280): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= limit ? t : `${t.slice(0, limit)}…`;
}

function truncateInline(s: string): string {
  if (s.length <= MAX_INLINE_CHARS) return s;
  return `${s.slice(0, MAX_INLINE_CHARS)}\n\n…（内容过长已截断）`;
}

function primaryKindFromFilename(name: string): string {
  const ext = extOf(name);
  if (ext === "csv") return "csv";
  if (ext === "json" || ext === "jsonl") return "json";
  if (ext === "md" || ext === "markdown") return "md";
  if (ext === "html" || ext === "htm") return "html";
  const base = (name ?? "").trim();
  if (CHATEXCEL_RESULT_RE.test(base)) return "chatexcel";
  if (LINKFOX_RESULT_RE.test(base)) return "linkfox";
  return "text";
}

/**
 * 基于当前任务结果面板的主产物构建收藏快照（不含会话消息）。
 * - 单 PDF：沿用 version 1 + copy_artifact_id。
 * - 其余：version 2 + sheets[]，与任务结果多 sheet / 表格·代码切换对齐。
 */
export async function buildFavoriteSnapshotFromArtifacts(
  withFreshToken: (run: (token: string) => Promise<void>) => Promise<void>,
  opts: { artifacts: PlatformTaskArtifactRef[] },
): Promise<BuildFavoriteSnapshotResult> {
  const sheetsBuilt = buildTaskResultSheets(opts.artifacts);
  if (sheetsBuilt.length === 0) {
    throw new Error("暂无可收藏的数据或报告文件");
  }

  if (sheetsBuilt.length === 1 && sheetsBuilt[0].primary) {
    const primary = sheetsBuilt[0].primary!;
    const ext = extOf(primary.original_name);
    if (ext === "pdf") {
      const fileLabel = (primary.original_name ?? "").trim() || "任务结果";
      const baseTitle = `收藏 · ${fileLabel.replace(/\.[^./]+$/, "")}`;
      return {
        title: baseTitle,
        snapshot: {
          version: 1,
          result_kind: "pdf",
          original_name: primary.original_name,
          card_preview: "PDF 文件（已保存副本，可随时下载）",
          display_title: fileLabel,
        },
        copy_artifact_id: primary.artifact_id,
      };
    }
  }

  const sheetRows: FavoriteSheetSnapshotRow[] = [];
  let previewSource = "";

  await withFreshToken(async (token) => {
    for (const sh of sheetsBuilt) {
      const row: FavoriteSheetSnapshotRow = { id: sh.id, label: sh.label };

      if (sh.csv && sh.json) {
        row.csv_text = truncateInline(await fetchAuthorizedText(token, sh.csv.download_api));
        row.json_text = truncateInline(await fetchAuthorizedText(token, sh.json.download_api));
        if (!previewSource) previewSource = row.csv_text ?? row.json_text ?? "";
      } else if (sh.csv) {
        row.csv_text = truncateInline(await fetchAuthorizedText(token, sh.csv.download_api));
        if (!previewSource) previewSource = row.csv_text ?? "";
      } else if (sh.json) {
        row.json_text = truncateInline(await fetchAuthorizedText(token, sh.json.download_api));
        if (!previewSource) previewSource = row.json_text ?? "";
      } else if (sh.primary) {
        const name = sh.primary.original_name ?? "";
        const ext = extOf(name);
        if (ext === "pdf") {
          row.primary_kind = "pdf";
          row.primary_original_name = name;
          row.primary_pdf_placeholder = true;
        } else {
          const text = truncateInline(await fetchAuthorizedText(token, sh.primary.download_api));
          row.primary_text = text;
          row.primary_original_name = name;
          row.primary_kind = primaryKindFromFilename(name);
          if (!previewSource) previewSource = text;
        }
      }

      sheetRows.push(row);
    }
  });

  const baseTitle = `收藏 · ${sheetRows[0]?.label ?? "任务结果"}`;

  return {
    title: baseTitle,
    snapshot: {
      version: 2,
      sheets: sheetRows,
      card_preview: cardPreviewFrom(previewSource || "收藏结果"),
      display_title: sheetRows[0]?.label ?? baseTitle,
    },
  };
}
