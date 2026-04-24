"use client";

/**
 * 浏览器内工作区运行态（runs / reports 等），由首页与 Data Agent API 写入；本文件不是「mock 推理」数据源。
 */

import { useSyncExternalStore } from "react";

import type {
  AgentAttachment,
  AgentRoundRuntimeEvent,
  ConversationNode,
  DataSourceChain,
  PlatformSubtaskSnapshot,
  PlatformTaskArtifactRef,
  TaskExecutionStep,
} from "@/lib/agent-events";
import { upsertReportCollection, upsertRunCollection } from "@/lib/workspace-upsert";
import { createMinimalResultPreview, DEFAULT_RESULT_PREVIEW_KEY } from "@/lib/report-defaults";
import { homeCapabilityItems } from "@/lib/home-capability-items";
import { DEFAULT_RESULT_SUMMARY_TITLE, WORKSPACE_DISPLAY_NAME } from "@/lib/workspace-constants";
import type { FavoriteItem, PromptCard, ResultPreview, RunRecord, ScheduleItem } from "@/lib/workspace-domain-types";

export type TaskDraft = {
  id: string;
  objective: string;
  mode: "专业模式" | "轻量模式";
  selectedCapabilities: string[];
  createdAt: string;
};

export type TaskRun = {
  id: string;
  /** 联调 Data Agent Server 时的聊天会话 id（与本地 run.id 分离） */
  platformSessionId?: string;
  taskDraftId: string;
  reportId: string;
  title: string;
  objective: string;
  mode: "专业模式" | "轻量模式";
  selectedCapabilities: string[];
  status: "queued" | "running" | "success" | "error";
  startedAt: string;
  sections: Array<{ id: string; title: string; body: string; tools: Array<{ id: string; title: string; detail: string; resultCount: string; previewId: string }> }>;
  notes: string[];
  activePreviewId: string;
  summaryTitle: string;
  summaryBody: string;
  saved: boolean;
  starred: boolean;
  latestRoundId: string | null;
  timeline: ConversationNode[];
  chains: DataSourceChain[];
  /** 每轮对话 UI：普通气泡 vs 工具编排（拆分/执行） */
  roundUiLayouts?: Record<string, "simple_chat" | "tool_orchestration">;
  /** 平台异步任务完成后附带的产物（用于右侧预览 CSV/JSON 等） */
  platformTaskArtifacts?: PlatformTaskArtifactRef[];
  platformTaskId?: string;
  platformTaskZipDownloadApi?: string | null;
  /** 按 round 存储平台任务的「分步执行」mock 状态 */
  taskExecutionStepsByRound?: Record<string, TaskExecutionStep[]>;
  /** 多步编排：每步完成后的产物快照（用于聊天卡片与右侧切换） */
  platformSubtasksByRound?: Record<string, PlatformSubtaskSnapshot[]>;
};

export type Report = ResultPreview & {
  runId: string;
  generatedAt: string;
  previewKey: string;
};

export type Template = PromptCard & {
  sourceRunId?: string;
  summary?: string;
};

export type Workflow = ScheduleItem & {
  templateId: string;
  description: string;
  /** 自定义分组名称；未设置则归入「默认」视图 */
  groupName?: string;
  /** 是否启用调度 */
  enabled?: boolean;
};

export type Artifact = FavoriteItem & {
  sourceRunId: string;
  reportId: string;
};

export type RunRecordEntry = RunRecord & {
  runId: string;
  reportId: string;
};

type DemoState = {
  workspaceName: string;
  taskDrafts: TaskDraft[];
  runs: TaskRun[];
  reports: Report[];
  templates: Template[];
  workflows: Workflow[];
  artifacts: Artifact[];
  runRecords: RunRecordEntry[];
  currentRunId: string;
};

export type QueueFollowupInput = {
  prompt: string;
  selectedCapabilities: string[];
  attachments: AgentAttachment[];
};

const capabilityLabelMap = new Map(homeCapabilityItems.map((item) => [item.id, item.label]));

function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
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

function toRunTitle(objective: string) {
  const cleaned = objective.replace(/\s+/g, " ").trim();
  if (!cleaned) return "新的研究任务";
  return cleaned.length > 24 ? `${cleaned.slice(0, 24)}...` : cleaned;
}

