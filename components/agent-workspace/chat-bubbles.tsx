"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { ChatMarkdown } from "@/components/chat-markdown";
import { UserMessageAttachmentCards } from "@/components/user-message-attachment-cards";
import { DotmSquare11 } from "@/components/ui/dotm-square-11";
import { ALICE_LOGO_SRC } from "@/lib/brand-assets";
import {
  stripModelThinkingForStreamPartial,
  stripModelThinkingForUi,
} from "@/lib/strip-model-thinking";
import { stripInternalToolNamesForUi } from "@/lib/strip-internal-tool-names";
import { useTypewriterReveal } from "@/lib/use-typewriter-reveal";
import type { UserMessageAttachment } from "@/lib/user-message-attachments";
import { cn } from "@/lib/utils";

function charLen(text: string): number {
  return [...text].length;
}

/** 普通对话与 durable Session 消息列表使用同一列宽。 */
export const SIMPLE_CHAT_COLUMN_MAX = "max-w-simple-column";
const SIMPLE_CHAT_BUBBLE_MAX = "max-w-simple-bubble";
const SIMPLE_CHAT_ROW_MAX = "max-w-simple-row";

function formatTimeForBubble(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
}

function AliceAvatar() {
  return (
    <span className="relative mt-1 block h-9 w-9 shrink-0">
      <Image
        src={ALICE_LOGO_SRC}
        alt="Alice"
        fill
        sizes="36px"
        className="object-contain"
        draggable={false}
      />
    </span>
  );
}

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
        {attachments.length > 0 ? (
          <UserMessageAttachmentCards attachments={attachments} />
        ) : null}
        {visibleText ? (
          <div className="shrink-0 rounded-panel bg-fill-hover px-4 py-3 text-body leading-7 text-foreground shadow-none">
            <div className="break-words whitespace-pre-wrap">{visibleText}</div>
          </div>
        ) : null}
        <div className="text-right text-caption text-text-tertiary opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          {formatTimeForBubble(datetime)}
        </div>
      </div>
    </div>
  );
}

/**
 * 与旧任务执行卡片保持一致的 Alice 助手输出容器。
 * Durable Round 的任务执行卡片和最终总结都复用这个容器，保证头像、名称和时间线归属一致。
 */
export function AssistantOutputFrame({
  datetime,
  children,
  className,
  wide = false,
}: {
  datetime?: string;
  children: ReactNode;
  className?: string;
  wide?: boolean;
}) {
  return (
    <div className="flex w-full justify-start">
      <div
        className={cn(
          "group flex items-start gap-3",
          wide ? cn("w-full", SIMPLE_CHAT_ROW_MAX) : SIMPLE_CHAT_BUBBLE_MAX,
          className,
        )}
      >
        <AliceAvatar />
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-3">
            <div className="text-body font-semibold text-foreground">Alice</div>
          </div>
          {children}
          {datetime ? (
            <div className="mt-1 text-left text-caption text-text-tertiary opacity-0 transition-opacity duration-150 group-hover:opacity-100">
              {formatTimeForBubble(datetime)}
            </div>
          ) : null}
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
  after,
}: {
  body: string;
  datetime: string;
  streaming?: boolean;
  typewriter?: boolean;
  /** 附属于同一条 durable assistant 消息的结果卡片。 */
  after?: ReactNode;
}) {
  const targetNorm = (() => {
    const text = streaming
      ? stripModelThinkingForStreamPartial(body)
      : stripModelThinkingForUi(body);
    const visible = text === "（无回复）" ? "" : text;
    return stripInternalToolNamesForUi(visible);
  })();
  const [latchedVisible, setLatchedVisible] = useState(() =>
    targetNorm.trim() ? targetNorm : "",
  );
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
  const showCursor = Boolean(streaming && runTypewriter && revealing);
  const frameMax = after ? cn("w-full", SIMPLE_CHAT_ROW_MAX) : SIMPLE_CHAT_BUBBLE_MAX;

  useEffect(() => {
    if (!revealing && !streaming) {
      latchedStreamRef.current = false;
    }
  }, [revealing, streaming]);

  return (
    <div className="flex w-full justify-start">
      <div className={cn("group flex items-start gap-3", frameMax)}>
        <AliceAvatar />
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
                <DotmSquare11
                  size={22}
                  dotSize={3}
                  speed={1.15}
                  className="shrink-0 text-foreground"
                  aria-hidden
                />
                <span>我正在思考，请等我一下～</span>
              </div>
            </div>
          ) : (
            <div className="shrink-0 rounded-panel border border-border bg-bg-surface px-4 py-3 text-foreground shadow-none">
              <div className="min-w-0">
                <ChatMarkdown>{shown}</ChatMarkdown>
                {showCursor ? (
                  <span
                    className="ml-0.5 inline-block animate-pulse text-text-tertiary"
                    aria-hidden
                  >
                    ▌
                  </span>
                ) : null}
              </div>
            </div>
          )}
          {after ? <div className="mt-2 w-full">{after}</div> : null}
          <div className="mt-1 text-left text-caption text-text-tertiary opacity-0 transition-opacity duration-150 group-hover:opacity-100">
            {formatTimeForBubble(datetime)}
          </div>
        </div>
      </div>
    </div>
  );
}
