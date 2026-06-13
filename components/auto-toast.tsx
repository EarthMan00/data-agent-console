"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AlertCircle } from "@/components/ui/tabler-icons";

import { cn } from "@/lib/utils";

type AutoToastProps = {
  /** 非空时展示，并在 `durationMs` 后调用 `onDismiss` */
  message: string | null;
  onDismiss: () => void;
  /** 默认 2000ms */
  durationMs?: number;
  className?: string;
  /** 成功为左侧黑底勾；错误为黑底感叹号（与「已存在同名分组」等提示一致） */
  variant?: "default" | "error";
};

/**
 * 顶部居中浮层：白底、圆角、左侧黑底白勾 + 文案，`durationMs` 后自动关闭。
 */
export function AutoToast({
  message,
  onDismiss,
  durationMs = 2000,
  className,
  variant = "default",
}: AutoToastProps) {
  const dismissRef = useRef(onDismiss);

  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!message) return;
    const id = window.setTimeout(() => dismissRef.current(), durationMs);
    return () => window.clearTimeout(id);
  }, [message, durationMs]);

  if (!message || typeof document === "undefined") return null;

  /** 与 `alice-shell` 顶栏 `h-14.5`（3.625rem）对齐，避免落在 `relative z-1` 堆叠上下文内被顶栏盖住 */
  const node = (
    <div
      className={cn(
        "pointer-events-none fixed left-1/2 z-[10000] flex w-[min(100%,24rem)] -translate-x-1/2 justify-center px-4",
        // 顶栏高度 + 间距（勿用 top-6：会叠在 sticky header 下方但仍被 z-50 压住）
        "top-[max(1rem,calc(env(safe-area-inset-top,0px)+4.375rem))]",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <div className="pointer-events-auto flex max-w-full items-center gap-2.5 rounded-[12px] border border-[#e8e8ea] bg-white px-4 py-3 shadow-[0_12px_40px_rgba(15,23,42,0.12)]">
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
            variant === "error" ? "bg-[#18181b] text-white" : "text-[#00B42A]",
          )}
        >
          {variant === "error" ? (
            <AlertCircle className="h-4 w-4" strokeWidth={2.5} aria-hidden />
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden
            >
              <path stroke="none" d="M0 0h24v24H0z" fill="none" />
              <path d="M17 3.34a10 10 0 1 1 -14.995 8.984l-.005 -.324l.005 -.324a10 10 0 0 1 14.995 -8.336zm-1.293 5.953a1 1 0 0 0 -1.32 -.083l-.094 .083l-3.293 3.292l-1.293 -1.292l-.094 -.083a1 1 0 0 0 -1.403 1.403l.083 .094l2 2l.094 .083a1 1 0 0 0 1.226 0l.094 -.083l4 -4l.083 -.094a1 1 0 0 0 -.083 -1.32z" />
            </svg>
          )}
        </span>
        <span className="text-[14px] font-medium leading-tight text-[#18181b]">{message}</span>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
