"use client";

import { useMemo } from "react";

import { AssistantOutputFrame, handleSuggestionOptionKeyDown } from "@/components/agent-workspace/chat-bubbles";
import { composerDraftContainsSuggestion } from "@/lib/composer-prefill";
import { parsePostTaskGuidanceSuggestions } from "@/lib/parse-post-task-guidance";
import { cn } from "@/lib/utils";

function formatTime(datetime: string) {
  const date = new Date(datetime);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
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
    <AssistantOutputFrame datetime={datetime} wide className={className}>
      <div className="w-full text-left">
        <div className="space-y-2">
          <p className="text-body leading-5 text-text-secondary">接下来您可以试试：</p>
          <div
            className="flex flex-row flex-wrap items-start gap-2"
            role={interactive ? "group" : "list"}
            aria-label={interactive ? "选择下一步建议" : undefined}
            onKeyDown={interactive ? handleSuggestionOptionKeyDown : undefined}
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
                    data-clarification-option
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
        </div>
        <div className="!mt-1 text-[12px] font-normal text-[#4e5969] opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          {formatTime(datetime)}
        </div>
      </div>
    </AssistantOutputFrame>
  );
}
