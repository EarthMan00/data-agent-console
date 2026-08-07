import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  ChatRoundEvent,
  ChatRoundSnapshot,
  RoundAccepted,
} from "@/lib/agent-api/types";

const agentClientMocks = vi.hoisted(() => ({
  listSessionMessages: vi.fn(),
}));

const roundClientMocks = vi.hoisted(() => ({
  cancelChatRound: vi.fn(),
  createChatRound: vi.fn(),
  getChatRound: vi.fn(),
  resumeChatRound: vi.fn(),
  subscribeChatRoundEvents: vi.fn(),
}));

vi.mock("@/lib/agent-api/client", () => ({
  listSessionMessages: agentClientMocks.listSessionMessages,
}));

vi.mock("@/lib/agent-api/chat-rounds", () => ({
  cancelChatRound: roundClientMocks.cancelChatRound,
  createChatRound: roundClientMocks.createChatRound,
  getChatRound: roundClientMocks.getChatRound,
  resumeChatRound: roundClientMocks.resumeChatRound,
  subscribeChatRoundEvents: roundClientMocks.subscribeChatRoundEvents,
}));

import { useChatRounds } from "@/components/agent-workspace/use-chat-rounds";

const TOKEN = "access-token";
const SESSION_A = "11111111-1111-4111-8111-111111111111";
const SESSION_B = "22222222-2222-4222-8222-222222222222";
const ROUND_A = "33333333-3333-4333-8333-333333333333";
const ROUND_B = "44444444-4444-4444-8444-444444444444";
const ASSISTANT_A = "55555555-5555-4555-8555-555555555555";
const ASSISTANT_B = "66666666-6666-4666-8666-666666666666";
const CLIENT_MESSAGE_ID = "77777777-7777-4777-8777-777777777777";

const TERMINAL = new Set(["SUCCEEDED", "PARTIAL_SUCCESS", "FAILED", "CANCELLED"]);

function snapshot(
  roundId: string,
  overrides: Partial<ChatRoundSnapshot> = {},
): ChatRoundSnapshot {
  return {
    round_id: roundId,
    session_id: SESSION_A,
    status: "EXECUTING",
    assistant_message_id: roundId === ROUND_A ? ASSISTANT_A : ASSISTANT_B,
    content: "working",
    last_event_seq: 2,
    steps: [],
    error_code: null,
    error_message: null,
    ...overrides,
  };
}

function event(
  roundId: string,
  seq: number,
  eventType: string,
  payload: Record<string, unknown>,
): ChatRoundEvent {
  return {
    round_id: roundId,
    seq,
    event_type: eventType,
    payload,
    created_at: "2026-07-27T00:00:00Z",
  };
}

function messagesFor(...roundIds: string[]) {
  return {
    messages: roundIds.map((roundId, index) => ({
      id: `message-${index}`,
      role: "assistant",
      content: "",
      created_at: "2026-07-27T00:00:00Z",
      message_index: index + 1,
      meta: { round_id: roundId },
    })),
    has_more: false,
  };
}

function withFreshToken<T>(run: (token: string) => Promise<T>): Promise<T> {
  return run(TOKEN);
}

function abortableSubscription(signal?: AbortSignal): Promise<{ kind: "subscription_closed" }> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve({ kind: "subscription_closed" });
      return;
    }
    signal?.addEventListener(
      "abort",
      () => resolve({ kind: "subscription_closed" }),
      { once: true },
    );
  });
}

async function settle(rounds = 8): Promise<void> {
  await act(async () => {
    for (let index = 0; index < rounds; index += 1) {
      await Promise.resolve();
    }
  });
}

