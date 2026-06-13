"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Copy, FileText } from "@/components/ui/tabler-icons";

import { ChatMarkdown } from "@/components/chat-markdown";
import { DotmSquare11 } from "@/components/ui/dotm-square-11";
import { AssistantAttachmentList } from "@/components/assistant-attachment-list";
import { copyTextToClipboard } from "@/lib/clipboard";
import type { AgentAttachment } from "@/lib/agent-events";
import { useTypewriterReveal } from "@/lib/use-typewriter-reveal";
import { cn } from "@/lib/utils";
import { stripModelThinkingForStreamPartial, stripModelThinkingForUi } from "@/lib/strip-model-thinking";
import { sanitizeClarificationForUserDisplay, splitClarificationForDisplay } from "@/lib/alice-clarification";
import { composerDraftContainsSuggestion } from "@/lib/composer-prefill";

function charLen(text: string): number {
  return [...text].length;
}

function splitMessageLines(text: string) {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/** 普通对话：与消息列表同列宽，用户气泡贴右、助手气泡贴左，最大宽度一致 */
export const SIMPLE_CHAT_COLUMN_MAX = "max-w-[min(100%,920px)]";
export const SIMPLE_CHAT_BUBBLE_MAX = "max-w-[min(100%,720px)]";
/** 任务拆分 / 任务执行卡片：占满会话列宽，长附件名可换行 */
export const ORCHESTRATION_BLOCK_MAX = "w-full min-w-0";

function formatTimeForBubble(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

/** 与 app-demo `live-agent-workbench` BubbleLine 对齐：普通对话气泡 */
export function SimpleUserBubble({
  text,
  datetime,
  attachments = [],
}: {
  text: string;
  datetime: string;
  attachments?: AgentAttachment[];
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const copyResetTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyResetTimer.current !== null) {
        window.clearTimeout(copyResetTimer.current);
      }
    };
  }, []);

  const copyMessage = async () => {
    const ok = await copyTextToClipboard(text);
    setCopyState(ok ? "copied" : "failed");
    if (copyResetTimer.current !== null) {
      window.clearTimeout(copyResetTimer.current);
    }
    copyResetTimer.current = window.setTimeout(() => {
      setCopyState("idle");
      copyResetTimer.current = null;
    }, 1500);
  };

  return (
    <div className="flex w-full justify-end" data-testid="agent-user-input-card">
      <div className={cn("group flex flex-col items-end", SIMPLE_CHAT_BUBBLE_MAX)}>
        <div className="shrink-0 rounded-[16px] bg-[#f0f0ef] px-4 py-3 text-[14px] leading-7 text-[#1d2129] shadow-none">
          {text ? <div className="break-words whitespace-pre-wrap">{text}</div> : null}
          {attachments.length > 0 ? (
            <AssistantAttachmentList attachments={attachments} className={cn(text ? "mt-3" : "")} />
          ) : null}
        </div>
        <div className="mt-1 flex h-9 items-center justify-end gap-2">
          <span className="text-[12px] font-normal text-[#4e5969] opacity-0 transition-opacity duration-150 group-hover:opacity-100">
            {formatTimeForBubble(datetime)}
          </span>
          <button
            type="button"
            aria-label={copyState === "copied" ? "已复制" : copyState === "failed" ? "复制失败" : "复制消息"}
            title={copyState === "copied" ? "已复制" : copyState === "failed" ? "复制失败" : "复制"}
            className="pointer-events-none inline-flex h-9 w-9 items-center justify-center rounded-[10px] text-[#4e5969] opacity-0 transition-[background-color,opacity] duration-150 hover:bg-[rgba(55,53,47,0.06)] focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#111111]/15 group-hover:pointer-events-auto group-hover:opacity-100"
            onClick={() => void copyMessage()}
          >
            <Copy className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}

