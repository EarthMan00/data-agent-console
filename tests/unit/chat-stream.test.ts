import { describe, expect, it } from "vitest";

import { consumeChatSendStream } from "@/lib/agent-api/chat-stream";

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

describe("consumeChatSendStream", () => {
  it("treats assistant_complete + done as completed when completed event is missing", async () => {
    const res = sseResponse([
      'event: assistant_complete\ndata: {"session_id":"s1","text":"已收到补充信息，正在继续执行多步任务…"}\n\n',
      "event: done\ndata: {}\n\n",
    ]);
    const result = await consumeChatSendStream(res, {});
    expect(result.kind).toBe("completed");
    if (result.kind === "completed") {
      expect(result.message).toContain("已收到补充信息");
      expect(result.session_id).toBe("s1");
    }
  });
});
