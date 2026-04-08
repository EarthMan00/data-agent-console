import type { AgentRoundRuntimeEvent } from "@/lib/agent-events";

import { buildFinalMarkdown, buildMockChains, buildReportPatch, buildStreamChunks } from "./report-helpers";
import { sleep } from "./util";
import type { AgentRoundInput } from "./types";

export async function runMockRound(
  input: AgentRoundInput,
  handlers: {
    onEvent: (event: AgentRoundRuntimeEvent) => void;
  },
) {
  const chains = buildMockChains(input);
  const sourceLabels = chains.map((item) => item.sourceLabel);
  handlers.onEvent({ type: "round_started", roundId: input.roundId });
  handlers.onEvent({
    type: "round_ui_layout",
    roundId: input.roundId,
    layout: "tool_orchestration",
  });
  await sleep(160);

  if (input.attachments.length > 0) {
    handlers.onEvent({
      type: "attachments_received",
      roundId: input.roundId,
      attachments: input.attachments.map((item) => ({ ...item, status: "accepted" })),
    });
    await sleep(120);
  }

  await sleep(220);

  for (const [index, chain] of chains.entries()) {
    handlers.onEvent({
      type: "source_started",
      roundId: input.roundId,
      chain: { ...chain, status: "running", progressText: `已连接 ${chain.sourceLabel}，开始查询。` },
    });
    await sleep(180);
    handlers.onEvent({
      type: "source_progress",
      roundId: input.roundId,
      chainId: chain.id,
      progressText: `正在整理 ${chain.sourceLabel} 返回的数据结构和关键字段。`,
    });
    await sleep(180);
    handlers.onEvent({
      type: "source_completed",
      roundId: input.roundId,
      chainId: chain.id,
      progressText: `${chain.sourceLabel} 已返回可用结果，等待与其他链路汇总。`,
      resultCountText: index === 0 ? "返回 50 条数据" : index === 1 ? "返回 60 条数据" : "返回 1 组结果",
      resultPreviewId: chain.resultPreviewId,
    });
    await sleep(120);
  }

  const chunks = buildStreamChunks(input.prompt, sourceLabels, input.attachments);
  for (const chunk of chunks) {
    handlers.onEvent({
      type: "delta",
      roundId: input.roundId,
      text: chunk,
    });
    await sleep(160);
  }

  handlers.onEvent({
    type: "final",
    roundId: input.roundId,
    text: buildFinalMarkdown(input.prompt, sourceLabels, input.attachments),
  });
  await sleep(120);

  handlers.onEvent({
    type: "report_updated",
    roundId: input.roundId,
    patch: buildReportPatch(input.prompt, sourceLabels, input.attachments),
  });
  await sleep(80);

  handlers.onEvent({
    type: "round_completed",
    roundId: input.roundId,
  });
}
