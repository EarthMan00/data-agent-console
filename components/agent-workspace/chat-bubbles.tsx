"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, FileText } from "@/components/ui/tabler-icons";

import { ChatMarkdown } from "@/components/chat-markdown";
import { DotmSquare11 } from "@/components/ui/dotm-square-11";
import { useTypewriterReveal } from "@/lib/use-typewriter-reveal";
import { cn } from "@/lib/utils";
import { stripModelThinkingForStreamPartial, stripModelThinkingForUi } from "@/lib/strip-model-thinking";
import { sanitizeClarificationForUserDisplay, splitClarificationForDisplay } from "@/lib/linkfox-clarification";
import { humanizeTaskErrorMessage } from "@/lib/platform-task-error-copy";
import { stripInternalToolNamesForUi } from "@/lib/strip-internal-tool-names";
import { composerDraftContainsSuggestion } from "@/lib/composer-prefill";
import type { UserMessageAttachment } from "@/lib/user-message-attachments";
import { UserMessageAttachmentCards } from "@/components/user-message-attachment-cards";

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
export const SIMPLE_CHAT_COLUMN_MAX = "max-w-simple-column";
export const SIMPLE_CHAT_BUBBLE_MAX = "max-w-simple-bubble";
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
  attachments?: UserMessageAttachment[];
}) {
  const visibleText = text.trim();
  return (
    <div className="flex w-full justify-end" data-testid="agent-user-input-card">
      <div className={cn("group flex flex-col items-end gap-2", SIMPLE_CHAT_BUBBLE_MAX)}>
        <div className="mb-1 text-caption text-text-tertiary opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          {formatTimeForBubble(datetime)}
        </div>
        {attachments.length > 0 ? <UserMessageAttachmentCards attachments={attachments} /> : null}
        {visibleText ? (
          <div className="shrink-0 rounded-panel bg-fill-hover px-4 py-3 text-body leading-7 text-foreground shadow-none">
            <div className="break-words whitespace-pre-wrap">{visibleText}</div>
          </div>
        ) : null}
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
    const norm = t === "（无回复）" ? "" : t;
    return stripInternalToolNamesForUi(norm);
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
          src="/mdata-logo.png"
          alt="Alice"
          width={36}
          height={36}
          className="mt-1 h-9 w-9 shrink-0 object-contain"
          draggable={false}
        />
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-3">
            <div className="text-body font-semibold text-foreground">Alice</div>
          </div>
          {waitingForContent ? (
            <div className="min-w-0 text-foreground">
              <div
                className="flex items-center gap-3 py-0.5 text-body leading-7 text-text-tertiary"
                role="status"
                aria-live="polite"
              >
                <DotmSquare11 size={22} dotSize={3} speed={1.15} className="shrink-0 text-foreground" aria-hidden />
                <span>我正在思考，请等我一下～</span>
              </div>
            </div>
          ) : (
            <div className="shrink-0 rounded-panel border border-border bg-bg-surface px-4 py-3 text-foreground shadow-none">
              <div className="min-w-0">
                <ChatMarkdown>{shown}</ChatMarkdown>
                {showCursor ? (
                  <span className="ml-0.5 inline-block animate-pulse text-text-tertiary" aria-hidden>
                    ▌
                  </span>
                ) : null}
              </div>
            </div>
          )}
          <div className="mt-1 text-left text-caption text-text-tertiary">
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
      <div className={cn("group flex items-start gap-3", SIMPLE_CHAT_BUBBLE_MAX)}>
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
          {targetNorm ? (
            <div className="shrink-0 rounded-panel border border-border bg-bg-surface px-4 py-3 text-foreground shadow-none">
              <div className="min-w-0 text-body leading-7">
                <ChatMarkdown>{shown}</ChatMarkdown>
                {showCursor ? (
                  <span className="ml-0.5 inline-block animate-pulse text-text-tertiary" aria-hidden>
                    ▌
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}
          {visibleSuggestions.length > 0 ? (
            <div className="flex flex-row flex-wrap items-start gap-2">
              {visibleSuggestions.map((item, index) => {
                const selected = composerDraftContainsSuggestion(composerDraft, item);
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
                  <div key={`${index}-${item.slice(0, 24)}`} className={chipClass}>
                    <span className="whitespace-pre-wrap break-words">{item}</span>
                  </div>
                );
              })}
            </div>
          ) : null}
          <div className="mt-1 text-left text-caption text-text-tertiary">
            {formatTimeForBubble(datetime)}
          </div>
        </div>
      </div>
    </div>
  );
}

/** @deprecated 请使用 AliceMessageBubble */
export function LinkfoxClarificationBubble({
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
          "shrink-0 rounded-panel border border-border bg-bg-surface px-4 py-3 text-body leading-7 text-text-secondary shadow-surface",
          SIMPLE_CHAT_BUBBLE_MAX,
        )}
      >
        <div className="text-caption font-medium uppercase tracking-wide opacity-70">系统</div>
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
      <div className={cn("w-full max-w-3xl", role === "user" ? "items-end" : "items-start")}>
        <div
          className={cn(
            "px-5 py-4",
            role === "user"
              ? "rounded-none bg-transparent px-0 py-0 text-foreground shadow-none"
              : tone === "status"
                ? "rounded-panel border border-border bg-bg-surface text-text-secondary shadow-none"
                : "border border-border bg-bg-surface text-foreground",
          )}
        >
          <div className="space-y-2 text-body leading-7">
            {lines.map((line) => (
              <p key={line} className="whitespace-pre-wrap break-words">
                {line}
              </p>
            ))}
          </div>
        </div>
        <div className={cn("mt-2 text-caption text-text-tertiary", role === "user" ? "text-right" : "text-left")}>
          {role === "assistant" ? <span className="mr-2 font-medium text-foreground">{title}</span> : null}
          <span>{datetime}</span>
        </div>
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
      className="flex w-full items-center justify-between rounded-panel border border-border bg-bg-surface px-4 py-3.5 text-left shadow-surface"
      data-testid={testId}
    >
      <div className="text-body font-semibold text-foreground">{title}</div>
      <ChevronDown className={cn("h-4 w-4 text-text-tertiary", expanded ? "rotate-180" : "-rotate-90")} />
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
        "rounded-panel border px-4 py-3 shadow-surface",
        tone === "error"
          ? "border-danger-border bg-danger-bg"
          : "border-border bg-bg-surface",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div
          className={cn(
            "flex items-center gap-2 text-caption font-medium",
            tone === "error" ? "text-danger" : "text-foreground",
          )}
        >
          <div className="flex h-5 w-5 items-center justify-center rounded-full border border-border bg-fill-hover">
            <FileText className="h-3 w-3" />
          </div>
          {title}
        </div>
        {onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="rounded-md border border-border bg-fill-hover px-2 py-0.5 text-caption font-medium text-foreground"
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
      <div className={cn("mt-2 text-caption leading-5", tone === "error" ? "text-danger" : "text-text-tertiary")}>
        {detail}
      </div>
    </div>
  );
}

/**
 * 任务失败错误气泡：以 Alice 身份展示，错误原因红字，补救方法为可点击气泡。
 * 复用 splitClarificationForDisplay 将编号列表项解析为可点击建议。
 */
export function AliceErrorBubble({
  body,
  datetime,
  composerDraft = "",
  onSuggestionToggle,
}: {
  body: string;
  datetime: string;
  composerDraft?: string;
  onSuggestionToggle?: (item: string) => void;
}) {
  const errorBody = humanizeTaskErrorMessage(body);
  const { leading, suggestions } = splitClarificationForDisplay(errorBody);
  const interactive = typeof onSuggestionToggle === "function" && suggestions.length > 0;
  // 去重建议列表
  const uniqueSuggestions = suggestions.filter(
    (s, i) => suggestions.findIndex((x) => x === s) === i,
  );

  const displayCause = leading || (uniqueSuggestions.length > 0 ? "" : errorBody);

  return (
    <div className="flex w-full justify-start">
      <div className={cn("group flex items-start gap-3", SIMPLE_CHAT_BUBBLE_MAX)}>
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

          {/* 错误原因 */}
          {displayCause ? (
            <div className="shrink-0 rounded-panel border border-danger-border bg-danger-bg px-4 py-3">
              <div className="whitespace-pre-wrap text-body leading-7 text-danger">
                {displayCause}
              </div>
            </div>
          ) : null}

          {/* 补救措施（可点击气泡） */}
          {uniqueSuggestions.length > 0 ? (
            <div className="space-y-2.5">
              <p className="text-caption font-medium text-text-tertiary">可尝试以下操作：</p>
              <div className="flex flex-row flex-wrap items-start gap-2">
                {uniqueSuggestions.map((item, index) => {
                  const selected = composerDraftContainsSuggestion(composerDraft, item);
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
                        key={`err-sug-${index}-${item.slice(0, 24)}`}
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
                    <div key={`err-sug-${index}-${item.slice(0, 24)}`} className={chipClass}>
                      <span className="whitespace-pre-wrap break-words">{item}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
          <div className="mt-1 text-left text-caption text-text-tertiary">
            {formatTimeForBubble(datetime)}
          </div>
        </div>
      </div>
    </div>
  );
}
