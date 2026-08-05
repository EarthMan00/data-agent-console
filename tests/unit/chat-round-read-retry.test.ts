import { describe, expect, it, vi } from "vitest";

import {
  executeAuthenticatedJsonGet,
  transientReadRetryDelayMs,
  type AuthenticatedReadResponse,
} from "../e2e/chat-round-read-retry";

type FakeResponse = AuthenticatedReadResponse & {
  body: { value: string };
  dispose: ReturnType<typeof vi.fn>;
};

function response(status: number, value = "ok"): FakeResponse {
  return {
    body: { value },
    ok: () => status >= 200 && status < 300,
    status: () => status,
    dispose: vi.fn(async () => undefined),
  };
}

function failure(status: number): Error {
  return new Error(`HTTP ${status}`);
}

describe("real chat Round authenticated GET retry", () => {
  it.each([502, 503, 504])(
    "retries one transient HTTP %s response and disposes both responses",
    async (status) => {
      const first = response(status);
      const second = response(200, "recovered");
      const request = vi.fn()
        .mockResolvedValueOnce(first)
        .mockResolvedValueOnce(second);
      const delay = vi.fn(async () => undefined);

      await expect(
        executeAuthenticatedJsonGet({
          request,
          refresh: vi.fn(async () => undefined),
          parse: async (current: FakeResponse) => current.body,
          failure,
          delay,
        }),
      ).resolves.toEqual({ value: "recovered" });
      expect(request).toHaveBeenCalledTimes(2);
      expect(delay).toHaveBeenCalledWith(500);
      expect(first.dispose).toHaveBeenCalledOnce();
      expect(second.dispose).toHaveBeenCalledOnce();
    },
  );

  it("uses bounded delays and fails after three consecutive gateway responses", async () => {
    const responses = [response(502), response(503), response(504)];
    const request = vi.fn()
      .mockResolvedValueOnce(responses[0])
      .mockResolvedValueOnce(responses[1])
      .mockResolvedValueOnce(responses[2]);
    const delay = vi.fn(async () => undefined);

    await expect(
      executeAuthenticatedJsonGet({
        request,
        refresh: vi.fn(async () => undefined),
        parse: async (current: FakeResponse) => current.body,
        failure,
        delay,
      }),
    ).rejects.toThrow("HTTP 504");
    expect(request).toHaveBeenCalledTimes(3);
    expect(delay.mock.calls).toEqual([[500], [1_000]]);
    for (const current of responses) {
      expect(current.dispose).toHaveBeenCalledOnce();
    }
  });

  it.each([400, 403, 404, 500])(
    "does not retry the non-transient HTTP %s response",
    async (status) => {
      const current = response(status);
      const request = vi.fn(async () => current);
      const delay = vi.fn(async () => undefined);

      await expect(
        executeAuthenticatedJsonGet({
          request,
          refresh: vi.fn(async () => undefined),
          parse: async (value) => value.body,
          failure,
          delay,
        }),
      ).rejects.toThrow(`HTTP ${status}`);
      expect(request).toHaveBeenCalledOnce();
      expect(delay).not.toHaveBeenCalled();
      expect(current.dispose).toHaveBeenCalledOnce();
    },
  );

  it("refreshes once for HTTP 401 and disposes the rejected response", async () => {
    const unauthorized = response(401);
    const recovered = response(200, "refreshed");
    const request = vi.fn()
      .mockResolvedValueOnce(unauthorized)
      .mockResolvedValueOnce(recovered);
    const refresh = vi.fn(async () => undefined);

    await expect(
      executeAuthenticatedJsonGet({
        request,
        refresh,
        parse: async (current: FakeResponse) => current.body,
        failure,
        delay: vi.fn(async () => undefined),
      }),
    ).resolves.toEqual({ value: "refreshed" });
    expect(refresh).toHaveBeenCalledOnce();
    expect(unauthorized.dispose).toHaveBeenCalledOnce();
    expect(recovered.dispose).toHaveBeenCalledOnce();
  });

  it("rejects a second HTTP 401 without refreshing twice", async () => {
    const first = response(401);
    const second = response(401);
    const request = vi.fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);
    const refresh = vi.fn(async () => undefined);

    await expect(
      executeAuthenticatedJsonGet({
        request,
        refresh,
        parse: async (current: FakeResponse) => current.body,
        failure,
        delay: vi.fn(async () => undefined),
      }),
    ).rejects.toThrow("HTTP 401");
    expect(request).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledOnce();
    expect(first.dispose).toHaveBeenCalledOnce();
    expect(second.dispose).toHaveBeenCalledOnce();
  });

  it("does not retry a JSON projection failure and still disposes the response", async () => {
    const current = response(200);
    const request = vi.fn(async () => current);

    await expect(
      executeAuthenticatedJsonGet({
        request,
        refresh: vi.fn(async () => undefined),
        parse: async () => {
          throw new Error("invalid JSON projection");
        },
        failure,
        delay: vi.fn(async () => undefined),
      }),
    ).rejects.toThrow("invalid JSON projection");
    expect(request).toHaveBeenCalledOnce();
    expect(current.dispose).toHaveBeenCalledOnce();
  });

  it("does not retry a request exception without an HTTP gateway response", async () => {
    const request = vi.fn(async () => {
      throw new Error("request transport failed");
    });

    await expect(
      executeAuthenticatedJsonGet({
        request,
        refresh: vi.fn(async () => undefined),
        parse: async (current) => current,
        failure,
        delay: vi.fn(async () => undefined),
      }),
    ).rejects.toThrow("request transport failed");
    expect(request).toHaveBeenCalledOnce();
  });

  it.each(["POST", "PUT", "PATCH", "DELETE"])(
    "never classifies %s as a retryable read",
    (method) => {
      expect(transientReadRetryDelayMs(method, 502, 1, 0)).toBeNull();
    },
  );
});
