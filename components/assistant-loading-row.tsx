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
    label ?? (variant === "task" ? "任务执行中，正在同步结果…" : "我正在思考，请等我一下～");
  const shell =
    variant === "task"
      ? "max-w-[min(100%,780px)] items-center gap-3 rounded-[16px] border border-dashed border-[#e2e2df] bg-white px-4 py-3 text-[14px] text-[#747571] shadow-[0_1px_2px_rgba(17,17,17,0.03)]"
      : cn(
          SIMPLE_CHAT_BUBBLE_MAX,
          "shrink-0 items-center gap-3 rounded-[16px] border border-dashed border-[#e2e2df] bg-white px-4 py-3 text-[14px] text-[#747571] shadow-[0_1px_2px_rgba(17,17,17,0.03)]",
        );
  const dotClass = variant === "task" ? "thinking-dots text-[#111111]" : "thinking-dots text-[#111111]";

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
