"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, Check } from "@/components/ui/tabler-icons";

import { cn } from "@/lib/utils";

type AutoToastProps = {
  /** 非空时展示，并在 `durationMs` 后调用 `onDismiss` */
  message: string | null;
  onDismiss: () => void;
  /** 默认 2000ms */
  durationMs?: number;
  className?: string;
  /** 成功为左侧绿色勾；错误为黑底感叹号（与「已存在同名分组」等提示一致） */
  variant?: "default" | "error";
};

/**
 * 顶部居中浮层：白底、圆角、左侧状态图标 + 文案，`durationMs` 后自动关闭。
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

  /** 与 `more-data-shell` 顶栏 `h-14.5`（3.625rem）对齐，避免落在 `relative z-1` 堆叠上下文内被顶栏盖住 */
  const node = (
    <div
      className={cn(
        "pointer-events-none fixed left-1/2 z-toast flex w-toast -translate-x-1/2 justify-center px-4",
        // 顶栏高度 + 间距（勿用 top-6：会叠在 sticky header 下方但仍被 z-50 压住）
        "top-safe-toast",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <div className="pointer-events-auto flex max-w-full items-center gap-2.5 rounded-field border border-border bg-bg-surface px-4 py-3 shadow-popover-strong">
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-primary-foreground",
            variant === "error" ? "bg-primary" : "bg-success",
          )}
        >
          {variant === "error" ? (
            <AlertCircle className="h-4 w-4" strokeWidth={2.5} aria-hidden />
          ) : (
            <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden />
          )}
        </span>
        <span className="text-body font-medium leading-tight text-foreground">{message}</span>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
