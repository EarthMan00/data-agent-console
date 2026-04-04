"use client";

import { cn } from "@/lib/utils";

const SIMPLE_CHAT_BUBBLE_MAX = "max-w-[min(100%,720px)]";

/**
 * 与旧版 `live-agent-workbench` 中 ThinkingRow / TaskRunningRow 一致的等待态：
 * 三点动画 + 灰底「思考」或浅蓝底「任务执行中」。
 */
export function AssistantLoadingRow({
  variant = "thinking",
  label,
}: {
  variant?: "thinking" | "task";
  /** 不传则使用与旧版相同的默认文案 */
  label?: string;
}) {
  const resolvedLabel =
    label ?? (variant === "task" ? "任务执行中，正在同步结果…" : "助手正在思考，请稍候…");
  const shell =
    variant === "task"
      ? "max-w-[min(100%,780px)] items-center gap-3 rounded-[16px] border border-dashed border-[#dbeafe] bg-[#eff6ff] px-4 py-3 text-[15px] text-[#475569] shadow-sm"
      : cn(
          SIMPLE_CHAT_BUBBLE_MAX,
          "shrink-0 items-center gap-3 rounded-[16px] border border-dashed border-[#d4dbe8] bg-[#f8fafc] px-4 py-3 text-[15px] text-[#64748b] shadow-sm",
        );
  const dotClass = variant === "task" ? "thinking-dots text-[#2563eb]" : "thinking-dots text-[#3b82f6]";

  return (
    <div className="flex w-full justify-start" role="status" aria-live="polite">
      <div className={cn("flex", shell)}>
        <div className={cn(dotClass)} aria-hidden>
          <span />
          <span />
          <span />
        </div>
        <span className="leading-7">{resolvedLabel}</span>
      </div>
    </div>
  );
}
