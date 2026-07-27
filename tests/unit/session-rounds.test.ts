import { describe, expect, it } from "vitest";

import type { SessionMessageItem } from "@/lib/agent-api/types";
import { roundIdsFromMessages } from "@/lib/session-rounds";

const FIRST_ROUND = "11111111-1111-4111-8111-111111111111";
const SECOND_ROUND = "22222222-2222-4222-8222-222222222222";

function message(
  id: string,
  role: SessionMessageItem["role"],
  messageIndex: number,
  meta: Record<string, unknown> = {},
): SessionMessageItem {
  return {
    id,
    role,
    content: "message",
    created_at: "2026-07-27T00:00:00Z",
    message_index: messageIndex,
    meta,
  };
}

describe("Round discovery from Session history", () => {
  it("collects unique canonical assistant Round ids newest first", () => {
    const messages = [
      message("user-1", "user", 1, { round_id: FIRST_ROUND }),
      message("assistant-1", "assistant", 2, { round_id: FIRST_ROUND }),
      message("assistant-duplicate", "assistant", 3, { round_id: FIRST_ROUND }),
      message("assistant-2", "assistant", 4, { round_id: SECOND_ROUND }),
    ];

    expect(roundIdsFromMessages(messages)).toEqual([SECOND_ROUND, FIRST_ROUND]);
  });

  it("rejects malformed ids and legacy execution helpers without converting history", () => {
    const messages = [
      message("assistant-malformed", "assistant", 1, { round_id: "not-a-uuid" }),
      message("assistant-nil", "assistant", 2, {
        round_id: "00000000-0000-0000-0000-000000000000",
      }),
      message("legacy-task", "assistant", 3, {
        kind: "task_execution_steps",
        round_id: FIRST_ROUND,
        task_id: "legacy-task-id",
      }),
      message("legacy-status", "assistant", 4, {
        kind: "task_terminated",
        round_id: SECOND_ROUND,
        task_status: "FAILED",
      }),
      message("ordinary-assistant", "assistant", 5, {
        task_id: "legacy-task-id",
        task_status: "SUCCESS",
      }),
    ];

    expect(roundIdsFromMessages(messages)).toEqual([]);
  });
});
