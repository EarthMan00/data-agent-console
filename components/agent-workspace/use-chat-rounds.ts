"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  cancelChatRound,
  createChatRound,
  getChatRound,
  resumeChatRound,
  subscribeChatRoundEvents,
} from "@/lib/agent-api/chat-rounds";
import { listSessionMessages } from "@/lib/agent-api/client";
import { applyRoundEvent } from "@/lib/agent-api/round-events";
import type {
  ChatRoundSnapshot,
  ChatRoundStatus,
  RoundAccepted,
} from "@/lib/agent-api/types";
import { roundIdsFromMessages } from "@/lib/session-rounds";

const RECONNECT_DELAYS_MS = [250, 500, 1_000, 2_000] as const;
const PLAN_SNAPSHOT_SYNC_DELAY_MS = 500;
const TERMINAL_STATUSES = new Set<ChatRoundStatus>([
  "SUCCEEDED",
  "PARTIAL_SUCCESS",
  "FAILED",
  "CANCELLED",
]);

type WithFreshToken = <T>(
  run: (token: string) => Promise<T>,
) => Promise<T>;

type UseChatRoundsInput = {
  sessionId: string;
  withFreshToken: WithFreshToken;
};

type UseChatRoundsResult = {
  snapshots: ReadonlyMap<string, ChatRoundSnapshot>;
  activeRound: ChatRoundSnapshot | null;
  loading: boolean;
  error: string;
  send: (
    message: string,
    clientMessageId: string,
    files: File[],
  ) => Promise<RoundAccepted>;
  resume: (
    roundId: string,
    message: string,
    clientMessageId: string,
    files: File[],
  ) => Promise<void>;
  cancel: (roundId: string) => Promise<ChatRoundSnapshot>;
  reload: () => Promise<void>;
};

