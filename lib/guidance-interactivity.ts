import type { SessionMessageItem } from "@/lib/agent-api/types";
import type { TaskResponse } from "@/lib/agent-api/types";
import { parseTaskExecutionStepsFromMeta } from "@/lib/task-execution-steps-meta";
import { extractPostTaskGuidance } from "@/lib/task-chat-summary";
import {
  resolvePostTaskGuidancePresentation,
  resolveTaskTerminatedPresentation,
} from "@/lib/parse-post-task-guidance";
function messageMeta(m: SessionMessageItem): Record<string, unknown> | undefined {
  return m.meta && typeof m.meta === "object" && !Array.isArray(m.meta)
    ? (m.meta as Record<string, unknown>)
    : undefined;
}

function messageHasGuidanceBubble(m: SessionMessageItem): boolean {
  if (m.role !== "assistant") return false;
  const meta = messageMeta(m);
  if (resolvePostTaskGuidancePresentation(m, meta).kind !== "none") return true;
  if (resolveTaskTerminatedPresentation(m, meta).kind !== "none") return true;
  return false;
}

type GuidanceBubbleKind = "none" | "post_task_guidance" | "other";

function classifyGuidanceBubbleMessage(m: SessionMessageItem): GuidanceBubbleKind {
  if (m.role !== "assistant") return "none";
  const meta = messageMeta(m);
  if (resolveTaskTerminatedPresentation(m, meta).kind !== "none") return "other";
  if (resolvePostTaskGuidancePresentation(m, meta).kind === "none") return "none";
  const msgKind = typeof meta?.kind === "string" ? meta.kind.trim() : "";
  return msgKind === "post_task_guidance" ? "post_task_guidance" : "other";
}

/** 同一轮用户追问与下一条用户消息之间，仅展示一条引导气泡。 */
export function segmentBoundsForMessage(
  messages: SessionMessageItem[],
  messageIndex: number,
): { start: number; end: number } {
  let start = 0;
  for (let i = messageIndex - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === "user") {
      start = i + 1;
      break;
    }
  }
  let end = messages.length;
  for (let i = messageIndex + 1; i < messages.length; i += 1) {
    if (messages[i]?.role === "user") {
      end = i;
      break;
    }
  }
  return { start, end };
}

/**
 * 历史回放时同一任务完成可能落库多条引导（专用 post_task_guidance + 旧版正文内嵌等），
 * 仅渲染该轮最后一条；专用 post_task_guidance 优先于内嵌引导。
 */
export function shouldRenderGuidanceBubbleAtMessage(
  messages: SessionMessageItem[],
  messageIndex: number,
): boolean {
  if (classifyGuidanceBubbleMessage(messages[messageIndex]!) === "none") return false;

  const { start, end } = segmentBoundsForMessage(messages, messageIndex);
  let lastAnyIdx = -1;
  let lastDedicatedIdx = -1;

  for (let i = start; i < end; i += 1) {
    const kind = classifyGuidanceBubbleMessage(messages[i]!);
    if (kind === "none") continue;
    lastAnyIdx = i;
    if (kind === "post_task_guidance") {
      lastDedicatedIdx = i;
    }
  }

  if (lastDedicatedIdx >= 0) return messageIndex === lastDedicatedIdx;
  return messageIndex === lastAnyIdx;
}

export type RoundPostTaskGuidance = {
  content: string;
  messageId: string;
};

/** 取该轮 segment 内最新的专用/内嵌引导文案（供步骤气泡下挂载）。 */
export function resolveDedicatedPostTaskGuidanceInSegment(
  messages: SessionMessageItem[],
  anchorIndex: number,
): RoundPostTaskGuidance | null {
  const { start, end } = segmentBoundsForMessage(messages, anchorIndex);
  for (let i = end - 1; i >= start; i -= 1) {
    const m = messages[i]!;
    if (m.role !== "assistant") continue;
    const meta = messageMeta(m);
    const pres = resolvePostTaskGuidancePresentation(m, meta);
    if (pres.kind === "dedicated" && pres.content.trim()) {
      return { content: pres.content.trim(), messageId: m.id };
    }
    if (pres.kind === "embedded" && pres.guidanceBlock?.trim()) {
      return { content: pres.guidanceBlock.trim(), messageId: m.id };
    }
  }
  return null;
}