function toCapabilityIds(objective: string) {
  const lower = objective.toLowerCase();
  return homeCapabilityItems
    .filter((item) => lower.includes(item.label.toLowerCase()) || lower.includes(item.id))
    .slice(0, 3)
    .map((item) => item.id);
}

function getSourceLabel(sourceId: string) {
  return capabilityLabelMap.get(sourceId) ?? sourceId;
}

function pickPreviewKey(sourceId: string) {
  if (["amazon", "keepa", "store-scan", "walmart", "ebay"].includes(sourceId)) return "market-report";
  if (["jimu", "seller-sprite", "google"].includes(sourceId)) return "review-report";
  if (["web-search", "alibaba", "tiktok", "patent"].includes(sourceId)) return "competition-report";
  return DEFAULT_RESULT_PREVIEW_KEY;
}

function clonePreviewByKey(previewKey: string) {
  const preview = createMinimalResultPreview({ id: previewKey, title: "任务结果" });
  return {
    ...preview,
    summary: [...preview.summary],
    sheetRows: preview.sheetRows.map((row) => [...row]),
    sheetTabs: preview.sheetTabs.map((tab) => ({ ...tab })),
  };
}

function buildSummaryBody(
  objective: string,
  sourceLabels: string[],
  note?: string,
  attachments?: AgentAttachment[],
) {
  const short = toRunTitle(objective);
  const sourceText =
    sourceLabels.length > 0 ? `系统已并行调度 ${sourceLabels.join("、")} 多条数据源链。` : "系统已完成基础数据源链调度。";
  const attachmentText =
    attachments && attachments.length > 0 ? `并纳入附件上下文 ${attachments.map((item) => item.name).join("、")}。` : "";
  const tail = note ? `最新补充要求为“${note}”，本轮结果已完成同步刷新。` : "当前结果适合继续追问、保存模板或转为周期任务。";
  return `任务“${short}”已完成多逻辑链执行。${sourceText}${attachmentText}${tail}`;
}

function buildAssistantFinalText(
  objective: string,
  sourceLabels: string[],
  note?: string,
  attachments?: AgentAttachment[],
) {
  const opening = note ? `已根据“${note}”补充分析。` : `围绕“${toRunTitle(objective)}”的首轮分析已完成。`;
  const sourceSentence =
    sourceLabels.length > 0
      ? `本轮主要整合了 ${sourceLabels.join("、")} 的结果，并在同一轮里完成交叉比对。`
      : "本轮基于默认数据源链给出了一版基础结果。";
  const attachmentSentence =
    attachments && attachments.length > 0
      ? `我也参考了附件 ${attachments.map((item) => item.name).join("、")} 的上下文，不是只看页面内文本。`
      : "当前输出已经包含市场、评论和竞争三个层面的综合判断。";
  return [opening, sourceSentence, attachmentSentence].join("\n\n");
}

function createNode<T extends ConversationNode>(node: T): T {
  return node;
}

function createUserNode(roundId: string, text: string, createdAt: string) {
  return createNode({
    id: createId("node"),
    roundId,
    createdAt,
    kind: "user_message",
    text,
  });
}

function createAttachmentNode(roundId: string, attachments: AgentAttachment[], createdAt: string) {
  return createNode({
    id: createId("node"),
    roundId,
    createdAt,
    kind: "attachment_group",
    attachments,
  });
}

