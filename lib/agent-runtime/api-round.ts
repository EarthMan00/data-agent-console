import type { AgentRoundRuntimeEvent } from "@/lib/agent-events";

import { getApiBase } from "./config";
import { buildFinalMarkdown, buildReportPatch, getSourceLabel } from "./report-helpers";
import { parseEventBlock, readSSEChunk } from "./sse";
import type { AgentRoundInput, AgentRunSnapshot } from "./types";

export async function runApiRound(
  input: AgentRoundInput,
  handlers: {
    onEvent: (event: AgentRoundRuntimeEvent) => void;
  },
) {
  const base = getApiBase();
  const response = await fetch(`${base}/runs/${input.runId}/followups/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({
      runId: input.runId,
      prompt: input.prompt,
      mode: input.mode,
      selectedCapabilities: input.selectedCapabilities,
      attachments: input.attachments,
    }),
  });

  if (!response.ok || !response.body) {
    const message = await response.text().catch(() => "");
    throw new Error(message || `流式请求失败：${response.status}`);
  }

  handlers.onEvent({ type: "round_started", roundId: input.roundId });
  handlers.onEvent({
    type: "round_ui_layout",
    roundId: input.roundId,
    layout: "tool_orchestration",
  });
  if (input.attachments.length > 0) {
    handlers.onEvent({
      type: "attachments_received",
      roundId: input.roundId,
      attachments: input.attachments.map((item) => ({ ...item, status: "accepted" })),
    });
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let sawRoundCompleted = false;

  const labels = () => input.selectedCapabilities.map(getSourceLabel);

  const emitRoundComplete = (snapshot?: AgentRunSnapshot | undefined) => {
    if (sawRoundCompleted) return;
    sawRoundCompleted = true;
    if (snapshot?.report) {
      handlers.onEvent({
        type: "report_updated",
        roundId: input.roundId,
        patch: {
          previewKey: snapshot.report.previewKey,
          title: snapshot.report.title,
          subtitle: snapshot.report.subtitle,
          generatedAt: snapshot.report.generatedAt,
          mode: snapshot.report.mode,
          summary: [...snapshot.report.summary],
          sheetTabs: snapshot.report.sheetTabs.map((tab) => ({ ...tab })),
          sheetRows: snapshot.report.sheetRows.map((row) => [...row]),
          summaryBody: `后端已返回本轮结果，并同步刷新当前预览。`,
        },
      });
    } else {
      handlers.onEvent({
        type: "report_updated",
        roundId: input.roundId,
        patch: buildReportPatch(input.prompt, labels(), input.attachments),
      });
    }
    handlers.onEvent({
      type: "final",
      roundId: input.roundId,
      text: buildFinalMarkdown(input.prompt, labels(), input.attachments),
    });
    handlers.onEvent({ type: "round_completed", roundId: input.roundId });
  };

  const processBlock = (block: string) => {
    const event = parseEventBlock(block);
    if (!event) return;
    if (event.type === "thinking") {
      handlers.onEvent({ type: "thinking", roundId: input.roundId, text: event.text });
    }
    if (event.type === "delta") {
      handlers.onEvent({ type: "delta", roundId: input.roundId, text: event.text });
    }
    if (event.type === "complete") {
      emitRoundComplete(event.snapshot);
    }
    if (event.type === "error") {
      throw new Error(event.message);
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const { completed, rest } = readSSEChunk(buffer);
    buffer = rest;
    completed.forEach(processBlock);
  }

  buffer += decoder.decode();
  const { completed: tailBlocks } = readSSEChunk(buffer + "\n\n");
  tailBlocks.forEach(processBlock);

  if (!sawRoundCompleted) {
    emitRoundComplete(undefined);
  }
}
