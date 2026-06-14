"use client";

import { useMemo, useState } from "react";
import { Download, Ellipsis, Expand, Minimize2, X } from "@/components/ui/tabler-icons";

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
        className="flex h-full min-h-0 flex-col items-center justify-center gap-4 bg-bg-surface p-8 text-text-secondary"
        data-testid={dataTestId === false ? undefined : dataTestId}
      >
        <p className="text-sm">无匹配的预览内容</p>
        <Button type="button" variant="outline" onClick={onClose}>
          关闭
        </Button>
      </div>
    );
  }

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-bg-surface text-foreground"
      data-testid={dataTestId === false ? undefined : dataTestId}
    >
      <div className="flex items-center justify-between border-b border-border bg-surface-gradient px-5 py-3.5">
        <div className="min-w-0">
          <div className="text-body font-semibold text-foreground">
            {reportTitle ?? preview.title}
          </div>
          <div className="mt-1 text-caption text-text-tertiary">{preview.subtitle}</div>
        </div>
        <div className="flex items-center gap-2 text-text-tertiary">
          <Button aria-label="下载预览结果" variant="ghost" size="iconSm" onClick={() => setActionNotice("导出能力待接入。")}>
            <Download className="h-4 w-4" />
          </Button>
          <Button aria-label="展开预览结果" variant="ghost" size="iconSm" onClick={() => setActionNotice("全屏预览待接入。")}>
            <Expand className="h-4 w-4" />
          </Button>
          <Button aria-label="更多预览操作" variant="ghost" size="iconSm" onClick={() => setActionNotice("更多操作待接入。")}>
            <Ellipsis className="h-4 w-4" />
          </Button>
          <Button aria-label="关闭预览面板" variant="ghost" size="iconSm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto bg-bg-surface">
        {actionNotice ? (
          <div className="border-b border-border-subtle bg-bg-page px-5 py-2 text-xs text-text-tertiary">
            {actionNotice}
          </div>
        ) : null}
        {preview.mode === "sheet" ? (
          <div className="min-w-source-menu">
            <div className="grid grid-cols-5 border-b border-border-subtle bg-report-heading-gradient text-center text-primary-foreground">
              <div className="col-span-5 px-6 py-7 text-lg font-semibold">{reportTitle ?? "任务执行结果"}</div>
            </div>

            <table className="w-full border-collapse text-left text-body">
              <tbody>
                {preview.sheetRows.map((row, rowIndex) => (
                  <tr key={`${preview.id}-${rowIndex}`} className="border-b border-border">
                    {row.map((cell, cellIndex) => (
                      <td
                        key={`${preview.id}-${rowIndex}-${cellIndex}`}
                        className={`border-r border-border px-4 py-4 align-top ${
                          rowIndex === 0 ? "bg-bg-subtle font-medium text-foreground" : "bg-bg-surface text-text-tertiary"
                        }`}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="space-y-3 px-6 py-7 text-sm leading-7 text-text-tertiary">
              {preview.summary.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </div>
        ) : (
          <div className="px-6 py-6">
            <div className="rounded-popover border border-border bg-report-card-gradient p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-title-3 font-semibold text-foreground">
                    {preview.title}
                  </div>
                  <div className="mt-2 text-sm text-text-tertiary">{preview.subtitle}</div>
                </div>
                <Minimize2 className="h-4 w-4 text-text-tertiary" />
              </div>
              <div className="mt-6 space-y-4 text-sm leading-7 text-text-tertiary">
                <div className="rounded-card border border-border bg-info-bg px-4 py-4">
                  <div className="mb-2 text-xs uppercase tracking-label-wide text-text-tertiary">
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

      <div className="flex items-center gap-1 border-t border-border bg-bg-surface px-4 py-2">
        {preview.sheetTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() =>
              setSelectedTabs((current) => ({
                ...current,
                [preview.id]: tab.id,
              }))
            }
            className={`rounded-md px-3 py-2 text-sm ${
              activeTab === tab.id
                ? "bg-fill-active text-foreground"
                : "text-text-tertiary hover:bg-fill-hover"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}