export function SimpleAssistantBubble({
  body,
  datetime,
  streaming = false,
  typewriter = true,
}: {
  body: string;
  datetime: string;
  streaming?: boolean;
  /** 流式时是否逐字展示（默认开启） */
  typewriter?: boolean;
}) {
  const targetNorm = (() => {
    const t = streaming ? stripModelThinkingForStreamPartial(body) : stripModelThinkingForUi(body);
    return t === "（无回复）" ? "" : t;
  })();
  const [latchedVisible, setLatchedVisible] = useState(() => (targetNorm.trim() ? targetNorm : ""));
  useEffect(() => {
    if (targetNorm.trim()) {
      setLatchedVisible(targetNorm);
    }
  }, [targetNorm]);
  const displayNorm = targetNorm.trim() || latchedVisible;
  const waitingForContent = streaming && !displayNorm.trim();
  const latchedStreamRef = useRef(false);
  // eslint-disable-next-line react-hooks/refs
  if (streaming) latchedStreamRef.current = true;

  // eslint-disable-next-line react-hooks/refs
  const runTypewriter = typewriter && latchedStreamRef.current && charLen(displayNorm) > 0;
  const { text: shown, revealing } = useTypewriterReveal(displayNorm, runTypewriter, {
    charIntervalMs: 22,
  });
  /** 仅在 SSE 进行中显示光标；流结束后继续打字机追平但不闪光标 */
  const showCursor = Boolean(streaming && runTypewriter && revealing);

  useEffect(() => {
    if (!revealing && !streaming) {
      latchedStreamRef.current = false;
    }
  }, [revealing, streaming]);

  return (
    <div className="flex w-full justify-start">
      <div className={cn("group flex items-start gap-3", SIMPLE_CHAT_BUBBLE_MAX)}>
        <Image
          src="/alice-logo.png"
          alt="Alice"
          width={36}
          height={36}
          className="mt-1 h-9 w-9 shrink-0 object-contain"
          draggable={false}
        />
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-3">
            <div className="text-[14px] font-semibold text-[#1d2129]">Alice</div>
          </div>
          {waitingForContent ? (
            <div className="min-w-0 text-[#1d2129]">
              <div
                className="flex items-center gap-3 py-0.5 text-[14px] leading-7 text-[#4e5969]"
                role="status"
                aria-live="polite"
              >
                <DotmSquare11 size={22} dotSize={3} speed={1.15} className="shrink-0 text-[#1d2129]" aria-hidden />
                <span>我正在思考，请等我一下～</span>
              </div>
            </div>
          ) : (
            <div className="shrink-0 rounded-[16px] border border-[#e2e2df] bg-white px-4 py-3 text-[#1d2129] shadow-none">
              <div className="min-w-0">
                <ChatMarkdown>{shown}</ChatMarkdown>
                {showCursor ? (
                  <span className="ml-0.5 inline-block animate-pulse text-[#4e5969]" aria-hidden>
                    ▌
                  </span>
                ) : null}
              </div>
            </div>
          )}
          <div className="mt-1 text-[12px] font-normal text-[#4e5969] opacity-0 transition-opacity duration-150 group-hover:opacity-100">
            {formatTimeForBubble(datetime)}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AliceMessageBubble({
  body,
  datetime,
  streaming = false,
  typewriter = false,
  composerDraft = "",
  onSuggestionToggle,
  hideSuggestions = false,
}: {
  body: string;
  datetime: string;
  streaming?: boolean;
  typewriter?: boolean;
  /** 澄清关键词气泡：与输入框草稿同步选中态 */
  composerDraft?: string;
  onSuggestionToggle?: (item: string) => void;
  /** 为 false 时不展示关键词气泡（默认展示；已回答时可传 composerDraft 高亮用户所选） */
  hideSuggestions?: boolean;
}) {
  const { leading, suggestions } = splitClarificationForDisplay(body);
  const visibleSuggestions = hideSuggestions ? [] : suggestions;
  const displayBody = leading || (suggestions.length > 0 ? "" : sanitizeClarificationForUserDisplay(body));
  const targetNorm = (() => {
    const t = streaming ? stripModelThinkingForStreamPartial(displayBody) : stripModelThinkingForUi(displayBody);
    return t === "（无回复）" ? "" : t;
  })();
  const latchedStreamRef = useRef(false);
  // eslint-disable-next-line react-hooks/refs
  if (streaming) latchedStreamRef.current = true;

  // eslint-disable-next-line react-hooks/refs
  const runTypewriter = typewriter && latchedStreamRef.current && charLen(targetNorm) > 0;
  const { text: shown, revealing } = useTypewriterReveal(targetNorm, runTypewriter, {
    charIntervalMs: 22,
  });
  const showCursor = Boolean(streaming && runTypewriter && revealing);

  useEffect(() => {
    if (!revealing && !streaming) {
      latchedStreamRef.current = false;
    }
  }, [revealing, streaming]);

  if (!targetNorm && visibleSuggestions.length === 0) return null;

  const interactive = typeof onSuggestionToggle === "function" && visibleSuggestions.length > 0;

  return (
    <div className="flex w-full justify-start">
      <div className={cn("group w-full space-y-3", SIMPLE_CHAT_BUBBLE_MAX)}>
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
            <div className="text-[14px] font-semibold text-[#1d2129]">Alice</div>
          </div>
        </div>
        {targetNorm ? (
          <div className="shrink-0 rounded-[16px] border border-[#e2e2df] bg-white px-4 py-3 text-[#1d2129] shadow-none">
            <div className="min-w-0 text-[14px] leading-7">
              <ChatMarkdown>{shown}</ChatMarkdown>
              {showCursor ? (
                <span className="ml-0.5 inline-block animate-pulse text-[#4e5969]" aria-hidden>
                  ▌
                </span>
              ) : null}
            </div>
          </div>
        ) : null}
        {visibleSuggestions.length > 0 ? (
          <div className="space-y-2.5 pl-0 sm:pl-12">
            <div className="flex flex-row flex-wrap items-start gap-2" role={interactive ? "list" : undefined}>
              {visibleSuggestions.map((item, index) => {
                const selected = composerDraftContainsSuggestion(composerDraft, item);
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
                  <div key={`${index}-${item.slice(0, 24)}`} role="listitem" className={chipClass}>
                    <span className="whitespace-pre-wrap break-words">{item}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
        <div className="!mt-1 text-[12px] font-normal text-[#4e5969] opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          {formatTimeForBubble(datetime)}
        </div>
      </div>
    </div>
  );
}

/** @deprecated 请使用 AliceMessageBubble */
export function AliceClarificationBubble({
  body,
  datetime,
  streaming = false,
}: {
  body: string;
  shareUrl?: string | null;
  datetime: string;
  streaming?: boolean;
}) {
  return <AliceMessageBubble body={body} datetime={datetime} streaming={streaming} typewriter={false} />;
}

export function SimpleSystemBubble({ message }: { message: string }) {
  return (
    <div className="flex w-full justify-start">
      <div
        className={cn(
          "shrink-0 rounded-[16px] border border-[#e2e2df] bg-white px-4 py-3 text-[14px] leading-7 text-[#4e5969] shadow-[0_1px_2px_rgba(17,17,17,0.03)]",
          SIMPLE_CHAT_BUBBLE_MAX,
        )}
      >
        <div className="text-[12px] font-medium uppercase tracking-wide opacity-70">系统</div>
        <p className="mt-1 whitespace-pre-wrap break-words">{message}</p>
      </div>
    </div>
  );
}

export function ConversationBubble({
  role,
  title,
  datetime,
  body,
  tone = "default",
}: {
  role: "user" | "assistant";
  title: string;
  datetime: string;
  body: string;
  tone?: "default" | "status";
}) {
  const lines = splitMessageLines(body);

  return (
    <div className={cn("flex", role === "user" ? "justify-end" : "justify-start")}>
      <div className={cn("group w-full max-w-[780px]", role === "user" ? "items-end" : "items-start")}>
        <div
          className={cn(
            "px-5 py-4",
            role === "user"
              ? "rounded-none bg-transparent px-0 py-0 text-[#1d2129] shadow-none"
              : tone === "status"
                ? "rounded-[16px] border border-[#e2e2df] bg-white text-[#4e5969] shadow-none"
                : "border border-[#e2e2df] bg-white text-[#1d2129]",
          )}
        >
          <div className="space-y-2 text-[14px] leading-7">
            {lines.map((line) => (
              <p key={line} className="whitespace-pre-wrap break-words">
                {line}
              </p>
            ))}
          </div>
          {role === "user" ? (
            <div className="mt-3 text-right text-[12px] font-normal text-[#4e5969] opacity-0 transition-opacity duration-150 group-hover:opacity-100">
              {datetime}
            </div>
          ) : null}
        </div>
        {role === "assistant" ? (
          <div className="mb-2 mt-2 flex items-center gap-2 text-[12px] font-normal justify-start text-[#4e5969] opacity-0 transition-opacity duration-150 group-hover:opacity-100">
            <span className="font-medium text-[#1d2129]">{title}</span>
            <span>{datetime}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function CollapsedStatusRow({
  title,
  expanded,
  onClick,
  testId,
}: {
  title: string;
  expanded: boolean;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-[16px] border border-[#e2e2df] bg-white px-4 py-3.5 text-left shadow-[0_1px_2px_rgba(17,17,17,0.03)]"
      data-testid={testId}
    >
      <div className="text-[14px] font-semibold text-[#1d2129]">{title}</div>
      <ChevronDown className={cn("h-4 w-4 text-[#8f9692]", expanded ? "rotate-180" : "-rotate-90")} />
    </button>
  );
}

export function ToolCard({
  title,
  detail,
  actionLabel = "查看",
  onAction,
  tone = "default",
}: {
  title: string;
  detail: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: "default" | "error";
}) {
  return (
    <div
      className={cn(
        "rounded-[16px] border px-4 py-3 shadow-[0_1px_2px_rgba(17,17,17,0.03)]",
        tone === "error"
          ? "border-[#fecaca] bg-[#fef2f2]"
          : "border-[#e2e2df] bg-white",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div
          className={cn(
            "flex items-center gap-2 text-[12px] font-medium",
            tone === "error" ? "text-[#991b1b]" : "text-[#1d2129]",
          )}
        >
          <div className="flex h-5 w-5 items-center justify-center rounded-full border border-[#e2e2df] bg-[#f7f7f7]">
            <FileText className="h-3 w-3" />
          </div>
          {title}
        </div>
        {onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="rounded-[8px] border border-[#e2e2df] bg-[#f7f7f7] px-2 py-0.5 text-[12px] font-medium text-[#1d2129]"
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
      <div className={cn("mt-2 text-[12px] leading-5", tone === "error" ? "text-[#b91c1c]" : "text-[#4e5969]")}>
        {detail}
      </div>
    </div>
  );
}
