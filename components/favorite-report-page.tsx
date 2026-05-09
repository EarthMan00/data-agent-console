"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Download, FileSpreadsheet, Loader2 } from "lucide-react";
import Link from "next/link";
import { FavoriteSheetsResultView } from "@/components/favorite-sheets-result-view";
import { useOptionalPlatformAgent } from "@/components/platform-agent-provider";
import { RequirePlatformLogin } from "@/components/require-platform-login";
import { Button } from "@/components/ui/button";
import {
  downloadAuthorizedFile,
  formatAgentApiErrorForUser,
  getUserFavorite,
} from "@/lib/agent-api/client";

function formatResultDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function FavoriteReportPage({ favoriteId }: { favoriteId: string }) {
  const platformAgent = useOptionalPlatformAgent();
  const [title, setTitle] = useState("");
  const [snapshot, setSnapshot] = useState<Record<string, unknown> | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!platformAgent?.withFreshToken || !favoriteId.trim()) return;
    setBusy(true);
    setError("");
    try {
      await platformAgent.withFreshToken(async (token) => {
        const d = await getUserFavorite(token, favoriteId.trim());
        setTitle(d.title);
        setSnapshot(d.snapshot);
        setGeneratedAt(d.updated_at ?? d.created_at ?? null);
      });
    } catch (e) {
      setError(formatAgentApiErrorForUser(e));
      setSnapshot(null);
    } finally {
      setBusy(false);
    }
  }, [favoriteId, platformAgent]);

  useEffect(() => {
    void load();
  }, [load]);

  const onDownload = () => {
    if (!platformAgent?.withFreshToken) return;
    void platformAgent.withFreshToken(async (token) => {
      await downloadAuthorizedFile(
        token,
        `/api/user/favorites/${encodeURIComponent(favoriteId)}/download`,
        `${(title || "report").replace(/[/\\?%*:|"<>]/g, "_")}.bin`,
      );
    });
  };

  const dateLine = formatResultDate(generatedAt ?? undefined);

  return (
    <RequirePlatformLogin>
      <div className="flex min-h-screen flex-col bg-[#f8fafc]">
        <header className="sticky top-0 z-10 flex shrink-0 items-center justify-between gap-3 border-b border-[#e5e7eb] bg-white px-4 py-3 shadow-sm sm:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0 rounded-[10px]" asChild>
              <Link href="/artifacts" aria-label="返回收藏夹">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#16a34a] text-white">
                <FileSpreadsheet className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <div className="truncate text-[15px] font-semibold text-[#0f172a]">{title || "任务执行结果"}</div>
                {dateLine ? (
                  <div className="mt-0.5 text-[12px] text-[#64748b]">最后生成时间：{dateLine}</div>
                ) : null}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-[10px]"
              aria-label="下载"
              onClick={() => onDownload()}
              disabled={!snapshot || busy}
            >
              <Download className="h-4 w-4 text-[#475569]" />
            </Button>
          </div>
        </header>

        <main className="mx-auto min-h-0 w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6">
          {busy ? (
            <div className="flex items-center gap-2 py-16 text-[#64748b]">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
              加载中…
            </div>
          ) : error ? (
            <p className="py-8 text-sm text-red-600">{error}</p>
          ) : snapshot ? (
            <div className="flex min-h-[480px] flex-1 flex-col overflow-hidden rounded-[12px] border border-[#e5e7eb] bg-white shadow-sm">
              <FavoriteSheetsResultView snapshot={snapshot} title={title} />
            </div>
          ) : (
            <p className="py-8 text-sm text-[#64748b]">暂无内容</p>
          )}
        </main>
      </div>
    </RequirePlatformLogin>
  );
}
