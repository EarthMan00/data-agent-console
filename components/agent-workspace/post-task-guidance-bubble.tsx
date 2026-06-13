"use client";

import Image from "next/image";
import { useMemo } from "react";

import { composerDraftContainsSuggestion } from "@/lib/composer-prefill";
import { parsePostTaskGuidanceSuggestions } from "@/lib/parse-post-task-guidance";
import { cn } from "@/lib/utils";

const WRAP = "w-full max-w-[min(100%,780px)]";

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
    <div className={cn("group flex w-full justify-start text-left", WRAP, className)}>
      <div className="w-full space-y-3">
        <div className="flex w-full min-w-0 items-center gap-3 text-[14px] font-medium text-[#1d2129]">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center">
              <Image
                src="/alice-logo.png"
                alt="Alice"
                width={36}
                height={36}
                className="h-9 w-9 shrink-0 object-contain"
                draggable={false}
              />
            </div>
            <div>
              <div className="text-[14px] font-semibold text-[#1d2129]">Alice</div>
            </div>
          </div>
        </div>

        <div className="space-y-1 pl-0">
          <p className="text-[12px] leading-5 text-[#4e5969]">接下来您可以试试：</p>
          <div
            className="flex flex-row flex-wrap items-start gap-1"
          >
            {suggestions.map((item, index) => {
              const selected =
                interactive && composerDraftContainsSuggestion(composerDraft, item);
              const chipClass = cn(
                "inline-flex max-w-full rounded-[999px] border px-3.5 py-2 text-left text-[14px] leading-5 transition",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#111111]/15",
                selected
                  ? "border-[#111111] bg-[#111111] text-white shadow-[0_1px_2px_rgba(17,17,17,0.08)]"
                  : "border-[#e2e2df] bg-white text-[#1d2129] shadow-[0_1px_2px_rgba(17,17,17,0.03)] hover:border-[#c9c9c4] hover:bg-[#fafaf9]",
              );

              if (interactive) {
                return (
                  <button
                    key={`${index}-${item.slice(0, 24)}`}
                    type="button"
                    aria-pressed={selected}
                    className={cn(chipClass, "active:scale-[0.98]")}
                    onClick={() => onSuggestionToggle(item)}
                  >
                    <span className="whitespace-pre-wrap break-words">{item}</span>
                  </button>
                );
              }

              return (
                <div
                  key={`${index}-${item.slice(0, 24)}`}
                  className={cn(chipClass, "border-[#e2e2df] bg-[#fafaf9] text-[#4e5969]")}
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
    </div>
  );
}
