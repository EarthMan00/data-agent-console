import {
  AgentApiError,
  getTask,
  getToolOrchestration,
  patchMockTaskExecution,
  postMockTaskExecution,
  refreshAccessToken,
  sendChatMessage,
} from "@/lib/agent-api/client";
import { loadAgentSession, notifyAgentSessionChanged, saveAgentSession } from "@/lib/agent-api/session";
import { humanizeTaskErrorMessage } from "@/lib/platform-task-error-copy";
import { isAgentApiProxyEnabled, isAgentRealApiEnabled } from "@/lib/agent-api/config";
import type { TaskResponse, ToolOrchestrationStatusApi } from "@/lib/agent-api/types";
import type { AgentAttachment, AgentRoundRuntimeEvent, DataSourceChain, TaskExecutionStepStatus } from "@/lib/agent-events";
import type { Report, TaskRun } from "@/lib/mock/store";
import { homeCapabilityItems, previewResults } from "@/lib/mock/demo-data";
import { safeRandomUUID } from "@/lib/random-uuid";
import { stripModelThinkingForUi } from "@/lib/strip-model-thinking";
import { buildTaskCompletionSummary } from "@/lib/task-chat-summary";

export type AgentRunSnapshot = {
  run: TaskRun;
  report: Report;
};

export type AgentCreateRunInput = {
  objective: string;
  mode: TaskRun["mode"];
  selectedCapabilities: string[];
};

export type AgentRoundInput = {
  roundId: string;
  runId: string;
  prompt: string;
  mode: "普通模式" | "深度模式";
  selectedCapabilities: string[];
  attachments: AgentAttachment[];
  objective?: string;
  isInitialRound?: boolean;
  /** Data Agent Server 的会话 id，对应 TaskRun.platformSessionId */
  platformChatSessionId?: string;
};

export type StreamAgentRoundPlatformOptions = {
  withFreshToken: (run: (token: string) => Promise<void>) => Promise<void>;
};

class PlatformAuthExpiredError extends Error {
  constructor() {
    super("PLATFORM_AUTH_EXPIRED");
    this.name = "PlatformAuthExpiredError";
  }
}

async function refreshPlatformAccessToken(): Promise<string | null> {
  const snap = loadAgentSession();
  if (!snap?.refreshToken) return null;
  try {
    const next = await refreshAccessToken(snap.refreshToken);
    saveAgentSession({ ...snap, accessToken: next });
    notifyAgentSessionChanged();
    return next;
  } catch {
    return null;
  }
}

const RUNTIME_MODE = process.env.NEXT_PUBLIC_AGENT_RUNTIME_MODE === "mock" ? "mock" : "api";
const API_BASE = process.env.NEXT_PUBLIC_AGENT_API_BASE_URL?.replace(/\/$/, "");
const capabilityLabelMap = new Map(homeCapabilityItems.map((item) => [item.id, item.label]));

export function isPlatformBackendEnabled() {
  return isAgentRealApiEnabled();
}

export function isAgentRuntimeConfigured() {
  if (isAgentRealApiEnabled()) {
    if (isAgentApiProxyEnabled()) return true;
    return Boolean(process.env.NEXT_PUBLIC_AGENT_API_ORIGIN?.trim());
  }
  return Boolean(API_BASE);
}

export function isMockRuntimeEnabled() {
  if (isAgentRealApiEnabled()) return false;
  return RUNTIME_MODE === "mock";
}

function getApiBase() {
  if (!API_BASE) {
    throw new Error("未配置会话后端接口：请设置 NEXT_PUBLIC_AGENT_API_BASE_URL");
  }
  return API_BASE;
}

