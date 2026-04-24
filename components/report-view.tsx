"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, Ellipsis, Expand, Share2 } from "lucide-react";

import { MoreDataShell } from "@/components/more-data-shell";
import { Button } from "@/components/ui/button";
import { useDemoState } from "@/lib/workspace-store";

const standaloneReportTabs = [
  { id: "overview", label: "报告摘要" },
  { id: "sheet", label: "结构化表格" },
];

export function ReportView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentRunId, reports, runs } = useDemoState();
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
        <div className="p-8 text-sm text-slate-600">未找到报告。请从运行列表或带 reportId 的链接进入。</div>
      </MoreDataShell>
    );
  }

  return (
    <MoreDataShell currentPath="/report" currentRunLabel={run.title}>
      <div className="h-full overflow-auto">
        <div className="flex items-center justify-between border-b border-[#e5e7eb] bg-[linear-gradient(180deg,#fafafa,#f4f4f5)] px-8 py-3.5">
          <div>
            <div className="text-[15px] font-semibold text-[#1f2421]">
              {report.title}
            </div>
            <div className="mt-1 text-[11px] text-[#8b9490]">{report.subtitle}</div>
          </div>
          <div className="flex items-center gap-2 text-[#7b8797]">
            <Button aria-label="分享结果页" variant="ghost" size="icon" className="h-8 w-8 rounded-[10px]" onClick={() => setNotice("分享能力待接入。")}>
              <Share2 className="h-4 w-4" />
            </Button>
            <Button aria-label="下载结果页" variant="ghost" size="icon" className="h-8 w-8 rounded-[10px]" onClick={() => setNotice("导出能力待接入。")}>
              <Download className="h-4 w-4" />
            </Button>
            <Button aria-label="展开结果页" variant="ghost" size="icon" className="h-8 w-8 rounded-[10px]" onClick={() => setNotice("当前结果页已是全宽展开状态。")}>
              <Expand className="h-4 w-4" />
            </Button>
            <Button aria-label="更多结果页操作" variant="ghost" size="icon" className="h-8 w-8 rounded-[10px]" onClick={() => setNotice("更多操作待接入。")}
            >
              <Ellipsis className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="px-8 py-6">
          {notice ? <p className="mb-5 text-sm text-[#52525b]">{notice}</p> : null}

          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              {standaloneReportTabs.map((tab) => (
                <Button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  variant={activeTab === tab.id ? "default" : "secondary"}
                  size="sm"
                  className={`rounded-[9px] ${activeTab === tab.id ? "bg-[#171717] text-white hover:bg-[#27272a]" : ""}`}
                >
                  {tab.label}
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <Button className="rounded-[10px]" onClick={() => router.push(`/agent?runId=${run.id}`)}>
                返回任务页
              </Button>
            </div>
          </div>

          {activeTab === "overview" ? (
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_360px]">
              <div className="space-y-4">
                {report.summary.map((line) => (
                  <div
                    key={line}
                    className="rounded-[16px] border border-[#e5e7eb] bg-white px-5 py-5 text-[14px] leading-8 text-[#5e6763] shadow-[0_8px_20px_rgba(15,23,42,0.04)]"
                  >
                    {line}
                  </div>
                ))}
              </div>
              <div className="rounded-[18px] border border-[#d4d4d8] bg-[linear-gradient(180deg,#ffffff,#fafafa)] p-5 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
                <div className="text-[13px] font-medium text-[#24322b]">任务上下文</div>
                <div className="mt-4 text-[18px] font-semibold text-[#243248]">{run.title}</div>
                <p className="mt-3 text-[13px] leading-7 text-[#5e6763]">{run.objective}</p>
                <div className="mt-5 space-y-3 text-[12px] text-[#7e8ca0]">
                  <div>生成时间：{report.generatedAt}</div>
                  <div>任务模式：{run.mode}</div>
                  <div>已补充追问：{run.notes.length} 条</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="overflow-hidden rounded-[18px] border border-[#e5e7eb] bg-white shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
              <div className="grid grid-cols-5 bg-[linear-gradient(90deg,#18181b,#27272a)] text-center text-white">
                <div className="col-span-5 px-6 py-7 text-[18px] font-semibold">{report.title}</div>
              </div>

              <table className="w-full border-collapse text-left text-[14px]">
                <tbody>
                  {report.sheetRows.map((row, rowIndex) => (
                    <tr key={`${report.id}-${rowIndex}`} className="border-b border-[#e5eaf2]">
                      {row.map((cell, cellIndex) => (
                        <td
                          key={`${report.id}-${rowIndex}-${cellIndex}`}
                          className={`border-r border-[#e5eaf2] px-4 py-4 align-top ${
                            rowIndex === 0 ? "bg-[#f8fafc] font-medium text-[#313734]" : "bg-white text-[#6d7c91]"
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
