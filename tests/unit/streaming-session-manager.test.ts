import { afterEach, describe, expect, it, vi } from "vitest";

import {
  completeStream,
  getStreamState,
  registerStream,
  releaseStream,
  subscribe,
  updateStreamContent,
} from "@/lib/streaming-session-manager";

const SESSION = "session-test-1";

afterEach(() => {
  releaseStream(SESSION);
});

describe("streaming-session-manager", () => {
  it("subscribe works before registerStream and survives releaseStream + registerStream", () => {
    const listener = vi.fn();
    const unsub = subscribe(SESSION, listener);

    releaseStream(SESSION);
    const ac = new AbortController();
    registerStream(SESSION, { abortController: ac, assistantStreamId: "asst-1" });

    updateStreamContent(SESSION, "你好");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getStreamState(SESSION)?.content).toBe("你好");

    releaseStream(SESSION);
    registerStream(SESSION, { abortController: new AbortController(), assistantStreamId: "asst-2" });

    updateStreamContent(SESSION, "世界");
    expect(listener).toHaveBeenCalledTimes(2);
    expect(getStreamState(SESSION)?.content).toBe("世界");

    unsub();
  });

  it("completeStream notifies subscribers", () => {
    const listener = vi.fn();
    subscribe(SESSION, listener);
    registerStream(SESSION, {
      abortController: new AbortController(),
      assistantStreamId: "asst-1",
    });
    updateStreamContent(SESSION, "done");
    completeStream(SESSION);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(getStreamState(SESSION)?.status).toBe("completed");
  });
});
