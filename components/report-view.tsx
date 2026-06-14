"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, Ellipsis, Expand, Share2 } from "@/components/ui/tabler-icons";

import { MoreDataShell } from "@/components/more-data-shell";
import { Button } from "@/components/ui/button";
import { useWorkspaceState } from "@/lib/workspace-store";

const standaloneReportTabs = [
  { id: "overview", label: "报告摘要" },
  { id: "sheet", label: "结构化表格" },
];

export function ReportView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentRunId, reports, runs } = useWorkspaceState();
  const reportId = searchParams.get("reportId");
  const report =
    reports.find((item) => item.id === reportId) ??
    reports.find((item) => item.runId === currentRunId) ??
    null;
  const run = report ? (runs.find((item) => item.id === report.runId) ?? null) : null;

  const [activeTab, setActiveTab] = useState(standaloneReportTabs[0].id);
  const [notice, setNotice] = useState("");

  if (!report || !run) {
    return (
      <MoreDataShell currentPath="/report" currentRunLabel="未找到报告" mainDecoration={null}>
        <div className="p-8 text-sm text-text-tertiary">未找到报告。请从运行列表或带 reportId 的链接进入。</div>
      </MoreDataShell>
    );
  }

  return (
    <MoreDataShell currentPath="/report" currentRunLabel={run.title}>
      <div className="h-full overflow-auto">
        <div className="flex items-center justify-between border-b border-border bg-bg-surface px-8 py-4">
          <div>
            <div className="text-title-3 font-semibold leading-8 text-foreground">
              {report.title}
            </div>
            <div className="mt-1 text-sm text-text-tertiary">{report.subtitle}</div>
          </div>
          <div className="flex items-center gap-2 text-text-tertiary">
            <Button aria-label="分享结果页" variant="ghost" size="iconSm" onClick={() => setNotice("分享能力待接入。")}>
              <Share2 className="h-4 w-4" />
            </Button>
            <Button aria-label="下载结果页" variant="ghost" size="iconSm" onClick={() => setNotice("导出能力待接入。")}>
              <Download className="h-4 w-4" />
            </Button>
            <Button aria-label="展开结果页" variant="ghost" size="iconSm" onClick={() => setNotice("当前结果页已是全宽展开状态。")}>
              <Expand className="h-4 w-4" />
            </Button>
            <Button aria-label="更多结果页操作" variant="ghost" size="iconSm" onClick={() => setNotice("更多操作待接入。")}
            >
              <Ellipsis className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="px-8 py-6">
          {notice ? <p className="mb-5 text-sm text-text-secondary">{notice}</p> : null}

          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              {standaloneReportTabs.map((tab) => (
                <Button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  variant={activeTab === tab.id ? "default" : "secondary"}
                  size="sm"
                >
                  {tab.label}
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={() => router.push(`/agent?runId=${run.id}`)}>
                返回任务页
              </Button>
            </div>
          </div>

          {activeTab === "overview" ? (
            <div className="grid gap-5 xl:grid-report-view">
              <div className="space-y-4">
                {report.summary.map((line) => (
                  <div
                    key={line}
                    className="rounded-popover border border-border bg-bg-surface px-5 py-5 text-body leading-7 text-text-secondary shadow-surface"
                  >
                    {line}
                  </div>
                ))}
              </div>
              <div className="rounded-popover border border-border bg-bg-surface p-5 shadow-surface">
                <div className="text-body font-medium text-foreground">任务上下文</div>
                <div className="mt-4 text-lg font-semibold text-foreground">{run.title}</div>
                <p className="mt-3 text-body leading-7 text-text-secondary">{run.objective}</p>
                <div className="mt-5 space-y-3 text-caption text-text-tertiary">
                  <div>生成时间：{report.generatedAt}</div>
                  <div>任务模式：{run.mode}</div>
                  <div>已补充追问：{run.notes.length} 条</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="overflow-hidden rounded-popover border border-border bg-bg-surface shadow-surface">
              <div className="grid grid-cols-5 bg-primary text-center text-primary-foreground">
                <div className="col-span-5 px-6 py-7 text-lg font-semibold">{report.title}</div>
              </div>

              <table className="w-full border-collapse text-left text-body">
                <tbody>
                  {report.sheetRows.map((row, rowIndex) => (
                    <tr key={`${report.id}-${rowIndex}`} className="border-b border-border">
                      {row.map((cell, cellIndex) => (
                        <td
                          key={`${report.id}-${rowIndex}-${cellIndex}`}
                          className={`border-r border-border px-4 py-4 align-top ${
                            rowIndex === 0 ? "bg-fill-hover font-medium text-foreground" : "bg-bg-surface text-text-tertiary"
                          }`}
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </MoreDataShell>
  );
}
