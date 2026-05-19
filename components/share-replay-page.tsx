"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FileText, X } from "lucide-react";

import { fetchPublicShare, type PublicShareReplayDto } from "@/lib/agent-api/public-shares";
import { useWorkspaceState } from "@/lib/workspace-store";

type ShareReplayPageProps = {
  shareId: string;
};

export function ShareReplayPage({ shareId }: ShareReplayPageProps) {
  const { reports, runs } = useWorkspaceState();
  const [share, setShare] = useState<PublicShareReplayDto | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchPublicShare(shareId).then((row) => {
      if (!cancelled) setShare(row);
    });
    return () => {
      cancelled = true;
    };
  }, [shareId]);

  const linkedRun = useMemo(() => {
    const rid = share?.replay_run_id;
    if (!rid) return null;
    return runs.find((r) => r.id === rid) ?? null;
  }, [runs, share?.replay_run_id]);

  const linkedReport = useMemo(() => {
    if (!linkedRun) return null;
    return reports.find((r) => r.runId === linkedRun.id) ?? null;
  }, [linkedRun, reports]);

  if (!share) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f7f7f8] text-[13px] text-[#6f7773]">
        加载分享内容…
      </div>
    );
  }

  const topTitle = share.title;
  const objective = share.objective;
  const generatedAt = linkedReport?.generatedAt ?? "";
  const summary =
    linkedRun?.summaryBody ??
    "完整执行回放需关联真实会话数据；当前仅展示该分享的任务目标与说明。";

  return (
    <div className="min-h-screen bg-[#f7f7f8] text-[#202124]">
      <header className="flex h-[44px] items-center justify-between border-b border-[#e5e7eb] bg-[linear-gradient(180deg,#fafafa,#f4f4f5)] px-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-[#171717] text-white">
            <FileText className="h-3.5 w-3.5" />
          </div>
          <div className="text-[13px] font-semibold tracking-[-0.01em] text-[#171717]">LinkData</div>
          <div className="h-4 w-px bg-[#e5e7eb]" />
          <div className="truncate text-[12px] font-medium text-[#27272a]">{topTitle}</div>
          {generatedAt ? <div className="text-[11px] text-[#8b949e]">{generatedAt}</div> : null}
        </div>
        <Link href="/" className="text-[#6f7773]" aria-label="关闭">
          <X className="h-4 w-4" />
        </Link>
      </header>
      <div className="mx-auto max-w-[960px] px-6 py-8">
        {share.description ? <p className="mb-4 text-[12px] text-[#6f7773]">{share.description}</p> : null}
        <div className="rounded-[18px] border border-[#e5e7eb] bg-white px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
          <div className="whitespace-pre-wrap text-[14px] leading-8 text-[#202124]">{objective}</div>
        </div>
        <p className="mt-6 text-[12px] leading-6 text-[#5e6763]">{summary}</p>
        {linkedRun
          ? linkedRun.sections.map((section) => (
              <div key={section.id} className="mt-4 rounded-[12px] border border-[#eceef1] bg-[#fafafa] px-4 py-3">
                <div className="text-[12px] font-medium text-[#303734]">{section.title}</div>
                <p className="mt-1 text-[12px] leading-6 text-[#5e6763]">{section.body}</p>
              </div>
            ))
          : null}
      </div>
    </div>
  );
}