async function parseJsonResponse<T>(response: Response) {
  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || `请求失败：${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function createAgentRun(input: AgentCreateRunInput) {
  const base = getApiBase();
  const response = await fetch(`${base}/runs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  return parseJsonResponse<AgentRunSnapshot>(response);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mapServerOrchestrationStepStatus(status: string): TaskExecutionStepStatus {
  const s = (status || "").toUpperCase();
  if (s === "SUCCESS") return "done";
  if (s === "FAILED") return "error";
  if (s === "RUNNING") return "running";
  return "pending";
}

function mapTaskResponseToSubtaskEvent(
  roundId: string,
  stepIndex: number,
  stepId: string,
  label: string,
  task: TaskResponse,
): AgentRoundRuntimeEvent {
  return {
    type: "platform_subtask_snapshot",
    roundId,
    stepIndex,
    stepId,
    label,
    taskId: task.task_id,
    outcome: task.status === "SUCCESS" ? "success" : "failed",
    taskStatus: task.status,
    errorMessage: task.error_message ?? null,
    artifacts: (task.artifacts ?? []).map((a) => ({
      artifact_id: a.artifact_id,
      artifact_type: a.artifact_type,
      original_name: a.original_name,
      download_api: a.download_api,
    })),
    zipDownloadApi: task.zip_download_api ?? null,
  };
}

function getSourceLabel(sourceId: string) {
  return capabilityLabelMap.get(sourceId) ?? sourceId;
}

function pickPreviewKey(sourceId: string, index: number) {
  if (["amazon", "keepa", "store-scan", "walmart", "ebay"].includes(sourceId)) return "market-report";
  if (["jimu", "seller-sprite", "google"].includes(sourceId)) return "review-report";
  if (["web-search", "alibaba", "tiktok", "patent"].includes(sourceId)) return "competition-report";
  return previewResults[index % previewResults.length]?.id ?? "market-report";
}

function formatDate(date = new Date()) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  const seconds = `${date.getSeconds()}`.padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function formatShortDate(date = new Date()) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildFinalMarkdown(
  prompt: string,
  sourceLabels: string[],
  attachments: AgentAttachment[],
) {
  const lines = [
    `已完成本轮针对“${prompt}”的多逻辑链分析。`,
    sourceLabels.length > 0
      ? `本轮重点调取了 ${sourceLabels.join("、")}，分别验证市场、评论与竞争层面的关键信号。`
      : "本轮按默认数据源链完成了一次基础验证。",
    attachments.length > 0
      ? `已纳入附件 ${attachments.map((item) => item.name).join("、")} 的上下文，不是只基于页面数据给出结论。`
      : "当前结果不是静态摘要，而是按数据源链逐步汇总得出的结论。",
  ];
  return lines.join("\n\n");
}

function buildStreamChunks(prompt: string, sourceLabels: string[], attachments: AgentAttachment[]) {
  const chunks = [
    `先按 ${sourceLabels.join("、") || "默认数据源"} 拆开核对关键信号，`,
    "再把市场需求、评论反馈和竞争密度放到同一轮判断里，",
    attachments.length > 0
      ? `并结合附件 ${attachments.map((item) => item.name).join("、")} 里的上下文补充约束，`
      : "避免只给单一数据源下的片面结论，",
    `最后围绕“${prompt}”收敛成一版可继续追问的结果。`,
  ];
  return chunks;
}

function buildReportPatch(prompt: string, sourceLabels: string[], attachments: AgentAttachment[]) {
  const previewKey = sourceLabels.length > 1 ? "market-report" : sourceLabels[0]?.includes("极目") ? "review-report" : "competition-report";
  const base = previewResults.find((item) => item.id === previewKey) ?? previewResults[0];
  return {
    previewKey,
    title: prompt.length > 24 ? `${prompt.slice(0, 24)}...` : prompt,
    subtitle: `最后生成时间：${formatShortDate()} · ${sourceLabels.join("、") || "默认数据源"}`,
    generatedAt: formatDate(),
    mode: base.mode,
    summary: [
      `本轮以 ${sourceLabels.join("、") || "默认数据源"} 为主线完成了多逻辑链执行。`,
      attachments.length > 0
        ? `已结合附件 ${attachments.map((item) => item.name).join("、")} 做上下文校正。`
        : "当前结果已经具备继续追问的上下文承接能力。",
      `围绕“${prompt}”的关键判断已同步写入右侧结果快照。`,
    ],
    sheetTabs: base.sheetTabs.map((tab) => ({ ...tab })),
    sheetRows: base.sheetRows.map((row) => [...row]),
    summaryBody: `系统已按 ${sourceLabels.join("、") || "默认数据源"} 并行完成多逻辑链分析，并将结果同步到当前会话与右侧预览。`,
  };
}

function buildMockChains(input: AgentRoundInput): DataSourceChain[] {
  const sources = input.selectedCapabilities.length > 0 ? input.selectedCapabilities : ["amazon"];
  return sources.map((sourceId, index) => ({
    id: `${input.roundId}-chain-${index + 1}`,
    roundId: input.roundId,
    sourceId,
    sourceLabel: getSourceLabel(sourceId),
    status: "queued",
    intent: `围绕“${input.prompt}”查询 ${getSourceLabel(sourceId)} 的结构化结果。`,
    progressText: "等待启动数据源链...",
    resultPreviewId: pickPreviewKey(sourceId, index),
  }));
}

async function runMockRound(
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

function readSSEChunk(buffer: string) {
  const parts = buffer.split("\n\n");
  return {
    completed: parts.slice(0, -1),
    rest: parts.at(-1) ?? "",
  };
}

function parseEventBlock(block: string) {
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
  } catch {
    if (event === "delta") return { type: "delta", text: raw } as const;
    if (event === "thinking") return { type: "thinking", text: raw } as const;
    if (event === "error") return { type: "error", message: raw } as const;
  }

  return null;
}

async function runApiRound(
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

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const { completed, rest } = readSSEChunk(buffer);
    buffer = rest;

    completed.forEach((block) => {
      const event = parseEventBlock(block);
      if (!event) return;
      if (event.type === "thinking") {
        handlers.onEvent({ type: "thinking", roundId: input.roundId, text: event.text });
      }
      if (event.type === "delta") {
        handlers.onEvent({ type: "delta", roundId: input.roundId, text: event.text });
      }
      if (event.type === "complete") {
        if (event.snapshot?.report) {
          handlers.onEvent({
            type: "report_updated",
            roundId: input.roundId,
            patch: {
              previewKey: event.snapshot.report.previewKey,
              title: event.snapshot.report.title,
              subtitle: event.snapshot.report.subtitle,
              generatedAt: event.snapshot.report.generatedAt,
              mode: event.snapshot.report.mode,
              summary: [...event.snapshot.report.summary],
              sheetTabs: event.snapshot.report.sheetTabs.map((tab) => ({ ...tab })),
              sheetRows: event.snapshot.report.sheetRows.map((row) => [...row]),
              summaryBody: `后端已返回本轮结果，并同步刷新当前预览。`,
            },
          });
          handlers.onEvent({
            type: "final",
            roundId: input.roundId,
            text: buildFinalMarkdown(input.prompt, input.selectedCapabilities.map(getSourceLabel), input.attachments),
          });
          handlers.onEvent({ type: "round_completed", roundId: input.roundId });
        }
      }
      if (event.type === "error") {
        throw new Error(event.message);
      }
    });
  }
}