function createSeedTimeline(
  objective: string,
  sources: string[],
  report: Report,
  roundId: string,
) {
  const createdAt = report.generatedAt;
  const sourceLabels = sources.map(getSourceLabel);
  const chains: DataSourceChain[] = sources.map((sourceId, index) => ({
    id: createId("chain"),
    roundId,
    sourceId,
    sourceLabel: getSourceLabel(sourceId),
    status: "success",
    intent: `围绕“${toRunTitle(objective)}”查询 ${getSourceLabel(sourceId)} 的结构化结果。`,
    progressText: `已完成 ${getSourceLabel(sourceId)} 数据查询与整理。`,
    resultCountText: index === 0 ? "返回 50 条数据" : index === 1 ? "返回 60 条数据" : "返回 1 组结果",
    resultPreviewId: pickPreviewKey(sourceId),
  }));

  const timeline: ConversationNode[] = [
    createUserNode(roundId, objective, createdAt),
    ...chains.map((chain) =>
      createNode({
        id: createId("node"),
        roundId,
        createdAt,
        kind: "data_source_chain",
        chainId: chain.id,
      }),
    ),
    createNode({
      id: createId("node"),
      roundId,
      createdAt,
      kind: "assistant_final",
      text: buildAssistantFinalText(objective, sourceLabels),
    }),
    createNode({
      id: createId("node"),
      roundId,
      createdAt,
      kind: "report_patch",
      summary: [...report.summary],
    }),
  ];

  return { timeline, chains };
}

function buildReport(runId: string, objective: string, previewKey = "market-report"): Report {
  const base = clonePreviewByKey(previewKey);
  return {
    ...base,
    id: createId("report"),
    runId,
    title: toRunTitle(objective),
    subtitle: `最后生成时间：${formatShortDate()} · ${objective.slice(0, 26)}`,
    generatedAt: formatDate(),
    previewKey,
  };
}

function buildArtifact(run: TaskRun, report: Report): Artifact {
  return {
    id: createId("artifact"),
    title: run.title,
    body: run.objective,
    scope: "全部",
    type: report.mode === "sheet" ? "表格" : "报告",
    createdAt: formatDate(),
    sourceRunId: run.id,
    reportId: report.id,
  };
}

function buildRunRecord(run: TaskRun, report: Report): RunRecordEntry {
  return {
    id: createId("record"),
    runId: run.id,
    reportId: report.id,
    title: run.title,
    startedAt: run.startedAt,
    completedAt: report.generatedAt,
    result: `生成 1 份${report.mode === "sheet" ? "结构化表格" : "结构化报告"}`,
    status: run.status === "error" ? "失败" : "成功",
    summary: run.objective.length > 120 ? `${run.objective.slice(0, 120)}…` : run.objective,
  };
}

function buildRunFromObjective(objective: string, mode: TaskDraft["mode"], selectedCapabilities: string[]) {
  const startedAt = formatDate();
  const taskDraftId = createId("task");
  const runId = createId("run");
  const roundId = createId("round");
  const title = toRunTitle(objective);
  const report = buildReport(runId, objective);
  const run: TaskRun = {
    id: runId,
    taskDraftId,
    reportId: report.id,
    title,
    objective,
    mode,
    selectedCapabilities,
    status: "queued",
    startedAt,
    sections: [],
    notes: [],
    activePreviewId: report.previewKey,
    summaryTitle: DEFAULT_RESULT_SUMMARY_TITLE,
    summaryBody: "任务已创建，等待开始执行多逻辑链分析。",
    saved: false,
    starred: false,
    latestRoundId: roundId,
    timeline: [createUserNode(roundId, objective, startedAt)],
    chains: [],
  };
  const taskDraft: TaskDraft = {
    id: taskDraftId,
    objective,
    mode,
    selectedCapabilities,
    createdAt: startedAt,
  };
  return { taskDraft, run, report };
}

function buildSeedRun(args: {
  runId: string;
  taskDraftId: string;
  objective: string;
  mode: TaskDraft["mode"];
  selectedCapabilities: string[];
  startedAt: string;
  saved: boolean;
}) {
  const report = {
    ...buildReport(args.runId, args.objective),
    id: `report-${args.runId}`,
    runId: args.runId,
    generatedAt: args.startedAt,
    subtitle: `最后生成时间：${args.startedAt.slice(0, 10)} · ${args.objective.slice(0, 26)}`,
  };
  const roundId = `round-${args.runId}`;
  const { timeline, chains } = createSeedTimeline(args.objective, args.selectedCapabilities, report, roundId);
  const run: TaskRun = {
    id: args.runId,
    taskDraftId: args.taskDraftId,
    reportId: report.id,
    title: toRunTitle(args.objective),
    objective: args.objective,
    mode: args.mode,
    selectedCapabilities: args.selectedCapabilities,
    status: "success",
    startedAt: args.startedAt,
    sections: [],
    notes: [],
    activePreviewId: report.previewKey,
    summaryTitle: DEFAULT_RESULT_SUMMARY_TITLE,
    summaryBody: buildSummaryBody(args.objective, args.selectedCapabilities.map(getSourceLabel)),
    saved: args.saved,
    starred: false,
    latestRoundId: roundId,
    timeline,
    chains,
    roundUiLayouts: { [roundId]: "tool_orchestration" },
  };
  return { run, report };
}

