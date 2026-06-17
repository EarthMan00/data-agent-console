"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FileText, X } from "@/components/ui/tabler-icons";

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
      <div className="flex min-h-screen items-center justify-center bg-fill-hover text-body text-text-tertiary">
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
    <div className="min-h-screen bg-fill-hover text-foreground">
      <header className="flex h-11 items-center justify-between border-b border-border bg-surface-gradient px-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <FileText className="h-3.5 w-3.5" />
          </div>
          <div className="text-body font-semibold tracking-normal text-foreground">Alice</div>
          <div className="h-4 w-px bg-fill-active" />
          <div className="truncate text-caption font-medium text-foreground">{topTitle}</div>
          {generatedAt ? <div className="text-caption text-text-tertiary">{generatedAt}</div> : null}
        </div>
        <Link href="/" className="text-text-tertiary" aria-label="关闭">
          <X className="h-4 w-4" />
        </Link>
      </header>
      <div className="mx-auto max-w-5xl px-6 py-8">
        {share.description ? <p className="mb-4 text-caption text-text-tertiary">{share.description}</p> : null}
        <div className="rounded-popover border border-border bg-bg-surface px-5 py-5 shadow-card-hover">
          <div className="whitespace-pre-wrap text-body leading-8 text-foreground">{objective}</div>
        </div>
        <p className="mt-6 text-caption leading-6 text-text-secondary">{summary}</p>
        {linkedRun
          ? linkedRun.sections.map((section) => (
              <div key={section.id} className="mt-4 rounded-field border border-border-subtle bg-bg-subtle px-4 py-3">
                <div className="text-caption font-medium text-foreground">{section.title}</div>
                <p className="mt-1 text-caption leading-6 text-text-secondary">{section.body}</p>
              </div>
            ))
          : null}
      </div>
    </div>
  );
}
