import { afterEach, describe, expect, it, vi } from "vitest";

import {
  cancelChatRound,
  createChatRound,
  createInitialChatRound,
  getChatRound,
  resumeChatRound,
  subscribeChatRoundEvents,
} from "@/lib/agent-api/chat-rounds";
import { AgentApiError } from "@/lib/agent-api/client";

const TOKEN = "access-token";
const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const ROUND_ID = "22222222-2222-4222-8222-222222222222";
const ASSISTANT_ID = "33333333-3333-4333-8333-333333333333";
const CLIENT_MESSAGE_ID = "44444444-4444-4444-8444-444444444444";

function accepted(overrides: Record<string, unknown> = {}) {
  return {
    session_id: SESSION_ID,
    round_id: ROUND_ID,
    assistant_message_id: ASSISTANT_ID,
    status: "QUEUED",
    last_event_seq: 1,
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("durable chat Round API client", () => {
  it("creates an initial Round with stable multipart idempotency fields and no internal routing fields", async () => {
    const files = [
      new File(["a"], "a.csv", { type: "text/csv" }),
      new File(["b"], "b.xlsx"),
    ];
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), init: init ?? {} });
      return new Response(JSON.stringify(accepted()), {
        status: 202,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await createInitialChatRound(TOKEN, "analyse these", CLIENT_MESSAGE_ID, files);
    await createInitialChatRound(TOKEN, "analyse these", CLIENT_MESSAGE_ID, files);

    expect(requests).toHaveLength(2);
    for (const request of requests) {
      expect(request.url).toBe("/agent-platform/api/chat/rounds");
      expect(request.init.method).toBe("POST");
      const headers = new Headers(request.init.headers);
      expect(headers.get("Authorization")).toBe(`Bearer ${TOKEN}`);
      expect(headers.get("X-Request-ID")).toBe(CLIENT_MESSAGE_ID);
      expect(headers.has("Content-Type")).toBe(false);
      expect(request.init.body).toBeInstanceOf(FormData);
      const form = request.init.body as FormData;
      expect(form.get("message")).toBe("analyse these");
      expect(form.get("client_message_id")).toBe(CLIENT_MESSAGE_ID);
      expect(form.getAll("files").map((file) => (file as File).name)).toEqual([
        "a.csv",
        "b.xlsx",
      ]);
      expect([...form.keys()].sort()).toEqual([
        "client_message_id",
        "files",
        "files",
        "message",
      ]);
      expect(form.has("capability")).toBe(false);
      expect(form.has("operation")).toBe(false);
      expect(form.has("tool")).toBe(false);
    }
  });

  it("uploads existing-session files before submitting only their attachment ids", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init: init ?? {} });
      if (url.endsWith(`/api/chat/${SESSION_ID}/attachments`)) {
        return new Response(
          JSON.stringify({
            attachments: [
              {
                attachment_id: "55555555-5555-4555-8555-555555555555",
                name: "input.csv",
                size: 4,
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify(accepted()), {
        status: 202,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await createChatRound(
      TOKEN,
      SESSION_ID,
      "use the upload",
      CLIENT_MESSAGE_ID,
      [new File(["data"], "input.csv")],
    );

    expect(calls.map((call) => call.url)).toEqual([
      `/agent-platform/api/chat/${SESSION_ID}/attachments`,
      `/agent-platform/api/chat/${SESSION_ID}/rounds`,
    ]);
    const create = calls[1].init;
    expect(new Headers(create.headers)).toEqual(
      new Headers({
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
        "X-Request-ID": CLIENT_MESSAGE_ID,
      }),
    );
    expect(JSON.parse(String(create.body))).toEqual({
      message: "use the upload",
      client_message_id: CLIENT_MESSAGE_ID,
      attachment_ids: ["55555555-5555-4555-8555-555555555555"],
    });
  });

  it("shape-validates every 202 accepted response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify(accepted({ last_event_seq: "1" })), {
          status: 202,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(
      createInitialChatRound(TOKEN, "hello", CLIENT_MESSAGE_ID, []),
    ).rejects.toMatchObject({
      name: "AgentApiError",
      status: 202,
      message: "invalid create chat round response shape",
    });
  });

  it("uses the existing AgentApiError for authenticated command failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ detail: "invalid token" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(getChatRound(TOKEN, ROUND_ID)).rejects.toBeInstanceOf(AgentApiError);
    await expect(cancelChatRound(TOKEN, ROUND_ID)).rejects.toMatchObject({ status: 401 });
    await expect(
      resumeChatRound(TOKEN, ROUND_ID, "more detail", CLIENT_MESSAGE_ID),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("strictly projects a snapshot with required public Step errors and no internal fields", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            round_id: ROUND_ID,
            session_id: SESSION_ID,
            status: "PARTIAL_SUCCESS",
            assistant_message_id: ASSISTANT_ID,
            content: "Data is ready.",
            last_event_seq: 8,
            execution_mode: "tool_orchestration",
            steps: [
              {
                step_id: "step-1",
                step_index: 0,
                label: "Create report",
                status: "FAILED",
                task_id: null,
                artifacts: [
                  {
                    artifact_id: "55555555-5555-4555-8555-555555555555",
                    artifact_type: "table",
                    original_name: "data.csv",
                    download_api: "/api/chat/rounds/result.csv",
                    managed_path: "C:/private/data.csv",
                  },
                ],
                evidence: { rows: 3 },
                error_code: "REPORT_FAILED",
                error_message: "The report could not be created.",
                capability: "report.generate",
              },
            ],
            error_code: "REPORT_FAILED",
            error_message: "The data is available, but the report failed.",
            raw_provider_output: "private",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const result = await getChatRound(TOKEN, ROUND_ID);

    expect(result.steps[0]).toEqual({
      step_id: "step-1",
      step_index: 0,
      label: "Create report",
      status: "FAILED",
      task_id: null,
      artifacts: [
        {
          artifact_id: "55555555-5555-4555-8555-555555555555",
          artifact_type: "table",
          original_name: "data.csv",
          download_api: "/api/chat/rounds/result.csv",
        },
      ],
      evidence: { rows: 3 },
      error_code: "REPORT_FAILED",
      error_message: "The report could not be created.",
    });
    expect(JSON.stringify(result)).not.toContain("tool_orchestration");
    expect(JSON.stringify(result)).not.toContain("report.generate");
    expect(JSON.stringify(result)).not.toContain("managed_path");
    expect(JSON.stringify(result)).not.toContain("private");
  });

  it("sends Bearer-authenticated SSE, parses id/event and multi-line data with a numeric seq", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            "id: 3\nevent: assistant.delta\ndata: {\"seq\":3,\ndata: \"event_type\":\"assistant.delta\",\"payload\":{\"content\":\"Hello\"},\"created_at\":\"2026-07-27T00:00:00Z\"}\n\n",
          ),
        );
        controller.close();
      },
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return new Response(body, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const events: unknown[] = [];

    const result = await subscribeChatRoundEvents(TOKEN, ROUND_ID, 2, {
      onEvent: (event) => events.push(event),
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`/agent-platform/api/chat/rounds/${ROUND_ID}/events?after_seq=2`);
    expect(new Headers(init?.headers).get("Authorization")).toBe(`Bearer ${TOKEN}`);
    expect(events).toEqual([
      {
        round_id: ROUND_ID,
        seq: 3,
        event_type: "assistant.delta",
        payload: { content: "Hello" },
        created_at: "2026-07-27T00:00:00Z",
      },
    ]);
    expect(result).toEqual({ kind: "stream_ended" });
  });

  it("treats AbortError as a closed subscription, never as a completed Round", async () => {
    const cancel = vi.fn(async () => undefined);
    const releaseLock = vi.fn();
    const reader = {
      read: vi.fn(async () => Promise.reject(new DOMException("closed", "AbortError"))),
      cancel,
      releaseLock,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        body: { getReader: () => reader },
      }) as unknown as Response),
    );

    await expect(
      subscribeChatRoundEvents(TOKEN, ROUND_ID, 0, {}),
    ).resolves.toEqual({ kind: "subscription_closed" });
    expect(cancel).toHaveBeenCalledOnce();
    expect(releaseLock).toHaveBeenCalledOnce();
  });

  it("rejects a non-numeric SSE id before delivering an event", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            "id: three\nevent: round.planning\ndata: {\"seq\":3,\"event_type\":\"round.planning\",\"payload\":{\"status\":\"PLANNING\"},\"created_at\":\"2026-07-27T00:00:00Z\"}\n\n",
          ),
        );
        controller.close();
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(body, { status: 200 })),
    );
    const onEvent = vi.fn();

    await expect(
      subscribeChatRoundEvents(TOKEN, ROUND_ID, 2, { onEvent }),
    ).rejects.toMatchObject({
      name: "AgentApiError",
      message: "invalid chat round event sequence",
    });
    expect(onEvent).not.toHaveBeenCalled();
  });
});
