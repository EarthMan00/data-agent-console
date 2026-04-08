import type {
  AgentAttachment,
  ConversationNode,
  DataSourceChain,
  PlatformSubtaskSnapshot,
  PlatformTaskArtifactRef,
  TaskExecutionStep,
} from "@/lib/agent-events";
import { humanizeTaskErrorMessage } from "@/lib/platform-task-error-copy";
import { hasTabularTaskResultFiles } from "@/lib/platform-task-artifacts";

export type RoundViewModel = {
  roundId: string;
  createdAt: string;
  userMessage?: string;
  attachments: AgentAttachment[];
  intentText: string;
  splitItems: string[];
  executionGroups: Array<{
    id: string;
    title: string;
    description: string;
    tools: Array<{
      id: string;
      title: string;
      detail: string;
      previewId?: string;
      tone?: "default" | "error";
    }>;
  }>;
  resultSummary: string;
  resultTitle: string;
  hasResult: boolean;
  showTaskResultInChat: boolean;
  uiLayout: "simple_chat" | "tool_orchestration";
  assistantPending: boolean;
  errorMessage?: string;
  collapseExecution: boolean;
  executionSteps?: TaskExecutionStep[];
  platformSubtasks?: PlatformSubtaskSnapshot[];
};

export type TaskRunLike = {
  startedAt: string;
  objective: string;
  selectedCapabilities: string[];
  timeline: ConversationNode[];
  chains: DataSourceChain[];
  roundUiLayouts?: Record<string, "simple_chat" | "tool_orchestration">;
  status?: "queued" | "running" | "success" | "error";
  latestRoundId?: string | null;
  taskExecutionStepsByRound?: Record<string, TaskExecutionStep[]>;
  platformSubtasksByRound?: Record<string, PlatformSubtaskSnapshot[]>;
  platformTaskArtifacts?: PlatformTaskArtifactRef[];
};

