"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, Ellipsis, Expand, Share2 } from "@/components/ui/tabler-icons";

import { AliceShell } from "@/components/alice-shell";
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
      <AliceShell currentPath="/report" currentRunLabel="未找到报告" mainDecoration={null}>
        <div className="p-8 text-sm text-[#747571]">未找到报告。请从运行列表或带 reportId 的链接进入。</div>
      </AliceShell>
    );
  }

  return (
    <AliceShell currentPath="/report" currentRunLabel={run.title}>
      <div className="h-full overflow-auto">
        <div className="flex items-center justify-between border-b border-[#e2e2df] bg-white px-8 py-4">
          <div>
            <div className="text-[24px] font-semibold leading-8 text-[#111111]">
              {report.title}
            </div>
            <div className="mt-1 text-sm text-[#747571]">{report.subtitle}</div>
          </div>
          <div className="flex items-center gap-2 text-[#747571]">
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
          {notice ? <p className="mb-5 text-sm text-[#52525b]">{notice}</p> : null}

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
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_360px]">
              <div className="space-y-4">
                {report.summary.map((line) => (
                  <div
                    key={line}
                    className="rounded-[18px] border border-[#e2e2df] bg-white px-5 py-5 text-[14px] leading-7 text-[#52524f] shadow-[0_1px_2px_rgba(17,17,17,0.03)]"
                  >
                    {line}
                  </div>
                ))}
              </div>
              <div className="rounded-[18px] border border-[#e2e2df] bg-white p-5 shadow-[0_1px_2px_rgba(17,17,17,0.03)]">
                <div className="text-[14px] font-medium text-[#34322d]">任务上下文</div>
                <div className="mt-4 text-[18px] font-semibold text-[#111111]">{run.title}</div>
                <p className="mt-3 text-[14px] leading-7 text-[#52524f]">{run.objective}</p>
                <div className="mt-5 space-y-3 text-[12px] text-[#8b8c87]">
                  <div>生成时间：{report.generatedAt}</div>
                  <div>任务模式：{run.mode}</div>
                  <div>已补充追问：{run.notes.length} 条</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="overflow-hidden rounded-[18px] border border-[#e2e2df] bg-white shadow-[0_1px_2px_rgba(17,17,17,0.03)]">
              <div className="grid grid-cols-5 bg-[#111111] text-center text-white">
                <div className="col-span-5 px-6 py-7 text-[18px] font-semibold">{report.title}</div>
              </div>

              <table className="w-full border-collapse text-left text-[14px]">
                <tbody>
                  {report.sheetRows.map((row, rowIndex) => (
                    <tr key={`${report.id}-${rowIndex}`} className="border-b border-[#e2e2df]">
                      {row.map((cell, cellIndex) => (
                        <td
                          key={`${report.id}-${rowIndex}-${cellIndex}`}
                          className={`border-r border-[#e2e2df] px-4 py-4 align-top ${
                            rowIndex === 0 ? "bg-[#f7f7f7] font-medium text-[#34322d]" : "bg-white text-[#747571]"
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
    </AliceShell>
  );
}
