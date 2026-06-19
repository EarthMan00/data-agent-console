"use client";

import Image from "next/image";

import { cn } from "@/lib/utils";
import { DotmSquare11 } from "@/components/ui/dotm-square-11";
import { ALICE_LOGO_SRC } from "@/lib/brand-assets";

const SIMPLE_CHAT_BUBBLE_MAX = "max-w-simple-bubble";
const SIMPLE_CHAT_ROW_MAX = "max-w-simple-row";

function AliceAvatar() {
  return (
    <span className="relative mt-1 block h-9 w-9 shrink-0">
      <Image src={ALICE_LOGO_SRC} alt="Alice" fill sizes="36px" className="object-contain" draggable={false} />
    </span>
  );
}

/**
 * 等待态：使用 Alice 动效 loading，避免三点占位与主产品 loading 不一致。
 */
export function AssistantLoadingRow({
  variant = "thinking",
  label,
  withIdentity = false,
}: {
  variant?: "thinking" | "task";
  /** 不传则使用与旧版相同的默认文案 */
  label?: string;
  /** 历史会话消息流内展示时，对齐普通 Alice 回复的头像与名称。 */
  withIdentity?: boolean;
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
  const content = (
    <div className={cn("flex", shell)}>
      <DotmSquare11 size={22} dotSize={3} speed={1.15} className="shrink-0 text-foreground" aria-hidden />
      <span className="leading-7">{resolvedLabel}</span>
    </div>
  );

  if (withIdentity) {
    return (
      <div className="flex w-full justify-start" role="status" aria-live="polite">
        <div className={cn("group flex items-start gap-3", SIMPLE_CHAT_ROW_MAX)}>
          <AliceAvatar />
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-3">
              <div className="text-body font-semibold text-foreground">Alice</div>
            </div>
            {content}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full justify-start" role="status" aria-live="polite">
      {content}
    </div>
  );
}