function isTerminal(status: ChatRoundStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

function acceptedShell(accepted: RoundAccepted): ChatRoundSnapshot {
  return {
    round_id: accepted.round_id,
    session_id: accepted.session_id,
    status: accepted.status,
    assistant_message_id: accepted.assistant_message_id,
    content: "",
    last_event_seq: accepted.last_event_seq,
    steps: [],
    error_code: null,
    error_message: null,
  };
}

function publicErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useChatRounds({
  sessionId,
  withFreshToken,
}: UseChatRoundsInput): UseChatRoundsResult {
  const [snapshots, setSnapshots] = useState<ReadonlyMap<string, ChatRoundSnapshot>>(
    () => new Map(),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const snapshotsRef = useRef<Map<string, ChatRoundSnapshot>>(new Map());
  const subscriptionsRef = useRef<Map<string, AbortController>>(new Map());
  const timerCleanupsRef = useRef<Set<() => void>>(new Set());
  const planSyncingRef = useRef<Set<string>>(new Set());
  const generationRef = useRef(0);
  const startSubscriptionRef = useRef<
    (roundId: string, generation: number, retryIndex?: number, reconcilePlan?: boolean) => void
  >(() => undefined);
  const cancellationRef = useRef<Map<string, Promise<ChatRoundSnapshot>>>(new Map());

  const publishSnapshot = useCallback(
    (
      snapshot: ChatRoundSnapshot,
      options: { newest?: boolean } = {},
    ): ChatRoundSnapshot => {
      const current = snapshotsRef.current;
      const existing = current.get(snapshot.round_id);
      const published =
        existing && existing.last_event_seq > snapshot.last_event_seq
          ? existing
          : snapshot;
      let next: Map<string, ChatRoundSnapshot>;
      if (options.newest) {
        const remaining = [...current].filter(([roundId]) => roundId !== snapshot.round_id);
        next = new Map([[snapshot.round_id, published], ...remaining]);
      } else {
        next = new Map(current);
        next.set(snapshot.round_id, published);
      }
      snapshotsRef.current = next;
      setSnapshots(next);
      return published;
    },
    [],
  );

  const stopSubscription = useCallback((roundId: string) => {
    const controller = subscriptionsRef.current.get(roundId);
    if (!controller) return;
    subscriptionsRef.current.delete(roundId);
    controller.abort();
  }, []);

  const closeDisplayChannels = useCallback(() => {
    for (const controller of subscriptionsRef.current.values()) {
      controller.abort();
    }
    subscriptionsRef.current.clear();
    for (const cleanup of [...timerCleanupsRef.current]) cleanup();
    timerCleanupsRef.current.clear();
  }, []);

  const waitForDelay = useCallback(
    (delayMs: number, generation: number): Promise<boolean> =>
      new Promise((resolve) => {
        if (generation !== generationRef.current) {
          resolve(false);
          return;
        }
        let settled = false;
        const finish = (canContinue: boolean) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          timerCleanupsRef.current.delete(cancel);
          resolve(canContinue);
        };
        const cancel = () => finish(false);
        const timer = setTimeout(
          () => finish(generation === generationRef.current),
          delayMs,
        );
        timerCleanupsRef.current.add(cancel);
      }),
    [],
  );

  const loadRoundSnapshot = useCallback(
    (roundId: string) =>
      withFreshToken((token) => getChatRound(token, roundId)),
    [withFreshToken],
  );

  const startPlanSnapshotSync = useCallback(
    (roundId: string, generation: number) => {
      if (planSyncingRef.current.has(roundId)) return;
      planSyncingRef.current.add(roundId);

      let stopped = false;
      let timer: ReturnType<typeof setTimeout> | null = null;
      const cleanup = () => {
        if (stopped) return;
        stopped = true;
        if (timer !== null) clearTimeout(timer);
        timerCleanupsRef.current.delete(cleanup);
        planSyncingRef.current.delete(roundId);
      };
      timerCleanupsRef.current.add(cleanup);

      const sync = async () => {
        if (stopped || generation !== generationRef.current) {
          cleanup();
          return;
        }
        const current = snapshotsRef.current.get(roundId);
        if (
          !current ||
          isTerminal(current.status) ||
          current.steps.length > 0 ||
          !["QUEUED", "PLANNING", "EXECUTING"].includes(current.status)
        ) {
          cleanup();
          return;
        }

        try {
          const authoritative = await loadRoundSnapshot(roundId);
          if (stopped || generation !== generationRef.current) {
            cleanup();
            return;
          }
          const published = publishSnapshot(authoritative);
          if (
            isTerminal(published.status) ||
            published.steps.length > 0 ||
            !["QUEUED", "PLANNING", "EXECUTING"].includes(published.status)
          ) {
            cleanup();
            return;
          }
        } catch {
          // The SSE channel remains authoritative; a transient GET failure
          // should not surface a duplicate error or stop the subscription.
        }

        if (!stopped) {
          timer = setTimeout(sync, PLAN_SNAPSHOT_SYNC_DELAY_MS);
        }
      };

      // Let the accepted shell publish first. The next event-loop turn then
      // reconciles the authoritative status/steps without delaying send().
      timer = setTimeout(sync, 0);
    },
    [loadRoundSnapshot, publishSnapshot],
  );

  const startSubscription = useCallback(
    (roundId: string, generation: number, retryIndex = 0, reconcilePlan = false) => {
      if (generation !== generationRef.current) return;
      const initial = snapshotsRef.current.get(roundId);
      if (!initial || isTerminal(initial.status)) {
        stopSubscription(roundId);
        return;
      }

      if (reconcilePlan && initial.steps.length === 0) {
        startPlanSnapshotSync(roundId, generation);
      }

      stopSubscription(roundId);
      const controller = new AbortController();
      subscriptionsRef.current.set(roundId, controller);

      void (async () => {
        const reloadBeforeReconnect = async (currentRetryIndex: number): Promise<void> => {
          if (
            controller.signal.aborted ||
            generation !== generationRef.current ||
            subscriptionsRef.current.get(roundId) !== controller
          ) {
            return;
          }

          let authoritative: ChatRoundSnapshot;
          try {
            authoritative = await loadRoundSnapshot(roundId);
          } catch (reloadError) {
            if (
              controller.signal.aborted ||
              generation !== generationRef.current ||
              subscriptionsRef.current.get(roundId) !== controller
            ) {
              return;
            }
            setError(publicErrorMessage(reloadError));
            const reloadDelay = RECONNECT_DELAYS_MS[
              Math.min(currentRetryIndex, RECONNECT_DELAYS_MS.length - 1)
            ];
            if (await waitForDelay(reloadDelay, generation)) {
              await reloadBeforeReconnect(currentRetryIndex + 1);
            }
            return;
          }

          if (
            generation !== generationRef.current ||
            subscriptionsRef.current.get(roundId) !== controller
          ) {
            return;
          }
          publishSnapshot(authoritative);
          if (isTerminal(authoritative.status)) {
            stopSubscription(roundId);
            setError("");
            return;
          }

          const reconnectDelay = RECONNECT_DELAYS_MS[
            Math.min(currentRetryIndex, RECONNECT_DELAYS_MS.length - 1)
          ];
          if (!(await waitForDelay(reconnectDelay, generation))) return;
          if (
            generation !== generationRef.current ||
            subscriptionsRef.current.get(roundId) !== controller
          ) {
            return;
          }
          subscriptionsRef.current.delete(roundId);
          setError("");
          startSubscriptionRef.current(
            roundId,
            generation,
            currentRetryIndex + 1,
            reconcilePlan,
          );
        };

        try {
          await withFreshToken((token) =>
            subscribeChatRoundEvents(
              token,
              roundId,
              initial.last_event_seq,
              {
                onEvent: (event) => {
                  if (
                    controller.signal.aborted ||
                    generation !== generationRef.current ||
                    subscriptionsRef.current.get(roundId) !== controller
                  ) {
                    return;
                  }
                  const current = snapshotsRef.current.get(roundId);
                  if (!current) return;
                  const next = applyRoundEvent(current, event);
                  if (next !== current) publishSnapshot(next);
                  if (isTerminal(next.status)) stopSubscription(roundId);
                },
              },
              { signal: controller.signal },
            ),
          );
        } catch (subscriptionError) {
          if (!controller.signal.aborted && generation === generationRef.current) {
            setError(publicErrorMessage(subscriptionError));
          }
        }

        if (
          controller.signal.aborted ||
          generation !== generationRef.current ||
          subscriptionsRef.current.get(roundId) !== controller
        ) {
          return;
        }

        await reloadBeforeReconnect(retryIndex);
      })();
    },
    [
      loadRoundSnapshot,
      publishSnapshot,
      stopSubscription,
      startPlanSnapshotSync,
      waitForDelay,
      withFreshToken,
    ],
  );
  startSubscriptionRef.current = startSubscription;

  const reload = useCallback(async () => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    closeDisplayChannels();
    setLoading(true);
    setError("");
    if (!sessionId) {
      snapshotsRef.current = new Map();
      setSnapshots(new Map());
      setLoading(false);
      return;
    }

    try {
      const page = await withFreshToken((token) =>
        listSessionMessages(token, sessionId, 100),
      );
      const roundIds = roundIdsFromMessages(page.messages);
      const loaded = await withFreshToken((token) =>
        Promise.all(roundIds.map((roundId) => getChatRound(token, roundId))),
      );
      if (generation !== generationRef.current) return;

      const next = new Map(loaded.map((snapshot) => [snapshot.round_id, snapshot]));
      snapshotsRef.current = next;
      setSnapshots(next);
      setError("");
      for (const snapshot of loaded) {
        if (!isTerminal(snapshot.status)) {
          startSubscriptionRef.current(snapshot.round_id, generation, 0);
        }
      }
    } catch (loadError) {
      if (generation === generationRef.current) {
        setError(publicErrorMessage(loadError));
      }
    } finally {
      if (generation === generationRef.current) setLoading(false);
    }
  }, [closeDisplayChannels, sessionId, withFreshToken]);

  useEffect(() => {
    const cancellations = cancellationRef.current;
    snapshotsRef.current = new Map();
    setSnapshots(new Map());
    void reload();
    return () => {
      generationRef.current += 1;
      closeDisplayChannels();
      cancellations.clear();
    };
  }, [closeDisplayChannels, reload]);

  const send = useCallback(
    async (message: string, clientMessageId: string, files: File[]) => {
      const generation = generationRef.current;
      const accepted = await withFreshToken((token) =>
        createChatRound(token, sessionId, message, clientMessageId, files),
      );
      if (accepted.session_id !== sessionId) {
        throw new Error("created Round does not belong to the active Session");
      }
      if (generation === generationRef.current) {
        const shell = publishSnapshot(acceptedShell(accepted), { newest: true });
        if (!isTerminal(shell.status)) {
          startSubscriptionRef.current(shell.round_id, generation, 0, true);
        }
      }
      return accepted;
    },
    [publishSnapshot, sessionId, withFreshToken],
  );

  const resume = useCallback(
    async (
      roundId: string,
      message: string,
      clientMessageId: string,
      files: File[],
    ) => {
      const generation = generationRef.current;
      const current = snapshotsRef.current.get(roundId);
      if (!current) throw new Error("Round snapshot is not loaded");
      const accepted = await withFreshToken((token) =>
        resumeChatRound(
          token,
          current.session_id,
          roundId,
          message,
          clientMessageId,
          files,
        ),
      );
      if (accepted.round_id !== roundId || accepted.session_id !== current.session_id) {
        throw new Error("resumed Round identity does not match the loaded snapshot");
      }
      if (generation !== generationRef.current) return;
      const resumed: ChatRoundSnapshot = {
        ...current,
        status: accepted.status,
        content: "",
        last_event_seq: accepted.last_event_seq,
      };
      const published = publishSnapshot(resumed);
      if (isTerminal(published.status)) {
        stopSubscription(roundId);
      } else {
        startSubscriptionRef.current(roundId, generation, 0);
      }
    },
    [publishSnapshot, stopSubscription, withFreshToken],
  );

  const cancel = useCallback(
    (roundId: string): Promise<ChatRoundSnapshot> => {
      const existing = cancellationRef.current.get(roundId);
      if (existing) return existing;
      const generation = generationRef.current;
      const cancellation = (async () => {
        let current = await withFreshToken((token) => cancelChatRound(token, roundId));
        if (generation !== generationRef.current) {
          throw new Error("Round controller changed while cancellation was pending");
        }
        current = publishSnapshot(current);
        if (isTerminal(current.status)) {
          stopSubscription(roundId);
          return current;
        }
        if (!subscriptionsRef.current.has(roundId)) {
          startSubscriptionRef.current(roundId, generation, 0);
        }

        let retryIndex = 0;
        while (!isTerminal(current.status)) {
          const observedBeforeDelay = snapshotsRef.current.get(roundId);
          if (observedBeforeDelay && isTerminal(observedBeforeDelay.status)) {
            current = observedBeforeDelay;
            break;
          }
          const delay = RECONNECT_DELAYS_MS[
            Math.min(retryIndex, RECONNECT_DELAYS_MS.length - 1)
          ];
          if (!(await waitForDelay(delay, generation))) {
            throw new Error("Round controller changed while cancellation was pending");
          }
          const observedAfterDelay = snapshotsRef.current.get(roundId);
          if (observedAfterDelay && isTerminal(observedAfterDelay.status)) {
            current = observedAfterDelay;
            break;
          }
          try {
            current = await loadRoundSnapshot(roundId);
            if (generation !== generationRef.current) {
              throw new Error("Round controller changed while cancellation was pending");
            }
            current = publishSnapshot(current);
            setError("");
          } catch (reloadError) {
            if (generation !== generationRef.current) throw reloadError;
            setError(publicErrorMessage(reloadError));
          }
          retryIndex += 1;
        }
        stopSubscription(roundId);
        return current;
      })();
      cancellationRef.current.set(roundId, cancellation);
      const clearPendingCancellation = () => {
        if (cancellationRef.current.get(roundId) === cancellation) {
          cancellationRef.current.delete(roundId);
        }
      };
      void cancellation.then(clearPendingCancellation, clearPendingCancellation);
      return cancellation;
    },
    [loadRoundSnapshot, publishSnapshot, stopSubscription, waitForDelay, withFreshToken],
  );

  const activeRound = useMemo(
    () => snapshots.values().next().value ?? null,
    [snapshots],
  );

  return {
    snapshots,
    activeRound,
    loading,
    error,
    send,
    resume,
    cancel,
    reload,
  };
}
