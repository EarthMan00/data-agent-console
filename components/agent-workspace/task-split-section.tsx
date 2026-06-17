"use client";

import { useCallback, useEffect, useRef } from "react";

import { useTypewriterReveal } from "@/lib/use-typewriter-reveal";
import { ORCHESTRATION_BLOCK_MAX } from "@/components/agent-workspace/chat-bubbles";
import { humanizeStepLabelForUi } from "@/lib/humanize-step-label";
import { cn } from "@/lib/utils";

function charLen(text: string): number {
  return [...text].length;
}

function cleanSplitLabel(item: string): string {
  return humanizeStepLabelForUi(item.replace(/^\d+[）).、]\s*/, ""));
}

function buildSplitBody(items: string[]): string {
  return items.map((item, i) => `${i + 1}. ${cleanSplitLabel(item)}`).join("\n");
}

function visibleSplitRows(items: string[], shown: string): Array<{ num: number; text: string }> {
  const rows: Array<{ num: number; text: string }> = [];
  let pos = 0;
  for (let i = 0; i < items.length; i += 1) {
    const num = i + 1;
    const label = cleanSplitLabel(items[i]!);
    const segment = `${num}. ${label}`;
    if (shown.length <= pos) break;
    const slice = shown.slice(pos);
    if (shown.length >= pos + segment.length) {
      rows.push({ num, text: label });
      pos += segment.length + (i < items.length - 1 ? 1 : 0);
    } else {
      const prefix = `${num}. `;
      const partial = slice.startsWith(prefix) ? slice.slice(prefix.length) : slice;
      rows.push({ num, text: partial });
      break;
    }
  }
  return rows;
}

/** 任务拆分：支持打字机逐字展示（含 SSE split_delta 增量步骤）。 */
export function TaskSplitSection({
  items,
  reveal = true,
  streamEnded = false,
  testId = "agent-split-section",
  onRevealComplete,
}: {
  items: string[];
  reveal?: boolean;
  /** 拆分 SSE 已全部到达；未结束前不触发 onRevealComplete */
  streamEnded?: boolean;
  testId?: string;
  /** 流式/打字机展示全部结束（或无打字机时立即触发） */
  onRevealComplete?: () => void;
}) {
  const body = buildSplitBody(items);
  const itemsFingerprint = items.join("\u0001");

  const runTypewriter = reveal && body.length > 0;
  const { text: shown, revealing } = useTypewriterReveal(body, runTypewriter, { charIntervalMs: 18 });
  const displayRows = runTypewriter
    ? visibleSplitRows(items, shown)
    : items.map((item, i) => ({ num: i + 1, text: cleanSplitLabel(item) }));
  const showCursor = runTypewriter && revealing && !streamEnded;

  const completedRef = useRef(false);
  const prevFingerprintRef = useRef(itemsFingerprint);

  const tryComplete = useCallback(() => {
    if (completedRef.current || !onRevealComplete) return;
    if (!streamEnded || items.length === 0) return;
    const typewriterDone = !runTypewriter || (!revealing && charLen(shown) >= charLen(body));
    if (reveal && runTypewriter && !typewriterDone) return;
    completedRef.current = true;
    onRevealComplete();
  }, [
    onRevealComplete,
    streamEnded,
    items.length,
    reveal,
    runTypewriter,
    revealing,
    shown,
    body,
  ]);

  useEffect(() => {
    if (prevFingerprintRef.current !== itemsFingerprint) {
      completedRef.current = false;
      prevFingerprintRef.current = itemsFingerprint;
    }
  }, [itemsFingerprint]);

  useEffect(() => {
    if (!streamEnded) return;
    tryComplete();
    const timers = [0, 32, 96, 240, 500, 1000].map((ms) => window.setTimeout(tryComplete, ms));
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [streamEnded, tryComplete]);

  if (items.length === 0) return null;

  return (
    <div className={cn("space-y-2 px-1", ORCHESTRATION_BLOCK_MAX)} data-testid={testId}>
      <div className="text-body font-semibold text-foreground">任务拆分</div>
      <div className="space-y-2.5 text-body leading-6.5 text-text-secondary">
        {displayRows.map((row) => (
          <div key={`${row.num}-${row.text}`} className="flex items-start gap-2.5">
            <span className="shrink-0 pt-px text-text-disabled">{row.num}.</span>
            <p className="min-w-0 flex-1 break-words overflow-wrap-anywhere whitespace-pre-wrap">
              {row.text}
              {showCursor && row.num === displayRows[displayRows.length - 1]?.num ? (
                <span className="ml-0.5 inline-block h-caret w-0.5 translate-y-0.5 animate-pulse bg-text-disabled" />
              ) : null}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