function updateAttachmentStatuses(nodes: ConversationNode[], roundId: string, attachments: AgentAttachment[]) {
  return nodes.map((node) =>
    node.kind === "attachment_group" && node.roundId === roundId
      ? { ...node, attachments }
      : node,
  );
}

function upsertTimelineNode(
  timeline: ConversationNode[],
  matcher: (node: ConversationNode) => boolean,
  createNodeValue: () => ConversationNode,
  updateNode: (node: ConversationNode) => ConversationNode,
) {
  const index = timeline.findIndex(matcher);
  if (index === -1) return [...timeline, createNodeValue()];
  return timeline.map((node, nodeIndex) => (nodeIndex === index ? updateNode(node) : node));
}

function applyEventToRun(run: TaskRun, report: Report, event: AgentRoundRuntimeEvent) {
  const timeline = [...run.timeline];
  const chains = [...run.chains];
  const nextRun = { ...run };
  let nextReport = { ...report };

  if (event.type === "round_started") {
    nextRun.status = "running";
    nextRun.platformTaskArtifacts = undefined;
    nextRun.platformTaskId = undefined;
    nextRun.platformTaskZipDownloadApi = undefined;
    const stepMap = { ...(nextRun.taskExecutionStepsByRound ?? {}) };
    delete stepMap[event.roundId];
    nextRun.taskExecutionStepsByRound = stepMap;
    const subMap = { ...(nextRun.platformSubtasksByRound ?? {}) };
    delete subMap[event.roundId];
    nextRun.platformSubtasksByRound = subMap;
  }

  if (event.type === "task_execution_steps_init") {
    const rows: TaskExecutionStep[] = event.steps.map((s, idx) => ({
      id: s.id,
      roundId: event.roundId,
      label: s.label,
      order: idx,
      status: "pending" as const,
    }));
    nextRun.taskExecutionStepsByRound = {
      ...(nextRun.taskExecutionStepsByRound ?? {}),
      [event.roundId]: rows,
    };
    const subMap = { ...(nextRun.platformSubtasksByRound ?? {}) };
    delete subMap[event.roundId];
    nextRun.platformSubtasksByRound = subMap;
    nextRun.chains = chains.filter((c) => c.roundId !== event.roundId);
    return { run: nextRun, report: nextReport };
  }

  if (event.type === "task_execution_step_update") {
    const list = nextRun.taskExecutionStepsByRound?.[event.roundId];
    if (list) {
      nextRun.taskExecutionStepsByRound = {
        ...(nextRun.taskExecutionStepsByRound ?? {}),
        [event.roundId]: list.map((s) => (s.id === event.stepId ? { ...s, status: event.status } : s)),
      };
    }
    return { run: nextRun, report: nextReport };
  }

  if (event.type === "platform_task_snapshot") {
    nextRun.platformTaskId = event.taskId;
    nextRun.platformTaskArtifacts = event.artifacts.map((a) => ({ ...a }));
    nextRun.platformTaskZipDownloadApi = event.zipDownloadApi ?? null;
    return { run: nextRun, report: nextReport };
  }

  if (event.type === "platform_subtask_snapshot") {
    const snap: PlatformSubtaskSnapshot = {
      stepIndex: event.stepIndex,
      stepId: event.stepId,
      label: event.label,
      taskId: event.taskId,
      outcome: event.outcome,
      taskStatus: event.taskStatus,
      errorMessage: event.errorMessage ?? null,
      artifacts: event.artifacts.map((a) => ({ ...a })),
      zipDownloadApi: event.zipDownloadApi ?? null,
    };
    const prev = nextRun.platformSubtasksByRound?.[event.roundId] ?? [];
    const deduped = prev.filter((s) => s.taskId !== snap.taskId);
    nextRun.platformSubtasksByRound = {
      ...(nextRun.platformSubtasksByRound ?? {}),
      [event.roundId]: [...deduped, snap],
    };
    nextRun.platformTaskId = event.taskId;
    nextRun.platformTaskArtifacts = snap.artifacts.map((a) => ({ ...a }));
    nextRun.platformTaskZipDownloadApi = snap.zipDownloadApi;
    return { run: nextRun, report: nextReport };
  }

  if (event.type === "round_ui_layout") {
    nextRun.roundUiLayouts = {
      ...(nextRun.roundUiLayouts ?? {}),
      [event.roundId]: event.layout,
    };
    return { run: nextRun, report: nextReport };
  }

  if (event.type === "attachments_received") {
    nextRun.timeline = updateAttachmentStatuses(timeline, event.roundId, event.attachments);
    return { run: nextRun, report: nextReport };
  }

  if (event.type === "thinking") {
    nextRun.timeline = upsertTimelineNode(
      timeline,
      (node) => node.kind === "assistant_thinking" && node.roundId === event.roundId,
      () =>
        createNode({
          id: createId("node"),
          roundId: event.roundId,
          createdAt: formatDate(),
          kind: "assistant_thinking",
          text: event.text,
        }),
      (node) => ({ ...node, text: event.text }),
    );
    return { run: nextRun, report: nextReport };
  }

  if (event.type === "loading") {
    nextRun.timeline = upsertTimelineNode(
      timeline,
      (node) => node.kind === "assistant_loading" && node.roundId === event.roundId,
      () =>
        createNode({
          id: createId("node"),
          roundId: event.roundId,
          createdAt: formatDate(),
          kind: "assistant_loading",
          text: event.text,
        }),
      (node) => ({ ...node, text: event.text }),
    );
    return { run: nextRun, report: nextReport };
  }

  if (event.type === "source_started") {
    nextRun.chains = [...chains, event.chain];
    nextRun.timeline = [
      ...timeline.filter((node) => !(node.roundId === event.roundId && node.kind === "assistant_loading")),
      createNode({
        id: createId("node"),
        roundId: event.roundId,
        createdAt: formatDate(),
        kind: "data_source_chain",
        chainId: event.chain.id,
      }),
    ];
    return { run: nextRun, report: nextReport };
  }

  if (event.type === "source_progress") {
    nextRun.chains = chains.map((chain) =>
      chain.id === event.chainId ? { ...chain, status: "running", progressText: event.progressText } : chain,
    );
    return { run: nextRun, report: nextReport };
  }

  if (event.type === "source_completed") {
    const chainStatus: DataSourceChain["status"] =
      event.chainOutcome === "error" ? "error" : "success";
    nextRun.chains = chains.map((chain) =>
      chain.id === event.chainId
        ? {
            ...chain,
            status: chainStatus,
            progressText: event.progressText,
            resultCountText: event.resultCountText,
            resultPreviewId: event.resultPreviewId ?? chain.resultPreviewId,
          }
        : chain,
    );
    if (event.resultPreviewId) {
      nextRun.activePreviewId = event.resultPreviewId;
    }
    return { run: nextRun, report: nextReport };
  }

  if (event.type === "delta") {
    nextRun.timeline = upsertTimelineNode(
      timeline,
      (node) => node.kind === "assistant_stream" && node.roundId === event.roundId,
      () =>
        createNode({
          id: createId("node"),
          roundId: event.roundId,
          createdAt: formatDate(),
          kind: "assistant_stream",
          text: event.text,
          status: "streaming",
        }),
      (node) =>
        node.kind === "assistant_stream"
          ? { ...node, text: `${node.text}${event.text}` }
          : node,
    );
    return { run: nextRun, report: nextReport };
  }

  if (event.type === "final") {
    nextRun.timeline = timeline.map((node) =>
      node.kind === "assistant_stream" && node.roundId === event.roundId
        ? { ...node, status: "complete" as const }
        : node,
    );
    nextRun.timeline = [
      ...nextRun.timeline,
      createNode({
        id: createId("node"),
        roundId: event.roundId,
        createdAt: formatDate(),
        kind: "assistant_final",
        text: event.text,
      }),
    ];
    return { run: nextRun, report: nextReport };
  }

  if (event.type === "report_updated") {
    nextReport = {
      ...nextReport,
      previewKey: event.patch.previewKey,
      title: event.patch.title,
      subtitle: event.patch.subtitle,
      generatedAt: event.patch.generatedAt,
      mode: event.patch.mode,
      summary: [...event.patch.summary],
      sheetTabs: event.patch.sheetTabs.map((tab) => ({ ...tab })),
      sheetRows: event.patch.sheetRows.map((row) => [...row]),
    };
    nextRun.summaryBody = event.patch.summaryBody;
    nextRun.activePreviewId = event.patch.previewKey;
    nextRun.timeline = [
      ...timeline,
      createNode({
        id: createId("node"),
        roundId: event.roundId,
        createdAt: formatDate(),
        kind: "report_patch",
        summary: [...event.patch.summary],
      }),
    ];
    return { run: nextRun, report: nextReport };
  }

  if (event.type === "round_completed") {
    nextRun.status = "success";
    return { run: nextRun, report: nextReport };
  }

  if (event.type === "error") {
    nextRun.status = "error";
    nextRun.timeline = [
      ...timeline,
      createNode({
        id: createId("node"),
        roundId: event.roundId,
        createdAt: formatDate(),
        kind: "error",
        message: event.message,
      }),
    ];
    return { run: nextRun, report: nextReport };
  }

  return { run: nextRun, report: nextReport };
}

