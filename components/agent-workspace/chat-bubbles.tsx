"use client";

import { ChevronDown, FileText } from "lucide-react";

import { ChatMarkdown } from "@/components/chat-markdown";
import { cn } from "@/lib/utils";
import { stripModelThinkingForUi } from "@/lib/strip-model-thinking";

function splitMessageLines(text: string) {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/** 普通对话：与消息列表同列宽，用户气泡贴右、助手气泡贴左，最大宽度一致 */
export const SIMPLE_CHAT_COLUMN_MAX = "max-w-[min(100%,800px)]";
export const SIMPLE_CHAT_BUBBLE_MAX = "max-w-[min(100%,720px)]";

function formatTimeForBubble(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

/** 与 app-demo `live-agent-workbench` BubbleLine 对齐：普通对话气泡 */
export function SimpleUserBubble({ text, datetime }: { text: string; datetime: string }) {
  return (
    <div className="flex w-full justify-end" data-testid="agent-user-input-card">
      <div className={cn("group flex flex-col items-end", SIMPLE_CHAT_BUBBLE_MAX)}>
        <div className="mb-1 text-[11px] text-[#78716c] opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          {formatTimeForBubble(datetime)}
        </div>
        <div className="shrink-0 rounded-[16px] bg-[#e8e8ed] px-4 py-3 text-[15px] leading-7 text-[#1c1917] shadow-sm">
          <div className="break-words whitespace-pre-wrap">{text}</div>
        </div>
      </div>
    </div>
  );
}

export function SimpleAssistantBubble({ body, datetime }: { body: string; datetime: string }) {
  return (
    <div className="flex w-full justify-start">
      <div className={cn("group flex flex-col items-start", SIMPLE_CHAT_BUBBLE_MAX)}>
        <div className="mb-1 text-[11px] text-[#94a3b8] opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          {formatTimeForBubble(datetime)}
        </div>
        <div className="shrink-0 rounded-[16px] border border-[#e1e6ef] bg-white px-4 py-3 text-[#324357] shadow-sm">
          <div className="text-[11px] font-medium uppercase tracking-wide text-[#64748b] opacity-80">助手</div>
          <div className="mt-1 min-w-0">
            <ChatMarkdown>{stripModelThinkingForUi(body)}</ChatMarkdown>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SimpleSystemBubble({ message }: { message: string }) {
  return (
    <div className="flex w-full justify-start">
      <div
        className={cn(
          "shrink-0 rounded-[16px] border border-[#e8e0d0] bg-[#fffbf5] px-4 py-3 text-[15px] leading-7 text-[#57534e] shadow-sm",
          SIMPLE_CHAT_BUBBLE_MAX,
        )}
      >
        <div className="text-[11px] font-medium uppercase tracking-wide opacity-70">系统</div>
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
      <div className={cn("w-full max-w-[780px]", role === "user" ? "items-end" : "items-start")}>
        <div
          className={cn(
            "px-5 py-4",
            role === "user"
              ? "rounded-none bg-transparent px-0 py-0 text-[#202124] shadow-none"
              : tone === "status"
                ? "rounded-[16px] border border-[#e6dcc8] bg-[linear-gradient(180deg,#fffdf8,#faf6eb)] text-[#5d5442] shadow-none"
                : "border border-[#e5e7eb] bg-[linear-gradient(180deg,#ffffff,#fafafa)] text-[#39403c]",
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
            <div className="mt-3 text-right text-[11px] text-[#b0b4b8]">
              {datetime}
            </div>
          ) : null}
        </div>
        {role === "assistant" ? (
          <div className="mb-2 mt-2 flex items-center gap-2 text-[11px] justify-start text-[#7a8380]">
            <span className="font-medium text-[#1f2421]">{title}</span>
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
      className="flex w-full items-center justify-between rounded-[16px] border border-[#eceef1] bg-[#fcfcfd] px-4 py-3.5 text-left"
      data-testid={testId}
    >
      <div className="text-[14px] font-semibold text-[#1f2421]">{title}</div>
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
        "rounded-[16px] border px-4 py-3 shadow-[0_12px_28px_rgba(15,23,42,0.05)]",
        tone === "error"
          ? "border-[#fecaca] bg-[#fef2f2]"
          : "border-[#eceef1] bg-white",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div
          className={cn(
            "flex items-center gap-2 text-[12px] font-medium",
            tone === "error" ? "text-[#991b1b]" : "text-[#3f4542]",
          )}
        >
          <div className="flex h-5 w-5 items-center justify-center rounded-full border border-[#e5e7eb] bg-[#fafafa]">
            <FileText className="h-3 w-3" />
          </div>
          {title}
        </div>
        {onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="rounded-[8px] border border-[#e5e7eb] bg-[#fafafa] px-2 py-0.5 text-[11px] font-medium text-[#3a403d]"
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
      <div className={cn("mt-2 text-[11px] leading-5", tone === "error" ? "text-[#b91c1c]" : "text-[#6c7571]")}>
        {detail}
      </div>
    </div>
  );
}
