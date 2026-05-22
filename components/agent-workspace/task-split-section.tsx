"use client";

import { useCallback, useEffect, useRef } from "react";

import { useTypewriterReveal } from "@/lib/use-typewriter-reveal";

function charLen(text: string): number {
  return [...text].length;
}

function cleanSplitLabel(item: string): string {
  return item.replace(/^\d+[）).、]\s*/, "");
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
  if (items.length === 0) return null;

  const body = buildSplitBody(items);
  const itemsFingerprint = items.join("\u0001");
  const latchedRef = useRef(false);
  if (reveal) latchedRef.current = true;

  const runTypewriter = reveal && latchedRef.current && body.length > 0;
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

  return (
    <div className="space-y-2 px-1" data-testid={testId}>
      <div className="text-[14px] font-semibold text-[#202124]">任务拆分</div>
      <div className="space-y-2 text-[13px] leading-6.5 text-[#4f5753]">
        {displayRows.map((row) => (
          <div key={`${row.num}-${row.text.slice(0, 24)}`} className="flex gap-2">
            <span className="pt-[1px] text-[#9aa39e]">{row.num}.</span>
            <p className="min-w-0 flex-1 whitespace-pre-wrap">
              {row.text}
              {showCursor && row.num === displayRows[displayRows.length - 1]?.num ? (
                <span className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] animate-pulse bg-[#94a3b8]" />
              ) : null}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