function createInitialState(): DemoState {
  return {
    workspaceName: WORKSPACE_DISPLAY_NAME,
    taskDrafts: [],
    runs: [],
    reports: [],
    templates: [],
    workflows: [],
    artifacts: [],
    runRecords: [],
    currentRunId: "",
  };
}

function readStoredState() {
  return createInitialState();
}

let state = readStoredState();
const listeners = new Set<() => void>();

function emit(nextState: DemoState) {
  state = nextState;
  listeners.forEach((listener) => listener());
}

function updateState(updater: (current: DemoState) => DemoState) {
  emit(updater(state));
}

function createTemplateFromInput(input: {
  title: string;
  body: string;
  scope?: Template["scope"];
  sourceRunId?: string;
  summary?: string;
}): Template {
  return {
    id: createId("template"),
    title: input.title.trim(),
    body: input.body.trim(),
    scope: input.scope ?? "默认",
    createdAt: formatDate(),
    sourceRunId: input.sourceRunId,
    summary: input.summary?.trim(),
  };
}

function createWorkflowFromInput(input: {
  templateId: string;
  title: string;
  prompt: string;
  frequency: string;
  nextRun: string;
  scope?: Workflow["scope"];
  groupName?: string;
  enabled?: boolean;
  status?: ScheduleItem["status"];
}): Workflow {
  return {
    id: createId("workflow"),
    templateId: input.templateId,
    title: input.title.trim(),
    description: input.prompt.trim(),
    frequency: input.frequency,
    nextRun: input.nextRun,
    status: input.status ?? (input.enabled === false ? "已暂停" : "生效中"),
    scope: input.scope ?? "默认",
    groupName: input.groupName?.trim() || undefined,
    enabled: input.enabled ?? true,
  };
}

