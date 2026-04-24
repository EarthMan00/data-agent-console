import type { ResultPreview } from "@/lib/workspace-domain-types";

/** 与后端/流式结果无关时的占位 key；真实回合会由 report_updated 覆盖。 */
export const DEFAULT_RESULT_PREVIEW_KEY = "platform-live";

/**
 * 无种子数据时报告预览的最小可渲染结构（来自当轮分析参数，不依赖 lib/mock 中的示例表）。
 */
export function createMinimalResultPreview(overrides?: Partial<ResultPreview>): ResultPreview {
  return {
    id: DEFAULT_RESULT_PREVIEW_KEY,
    title: "任务结果",
    subtitle: "",
    mode: "sheet",
    summary: [],
    sheetTabs: [{ id: "main", label: "结果" }],
    sheetRows: [
      ["指标", "值"],
      ["—", "—"],
    ],
    ...overrides,
  };
}