async function runPlatformRound(
  input: AgentRoundInput,
  handlers: { onEvent: (event: AgentRoundRuntimeEvent) => void },
  chatSessionId: string,
  withFreshToken: StreamAgentRoundPlatformOptions["withFreshToken"],
) {
  const sourceLabels =
    input.selectedCapabilities.length > 0
      ? input.selectedCapabilities.map((id) => capabilityLabelMap.get(id) ?? id)
      : [];

  handlers.onEvent({ type: "round_started", roundId: input.roundId });

  if (input.attachments.length > 0) {
    handlers.onEvent({
      type: "attachments_received",
      roundId: input.roundId,
      attachments: input.attachments.map((item) => ({ ...item, status: "accepted" as const })),
    });
  }

  await withFreshToken(async (token) => {
    let accessToken = token;
    const withAuthRetry = async <T,>(fn: (t: string) => Promise<T>): Promise<T> => {
      try {
        return await fn(accessToken);
      } catch (e) {
        if (e instanceof AgentApiError && e.status === 401) {
          const next = await refreshPlatformAccessToken();
          if (next) {
            accessToken = next;
            return await fn(accessToken);
          }
          throw new PlatformAuthExpiredError();
        }
        throw e;
      }
    };

    const mid = safeRandomUUID();
    const result = await sendChatMessage(token, chatSessionId, input.prompt, mid);

    if (result.kind === "completed") {
      handlers.onEvent({
        type: "round_ui_layout",
        roundId: input.roundId,
        layout: "simple_chat",
      });
      const text = stripModelThinkingForUi(result.message);
      handlers.onEvent({ type: "final", roundId: input.roundId, text });
      handlers.onEvent({
        type: "report_updated",
        roundId: input.roundId,
        patch: buildReportPatch(input.prompt, sourceLabels, input.attachments),
      });
      handlers.onEvent({ type: "round_completed", roundId: input.roundId });
      return;
    }

    if (result.kind === "blocked") {
      handlers.onEvent({
        type: "round_ui_layout",
        roundId: input.roundId,
        layout: "simple_chat",
      });
      handlers.onEvent({
        type: "error",
        roundId: input.roundId,
        message: result.message,
      });
      return;
    }

    try {
    const executionSteps = result.execution_steps ?? [];
    const stepLabels =
      executionSteps.length > 0
        ? executionSteps
        : (() => {
            const compact = input.prompt.replace(/\s+/g, " ").trim();
            const t = compact.length > 200 ? `${compact.slice(0, 197)}...` : compact;
            return [t ? `调用工具：${t}` : "调用工具执行当前任务"];
          })();

    const stepDefs = stepLabels.map((label, i) => ({
      id: `${input.roundId}-step-${i + 1}`,
      label,
    }));

    handlers.onEvent({
      type: "round_ui_layout",
      roundId: input.roundId,
      layout: "tool_orchestration",
    });

    handlers.onEvent({
      type: "task_execution_steps_init",
      roundId: input.roundId,
      steps: stepDefs.map((s) => ({ id: s.id, label: s.label })),
    });

    const mockStepsMessageId = await postMockTaskExecution(accessToken, chatSessionId, {
      round_id: input.roundId,
      task_id: result.task_id,
      steps: stepDefs.map((s) => ({
        id: s.id,
        label: s.label,
        status: "pending" as const,
      })),
    });

    const persistMockStepsRows = async (statuses: TaskExecutionStepStatus[]) => {
      try {
        const steps = stepDefs.map((s, i) => ({
          id: s.id,
          label: s.label,
          status: statuses[i] ?? ("pending" as TaskExecutionStepStatus),
        }));
        const body = {
          round_id: input.roundId,
          task_id: result.task_id,
          steps,
        };
        if (mockStepsMessageId) {
          await patchMockTaskExecution(accessToken, chatSessionId, mockStepsMessageId, body);
        } else {
          await postMockTaskExecution(accessToken, chatSessionId, body);
        }
      } catch {
        /* 落库失败不影响主流程 */
      }
    };

    const persistMockStepsUniform = async (finalStatus: TaskExecutionStepStatus) => {
      await persistMockStepsRows(stepDefs.map(() => finalStatus));
    };

    const pushPlatformSnapshot = (t: Pick<TaskResponse, "task_id" | "artifacts" | "zip_download_api">) => {
      handlers.onEvent({
        type: "platform_task_snapshot",
        roundId: input.roundId,
        taskId: t.task_id,
        artifacts: (t.artifacts ?? []).map((a) => ({
          artifact_id: a.artifact_id,
          artifact_type: a.artifact_type,
          original_name: a.original_name,
          download_api: a.download_api,
        })),
        zipDownloadApi: t.zip_download_api ?? null,
      });
    };

    const emittedSubtaskTaskIds = new Set<string>();

    const emitFinishedOrchestrationSubtasks = async (orch: ToolOrchestrationStatusApi) => {
      for (let i = 0; i < orch.steps.length; i++) {
        const st = orch.steps[i]!;
        const tid = st.task_id;
        if (!tid || emittedSubtaskTaskIds.has(tid)) continue;
        const u = st.status.toUpperCase();
        if (u !== "SUCCESS" && u !== "FAILED") continue;
        emittedSubtaskTaskIds.add(tid);
        const def = stepDefs[i];
        const label = def?.label ?? st.label ?? `步骤 ${i + 1}`;
        const sid = def?.id ?? `${input.roundId}-step-${i + 1}`;
        try {
          const t = await withAuthRetry((tk) => getTask(tk, tid));
          handlers.onEvent(mapTaskResponseToSubtaskEvent(input.roundId, i, sid, label, t));
        } catch (e) {
          if (e instanceof PlatformAuthExpiredError) throw e;
          /* 单步任务查询失败不阻断整轮 */
        }
      }
    };

    const emitStep = (stepId: string, status: TaskExecutionStepStatus) => {
      handlers.onEvent({
        type: "task_execution_step_update",
        roundId: input.roundId,
        stepId,
        status,
      });
    };

    const finalizeAllSteps = (status: TaskExecutionStepStatus) => {
      for (const s of stepDefs) {
        emitStep(s.id, status);
      }
    };

    const orchestrationId = result.orchestration_id;
    let sharedTask: TaskResponse = await withAuthRetry((t) => getTask(t, result.task_id));
    let orchFinished = false;
    let lastOrch: Awaited<ReturnType<typeof getToolOrchestration>> | null = null;

    if (orchestrationId) {
      for (let polls = 0; polls < 4500; polls += 1) {
        await sleep(800);
        try {
          lastOrch = await withAuthRetry((t) => getToolOrchestration(t, orchestrationId));
        } catch (e) {
          if (e instanceof PlatformAuthExpiredError) throw e;
          lastOrch = null;
          continue;
        }
        lastOrch.steps.forEach((st, idx) => {
          const def = stepDefs[idx];
          if (!def) return;
          emitStep(def.id, mapServerOrchestrationStepStatus(st.status));
        });
        await emitFinishedOrchestrationSubtasks(lastOrch);
        if (lastOrch.finished) {
          orchFinished = true;
          break;
        }
      }

      let summaryTaskId = result.task_id;
      if (lastOrch) {
        if (lastOrch.success) {
          const lastWithId = [...lastOrch.steps].reverse().find((s) => s.task_id);
          if (lastWithId?.task_id) summaryTaskId = lastWithId.task_id;
        } else {
          const failed = lastOrch.steps.find((s) => s.status.toUpperCase() === "FAILED");
          summaryTaskId = failed?.task_id ?? result.task_id;
        }
      }
      sharedTask = await withAuthRetry((t) => getTask(t, summaryTaskId));
    } else {
      if (stepDefs.length > 0) {
        emitStep(stepDefs[0]!.id, "running");
      }
      let polls = 0;
      while (!sharedTask.finished_at && polls < 600) {
        await sleep(1000);
        try {
          sharedTask = await withAuthRetry((t) => getTask(t, result.task_id));
        } catch (e) {
          if (e instanceof PlatformAuthExpiredError) throw e;
          polls += 1;
          continue;
        }
        polls += 1;
      }
      if (stepDefs.length > 0) {
        if (!sharedTask.finished_at) {
          emitStep(stepDefs[0]!.id, "error");
        } else if (sharedTask.status === "SUCCESS") {
          emitStep(stepDefs[0]!.id, "done");
        } else {
          emitStep(stepDefs[0]!.id, "error");
        }
      }
      if (sharedTask.finished_at && stepDefs[0] && !emittedSubtaskTaskIds.has(sharedTask.task_id)) {
        emittedSubtaskTaskIds.add(sharedTask.task_id);
        handlers.onEvent(
          mapTaskResponseToSubtaskEvent(
            input.roundId,
            0,
            stepDefs[0]!.id,
            stepDefs[0]!.label,
            sharedTask,
          ),
        );
      }
    }

    const task = sharedTask;

    if (orchestrationId) {
      if (!orchFinished) {
        finalizeAllSteps("error");
        await persistMockStepsUniform("error");
        pushPlatformSnapshot({
          task_id: result.task_id,
          artifacts: [],
          zip_download_api: null,
        });
        handlers.onEvent({
          type: "error",
          roundId: input.roundId,
          message: humanizeTaskErrorMessage("多步任务等待超时，请稍后在任务列表中查看各步骤状态。"),
        });
        return;
      }

      const rowStatuses: TaskExecutionStepStatus[] =
        lastOrch?.steps.map((s) => mapServerOrchestrationStepStatus(s.status)) ??
        stepDefs.map(() => "error" as TaskExecutionStepStatus);
      await persistMockStepsRows(rowStatuses);

      if (!lastOrch?.success) {
        handlers.onEvent({
          type: "error",
          roundId: input.roundId,
          message: humanizeTaskErrorMessage(task.error_message ?? "多步任务中某一步执行失败"),
        });
        return;
      }

      pushPlatformSnapshot(task);

      const summary = buildTaskCompletionSummary(task);
      handlers.onEvent({ type: "final", roundId: input.roundId, text: summary });
      handlers.onEvent({
        type: "report_updated",
        roundId: input.roundId,
        patch: buildReportPatch(input.prompt, sourceLabels, input.attachments),
      });
      handlers.onEvent({ type: "round_completed", roundId: input.roundId });
      return;
    }

    if (!task.finished_at) {
      finalizeAllSteps("error");
      await persistMockStepsUniform("error");
      pushPlatformSnapshot({
        task_id: result.task_id,
        artifacts: [],
        zip_download_api: null,
      });
      handlers.onEvent({
        type: "error",
        roundId: input.roundId,
        message: humanizeTaskErrorMessage("等待任务结果超时，请稍后在任务列表中查看。"),
      });
      return;
    }

    if (task.status === "FAILED") {
      finalizeAllSteps("error");
      await persistMockStepsUniform("error");
      handlers.onEvent({
        type: "error",
        roundId: input.roundId,
        message: humanizeTaskErrorMessage(task.error_message ?? "任务执行失败"),
      });
      return;
    }

    if (task.status !== "SUCCESS") {
      finalizeAllSteps("error");
      await persistMockStepsUniform("error");
      const summary = buildTaskCompletionSummary(task);
      handlers.onEvent({ type: "final", roundId: input.roundId, text: summary });
      handlers.onEvent({
        type: "report_updated",
        roundId: input.roundId,
        patch: buildReportPatch(input.prompt, sourceLabels, input.attachments),
      });
      handlers.onEvent({ type: "round_completed", roundId: input.roundId });
      return;
    }

    finalizeAllSteps("done");
    await persistMockStepsUniform("done");

    pushPlatformSnapshot(task);

    const summary = buildTaskCompletionSummary(task);
    handlers.onEvent({ type: "final", roundId: input.roundId, text: summary });
    handlers.onEvent({
      type: "report_updated",
      roundId: input.roundId,
      patch: buildReportPatch(input.prompt, sourceLabels, input.attachments),
    });
    handlers.onEvent({ type: "round_completed", roundId: input.roundId });
    } catch (e) {
      if (e instanceof PlatformAuthExpiredError) {
        handlers.onEvent({
          type: "error",
          roundId: input.roundId,
          message: humanizeTaskErrorMessage("登录已失效，请重新登录后再试。"),
        });
        return;
      }
      throw e;
    }
  });
}

export async function streamAgentRound(
  input: AgentRoundInput,
  handlers: {
    onEvent: (event: AgentRoundRuntimeEvent) => void;
  },
  options?: { platform?: StreamAgentRoundPlatformOptions },
) {
  if (isAgentRealApiEnabled()) {
    const { withFreshToken } = options?.platform ?? {};
    const sid = input.platformChatSessionId;
    if (sid && withFreshToken) {
      await runPlatformRound(input, handlers, sid, withFreshToken);
      return;
    }
    throw new Error(
      "已开启后端联调（NEXT_PUBLIC_AGENT_USE_REAL_API=1），但当前任务是内置演示数据，没有平台会话。请返回首页输入需求并发送以创建真实会话；不要直接打开 /agent 或点击侧栏里的演示历史对话。",
    );
  }
  if (isMockRuntimeEnabled()) {
    await runMockRound(input, handlers);
    return;
  }
  await runApiRound(input, handlers);
}
