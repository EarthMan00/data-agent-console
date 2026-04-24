"use client";

import { useMemo, useState } from "react";
import { Download, Ellipsis, Expand, Minimize2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Report } from "@/lib/workspace-store";

type ReportPreviewPanelProps = {
  previewId: string;
  onClose: () => void;
  reportTitle?: string;
  report?: Report;
  /** 嵌入外层容器（如 AgentTaskResultPanel）时设为 false，避免重复 testid */
  dataTestId?: string | false;
};

export function ReportPreviewPanel({
  previewId,
  onClose,
  reportTitle,
  report,
  dataTestId = "agent-preview-panel",
}: ReportPreviewPanelProps) {
  const preview = useMemo(() => {
    if (report && report.previewKey === previewId) return report;
    return null;
  }, [previewId, report]);
  const [selectedTabs, setSelectedTabs] = useState<Record<string, string>>({});
  const [actionNotice, setActionNotice] = useState("");
  const activeTab = preview ? (selectedTabs[preview.id] ?? preview.sheetTabs[0]?.id ?? "") : "";

  if (!preview) {
    return (
      <div
        className="flex h-full min-h-0 flex-col items-center justify-center gap-4 bg-white p-8 text-[#64748b]"
        data-testid={dataTestId === false ? undefined : dataTestId}
      >
        <p className="text-sm">无匹配的预览内容</p>
        <Button type="button" variant="outline" className="rounded-[10px]" onClick={onClose}>
          关闭
        </Button>
      </div>
    );
  }

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-white text-[#31405a]"
      data-testid={dataTestId === false ? undefined : dataTestId}
    >
      <div className="flex items-center justify-between border-b border-[#e5e7eb] bg-[linear-gradient(180deg,#fafafa,#f4f4f5)] px-5 py-3.5">
        <div className="min-w-0">
          <div className="text-[14px] font-semibold text-[#1f2421]">
            {reportTitle ?? preview.title}
          </div>
          <div className="mt-1 text-[11px] text-[#8b9490]">{preview.subtitle}</div>
        </div>
        <div className="flex items-center gap-2 text-[#7b8797]">
          <Button aria-label="下载预览结果" variant="ghost" size="icon" className="h-8 w-8 rounded-[10px]" onClick={() => setActionNotice("导出能力待接入。")}>
            <Download className="h-4 w-4" />
          </Button>
          <Button aria-label="展开预览结果" variant="ghost" size="icon" className="h-8 w-8 rounded-[10px]" onClick={() => setActionNotice("全屏预览待接入。")}>
            <Expand className="h-4 w-4" />
          </Button>
          <Button aria-label="更多预览操作" variant="ghost" size="icon" className="h-8 w-8 rounded-[10px]" onClick={() => setActionNotice("更多操作待接入。")}>
            <Ellipsis className="h-4 w-4" />
          </Button>
          <Button aria-label="关闭预览面板" variant="ghost" size="icon" className="h-8 w-8 rounded-[10px]" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto bg-white">
        {actionNotice ? (
          <div className="border-b border-[#ececec] bg-[#fafaf9] px-5 py-2 text-xs text-[#78716c]">
            {actionNotice}
          </div>
        ) : null}
        {preview.mode === "sheet" ? (
          <div className="min-w-[760px]">
            <div className="grid grid-cols-5 border-b border-[#ececec] bg-[linear-gradient(90deg,#18181b,#27272a)] text-center text-white">
              <div className="col-span-5 px-6 py-7 text-[18px] font-semibold">{reportTitle ?? "任务执行结果"}</div>
            </div>

            <table className="w-full border-collapse text-left text-[14px]">
              <tbody>
                {preview.sheetRows.map((row, rowIndex) => (
                  <tr key={`${preview.id}-${rowIndex}`} className="border-b border-[#e5eaf2]">
                    {row.map((cell, cellIndex) => (
                      <td
                        key={`${preview.id}-${rowIndex}-${cellIndex}`}
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

            <div className="space-y-3 px-6 py-7 text-sm leading-7 text-[#708096]">
              {preview.summary.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </div>
        ) : (
          <div className="px-6 py-6">
            <div className="rounded-[18px] border border-[#e5e7eb] bg-[linear-gradient(180deg,#ffffff,#fafafa)] p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[24px] font-semibold text-[#22314a]">
                    {preview.title}
                  </div>
                  <div className="mt-2 text-sm text-[#7f8b99]">{preview.subtitle}</div>
                </div>
                <Minimize2 className="h-4 w-4 text-[#8f96a3]" />
              </div>
              <div className="mt-6 space-y-4 text-sm leading-7 text-[#73839a]">
                <div className="rounded-[14px] border border-[#e2e7ef] bg-[#f8faff] px-4 py-4">
                  <div className="mb-2 text-xs uppercase tracking-[0.18em] text-[#7c8ca1]">
                    {preview.sheetTabs.find((tab) => tab.id === activeTab)?.label ?? "结果摘要"}
                  </div>
                  {preview.summary[preview.sheetTabs.findIndex((tab) => tab.id === activeTab)] ??
                    preview.summary[0]}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 border-t border-[#e5e7eb] bg-white px-4 py-2">
        {preview.sheetTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() =>
              setSelectedTabs((current) => ({
                ...current,
                [preview.id]: tab.id,
              }))
            }
            className={`rounded-[8px] px-3 py-2 text-sm ${
              activeTab === tab.id
                ? "bg-[#f4f4f5] text-[#18181b]"
                : "text-[#7e8692] hover:bg-[#f2f5fa]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}
