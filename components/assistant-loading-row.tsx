"use client";

import { cn } from "@/lib/utils";
import { DotmSquare11 } from "@/components/ui/dotm-square-11";

const SIMPLE_CHAT_BUBBLE_MAX = "max-w-simple-bubble";

/**
 * 等待态：使用 Alice 动效 loading，避免三点占位与主产品 loading 不一致。
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
      ? "max-w-simple-row items-center gap-3 rounded-panel border border-dashed border-border bg-bg-surface px-4 py-3 text-body text-text-tertiary shadow-none"
      : cn(
          SIMPLE_CHAT_BUBBLE_MAX,
          "shrink-0 items-center gap-3 rounded-panel border border-border bg-bg-surface px-4 py-3 text-body text-text-tertiary shadow-none",
        );

  return (
    <div className="flex w-full justify-start" role="status" aria-live="polite">
      <div className={cn("flex", shell)}>
        <DotmSquare11 size={22} dotSize={3} speed={1.15} className="shrink-0 text-foreground" aria-hidden />
        <span className="leading-7">{resolvedLabel}</span>
      </div>
    </div>
  );
}