/** 步骤气泡下展示：优先 segment 内落库引导，其次任务 response_summary。 */
export function resolveRoundPostTaskGuidanceContent(
  messages: SessionMessageItem[],
  anchorIndex: number,
  options?: { taskId?: string | null; taskSnapshot?: TaskResponse | null },
): RoundPostTaskGuidance | null {
  const fromSegment = resolveDedicatedPostTaskGuidanceInSegment(messages, anchorIndex);
  if (fromSegment) return fromSegment;

  const tid = (options?.taskId ?? "").trim();
  const snap = options?.taskSnapshot;
  if (!tid || !snap || snap.task_id !== tid) return null;
  const fromTask = extractPostTaskGuidance(snap);
  if (!fromTask) return null;
  return { content: fromTask, messageId: `task_guidance_${tid}` };
}

function hasTerminalTaskExecutionStepsMessage(m: SessionMessageItem): boolean {
  if (m.role !== "assistant") return false;
  const meta = messageMeta(m);
  const steps = parseTaskExecutionStepsFromMeta(meta);
  if (!steps?.length) return false;
  return steps.every((s) => s.status === "done" || s.status === "error");
}

/** 引导挂在最新步骤气泡下时，避免同轮 post_task_guidance 消息重复渲染。 */
export function shouldDeferPostTaskGuidanceToStepsBubble(
  messages: SessionMessageItem[],
  messageIndex: number,
  latestStepsMessageId: string | null,
): boolean {
  if (!latestStepsMessageId) return false;
  const stepsIdx = messages.findIndex((m) => m.id === latestStepsMessageId);
  if (stepsIdx < 0) return false;
  const { start, end } = segmentBoundsForMessage(messages, messageIndex);
  if (stepsIdx < start || stepsIdx >= end) return false;
  return hasTerminalTaskExecutionStepsMessage(messages[stepsIdx]!);
}

function hasUserMessageAfter(messages: SessionMessageItem[], afterIndex: number): boolean {
  for (let i = afterIndex + 1; i < messages.length; i++) {
    if (messages[i]?.role === "user") return true;
  }
  return false;
}

/**
 * 仅最后一条引导消息可点击；其后若已有用户追问，则全部引导（含最后一条）变为只读。
 */
export function resolveInteractiveGuidanceMessageId(
  messages: SessionMessageItem[],
  options?: { syntheticTerminatedMessageId?: string | null },
): string | null {
  const anchors: { id: string; index: number }[] = [];

  messages.forEach((m, index) => {
    if (messageHasGuidanceBubble(m)) {
      anchors.push({ id: m.id, index });
    }
  });

  const syntheticId = (options?.syntheticTerminatedMessageId ?? "").trim();
  if (syntheticId) {
    const idx = messages.findIndex((m) => m.id === syntheticId);
    if (idx >= 0 && !anchors.some((a) => a.id === syntheticId)) {
      anchors.push({ id: syntheticId, index: idx });
    }
  }

  if (anchors.length === 0) return null;

  const latest = anchors.reduce((best, cur) => (cur.index > best.index ? cur : best));
  if (hasUserMessageAfter(messages, latest.index)) return null;
  return latest.id;
}

export type RoundGuidanceLike = {
  roundId: string;
  postTaskGuidance?: string | null;
  errorMessage?: string | null;
  supplementalUserMessages?: unknown[] | null;
};

/** 新建会话（workspace rounds）：仅最后一轮引导可点击，且该轮之后无新追问。 */
export function resolveInteractiveGuidanceRoundId(
  rounds: RoundGuidanceLike[],
  options?: { roundHasTerminatedGuidance?: (round: RoundGuidanceLike) => boolean },
): string | null {
  const hasTerminatedGuidance =
    options?.roundHasTerminatedGuidance ??
    ((round) => {
      const msg = (round.errorMessage ?? "").trim();
      return msg.startsWith("任务已终止");
    });

  let lastGuidanceIdx = -1;
  rounds.forEach((round, index) => {
    if (round.postTaskGuidance?.trim() || hasTerminatedGuidance(round)) {
      lastGuidanceIdx = index;
    }
  });

  if (lastGuidanceIdx < 0) return null;
  if (lastGuidanceIdx < rounds.length - 1) return null;

  const lastRound = rounds[lastGuidanceIdx]!;
  if ((lastRound.supplementalUserMessages?.length ?? 0) > 0) return null;
  return lastRound.roundId;
}
