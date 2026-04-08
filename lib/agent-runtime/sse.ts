import type { AgentRunSnapshot } from "./types";

export function readSSEChunk(buffer: string) {
  const parts = buffer.split("\n\n");
  return {
    completed: parts.slice(0, -1),
    rest: parts.at(-1) ?? "",
  };
}

export function parseEventBlock(block: string) {
  const lines = block.split("\n").filter(Boolean);
  let event = "message";
  const dataLines: string[] = [];

  lines.forEach((line) => {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
      return;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trim());
    }
  });

  if (dataLines.length === 0) return null;
  const raw = dataLines.join("\n");

  try {
    const payload = JSON.parse(raw) as Record<string, unknown>;
    if (event === "thinking") return { type: "thinking", text: String(payload.text ?? "") } as const;
    if (event === "delta") return { type: "delta", text: String(payload.text ?? "") } as const;
    if (event === "complete") return { type: "complete", snapshot: payload.snapshot as AgentRunSnapshot | undefined } as const;
    if (event === "error") return { type: "error", message: String(payload.message ?? "后端返回错误") } as const;
  } catch (e) {
    if (event === "delta") return { type: "delta", text: raw } as const;
    if (event === "thinking") return { type: "thinking", text: raw } as const;
    if (event === "error") return { type: "error", message: raw } as const;
    console.warn("[agent-runtime] sse_event_json_parse_failed", {
      event,
      raw_preview: raw.length > 500 ? `${raw.slice(0, 500)}…` : raw,
      error: e instanceof Error ? e.message : String(e),
    });
  }

  return null;
}
