import { useCallback, useEffect, useRef, type RefObject } from "react";

const DEFAULT_THRESHOLD_PX = 48;

function isPinnedToBottom(el: HTMLElement, thresholdPx: number): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= thresholdPx;
}

function scrollContainerToBottom(el: HTMLElement) {
  el.scrollTop = el.scrollHeight;
}

export type UseChatStickToBottomOptions = {
  /** 距底部多少像素内仍视为「在底部」 */
  thresholdPx?: number;
  /** 切换会话/任务时重置为自动贴底（如 runId、sessionId） */
  resetKey?: string | number | null;
  /** 内容自身尺寸变化时是否继续贴底；历史会话追问会逐步插入任务卡，关闭后可避免视口被反复拉动。 */
  followContentResize?: boolean;
};

/**
 * 聊天区贴底滚动：默认跟随内容到底部；用户上滑后不再抢滚动；用户再次滚到底部后恢复跟随。
 */
export function useChatStickToBottom(
  scrollRef: RefObject<HTMLElement | null>,
  contentRef: RefObject<HTMLElement | null>,
  watchDeps: unknown[],
  options?: UseChatStickToBottomOptions,
) {
  const stickRef = useRef(true);
  const thresholdPx = options?.thresholdPx ?? DEFAULT_THRESHOLD_PX;
  const resetKey = options?.resetKey;
  const followContentResize = options?.followContentResize ?? true;

  const scrollToBottomIfStuck = useCallback(() => {
    const el = scrollRef.current;
    if (!el || !stickRef.current) return;
    requestAnimationFrame(() => {
      const target = scrollRef.current;
      if (!target || !stickRef.current) return;
      scrollContainerToBottom(target);
    });
  }, [scrollRef]);

  useEffect(() => {
    if (resetKey === undefined) return;
    stickRef.current = true;
    scrollToBottomIfStuck();
  }, [resetKey, scrollToBottomIfStuck]);

  useEffect(() => {
    const outer = scrollRef.current;
    if (!outer) return;

    const onScroll = () => {
      stickRef.current = isPinnedToBottom(outer, thresholdPx);
    };

    outer.addEventListener("scroll", onScroll, { passive: true });
    return () => outer.removeEventListener("scroll", onScroll);
  }, [scrollRef, thresholdPx]);

  useEffect(() => {
    const outer = scrollRef.current;
    const inner = contentRef.current;
    if (!outer || !inner) return;

    scrollToBottomIfStuck();

    if (!followContentResize) return undefined;

    const ro = new ResizeObserver(() => scrollToBottomIfStuck());
    ro.observe(inner);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- watchDeps 由调用方显式传入
  }, [scrollRef, contentRef, followContentResize, scrollToBottomIfStuck, ...watchDeps]);

  return { scrollToBottomIfStuck };
}
