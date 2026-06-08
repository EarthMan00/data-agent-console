"use client";

import { useEffect, useRef, useState } from "react";

function charLen(text: string): number {
  return [...text].length;
}

export function takeChars(text: string, n: number): string {
  return [...text].slice(0, n).join("");
}

export type TypewriterRevealOptions = {
  charIntervalMs?: number;
};

export type TypewriterRevealResult = {
  /** 当前应展示的文字 */
  text: string;
  /** 仍在逐字追平目标全文（含 SSE 已结束但 UI 未打完） */
  revealing: boolean;
};

/**
 * 打字机展示：SSE 结束后也会继续逐字追平，不会在流结束时一次性跳全文。
 */
export function useTypewriterReveal(
  target: string,
  enabled: boolean,
  options?: TypewriterRevealOptions,
): TypewriterRevealResult {
  const charIntervalMs = options?.charIntervalMs ?? 22;

  const [display, setDisplay] = useState(() => (enabled ? "" : target));
  const displayLenRef = useRef(enabled ? 0 : charLen(target));
  const targetRef = useRef(target);
  const enabledRef = useRef(enabled);
  const prevEnabledRef = useRef(enabled);

  useEffect(() => {
    targetRef.current = target;
  }, [target]);

  useEffect(() => {
    const wasDisabled = !prevEnabledRef.current;
    prevEnabledRef.current = enabled;
    enabledRef.current = enabled;
    if (!enabled) {
      displayLenRef.current = charLen(target);
      setDisplay(target);
      return;
    }
    // 从 disabled 切到 enabled 且已有内容时重置打字机，避免恢复内容一次性全量展示
    if (wasDisabled || charLen(target) === 0) {
      displayLenRef.current = 0;
      setDisplay("");
    }
  }, [enabled, target]);

  useEffect(() => {
    if (!enabled) return;

    let raf = 0;
    let lastTs = performance.now();
    let carry = 0;

    const tick = (ts: number) => {
      if (!enabledRef.current) return;

      const full = targetRef.current;
      const fullLen = charLen(full);
      let len = displayLenRef.current;

      if (len < fullLen) {
        const dt = Math.min(ts - lastTs, 64);
        lastTs = ts;
        carry += dt;
        while (carry >= charIntervalMs && len < fullLen) {
          carry -= charIntervalMs;
          len += 1;
        }
        if (len !== displayLenRef.current) {
          displayLenRef.current = len;
          setDisplay(takeChars(full, len));
        }
      }

      if (displayLenRef.current < charLen(targetRef.current)) {
        raf = requestAnimationFrame(tick);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled, charIntervalMs, target]);

  if (!enabled) {
    return { text: target, revealing: false };
  }

  const revealing = charLen(display) < charLen(target);
  return { text: display, revealing };
}
