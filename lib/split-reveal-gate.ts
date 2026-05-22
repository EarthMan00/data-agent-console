import { sleep } from "@/lib/agent-runtime/util";
import { workspaceStore } from "@/lib/workspace-store";

type Waiter = {
  resolve: () => void;
  promise: Promise<void>;
  settled: boolean;
};

const waiters = new Map<string, Waiter>();

export function isSplitRevealCompleteInStore(roundId: string): boolean {
  const snap = workspaceStore.getSnapshot();
  return snap.runs.some((run) => Boolean(run.splitRevealCompleteByRound?.[roundId]));
}

export function isSplitStreamEndedInStore(roundId: string): boolean {
  const snap = workspaceStore.getSnapshot();
  return snap.runs.some((run) => Boolean(run.splitStreamEndedByRound?.[roundId]));
}

/** 按步骤文案长度估算打字机所需时间（ms） */
export function estimateSplitTypewriterMs(stepLabels: string[]): number {
  if (stepLabels.length === 0) return 400;
  const body = stepLabels
    .map((label, i) => `${i + 1}. ${label.replace(/^\d+[）).、]\s*/, "")}`)
    .join("\n");
  const chars = [...body].length;
  return Math.min(28_000, Math.max(700, chars * 20 + stepLabels.length * 180));
}

export function registerSplitRevealWait(roundId: string): void {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = () => {
      const w = waiters.get(roundId);
      if (!w || w.settled) return;
      w.settled = true;
      waiters.delete(roundId);
      r();
    };
  });
  waiters.set(roundId, { promise, resolve, settled: false });
}

export function notifySplitRevealComplete(roundId: string): void {
  waiters.get(roundId)?.resolve();
}

export function clearSplitRevealWait(roundId: string): void {
  const w = waiters.get(roundId);
  if (w && !w.settled) {
    w.settled = true;
    w.resolve();
  }
  waiters.delete(roundId);
}

export async function yieldToUi(): Promise<void> {
  await sleep(0);
  if (typeof window !== "undefined" && typeof requestAnimationFrame === "function") {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  } else {
    await sleep(32);
  }
}

/**
 * 等待任务拆分 UI 展示完毕：轮询 store + 文案长度预算；不依赖单次 React effect。
 */
export async function waitForSplitRevealComplete(
  roundId: string,
  stepLabels: string[],
  options?: { timeoutMs?: number },
): Promise<void> {
  const budgetMs = options?.timeoutMs ?? estimateSplitTypewriterMs(stepLabels);
  const deadline = Date.now() + budgetMs;

  await yieldToUi();

  if (!waiters.has(roundId)) {
    registerSplitRevealWait(roundId);
  }

  while (Date.now() < deadline) {
    if (isSplitRevealCompleteInStore(roundId)) {
      clearSplitRevealWait(roundId);
      return;
    }
    await sleep(48);
  }

  clearSplitRevealWait(roundId);
}
