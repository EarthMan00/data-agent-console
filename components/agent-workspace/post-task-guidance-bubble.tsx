"use client";

import Image from "next/image";
import { useMemo } from "react";

import { composerDraftContainsSuggestion } from "@/lib/composer-prefill";
import { parsePostTaskGuidanceSuggestions } from "@/lib/parse-post-task-guidance";
import { cn } from "@/lib/utils";

const WRAP = "w-full max-w-simple-row";

function formatTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export function PostTaskGuidanceBubble({
  content,
  datetime,
  composerDraft = "",
  onSuggestionToggle,
  className,
}: {
  content: string;
  datetime: string;
  /** 用于判断气泡选中态，与下方输入框草稿同步 */
  composerDraft?: string;
  /** 点击气泡时由父组件更新输入框（勿在 render 中调用） */
  onSuggestionToggle?: (item: string) => void;
  className?: string;
}) {
  const suggestions = useMemo(() => parsePostTaskGuidanceSuggestions(content), [content]);

  const interactive = typeof onSuggestionToggle === "function";

  if (suggestions.length === 0) return null;

  return (
    <div className={cn("flex w-full justify-start text-left", WRAP, className)}>
      <div className="flex w-full items-start gap-3">
        <Image
          src="/mdata-logo.png"
          alt="Alice"
          width={36}
          height={36}
          className="mt-1 h-9 w-9 shrink-0 object-contain"
          draggable={false}
        />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="text-body font-semibold text-foreground">Alice</div>
          <p className="text-body leading-5 text-text-secondary">接下来您可以试试：</p>
          <div
            className="flex flex-row flex-wrap items-start gap-1"
          >
            {suggestions.map((item, index) => {
              const selected =
                interactive && composerDraftContainsSuggestion(composerDraft, item);
              const chipClass = cn(
                "inline-flex max-w-full rounded-pill border px-3.5 py-2 text-left text-body leading-5 transition",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/15",
                selected
                  ? "border-primary bg-primary text-primary-foreground shadow-surface-strong"
                  : "border-border bg-bg-surface text-foreground shadow-surface hover:border-border-strong hover:bg-bg-page",
              );

              if (interactive) {
                return (
                  <button
                    key={`${index}-${item.slice(0, 24)}`}
                    type="button"
                    aria-pressed={selected}
                    className={cn(chipClass, "active-scale-chip")}
                    onClick={() => onSuggestionToggle(item)}
                  >
                    <span className="whitespace-pre-wrap break-words">{item}</span>
                  </button>
                );
              }

              return (
                <div
                  key={`${index}-${item.slice(0, 24)}`}
                  className={cn(chipClass, "border-border bg-bg-page text-text-secondary")}
                >
                  <span className="whitespace-pre-wrap break-words">{item}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-1 text-left text-caption text-text-tertiary">{formatTime(datetime)}</div>
        </div>
      </div>
    </div>
  );
}