export function compactText(text: string, maxLength = 120) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength).trim()}...`;
}

export function toCapabilitySafeTitle(text: string) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  return cleaned.length > 42 ? `${cleaned.slice(0, 42)}...` : cleaned;
}

function buildExecutionSummaryFallback(objective: string, sourceLabels: string[]) {
  if (sourceLabels.length > 0) {
    return `本轮已经完成 ${sourceLabels.join("、")} 的结构化执行，并将关键结果整理进当前任务。`;
  }
  return `本轮围绕“${toCapabilitySafeTitle(objective)}”生成了一份结构化结果。`;
}

function buildResultTitle(sourceText: string) {
  const cleaned = toCapabilitySafeTitle(sourceText)
    .replace(/^(请帮我做一份|请帮我|帮我|给我|做一份|做个|生成|输出)/, "")
    .trim();

  if (!cleaned) return "分析结果";
  if (/(报告|结果|方案|规划|摘要|概览|分析)$/.test(cleaned)) return cleaned;
  return `${cleaned}结果`;
}

export function buildRoundViewModels(run: TaskRunLike) {
  const seen = new Set<string>();
  const models: RoundViewModel[] = [];

  for (const node of run.timeline) {
    if (seen.has(node.roundId)) continue;
    seen.add(node.roundId);

    const roundNodes = run.timeline.filter((item) => item.roundId === node.roundId);
    const createdAt = roundNodes[0]?.createdAt ?? run.startedAt;
    const userNode = roundNodes.find((item) => item.kind === "user_message" && "text" in item);
    const finalNode = roundNodes.find((item) => item.kind === "assistant_final" && "text" in item);
    const attachmentNode = roundNodes.find((item) => item.kind === "attachment_group" && "attachments" in item);
    const patchNode = roundNodes.find((item) => item.kind === "report_patch" && "summary" in item);
    const errorNode = roundNodes.find((item): item is ConversationNode & { kind: "error"; message: string } => item.kind === "error");
    const errorMessage = errorNode?.message ? humanizeTaskErrorMessage(errorNode.message) : undefined;

    const chains = run.chains.filter((chain) => chain.roundId === node.roundId);
    const sourceLabels = chains.map((chain) => chain.sourceLabel);

    const execStepsSorted = run.taskExecutionStepsByRound?.[node.roundId]
      ? [...run.taskExecutionStepsByRound[node.roundId]!].sort((a, b) => a.order - b.order)
      : undefined;
    const hasExecSteps = Boolean(execStepsSorted?.length);
    const platformSubtasks = run.platformSubtasksByRound?.[node.roundId];

    const explicitLayout = run.roundUiLayouts?.[node.roundId];
    const uiLayout: RoundViewModel["uiLayout"] =
      explicitLayout ?? (chains.length > 0 ? "tool_orchestration" : "simple_chat");

    const assistantPending =
      (run.status === "running" || run.status === "queued") &&
      run.latestRoundId === node.roundId &&
      !finalNode &&
      !errorMessage;

    let intentText =
      sourceLabels.length > 0
        ? `本轮会优先调度 ${sourceLabels.join("、")}，先确认目标，再完成结果汇总。`
        : "本轮会先确认目标，再按阶段完成执行与汇总。";
    let splitItems =
      chains.length > 0
        ? chains.map((chain, index) => `${index + 1}）${chain.sourceLabel}：补充本轮所需的结构化结果。`)
        : (run.selectedCapabilities.length > 0 ? run.selectedCapabilities : ["web-search"]).map(
            (sourceId, index) => `${index + 1}）${toCapabilitySafeTitle(sourceId)}：补充本轮所需的结构化结果。`,
          );
    let executionGroups = chains.map((chain) => ({
      id: chain.id,
      title: chain.sourceLabel,
      description: chain.intent,
      tools: [
        {
          id: `${chain.id}-tool`,
          title: chain.sourceLabel,
          detail: `${chain.progressText}${chain.resultCountText ? `（${chain.resultCountText}）` : ""}`,
          previewId: chain.resultPreviewId,
          tone: chain.status === "error" ? ("error" as const) : ("default" as const),
        },
      ],
    }));

    if (uiLayout === "tool_orchestration" && hasExecSteps) {
      splitItems = execStepsSorted!.map((s, idx) => `${idx + 1}）${s.label}`);
      executionGroups = [];
      intentText = `本轮已拆解为 ${execStepsSorted!.length} 个执行步骤，后台将真实调用工具执行；界面同步展示每步状态，任务结束后全部标记为完成并展示结果。`;
    }

    if (uiLayout === "simple_chat") {
      intentText = "";
      splitItems = [];
      executionGroups = [];
    }

    const patchSummaryText = (patchNode?.summary ?? []).join("。");
    const baseConversationOutput = Boolean(
      (finalNode?.text && finalNode.text.trim()) || (patchNode?.summary && patchNode.summary.length > 0),
    );
    const executionPhasesComplete =
      uiLayout === "simple_chat" ||
      (hasExecSteps &&
        execStepsSorted!.every((s) => s.status === "done" || s.status === "error")) ||
      (!hasExecSteps && chains.length === 0) ||
      (!hasExecSteps && chains.every((c) => c.status === "success" || c.status === "error"));

    const taskOutcomeReady =
      uiLayout === "tool_orchestration" && hasExecSteps
        ? executionPhasesComplete && (baseConversationOutput || Boolean(errorMessage))
        : baseConversationOutput || Boolean(errorMessage);

    const waitingExecSummary =
      uiLayout === "tool_orchestration" && hasExecSteps && !taskOutcomeReady && !errorMessage;

    const resultSummary = errorMessage
      ? ""
      : finalNode?.text?.trim() ||
        patchSummaryText ||
        (waitingExecSummary ? "任务执行完成后将在此展示结果摘要。" : buildExecutionSummaryFallback(run.objective, sourceLabels));

    const collapseExecution =
      Boolean(errorMessage) ||
      (uiLayout === "tool_orchestration" && hasExecSteps
        ? taskOutcomeReady
        : baseConversationOutput && executionPhasesComplete);

    const isPlatformStepRound = uiLayout === "tool_orchestration" && hasExecSteps;
    const tabularOk = hasTabularTaskResultFiles(run.platformTaskArtifacts);

    const showTaskResultInChat = isPlatformStepRound
      ? Boolean(
          !errorMessage &&
            run.status === "success" &&
            tabularOk &&
            taskOutcomeReady,
        )
      : !(uiLayout === "tool_orchestration" && hasExecSteps) || taskOutcomeReady;

    const hasResult = isPlatformStepRound
      ? Boolean(!errorMessage && run.status === "success" && tabularOk && taskOutcomeReady)
      : taskOutcomeReady;

    models.push({
      roundId: node.roundId,
      createdAt,
      userMessage: userNode?.text,
      attachments: attachmentNode?.attachments ?? [],
      intentText,
      splitItems,
      executionGroups,
      resultSummary,
      resultTitle: buildResultTitle(userNode?.text ?? run.objective),
      hasResult,
      showTaskResultInChat,
      uiLayout,
      assistantPending,
      errorMessage,
      collapseExecution,
      executionSteps: execStepsSorted,
      platformSubtasks,
    });
  }

  return models;
}

export function buildAcknowledgement(round: RoundViewModel, run: TaskRunLike) {
  const shortTitle = compactText(round.userMessage ?? run.objective, 40);
  if (round.executionSteps?.length) {
    return `好的，我收到「${shortTitle}」这个任务了。我会按已拆解的 ${round.executionSteps.length} 个步骤执行，并在后台调用工具完成后汇总结果。`;
  }
  if (round.executionGroups.length > 0) {
    const groupTitles = round.executionGroups.map((group) => group.title).join("、");
    return `好的，我收到「${shortTitle}」这个任务了。我会先把 ${groupTitles} 这些结果查齐，再整理成结论给你。`;
  }
  return `好的，我收到「${shortTitle}」这个任务了。我会先完成任务理解，再把执行结果整理给你。`;
}