export const demoStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot() {
    return state;
  },
};

export function useDemoState() {
  return useSyncExternalStore(demoStore.subscribe, demoStore.getSnapshot, demoStore.getSnapshot);
}

export const demoActions = {
  startTaskRun(input: {
    objective: string;
    mode: TaskDraft["mode"];
    selectedCapabilities?: string[];
  }) {
    const objective = input.objective.trim();
    const selectedCapabilities = input.selectedCapabilities?.length
      ? input.selectedCapabilities
      : toCapabilityIds(objective);
    const { taskDraft, run, report } = buildRunFromObjective(objective, input.mode, selectedCapabilities);

    updateState((current) => ({
      ...current,
      taskDrafts: [taskDraft, ...current.taskDrafts],
      runs: [run, ...current.runs],
      reports: [report, ...current.reports],
      runRecords: [buildRunRecord(run, report), ...current.runRecords],
      currentRunId: run.id,
    }));

    return run.id;
  },

  startPlatformTask(input: {
    platformSessionId: string;
    objective: string;
    mode: TaskDraft["mode"];
    selectedCapabilities: string[];
  }) {
    const objective = input.objective.trim();
    const selectedCapabilities = input.selectedCapabilities?.length
      ? input.selectedCapabilities
      : toCapabilityIds(objective);
    const startedAt = formatDate();
    const taskDraftId = createId("task");
    const runId = createId("run");
    const roundId = createId("round");
    const title = toRunTitle(objective);
    const report = buildReport(runId, objective);
    const run: TaskRun = {
      id: runId,
      platformSessionId: input.platformSessionId,
      taskDraftId,
      reportId: report.id,
      title,
      objective,
      mode: input.mode,
      selectedCapabilities,
      status: "queued",
      startedAt,
      sections: [],
      notes: [],
      activePreviewId: report.previewKey,
      summaryTitle: DEFAULT_RESULT_SUMMARY_TITLE,
      summaryBody: "任务已创建，正在连接后端执行。",
      saved: false,
      starred: false,
      latestRoundId: roundId,
      timeline: [createUserNode(roundId, objective, startedAt)],
      chains: [],
    };
    const taskDraft: TaskDraft = {
      id: taskDraftId,
      objective,
      mode: input.mode,
      selectedCapabilities,
      createdAt: startedAt,
    };
    updateState((current) => ({
      ...current,
      taskDrafts: [taskDraft, ...current.taskDrafts],
      runs: [run, ...current.runs],
      reports: [report, ...current.reports],
      runRecords: [buildRunRecord(run, report), ...current.runRecords],
      currentRunId: run.id,
    }));
    return run.id;
  },

  queueFollowupRound(runId: string, input: QueueFollowupInput) {
    const roundId = createId("round");
    const createdAt = formatDate();
    updateState((current) => ({
      ...current,
      runs: current.runs.map((run) =>
        run.id === runId
          ? {
              ...run,
              status: "running",
              latestRoundId: roundId,
              notes: [...run.notes, input.prompt],
              timeline: [
                ...run.timeline,
                createUserNode(roundId, input.prompt, createdAt),
                ...(input.attachments.length > 0
                  ? [createAttachmentNode(roundId, input.attachments, createdAt)]
                  : []),
              ],
            }
          : run,
      ),
    }));
    return roundId;
  },

  applyRuntimeEvent(runId: string, event: AgentRoundRuntimeEvent) {
    updateState((current) => {
      const run = current.runs.find((item) => item.id === runId);
      const report = current.reports.find((item) => item.runId === runId);
      if (!run || !report) return current;
      const next = applyEventToRun(run, report, event);
      return {
        ...current,
        runs: upsertRunCollection(current.runs, next.run),
        reports: upsertReportCollection(current.reports, next.report),
      };
    });
  },

  setCurrentRun(runId: string) {
    updateState((current) => ({ ...current, currentRunId: runId }));
  },

  setActivePreview(runId: string, previewId: string) {
    updateState((current) => ({
      ...current,
      runs: current.runs.map((run) => (run.id === runId ? { ...run, activePreviewId: previewId } : run)),
    }));
  },

  appendRunFollowup(runId: string, note: string) {
    return this.queueFollowupRound(runId, {
      prompt: note.trim(),
      selectedCapabilities: [],
      attachments: [],
    });
  },

  upsertRunSnapshot(run: TaskRun, report: Report) {
    updateState((current) => ({
      ...current,
      runs: upsertRunCollection(current.runs, run),
      reports: upsertReportCollection(current.reports, report),
      currentRunId: run.id,
    }));
  },

  toggleRunStar(runId: string) {
    updateState((current) => ({
      ...current,
      runs: current.runs.map((run) => (run.id === runId ? { ...run, starred: !run.starred } : run)),
    }));
  },

  toggleArtifactForRun(runId: string) {
    let saved = false;

    updateState((current) => {
      const existing = current.artifacts.find((artifact) => artifact.sourceRunId === runId);
      const run = current.runs.find((item) => item.id === runId);
      const report = current.reports.find((item) => item.runId === runId);
      if (!run || !report) return current;

      if (existing) {
        saved = false;
        return {
          ...current,
          artifacts: current.artifacts.filter((artifact) => artifact.sourceRunId !== runId),
          runs: current.runs.map((item) => (item.id === runId ? { ...item, saved: false } : item)),
        };
      }

      saved = true;
      const artifact = buildArtifact(run, report);
      return {
        ...current,
        artifacts: [artifact, ...current.artifacts],
        runs: current.runs.map((item) => (item.id === runId ? { ...item, saved: true } : item)),
      };
    });

    return saved;
  },

  saveTemplateFromRun(runId: string) {
    let templateId = "";
    updateState((current) => {
      const run = current.runs.find((item) => item.id === runId);
      if (!run) return current;
      const template = createTemplateFromInput({
        title: `${run.title} 模板`,
        body: run.objective,
        sourceRunId: run.id,
        summary: run.summaryBody,
      });
      templateId = template.id;
      return {
        ...current,
        templates: [template, ...current.templates],
      };
    });
    return templateId;
  },

  createTemplate(input: {
    title: string;
    body: string;
    scope: "全部" | "默认";
    sourceRunId?: string;
    summary?: string;
  }) {
    const template = createTemplateFromInput(input);
    updateState((current) => ({
      ...current,
      templates: [template, ...current.templates],
    }));
    return template.id;
  },

  createWorkflow(input: {
    templateId: string;
    title: string;
    prompt: string;
    frequency: string;
    nextRun: string;
    scope: Workflow["scope"];
    groupName?: string;
    enabled?: boolean;
  }) {
    const workflow = createWorkflowFromInput({ ...input, enabled: input.enabled ?? true });
    updateState((current) => ({
      ...current,
      workflows: [workflow, ...current.workflows],
    }));
    return workflow.id;
  },

  deleteWorkflow(workflowId: string) {
    updateState((current) => ({
      ...current,
      workflows: current.workflows.filter((w) => w.id !== workflowId),
    }));
  },

  setWorkflowEnabled(workflowId: string, enabled: boolean) {
    updateState((current) => ({
      ...current,
      workflows: current.workflows.map((w) => {
        if (w.id !== workflowId) return w;
        if (w.status === "已完结") return { ...w, enabled: false };
        const nextStatus: ScheduleItem["status"] = !enabled
          ? "已暂停"
          : w.status === "已暂停"
            ? "生效中"
            : w.status;
        return { ...w, enabled, status: nextStatus };
      }),
    }));
  },

  patchWorkflow(workflowId: string, patch: Partial<Pick<Workflow, "title" | "description" | "frequency" | "nextRun" | "status" | "groupName">>) {
    updateState((current) => ({
      ...current,
      workflows: current.workflows.map((w) => (w.id === workflowId ? { ...w, ...patch } : w)),
    }));
  },

  deleteRunRecords(recordIds: string[]) {
    if (recordIds.length === 0) return;
    const drop = new Set(recordIds);
    updateState((current) => ({
      ...current,
      runRecords: current.runRecords.filter((r) => !drop.has(r.id)),
    }));
  },

  createWorkflowWithTemplate(input: {
    title: string;
    prompt: string;
    frequency: string;
    nextRun: string;
    scope: Workflow["scope"];
    groupName?: string;
    enabled?: boolean;
  }) {
    let workflowId = "";
    let templateId = "";

    updateState((current) => {
      const template = createTemplateFromInput({
        title: input.title,
        body: input.prompt,
        scope: input.scope,
        summary: "由定时任务创建流程自动沉淀的任务模板。",
      });
      const workflow = createWorkflowFromInput({
        templateId: template.id,
        title: input.title,
        prompt: input.prompt,
        frequency: input.frequency,
        nextRun: input.nextRun,
        scope: input.scope,
        groupName: input.groupName,
        enabled: input.enabled ?? true,
      });

      workflowId = workflow.id;
      templateId = template.id;

      return {
        ...current,
        templates: [template, ...current.templates],
        workflows: [workflow, ...current.workflows],
      };
    });

    return { workflowId, templateId };
  },
};
