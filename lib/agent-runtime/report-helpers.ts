import type { AgentAttachment } from "@/lib/agent-events";
import type { ResultPreview } from "@/lib/workspace-domain-types";
import { DEFAULT_RESULT_PREVIEW_KEY } from "@/lib/report-defaults";

import { capabilityLabelMap } from "./constants";

export function getSourceLabel(sourceId: string) {
  return capabilityLabelMap.get(sourceId) ?? sourceId;
}

function formatDate(date = new Date()) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  const seconds = `${date.getSeconds()}`.padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function formatShortDate(date = new Date()) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function buildFinalMarkdown(prompt: string, sourceLabels: string[], attachments: AgentAttachment[]) {
  const lines = [
    `已完成本轮针对“${prompt}”的多逻辑链分析。`,
    sourceLabels.length > 0
      ? `本轮重点调取了 ${sourceLabels.join("、")}，分别验证市场、评论与竞争层面的关键信号。`
      : "本轮按默认数据源链完成了一次基础验证。",
    attachments.length > 0
      ? `已纳入附件 ${attachments.map((item) => item.name).join("、")} 的上下文，不是只基于页面数据给出结论。`
      : "当前结果不是静态摘要，而是按数据源链逐步汇总得出的结论。",
  ];
  return lines.join("\n\n");
}

export function buildStreamChunks(prompt: string, sourceLabels: string[], attachments: AgentAttachment[]) {
  const chunks = [
    `先按 ${sourceLabels.join("、") || "默认数据源"} 拆开核对关键信号，`,
    "再把市场需求、评论反馈和竞争密度放到同一轮判断里，",
    attachments.length > 0
      ? `并结合附件 ${attachments.map((item) => item.name).join("、")} 里的上下文补充约束，`
      : "避免只给单一数据源下的片面结论，",
    `最后围绕“${prompt}”收敛成一版可继续追问的结果。`,
  ];
  return chunks;
}

/** 流式阶段的报告元数据补丁；表格内容须由真实 task/report 事件填充。 */
export function buildReportPatch(prompt: string, sourceLabels: string[], attachments: AgentAttachment[]) {
  return {
    previewKey: DEFAULT_RESULT_PREVIEW_KEY,
    title: prompt.length > 24 ? `${prompt.slice(0, 24)}...` : prompt,
    subtitle: `最后生成时间：${formatShortDate()} · ${sourceLabels.join("、") || "默认数据源"}`,
    generatedAt: formatDate(),
    mode: "sheet" as const,
    summary: [
      `本轮以 ${sourceLabels.join("、") || "默认数据源"} 为主线完成了多逻辑链执行。`,
      attachments.length > 0
        ? `已结合附件 ${attachments.map((item) => item.name).join("、")} 做上下文校正。`
        : "当前结果已经具备继续追问的上下文承接能力。",
      `围绕“${prompt}”的关键判断将随任务结果同步到右侧预览。`,
    ],
    sheetTabs: [] as ResultPreview["sheetTabs"],
    sheetRows: [] as ResultPreview["sheetRows"],
    summaryBody: `系统已按 ${sourceLabels.join("、") || "默认数据源"} 并行执行多逻辑链分析，表格数据将在任务完成后写入。`,
  };
}
