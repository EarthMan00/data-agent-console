import type { SessionMessageItem } from "@/lib/agent-api/types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isCanonicalRoundAssistant(message: SessionMessageItem): boolean {
  if (message.role !== "assistant") return false;
  const meta = message.meta;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return false;

  // Durable Round assistants have no legacy helper kind. In particular, do not
  // reinterpret execution-status bubbles as Round history.
  return typeof meta.kind !== "string";
}

export function roundIdsFromMessages(messages: SessionMessageItem[]): string[] {
  const seen = new Set<string>();
  return [...messages].reverse().flatMap((message) => {
    if (!isCanonicalRoundAssistant(message)) return [];
    const id = typeof message.meta?.round_id === "string" ? message.meta.round_id : "";
    if (!UUID_RE.test(id) || seen.has(id)) return [];
    seen.add(id);
    return [id];
  });
}
