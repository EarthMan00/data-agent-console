import type { ResultPreview } from "@/lib/workspace-domain-types";

/** 与后端/流式结果无关时的占位 key；真实回合会由 report_updated 覆盖。 */
export const DEFAULT_RESULT_PREVIEW_KEY = "platform-live";