beforeEach(() => {
  agentClientMocks.listSessionMessages.mockReset();
  roundClientMocks.cancelChatRound.mockReset();
  roundClientMocks.createChatRound.mockReset();
  roundClientMocks.getChatRound.mockReset();
  roundClientMocks.resumeChatRound.mockReset();
  roundClientMocks.subscribeChatRoundEvents.mockReset();

  agentClientMocks.listSessionMessages.mockResolvedValue(messagesFor(ROUND_A));
  roundClientMocks.getChatRound.mockImplementation(async (_token, roundId) =>
    snapshot(roundId),
  );
  roundClientMocks.subscribeChatRoundEvents.mockImplementation(
    async (_token, _roundId, _afterSeq, _handlers, init) =>
      abortableSubscription(init?.signal),
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useChatRounds", () => {
  it("loads messages, fetches newest snapshots, and subscribes once per nonterminal Round", async () => {
    agentClientMocks.listSessionMessages.mockResolvedValue(
      messagesFor(ROUND_A, ROUND_B),
    );
    roundClientMocks.getChatRound.mockImplementation(async (_token, roundId) =>
      roundId === ROUND_A
        ? snapshot(ROUND_A, { status: "SUCCEEDED" })
        : snapshot(ROUND_B, { last_event_seq: 7 }),
    );

    const { result, unmount } = renderHook(() =>
      useChatRounds({ sessionId: SESSION_A, withFreshToken }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(agentClientMocks.listSessionMessages).toHaveBeenCalledWith(TOKEN, SESSION_A, 100);
    expect(roundClientMocks.getChatRound.mock.calls.map((call) => call[1])).toEqual([
      ROUND_B,
      ROUND_A,
    ]);
    expect([...result.current.snapshots.keys()]).toEqual([ROUND_B, ROUND_A]);
    expect(result.current.activeRound?.round_id).toBe(ROUND_B);
    expect(roundClientMocks.subscribeChatRoundEvents).toHaveBeenCalledOnce();
    expect(roundClientMocks.subscribeChatRoundEvents.mock.calls[0].slice(0, 3)).toEqual([
      TOKEN,
      ROUND_B,
      7,
    ]);

    unmount();
  });

  it("aborts subscriptions on cleanup but never cancels or releases a durable Round", async () => {
    const abortSpy = vi.spyOn(AbortController.prototype, "abort");
    const { result, unmount } = renderHook(() =>
      useChatRounds({ sessionId: SESSION_A, withFreshToken }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    unmount();
    await settle();

    expect(abortSpy).toHaveBeenCalled();
    expect(roundClientMocks.cancelChatRound).not.toHaveBeenCalled();
  });

  it("reloads after SSE failure and reconnects from the authoritative seq with bounded backoff", async () => {
    vi.useFakeTimers();
    const loadedSeqs = [2, 5, 8, 13, 21];
    roundClientMocks.getChatRound.mockImplementation(async () =>
      snapshot(ROUND_A, { last_event_seq: loadedSeqs.shift() ?? 21 }),
    );
    roundClientMocks.subscribeChatRoundEvents.mockRejectedValue(new Error("network closed"));

    const { result, unmount } = renderHook(() =>
      useChatRounds({ sessionId: SESSION_A, withFreshToken }),
    );
    await settle();
    expect(result.current.loading).toBe(false);
    expect(roundClientMocks.subscribeChatRoundEvents.mock.calls[0][2]).toBe(2);

    for (const [index, delay] of [250, 500, 1_000, 2_000].entries()) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(delay - 1);
      });
      expect(roundClientMocks.subscribeChatRoundEvents).toHaveBeenCalledTimes(index + 1);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      await settle();
      expect(roundClientMocks.subscribeChatRoundEvents.mock.calls[index + 1][2]).toBe(
        [5, 8, 13, 21][index],
      );
    }

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_999);
    });
    expect(roundClientMocks.subscribeChatRoundEvents).toHaveBeenCalledTimes(5);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(roundClientMocks.subscribeChatRoundEvents).toHaveBeenCalledTimes(6);
    unmount();
  });

  it("stops reconnecting after a terminal event", async () => {
    vi.useFakeTimers();
    roundClientMocks.subscribeChatRoundEvents.mockImplementation(
      async (_token, roundId, _afterSeq, handlers) => {
        handlers.onEvent?.(
          event(roundId, 3, "round.completed", {
            status: "SUCCEEDED",
            content: "done",
          }),
        );
        return { kind: "stream_ended" };
      },
    );

    const { result, unmount } = renderHook(() =>
      useChatRounds({ sessionId: SESSION_A, withFreshToken }),
    );
    await settle();
    expect(result.current.snapshots.get(ROUND_A)?.status).toBe("SUCCEEDED");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(roundClientMocks.subscribeChatRoundEvents).toHaveBeenCalledOnce();
    unmount();
  });

  it("reloads a snapshot before resubscribing when an event seq has a gap", async () => {
    vi.useFakeTimers();
    roundClientMocks.getChatRound
      .mockResolvedValueOnce(snapshot(ROUND_A, { last_event_seq: 2 }))
      .mockResolvedValueOnce(snapshot(ROUND_A, { last_event_seq: 9 }));
    roundClientMocks.subscribeChatRoundEvents
      .mockImplementationOnce(async (_token, roundId, _afterSeq, handlers) => {
        handlers.onEvent?.(event(roundId, 5, "round.executing", { status: "EXECUTING" }));
        return { kind: "stream_ended" };
      })
      .mockImplementation(async (_token, _roundId, _afterSeq, _handlers, init) =>
        abortableSubscription(init?.signal),
      );

    const { unmount } = renderHook(() =>
      useChatRounds({ sessionId: SESSION_A, withFreshToken }),
    );
    await settle();
    expect(roundClientMocks.getChatRound).toHaveBeenCalledTimes(2);
    expect(roundClientMocks.subscribeChatRoundEvents).toHaveBeenCalledOnce();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    await settle();
    expect(roundClientMocks.subscribeChatRoundEvents.mock.calls[1][2]).toBe(9);
    unmount();
  });

  it("does not subscribe from a stale cursor while an authoritative reload is failing", async () => {
    vi.useFakeTimers();
    roundClientMocks.getChatRound
      .mockResolvedValueOnce(snapshot(ROUND_A, { last_event_seq: 2 }))
      .mockRejectedValueOnce(new Error("snapshot unavailable"))
      .mockResolvedValueOnce(snapshot(ROUND_A, { last_event_seq: 9 }));
    roundClientMocks.subscribeChatRoundEvents
      .mockRejectedValueOnce(new Error("network closed"))
      .mockImplementation(async (_token, _roundId, _afterSeq, _handlers, init) =>
        abortableSubscription(init?.signal),
      );

    const { unmount } = renderHook(() =>
      useChatRounds({ sessionId: SESSION_A, withFreshToken }),
    );
    await settle();
    expect(roundClientMocks.getChatRound).toHaveBeenCalledTimes(2);
    expect(roundClientMocks.subscribeChatRoundEvents).toHaveBeenCalledOnce();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    await settle();
    expect(roundClientMocks.getChatRound).toHaveBeenCalledTimes(3);
    expect(roundClientMocks.subscribeChatRoundEvents).toHaveBeenCalledOnce();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(499);
    });
    expect(roundClientMocks.subscribeChatRoundEvents).toHaveBeenCalledOnce();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(roundClientMocks.subscribeChatRoundEvents.mock.calls[1][2]).toBe(9);
    unmount();
  });

  it("publishes a new Map identity for each event update", async () => {
    let deliver: ((roundEvent: ChatRoundEvent) => void) | undefined;
    roundClientMocks.subscribeChatRoundEvents.mockImplementation(
      async (_token, _roundId, _afterSeq, handlers, init) => {
        deliver = handlers.onEvent;
        return abortableSubscription(init?.signal);
      },
    );
    const { result, unmount } = renderHook(() =>
      useChatRounds({ sessionId: SESSION_A, withFreshToken }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    const before = result.current.snapshots;

    act(() => {
      deliver?.(event(ROUND_A, 3, "assistant.delta", { content: "new content" }));
    });

    expect(result.current.snapshots).not.toBe(before);
    expect(result.current.snapshots.get(ROUND_A)?.content).toBe("new content");
    unmount();
  });

  it("closes old subscriptions on Session change without changing or cancelling the old Round", async () => {
    const abortSpy = vi.spyOn(AbortController.prototype, "abort");
    agentClientMocks.listSessionMessages.mockImplementation(async (_token, sessionId) =>
      sessionId === SESSION_A ? messagesFor(ROUND_A) : messagesFor(ROUND_B),
    );
    roundClientMocks.getChatRound.mockImplementation(async (_token, roundId) =>
      snapshot(roundId, { session_id: roundId === ROUND_A ? SESSION_A : SESSION_B }),
    );

    const { result, rerender, unmount } = renderHook(
      ({ sessionId }) => useChatRounds({ sessionId, withFreshToken }),
      { initialProps: { sessionId: SESSION_A } },
    );
    await waitFor(() => expect(result.current.snapshots.has(ROUND_A)).toBe(true));

    rerender({ sessionId: SESSION_B });
    await waitFor(() => expect(result.current.snapshots.has(ROUND_B)).toBe(true));

    expect(abortSpy).toHaveBeenCalled();
    expect(roundClientMocks.cancelChatRound).not.toHaveBeenCalled();
    expect(result.current.snapshots.has(ROUND_A)).toBe(false);
    expect(result.current.snapshots.get(ROUND_B)?.status).toBe("EXECUTING");
    unmount();
  });

  it("sends in the existing Session, publishes an accepted shell, and subscribes", async () => {
    agentClientMocks.listSessionMessages.mockResolvedValue(messagesFor());
    const accepted: RoundAccepted = {
      session_id: SESSION_A,
      round_id: ROUND_A,
      assistant_message_id: ASSISTANT_A,
      status: "QUEUED",
      last_event_seq: 1,
    };
    roundClientMocks.createChatRound.mockResolvedValue(accepted);

    const { result, unmount } = renderHook(() =>
      useChatRounds({ sessionId: SESSION_A, withFreshToken }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    const file = new File(["data"], "input.csv");
    let returned: RoundAccepted | undefined;
    await act(async () => {
      returned = await result.current.send("analyse", CLIENT_MESSAGE_ID, [file]);
    });

    expect(returned).toEqual(accepted);
    expect(roundClientMocks.createChatRound).toHaveBeenCalledWith(
      TOKEN,
      SESSION_A,
      "analyse",
      CLIENT_MESSAGE_ID,
      [file],
    );
    expect(result.current.snapshots.get(ROUND_A)).toMatchObject({
      round_id: ROUND_A,
      status: "QUEUED",
      last_event_seq: 1,
      content: "",
      steps: [],
    });
    expect(roundClientMocks.subscribeChatRoundEvents).toHaveBeenCalledWith(
      TOKEN,
      ROUND_A,
      1,
      expect.any(Object),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    unmount();
  });

  it("reconciles planned steps before an SSE proxy delivers the plan.ready event", async () => {
    vi.useRealTimers();
    agentClientMocks.listSessionMessages.mockResolvedValue(messagesFor());
    const accepted: RoundAccepted = {
      session_id: SESSION_A,
      round_id: ROUND_A,
      assistant_message_id: ASSISTANT_A,
      status: "QUEUED",
      last_event_seq: 1,
    };
    const planned = snapshot(ROUND_A, {
      status: "EXECUTING",
      last_event_seq: 3,
      steps: [
        {
          step_id: "public-step-1",
          step_index: 0,
          label: "在亚马逊美国站搜索关键词 cup，获取排名前三的爆品信息",
          status: "PENDING",
          task_id: null,
          artifacts: [],
          evidence: null,
          error_code: null,
          error_message: null,
        },
      ],
    });
    roundClientMocks.createChatRound.mockResolvedValue(accepted);
    roundClientMocks.getChatRound
      .mockResolvedValueOnce(snapshot(ROUND_A, { status: "EXECUTING", steps: [] }))
      .mockResolvedValue(planned);

    const { result, unmount } = renderHook(() =>
      useChatRounds({ sessionId: SESSION_A, withFreshToken }),
    );
    await settle();
    expect(result.current.loading).toBe(false);
    await act(async () => {
      await result.current.send("搜索 cup", CLIENT_MESSAGE_ID, []);
    });

    expect(result.current.snapshots.get(ROUND_A)?.steps).toHaveLength(0);
    await waitFor(() => expect(result.current.snapshots.get(ROUND_A)?.steps).toHaveLength(1));

    expect(roundClientMocks.getChatRound).toHaveBeenCalledTimes(2);
    expect(result.current.snapshots.get(ROUND_A)).toMatchObject({
      status: "EXECUTING",
      steps: expect.any(Array),
    });
    expect(result.current.snapshots.get(ROUND_A)?.steps[0]?.label).toContain("亚马逊");
    expect(result.current.snapshots.get(ROUND_A)?.status).toBe("EXECUTING");
    unmount();
  });

  it("uses the server cancel response and keeps reloading until terminal", async () => {
    vi.useFakeTimers();
    roundClientMocks.cancelChatRound.mockResolvedValue(
      snapshot(ROUND_A, { status: "CANCEL_REQUESTED", last_event_seq: 3 }),
    );
    roundClientMocks.getChatRound
      .mockResolvedValueOnce(snapshot(ROUND_A))
      .mockResolvedValueOnce(
        snapshot(ROUND_A, { status: "CANCEL_REQUESTED", last_event_seq: 3 }),
      )
      .mockResolvedValueOnce(
        snapshot(ROUND_A, { status: "CANCELLED", last_event_seq: 4 }),
      );

    const { result, unmount } = renderHook(() =>
      useChatRounds({ sessionId: SESSION_A, withFreshToken }),
    );
    await settle();
    let cancellation: Promise<ChatRoundSnapshot>;
    act(() => {
      cancellation = result.current.cancel(ROUND_A);
    });
    await settle();
    expect(roundClientMocks.cancelChatRound).toHaveBeenCalledOnce();
    expect(result.current.snapshots.get(ROUND_A)?.status).toBe("CANCEL_REQUESTED");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    await settle();
    expect(result.current.snapshots.get(ROUND_A)?.status).toBe("CANCEL_REQUESTED");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    const terminal = await cancellation!;
    expect(terminal.status).toBe("CANCELLED");
    expect(TERMINAL.has(result.current.snapshots.get(ROUND_A)?.status ?? "")).toBe(true);
    expect(roundClientMocks.cancelChatRound).toHaveBeenCalledOnce();
    unmount();
  });

  it("does not regress a terminal SSE snapshot when an older cancel response arrives later", async () => {
    let deliver: ((roundEvent: ChatRoundEvent) => void) | undefined;
    let resolveCancel: ((value: ChatRoundSnapshot) => void) | undefined;
    roundClientMocks.subscribeChatRoundEvents.mockImplementation(
      async (_token, _roundId, _afterSeq, handlers, init) => {
        deliver = handlers.onEvent;
        return abortableSubscription(init?.signal);
      },
    );
    roundClientMocks.cancelChatRound.mockImplementation(
      () =>
        new Promise<ChatRoundSnapshot>((resolve) => {
          resolveCancel = resolve;
        }),
    );
    const { result, unmount } = renderHook(() =>
      useChatRounds({ sessionId: SESSION_A, withFreshToken }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    let cancellation: Promise<ChatRoundSnapshot>;
    act(() => {
      cancellation = result.current.cancel(ROUND_A);
    });
    await settle();
    act(() => {
      deliver?.(event(ROUND_A, 3, "round.cancel_requested", {
        status: "CANCEL_REQUESTED",
      }));
      deliver?.(event(ROUND_A, 4, "round.cancelled", { status: "CANCELLED" }));
    });
    let terminal: ChatRoundSnapshot | undefined;
    await act(async () => {
      resolveCancel?.(
        snapshot(ROUND_A, { status: "CANCEL_REQUESTED", last_event_seq: 3 }),
      );
      terminal = await cancellation!;
    });

    expect(terminal).toMatchObject({
      status: "CANCELLED",
      last_event_seq: 4,
    });
    expect(result.current.snapshots.get(ROUND_A)).toMatchObject({
      status: "CANCELLED",
      last_event_seq: 4,
    });
    expect(roundClientMocks.cancelChatRound).toHaveBeenCalledOnce();
    unmount();
  });

  it("resumes WAITING_INPUT with the caller's stable UUID and files without changing Round id", async () => {
    const file = new File(["more"], "details.csv");
    roundClientMocks.getChatRound.mockResolvedValue(
      snapshot(ROUND_A, { status: "WAITING_INPUT" }),
    );
    roundClientMocks.resumeChatRound.mockResolvedValue({
      session_id: SESSION_A,
      round_id: ROUND_A,
      assistant_message_id: ASSISTANT_A,
      status: "QUEUED",
      last_event_seq: 4,
    });

    const { result, unmount } = renderHook(() =>
      useChatRounds({ sessionId: SESSION_A, withFreshToken }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.resume(ROUND_A, "more detail", CLIENT_MESSAGE_ID, [file]);
      await result.current.resume(ROUND_A, "more detail", CLIENT_MESSAGE_ID, [file]);
    });

    expect(roundClientMocks.resumeChatRound).toHaveBeenCalledTimes(2);
    for (const call of roundClientMocks.resumeChatRound.mock.calls) {
      expect(call).toEqual([
        TOKEN,
        SESSION_A,
        ROUND_A,
        "more detail",
        CLIENT_MESSAGE_ID,
        [file],
      ]);
    }
    expect(result.current.snapshots.get(ROUND_A)?.round_id).toBe(ROUND_A);
    unmount();
  });

  it("rejects resume for an unknown Round instead of guessing a Session", async () => {
    agentClientMocks.listSessionMessages.mockResolvedValue(messagesFor());
    const { result, unmount } = renderHook(() =>
      useChatRounds({ sessionId: SESSION_A, withFreshToken }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(
      result.current.resume(ROUND_A, "more detail", CLIENT_MESSAGE_ID, []),
    ).rejects.toThrow("Round snapshot is not loaded");
    expect(roundClientMocks.resumeChatRound).not.toHaveBeenCalled();
    unmount();
  });
});
