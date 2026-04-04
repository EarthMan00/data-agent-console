"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Bot, ChevronDown, FileText, ListRestart, MessageCircleMore, ThumbsDown, ThumbsUp } from "lucide-react";
import type { TdAttachmentItem } from "tdesign-web-components/lib/filecard/type";
import type {
  AgentAttachment,
  ConversationNode,
  DataSourceChain,
  PlatformSubtaskSnapshot,
  PlatformTaskArtifactRef,
  TaskExecutionStep,
} from "@/lib/agent-events";
import { InlineNotice } from "@/components/inline-notice";
import { MoreDataShell } from "@/components/more-data-shell";
import { AgentTaskResultPanel } from "@/components/agent-task-result-panel";
import { AssistantLoadingRow } from "@/components/assistant-loading-row";
import { TaskResultSummaryCard } from "@/components/task-result-summary-card";
import {
  buildPlatformStepTimeline,
  ExecutionStepCard,
  StepResultPendingCard,
} from "@/components/execution-steps-monitor";
import { MockTaskExecutionAssistantBubble } from "@/components/mock-task-execution-assistant-bubble";
import { ChatMarkdown } from "@/components/chat-markdown";
import { ReportPreviewPanel } from "@/components/report-preview-panel";
import { TaskComposer } from "@/components/task-composer";
import { Button } from "@/components/ui/button";
import { inferAttachmentType, sanitizeObjective } from "@/lib/agent-attachments";
import { useOptionalPlatformAgent } from "@/components/platform-agent-provider";
import { isPlatformBackendEnabled, streamAgentRound } from "@/lib/agent-runtime";
import { homeCapabilityItems } from "@/lib/mock/demo-data";
import { demoActions, useDemoState } from "@/lib/mock/store";
import { humanizeTaskErrorMessage } from "@/lib/platform-task-error-copy";
import { filterArtifactsForTaskResultPanel, hasTabularTaskResultFiles } from "@/lib/platform-task-artifacts";
import { parseMockTaskExecutionStepsFromMeta } from "@/lib/mock-task-execution-meta";
import { cn } from "@/lib/utils";
import { formatAgentApiErrorForUser, getTask, listSessionMessages, sendChatMessage } from "@/lib/agent-api/client";
import type { SessionMessageItem } from "@/lib/agent-api/types";
import { safeRandomUUID } from "@/lib/random-uuid";

const ChatAttachments = dynamic(
  () => import("@tdesign-react/aigc").then((mod) => mod.ChatAttachments),
  { ssr: false },
);

function buildAttachmentItems(files: FileList): AgentAttachment[] {
  return Array.from(files).map((file, index) => ({
    id: `${file.name}-${index}`,
    name: file.name,
    size: file.size,
    fileType: inferAttachmentType(file.name),
    extension: file.name.split(".").pop()?.toLowerCase(),
    status: "queued",
  }));
}

function toTdAttachments(attachments: AgentAttachment[]): TdAttachmentItem[] {
  return attachments.map((item) => ({
    uid: item.id,
    name: item.name,
    size: item.size,
    status: "success",
    fileType: item.fileType,
    extension: item.extension,
  }));
}

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
  /** 平台分步任务：仅在实际结束（或失败且步骤已终态）后在主区展示「任务结果」块 */
  showTaskResultInChat: boolean;
  uiLayout: "simple_chat" | "tool_orchestration";
  assistantPending: boolean;
  errorMessage?: string;
  /** 工具编排：链路全部终态且已有对话/报告产出时，收起「任务执行」卡片 */
  collapseExecution: boolean;
  /** 平台任务：分步执行 mock（与真实后台并行） */
  executionSteps?: TaskExecutionStep[];
  /** 多步编排：每步完成后的任务快照（聊天卡片） */
  platformSubtasks?: PlatformSubtaskSnapshot[];
};

function compactText(text: string, maxLength = 120) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength).trim()}...`;
}

function PlatformSubtaskResultCard({
  snap,
  isActive,
  onSelect,
  totalSteps,
}: {
  snap: PlatformSubtaskSnapshot;
  isActive: boolean;
  onSelect: () => void;
  /** 与执行卡片对齐的步骤总数，用于「步骤 N / M」 */
  totalSteps?: number;
}) {
  const ok = snap.outcome === "success";
  const stepNo = snap.stepIndex + 1;
  const header =
    totalSteps != null ? `步骤 ${stepNo} / ${totalSteps} · 执行结果` : `步骤 ${stepNo} · 执行结果`;
  return (
    <div
      className={cn(
        "w-full rounded-[16px] border px-4 py-3 text-left shadow-[0_8px_20px_rgba(15,23,42,0.04)]",
        isActive ? "border-[#2563eb] bg-[#eff6ff]" : "border-[#eceef1] bg-white",
      )}
    >
      <div className="text-[11px] font-medium uppercase tracking-wide text-[#9aa39e]">{header}</div>
      <div className="mt-2 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-[#1f2421]">步骤 {stepNo}</div>
          <p className="mt-1 text-[12px] leading-5.5 text-[#4f5753]">{compactText(snap.label, 200)}</p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
            ok ? "bg-[#dcfce7] text-[#166534]" : "bg-[#fee2e2] text-[#991b1b]",
          )}
        >
          {ok ? "已完成" : "失败"}
        </span>
      </div>
      {snap.errorMessage ? (
        <p className="mt-2 text-[11px] leading-5 text-[#b91c1c]">{compactText(snap.errorMessage, 160)}</p>
      ) : null}
      <Button type="button" variant="default" size="sm" className="mt-3 h-8 rounded-[10px] px-3 text-xs" onClick={onSelect}>
        查看任务结果
      </Button>
    </div>
  );
}

function PlatformRoundStepTimeline({
  executionSteps,
  platformSubtasks,
  panelSubtaskFocus,
  runId,
  setPanelSubtaskFocus,
  setPanelVisibility,
}: {
  executionSteps: TaskExecutionStep[];
  platformSubtasks: PlatformSubtaskSnapshot[] | undefined;
  panelSubtaskFocus: { taskId: string; artifacts: PlatformTaskArtifactRef[] } | null;
  runId: string;
  setPanelSubtaskFocus: Dispatch<SetStateAction<{ taskId: string; artifacts: PlatformTaskArtifactRef[] } | null>>;
  setPanelVisibility: Dispatch<SetStateAction<Record<string, boolean>>>;
}) {
  const items = buildPlatformStepTimeline(executionSteps, platformSubtasks);
  const subs = platformSubtasks ?? [];
  const lastSnap = subs.length ? subs[subs.length - 1] : undefined;
  const total = executionSteps.length;

  return (
    <div className="space-y-3" data-testid="agent-step-timeline">
      {items.map((item) => {
        if (item.kind === "executing") {
          return (
            <ExecutionStepCard
              key={`exec-${item.step.id}-${item.stepIndex}`}
              step={item.step}
              stepIndex={item.stepIndex}
              total={item.total}
            />
          );
        }
        if (item.kind === "result_pending") {
          return (
            <StepResultPendingCard
              key={`rp-${item.stepIndex}`}
              stepIndex={item.stepIndex}
              total={item.total}
              label={item.label}
              status={item.status}
            />
          );
        }
        const snap = item.snap;
        const active =
          panelSubtaskFocus?.taskId === snap.taskId ||
          (!panelSubtaskFocus && lastSnap != null && snap.taskId === lastSnap.taskId);
        return (
          <PlatformSubtaskResultCard
            key={snap.taskId}
            snap={snap}
            isActive={active}
            totalSteps={total}
            onSelect={() => {
              setPanelSubtaskFocus({ taskId: snap.taskId, artifacts: snap.artifacts });
              setPanelVisibility((c) => ({ ...c, [runId]: true }));
            }}
          />
        );
      })}
    </div>
  );
}

function splitMessageLines(text: string) {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/** 普通对话：与消息列表同列宽，用户气泡贴右、助手气泡贴左，最大宽度一致 */
const SIMPLE_CHAT_COLUMN_MAX = "max-w-[min(100%,800px)]";
const SIMPLE_CHAT_BUBBLE_MAX = "max-w-[min(100%,720px)]";

function formatTimeForBubble(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // 使用浏览器本地格式，避免精确到毫秒的技术化时间串
  return d.toLocaleString();
}

/** 与 app-demo `live-agent-workbench` BubbleLine 对齐：普通对话气泡 */
function SimpleUserBubble({ text, datetime }: { text: string; datetime: string }) {
  return (
    <div className="flex w-full justify-end" data-testid="agent-user-input-card">
      <div className={cn("group flex flex-col items-end", SIMPLE_CHAT_BUBBLE_MAX)}>
        <div className="mb-1 text-[11px] text-[#78716c] opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          {formatTimeForBubble(datetime)}
        </div>
        <div className="shrink-0 rounded-[16px] bg-[#e8e8ed] px-4 py-3 text-[15px] leading-7 text-[#1c1917] shadow-sm">
          <div className="break-words whitespace-pre-wrap">{text}</div>
        </div>
      </div>
    </div>
  );
}

function SimpleAssistantBubble({ body, datetime }: { body: string; datetime: string }) {
  return (
    <div className="flex w-full justify-start">
      <div className={cn("group flex flex-col items-start", SIMPLE_CHAT_BUBBLE_MAX)}>
        <div className="mb-1 text-[11px] text-[#94a3b8] opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          {formatTimeForBubble(datetime)}
        </div>
        <div className="shrink-0 rounded-[16px] border border-[#e1e6ef] bg-white px-4 py-3 text-[#324357] shadow-sm">
          <div className="text-[11px] font-medium uppercase tracking-wide text-[#64748b] opacity-80">助手</div>
          <div className="mt-1 min-w-0">
            <ChatMarkdown>{body}</ChatMarkdown>
          </div>
        </div>
      </div>
    </div>
  );
}

function SimpleSystemBubble({ message }: { message: string }) {
  return (
    <div className="flex w-full justify-start">
      <div
        className={cn(
          "shrink-0 rounded-[16px] border border-[#e8e0d0] bg-[#fffbf5] px-4 py-3 text-[15px] leading-7 text-[#57534e] shadow-sm",
          SIMPLE_CHAT_BUBBLE_MAX,
        )}
      >
        <div className="text-[11px] font-medium uppercase tracking-wide opacity-70">系统</div>
        <p className="mt-1 whitespace-pre-wrap break-words">{message}</p>
      </div>
    </div>
  );
}

function ConversationBubble({
  role,
  title,
  datetime,
  body,
  tone = "default",
}: {
  role: "user" | "assistant";
  title: string;
  datetime: string;
  body: string;
  tone?: "default" | "status";
}) {
  const lines = splitMessageLines(body);

  return (
    <div className={cn("flex", role === "user" ? "justify-end" : "justify-start")}>
      <div className={cn("w-full max-w-[780px]", role === "user" ? "items-end" : "items-start")}>
        <div
          className={cn(
            "px-5 py-4",
            role === "user"
              ? "rounded-none bg-transparent px-0 py-0 text-[#202124] shadow-none"
              : tone === "status"
                ? "rounded-[16px] border border-[#e6dcc8] bg-[linear-gradient(180deg,#fffdf8,#faf6eb)] text-[#5d5442] shadow-none"
                : "border border-[#e5e7eb] bg-[linear-gradient(180deg,#ffffff,#fafafa)] text-[#39403c]",
          )}
        >
          <div className="space-y-2 text-[14px] leading-7">
            {lines.map((line) => (
              <p key={line} className="whitespace-pre-wrap break-words">
                {line}
              </p>
            ))}
          </div>
          {role === "user" ? (
            <div className="mt-3 text-right text-[11px] text-[#b0b4b8]">
              {datetime}
            </div>
          ) : null}
        </div>
        {role === "assistant" ? (
          <div className="mb-2 mt-2 flex items-center gap-2 text-[11px] justify-start text-[#7a8380]">
            <span className="font-medium text-[#1f2421]">{title}</span>
            <span>{datetime}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function CollapsedStatusRow({
  title,
  expanded,
  onClick,
  testId,
}: {
  title: string;
  expanded: boolean;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-[16px] border border-[#eceef1] bg-[#fcfcfd] px-4 py-3.5 text-left"
      data-testid={testId}
    >
      <div className="text-[14px] font-semibold text-[#1f2421]">{title}</div>
      <ChevronDown className={cn("h-4 w-4 text-[#8f9692]", expanded ? "rotate-180" : "-rotate-90")} />
    </button>
  );
}

function ToolCard({
  title,
  detail,
  actionLabel = "查看",
  onAction,
  tone = "default",
}: {
  title: string;
  detail: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: "default" | "error";
}) {
  return (
    <div
      className={cn(
        "rounded-[16px] border px-4 py-3 shadow-[0_12px_28px_rgba(15,23,42,0.05)]",
        tone === "error"
          ? "border-[#fecaca] bg-[#fef2f2]"
          : "border-[#eceef1] bg-white",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div
          className={cn(
            "flex items-center gap-2 text-[12px] font-medium",
            tone === "error" ? "text-[#991b1b]" : "text-[#3f4542]",
          )}
        >
          <div className="flex h-5 w-5 items-center justify-center rounded-full border border-[#e5e7eb] bg-[#fafafa]">
            <FileText className="h-3 w-3" />
          </div>
          {title}
        </div>
        {onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="rounded-[8px] border border-[#e5e7eb] bg-[#fafafa] px-2 py-0.5 text-[11px] font-medium text-[#3a403d]"
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
      <div className={cn("mt-2 text-[11px] leading-5", tone === "error" ? "text-[#b91c1c]" : "text-[#6c7571]")}>
        {detail}
      </div>
    </div>
  );
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

    /** 平台分步任务：须步骤全部终态且已有最终产出或错误，才视为可展示任务结果（避免仅因 snapshot 等提前展示） */
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

export function toCapabilitySafeTitle(text: string) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  return cleaned.length > 42 ? `${cleaned.slice(0, 42)}...` : cleaned;
}

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
  /** 平台任务产物；用于判断是否展示 CSV/JSON 侧栏 */
  platformTaskArtifacts?: PlatformTaskArtifactRef[];
};

export function AgentWorkspace() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const platformAgent = useOptionalPlatformAgent();
  const historySessionId = searchParams.get("sessionId") ?? "";
  const { currentRunId, reports, runs, templates } = useDemoState();
  const runId = searchParams.get("runId") ?? currentRunId;
  const run = runs.find((item) => item.id === runId) ?? runs[0];
  const report = reports.find((item) => item.id === run?.reportId) ?? reports[0];
  const isPlatformSession = isPlatformBackendEnabled() && Boolean(platformAgent) && Boolean(historySessionId);

  useEffect(() => {
    // 仅在既没有 runId、也没有 sessionId 时，才认为是误打开 /agent，需要跳回首页。
    const hasRunId = Boolean(searchParams.get("runId"));
    const hasSessionId = Boolean(historySessionId);
    if (pathname === "/agent" && !hasRunId && !hasSessionId) {
      router.replace("/");
    }
  }, [pathname, router, searchParams, historySessionId]);

  const [previewOverrides, setPreviewOverrides] = useState<Record<string, string | null>>({});
  const [panelVisibility, setPanelVisibility] = useState<Record<string, boolean>>({});
  /** 右侧任务结果区：点击某张步骤结果卡片时锁定该步产物；新一轮步骤快照到达时自动清除以跟随最新一步 */
  const [panelSubtaskFocus, setPanelSubtaskFocus] = useState<{
    taskId: string;
    artifacts: PlatformTaskArtifactRef[];
  } | null>(null);
  const [composerModes, setComposerModes] = useState<Record<string, "普通模式" | "深度模式">>({});
  const [selectedSourceOverrides, setSelectedSourceOverrides] = useState<Record<string, string[]>>({});
  const [queuedAttachments, setQueuedAttachments] = useState<Record<string, AgentAttachment[]>>({});
  const [composerVersion, setComposerVersion] = useState<Record<string, number>>({});
  const [executionCardExpandedByRound, setExecutionCardExpandedByRound] = useState<Record<string, boolean>>({});
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState("");
  const executingRoundsRef = useRef<Set<string>>(new Set());
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const messagesInnerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (run && currentRunId !== run.id) {
      demoActions.setCurrentRun(run.id);
    }
  }, [currentRunId, run]);

  const composerMode = composerModes[run.id] ?? (run.mode === "专业模式" ? "深度模式" : "普通模式");
  const selectedSourceIds = selectedSourceOverrides[run.id] ?? [];
  const currentComposerVersion = composerVersion[run.id] ?? 0;

  const roundModels = useMemo(
    () =>
      buildRoundViewModels({
        startedAt: run.startedAt,
        objective: run.objective,
        selectedCapabilities: run.selectedCapabilities,
        timeline: run.timeline,
        chains: run.chains,
        roundUiLayouts: run.roundUiLayouts,
        status: run.status,
        latestRoundId: run.latestRoundId,
        taskExecutionStepsByRound: run.taskExecutionStepsByRound,
        platformSubtasksByRound: run.platformSubtasksByRound,
        platformTaskArtifacts: run.platformTaskArtifacts,
      }),
    [
      run.chains,
      run.latestRoundId,
      run.objective,
      run.platformSubtasksByRound,
      run.platformTaskArtifacts,
      run.roundUiLayouts,
      run.selectedCapabilities,
      run.startedAt,
      run.status,
      run.taskExecutionStepsByRound,
      run.timeline,
    ],
  );

  const previewBaseId = previewOverrides[run.id] ?? run.activePreviewId ?? report.previewKey;

  const latestRoundModel = roundModels.length > 0 ? roundModels[roundModels.length - 1] : undefined;
  const latestHasPlatformSteps = Boolean(latestRoundModel?.executionSteps?.length);
  const latestRoundIdForPanel = latestRoundModel?.roundId;
  const latestPlatformSubtasks = latestRoundIdForPanel
    ? (run.platformSubtasksByRound?.[latestRoundIdForPanel] ?? [])
    : [];
  const anySubtaskTabular = latestPlatformSubtasks.some((s) => hasTabularTaskResultFiles(s.artifacts));
  const effectivePanelArtifacts = panelSubtaskFocus?.artifacts ?? run.platformTaskArtifacts;
  /** 分步任务：任一步产生可表格化产物即可展开右侧；执行中（running）也可预览已完成的步骤 */
  const latestRoundWantsTaskPanel = Boolean(
    latestRoundModel?.uiLayout === "tool_orchestration" &&
      latestHasPlatformSteps &&
      (run.status === "success" || run.status === "running") &&
      (hasTabularTaskResultFiles(effectivePanelArtifacts) || anySubtaskTabular) &&
      !latestRoundModel?.errorMessage,
  );

  const pv = panelVisibility[run.id];
  const showTaskResultPanel = latestRoundWantsTaskPanel && pv === true;
  const showLegacyReportPreview =
    !latestRoundWantsTaskPanel && pv === true && Boolean(previewBaseId);
  const showRightRail = showTaskResultPanel || showLegacyReportPreview;

  const prevWantsTaskPanelRef = useRef(false);
  const taskPanelRunIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (taskPanelRunIdRef.current !== run.id) {
      taskPanelRunIdRef.current = run.id;
      prevWantsTaskPanelRef.current = false;
    }
    if (!latestRoundWantsTaskPanel) {
      setPanelVisibility((c) => ({ ...c, [run.id]: false }));
      prevWantsTaskPanelRef.current = false;
      return;
    }
    if (!prevWantsTaskPanelRef.current) {
      setPanelVisibility((c) => ({ ...c, [run.id]: true }));
      prevWantsTaskPanelRef.current = true;
    }
  }, [latestRoundWantsTaskPanel, run.id]);

  const latestSubtasksCount = latestPlatformSubtasks.length;
  const prevLatestSubtasksCountRef = useRef(0);
  useEffect(() => {
    setPanelSubtaskFocus(null);
    prevLatestSubtasksCountRef.current = 0;
  }, [run.id]);
  useEffect(() => {
    if (latestSubtasksCount > prevLatestSubtasksCountRef.current) {
      setPanelSubtaskFocus(null);
    }
    prevLatestSubtasksCountRef.current = latestSubtasksCount;
  }, [latestSubtasksCount]);

  const filteredPlatformArtifacts = useMemo(
    () => filterArtifactsForTaskResultPanel(effectivePanelArtifacts ?? []),
    [effectivePanelArtifacts],
  );
  const taskPanelOpen = showTaskResultPanel;

  useEffect(() => {
    const outer = messagesScrollRef.current;
    const inner = messagesInnerRef.current;
    if (!outer || !inner) return;
    const scrollToBottom = () => {
      requestAnimationFrame(() => {
        outer.scrollTop = outer.scrollHeight;
      });
    };
    scrollToBottom();
    const ro = new ResizeObserver(scrollToBottom);
    ro.observe(inner);
    return () => ro.disconnect();
  }, [
    executionCardExpandedByRound,
    notice,
    roundModels,
    run.chains,
    run.latestRoundId,
    run.platformSubtasksByRound,
    run.platformTaskArtifacts,
    run.status,
    run.taskExecutionStepsByRound,
    run.timeline,
  ]);

  const executeRound = useCallback(async (input: {
    roundId: string;
    prompt: string;
    selectedCapabilities: string[];
    attachments: AgentAttachment[];
    isInitialRound?: boolean;
  }) => {
    if (executingRoundsRef.current.has(input.roundId)) return;
    executingRoundsRef.current.add(input.roundId);
    try {
      await streamAgentRound(
        {
          roundId: input.roundId,
          runId: run.id,
          prompt: input.prompt,
          mode: composerMode,
          selectedCapabilities: input.selectedCapabilities,
          attachments: input.attachments,
          objective: run.objective,
          isInitialRound: input.isInitialRound,
          platformChatSessionId: run.platformSessionId,
        },
        {
          onEvent: (event) => {
            demoActions.applyRuntimeEvent(run.id, event);
          },
        },
        isPlatformBackendEnabled() && platformAgent && run.platformSessionId
          ? { platform: { withFreshToken: platformAgent.withFreshToken } }
          : undefined,
      );
      setQueuedAttachments((current) => ({ ...current, [run.id]: [] }));
      setComposerVersion((current) => ({ ...current, [run.id]: (current[run.id] ?? 0) + 1 }));
    } catch (error) {
      const errText = formatAgentApiErrorForUser(error);
      demoActions.applyRuntimeEvent(run.id, {
        type: "error",
        roundId: input.roundId,
        message: errText,
      });
      // 错误已在会话区内展示（系统气泡 / 任务区提示），勿再写入顶部 notice，避免重复白框
      setNotice("");
    } finally {
      executingRoundsRef.current.delete(input.roundId);
    }
  }, [composerMode, platformAgent, run.id, run.objective, run.platformSessionId]);

  useEffect(() => {
  if (run.status !== "queued" || !run.latestRoundId) return;
    void executeRound({
      roundId: run.latestRoundId,
      prompt: run.objective,
      selectedCapabilities: run.selectedCapabilities,
      attachments: [],
      isInitialRound: true,
    });
  }, [executeRound, run.id, run.latestRoundId, run.objective, run.selectedCapabilities, run.status]);

  const appendNote = async () => {
    const value = sanitizeObjective(draft);
    if (!value || run.status === "running") return;
    const attachments = queuedAttachments[run.id] ?? [];
    const roundId = demoActions.queueFollowupRound(run.id, {
      prompt: value,
      selectedCapabilities: selectedSourceIds,
      attachments,
    });
    setDraft("");
    setPanelVisibility((current) => {
      const next = { ...current };
      delete next[run.id];
      return next;
    });
    setNotice(`已发起新一轮多数据源分析：${value}`);
    await executeRound({
      roundId,
      prompt: value,
      selectedCapabilities: selectedSourceIds,
      attachments,
    });
  };

  const applyCapability = (capabilityId: string) => {
    const item = homeCapabilityItems.find((entry) => entry.id === capabilityId);
    if (!item) return;
    setSelectedSourceOverrides((current) => {
      const currentSources = current[run.id] ?? [];
      return {
        ...current,
        [run.id]: currentSources.includes(item.id) ? currentSources : [...currentSources, item.id],
      };
    });
    setNotice(`本轮已加入数据源「${item.label}」。`);
  };

  const removeCapability = (capabilityId: string) => {
    setSelectedSourceOverrides((current) => ({
      ...current,
      [run.id]: (current[run.id] ?? []).filter((id) => id !== capabilityId),
    }));
  };

  const applyTemplate = (templateId: string) => {
    const template = templates.find((item) => item.id === templateId);
    if (!template) return;
    setDraft(template.body);
    setNotice(`已载入任务指令「${template.title}」。`);
  };

  const handleFilesSelected = (files: FileList) => {
    const attachmentItems = buildAttachmentItems(files);
    setQueuedAttachments((current) => ({
      ...current,
      [run.id]: attachmentItems,
    }));
    setNotice(`已添加附件：${attachmentItems.map((item) => item.name).join("、")}。`);
  };

  const handleFeedback = (kind: "喜欢" | "不喜欢" | "需要继续") => {
    setNotice(`已记录反馈：${kind}。`);
  };

  if (isPlatformSession) {
    return <PlatformSessionAgentWorkspace sessionId={historySessionId} />;
  }

  return (
    <MoreDataShell
      currentPath="/agent"
      contentScrollMode="child"
      currentRunLabel={run.title}
      rightRail={
        showRightRail ? (
          showTaskResultPanel ? (
            <AgentTaskResultPanel
              artifacts={filteredPlatformArtifacts}
              withFreshToken={platformAgent?.withFreshToken}
              onClose={() =>
                setPanelVisibility((current) => ({
                  ...current,
                  [run.id]: false,
                }))
              }
            />
          ) : (
            <ReportPreviewPanel
              previewId={previewBaseId!}
              reportTitle={run.title}
              report={report}
              onClose={() =>
                setPanelVisibility((current) => ({
                  ...current,
                  [run.id]: false,
                }))
              }
            />
          )
        ) : undefined
      }
    >
      <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-white">
        <div
          ref={messagesScrollRef}
          className="hide-scrollbar-y min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-4 pb-4 pt-6 sm:px-6"
        >
          <div ref={messagesInnerRef} className={cn("mx-auto w-full", SIMPLE_CHAT_COLUMN_MAX)}>
            <div className="space-y-5">
              {isPlatformBackendEnabled() && !run.platformSessionId ? (
                <InlineNotice message="当前为内置演示任务，消息不会发往 Data Agent Server。请打开首页重新输入并发送以创建真实会话；避免使用地址栏 /agent（无 runId）或侧栏中的演示历史对话。" />
              ) : null}
              {notice ? <InlineNotice message={notice} /> : null}

            <div className="space-y-7">
              {roundModels.map((round, index) => {
                const executionExpanded =
                  executionCardExpandedByRound[round.roundId] ?? !round.collapseExecution;

                return (
                <div key={round.roundId} className="space-y-3">
                  {round.userMessage ? (
                    round.uiLayout === "simple_chat" ? (
                      <SimpleUserBubble text={round.userMessage} datetime={round.createdAt} />
                    ) : (
                      <div className="flex justify-end">
                        <div className="w-full max-w-[780px]" data-testid="agent-user-input-card">
                          <ConversationBubble role="user" title="你" datetime={round.createdAt} body={compactText(round.userMessage, 220)} />
                        </div>
                      </div>
                    )
                  ) : null}

                  {round.attachments.length > 0 ? (
                    <div
                      className={cn(
                        "w-full",
                        round.uiLayout === "simple_chat" ? "flex justify-end" : "max-w-[780px]",
                      )}
                    >
                      <div
                        className={cn(
                          "rounded-[16px] border border-[#e5e7eb] bg-white px-3 py-3",
                          round.uiLayout === "simple_chat" && cn("w-full", SIMPLE_CHAT_BUBBLE_MAX),
                        )}
                      >
                        <ChatAttachments items={toTdAttachments(round.attachments)} overflow="wrap" />
                      </div>
                    </div>
                  ) : null}

                  {round.uiLayout === "simple_chat" ? (
                    <div className="w-full space-y-3">
                      {round.errorMessage ? (
                        <SimpleSystemBubble message={round.errorMessage} />
                      ) : round.assistantPending ? (
                        <AssistantLoadingRow variant="thinking" />
                      ) : (
                        <SimpleAssistantBubble body={round.resultSummary} datetime={round.createdAt} />
                      )}
                    </div>
                  ) : (
                  <div className="w-full max-w-[780px]">
                    <div className="space-y-3.5">
                      <div className="flex items-center gap-3 text-[14px] font-medium text-[#303734]">
                        <div className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-[#171717] text-white shadow-[0_14px_32px_rgba(23,23,23,0.18)]">
                          <Bot className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="text-[15px] font-semibold text-[#1f2421]">MData Agent</div>
                        </div>
                      </div>

                      {round.assistantPending &&
                      round.executionGroups.length === 0 &&
                      !round.executionSteps?.length ? (
                        <AssistantLoadingRow variant="task" />
                      ) : null}

                      <div className="space-y-2 px-1" data-testid="agent-split-section">
                        <div className="text-[14px] font-semibold text-[#202124]">任务拆分</div>
                        <div className="space-y-2 text-[13px] leading-6.5 text-[#4f5753]">
                          {round.splitItems.map((item, itemIndex) => (
                            <div key={item} className="flex gap-2">
                              <span className="pt-[1px] text-[#9aa39e]">{itemIndex + 1}.</span>
                              <p className="min-w-0 flex-1">{item.replace(/^\d+[）)]\s*/, "")}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {executionExpanded ? (
                        <div className="rounded-[20px] border border-[#eceef1] bg-[#fcfcfd] px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.03)]" data-testid="agent-execution-panel">
                          <div className="flex items-center justify-between gap-4">
                            <div>
                              <div className="text-[16px] font-semibold tracking-[-0.02em] text-[#1f2421]">任务执行</div>
                            </div>
                            <div className="flex items-center">
                              {round.collapseExecution ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExecutionCardExpandedByRound((current) => ({
                                      ...current,
                                      [round.roundId]: false,
                                    }))
                                  }
                                  aria-label="收起任务执行"
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-[#e5e7eb] bg-white text-[#303734]"
                                >
                                  <ChevronDown className="h-4 w-4" />
                                </button>
                              ) : null}
                            </div>
                          </div>

                          <div className="mt-4 space-y-3">
                            {round.executionSteps?.length ? (
                              <PlatformRoundStepTimeline
                                executionSteps={round.executionSteps}
                                platformSubtasks={round.platformSubtasks}
                                panelSubtaskFocus={panelSubtaskFocus}
                                runId={run.id}
                                setPanelSubtaskFocus={setPanelSubtaskFocus}
                                setPanelVisibility={setPanelVisibility}
                              />
                            ) : (
                              <>
                                {round.executionGroups.map((group) => (
                                  <div key={group.id} className="space-y-2.5">
                                    {group.tools.map((tool) => (
                                      <ToolCard
                                        key={tool.id}
                                        title={tool.title}
                                        detail={tool.detail}
                                        tone={tool.tone}
                                        onAction={
                                          tool.previewId
                                            ? () => {
                                                demoActions.setActivePreview(run.id, tool.previewId!);
                                                setPreviewOverrides((current) => ({
                                                  ...current,
                                                  [run.id]: tool.previewId!,
                                                }));
                                                setPanelVisibility((current) => ({ ...current, [run.id]: true }));
                                              }
                                            : undefined
                                        }
                                      />
                                    ))}
                                  </div>
                                ))}
                                {round.executionGroups.length === 0 && !round.assistantPending ? (
                                  <div className="rounded-[18px] border border-dashed border-[#e5e7eb] bg-[#fcfcfd] px-4 py-5 text-[13px] leading-7 text-[#6c7571]">
                                    正在为这轮任务准备执行节点，稍后会把关键过程同步到这里。
                                  </div>
                                ) : null}
                              </>
                            )}
                          </div>
                        </div>
                      ) : (
                        <>
                          <CollapsedStatusRow
                            title={round.errorMessage ? "任务执行失败" : "任务已完成"}
                            expanded={false}
                            onClick={() =>
                              setExecutionCardExpandedByRound((current) => ({
                                ...current,
                                [round.roundId]: true,
                              }))
                            }
                            testId="agent-execution-summary-bar"
                          />
                          {round.executionSteps?.length ? (
                            <div className="mt-3 px-1">
                              <PlatformRoundStepTimeline
                                executionSteps={round.executionSteps}
                                platformSubtasks={round.platformSubtasks}
                                panelSubtaskFocus={panelSubtaskFocus}
                                runId={run.id}
                                setPanelSubtaskFocus={setPanelSubtaskFocus}
                                setPanelVisibility={setPanelVisibility}
                              />
                            </div>
                          ) : null}
                        </>
                      )}

                      {round.errorMessage ? <InlineNotice message={round.errorMessage} /> : null}

                      {round.showTaskResultInChat && (run.activePreviewId || latestRoundWantsTaskPanel) ? (
                        <TaskResultSummaryCard
                          title={compactText(round.resultTitle, 48)}
                          summary={compactText(round.resultSummary, 220)}
                          hasResult={round.hasResult}
                          expanded={taskPanelOpen}
                          onToggle={() => {
                            if (!latestRoundWantsTaskPanel && !run.activePreviewId) return;
                            const currentOpen = panelVisibility[run.id] ?? false;
                            const next = !currentOpen;
                            if (next && run.activePreviewId) {
                              demoActions.setActivePreview(run.id, run.activePreviewId);
                              setPreviewOverrides((current) => ({ ...current, [run.id]: run.activePreviewId! }));
                            }
                            setPanelVisibility((current) => ({ ...current, [run.id]: next }));
                          }}
                        />
                      ) : null}
                    </div>
                  </div>
                  )}

                  {index < roundModels.length - 1 ? <div className="border-b border-dashed border-[#e5e7eb]" /> : null}
                </div>
                );
              })}
            </div>

            <div className="flex items-center gap-1 text-[#8a97a8]">
                <Button aria-label="继续追问" variant="ghost" size="icon" className="h-8 w-8 rounded-[10px]" onClick={() => handleFeedback("需要继续")}>
                  <ListRestart className="h-4 w-4" />
                </Button>
                <Button aria-label="反馈喜欢" variant="ghost" size="icon" className="h-8 w-8 rounded-[10px]" onClick={() => handleFeedback("喜欢")}>
                  <ThumbsUp className="h-4 w-4" />
                </Button>
                <Button aria-label="反馈不喜欢" variant="ghost" size="icon" className="h-8 w-8 rounded-[10px]" onClick={() => handleFeedback("不喜欢")}>
                  <ThumbsDown className="h-4 w-4" />
                </Button>
                <Button aria-label="添加会话备注" variant="ghost" size="icon" className="h-8 w-8 rounded-[10px]" onClick={() => setNotice("评论接口入口已预留。")}>
                  <MessageCircleMore className="h-4 w-4" />
                </Button>
            </div>
            </div>
          </div>
        </div>

        <div className="shrink-0 bg-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:px-6">
          <div className={cn("mx-auto w-full", SIMPLE_CHAT_COLUMN_MAX)}>
            <TaskComposer
              key={`${run.id}-${currentComposerVersion}`}
              value={draft}
              onValueChange={setDraft}
              placeholder="继续追问，或通过 @ 选择要执行的数据源"
              mode={composerMode}
              onModeChange={(mode) =>
                setComposerModes((current) => ({
                  ...current,
                  [run.id]: mode,
                }))
              }
              templates={templates}
              selectedSourceIds={selectedSourceIds}
              onToolSelect={applyCapability}
              onSourceRemove={removeCapability}
              onTemplateSelect={applyTemplate}
              onFilesSelected={handleFilesSelected}
              onSubmit={() => {
                if (run.status !== "running") {
                  void appendNote();
                }
              }}
              containerClassName="overflow-visible rounded-[18px] border border-[#dde4ef] bg-[rgba(255,255,255,0.98)] shadow-[0_16px_36px_rgba(163,177,198,0.12)]"
              textareaClassName="min-h-[84px] max-h-[12em] min-w-[180px] flex-1 overflow-y-auto whitespace-pre-wrap break-words border-0 bg-transparent px-1 py-2 pr-2 text-[15px] leading-7 text-[#324357] caret-[#324357] outline-none shadow-none scrollbar-thin scrollbar-thumb-transparent hover:scrollbar-thumb-zinc-300 focus-visible:outline-none focus-visible:ring-0 focus-visible:[box-shadow:none!important]"
              sendButtonClassName="h-9 w-9 rounded-[10px]"
            />

            <div className="mt-3 text-center text-xs text-[#92a0b2]">内容由 AI 大模型生成，请仔细甄别</div>
          </div>
        </div>
      </div>
    </MoreDataShell>
  );
}

function PlatformSessionAgentWorkspace({ sessionId }: { sessionId: string }) {
  const platformAgent = useOptionalPlatformAgent();
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<SessionMessageItem[]>([]);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const messagesInnerRef = useRef<HTMLDivElement>(null);
  const [showResultPanel, setShowResultPanel] = useState(false);
  const [currentArtifacts, setCurrentArtifacts] = useState<PlatformTaskArtifactRef[] | null>(null);

  const reload = useCallback(async () => {
    if (!platformAgent?.auth) return;
    setBusy(true);
    setError("");
    try {
      await platformAgent.withFreshToken(async (token) => {
        const res = await listSessionMessages(token, sessionId, 100);
        // 后端已保证按时间升序返回，这里直接信任顺序即可
        setMessages(res.messages ?? []);
      });
    } catch (e) {
      setError(formatAgentApiErrorForUser(e));
    } finally {
      setBusy(false);
    }
  }, [platformAgent, sessionId]);

  useEffect(() => {
    if (!platformAgent) return;
    if (!platformAgent.auth) return;
    platformAgent.setActivePlatformSession(sessionId);
    void reload();
  }, [platformAgent, reload, sessionId]);

  useEffect(() => {
    const outer = messagesScrollRef.current;
    const inner = messagesInnerRef.current;
    if (!outer || !inner) return;
    const scrollToBottom = () => {
      requestAnimationFrame(() => {
        outer.scrollTop = outer.scrollHeight;
      });
    };
    scrollToBottom();
    const ro = new ResizeObserver(scrollToBottom);
    ro.observe(inner);
    return () => ro.disconnect();
  }, [busy, error, messages, sending]);

  useEffect(() => {
    // 切换会话时默认不展开右侧任务结果区
    setShowResultPanel(false);
    setCurrentArtifacts(null);
  }, [sessionId]);

  const openTaskResultPanel = useCallback(
    async (taskId: string) => {
      if (!platformAgent?.auth) {
        platformAgent?.openLogin("请先登录后再查看任务结果。");
        return;
      }
      setError("");
      try {
        await platformAgent.withFreshToken(async (token) => {
          const task = await getTask(token, taskId);
          const artifacts: PlatformTaskArtifactRef[] = (task.artifacts ?? []).map((a) => ({
            artifact_id: a.artifact_id,
            artifact_type: a.artifact_type,
            original_name: a.original_name,
            download_api: a.download_api,
          }));
          setCurrentArtifacts(artifacts);
          setShowResultPanel(true);
        });
      } catch (e) {
        setError(formatAgentApiErrorForUser(e));
      }
    },
    [platformAgent],
  );

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || sending) return;
    if (!platformAgent?.auth) {
      platformAgent?.openLogin("请先登录后再发送消息。");
      return;
    }
    setSending(true);
    setError("");
    const optimistic: SessionMessageItem = {
      id: `optimistic_user_${safeRandomUUID()}`,
      role: "user",
      content: text,
      created_at: new Date().toISOString(),
      meta: {},
    };
    setMessages((cur) => [...cur, optimistic]);
    setDraft("");
    try {
      await platformAgent.withFreshToken(async (token) => {
        const mid = safeRandomUUID();
        await sendChatMessage(token, sessionId, text, mid);
      });
      await reload();
    } catch (e) {
      setError(formatAgentApiErrorForUser(e));
      await reload();
    } finally {
      setSending(false);
    }
  }, [draft, platformAgent, reload, sending, sessionId]);

  return (
    <MoreDataShell
      currentPath="/agent"
      contentScrollMode="child"
      currentRunLabel="对话"
      rightRail={
        showResultPanel && currentArtifacts && platformAgent?.withFreshToken ? (
          <AgentTaskResultPanel
            artifacts={currentArtifacts}
            withFreshToken={platformAgent.withFreshToken}
            onClose={() => setShowResultPanel(false)}
          />
        ) : undefined
      }
    >
      <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-white">
        <div
          ref={messagesScrollRef}
          className="hide-scrollbar-y min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-4 pb-4 pt-6 sm:px-6"
        >
          <div ref={messagesInnerRef} className={cn("mx-auto w-full", SIMPLE_CHAT_COLUMN_MAX)}>
            <div className="space-y-5">
              {error ? <InlineNotice message={`加载/发送失败：${error}`} /> : null}
              {busy ? <InlineNotice message="加载中…" /> : null}
              {!busy && messages.length === 0 ? <InlineNotice message="该会话暂无消息" /> : null}
              <div className="space-y-3">
                {messages.map((m) => {
                  const meta = m.meta && typeof m.meta === "object" ? (m.meta as Record<string, unknown>) : undefined;
                  const mockSteps = parseMockTaskExecutionStepsFromMeta(meta);
                  const taskId =
                    typeof m.meta?.task_id === "string" && m.meta?.kind !== "mock_task_execution"
                      ? m.meta.task_id
                      : undefined;
                  const key = m.id;
                  return (
                    <div key={key} className="space-y-2">
                      {m.role === "user" ? (
                        <SimpleUserBubble text={m.content} datetime={m.created_at} />
                      ) : m.role === "assistant" ? (
                        mockSteps ? (
                          <MockTaskExecutionAssistantBubble steps={mockSteps} datetime={m.created_at} />
                        ) : (
                          <SimpleAssistantBubble body={m.content} datetime={m.created_at} />
                        )
                      ) : (
                        <SimpleSystemBubble message={m.content} />
                      )}
                      {taskId ? (
                        <TaskResultSummaryCard
                          title="任务结果"
                          summary="该轮任务已完成，可在右侧查看任务结果与数据文件。"
                          expanded={showResultPanel}
                          onToggle={() => {
                            if (showResultPanel) {
                              setShowResultPanel(false);
                              return;
                            }
                            void openTaskResultPanel(taskId);
                          }}
                        />
                      ) : null}
                    </div>
                  );
                })}
                {sending ? <AssistantLoadingRow variant="thinking" /> : null}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-[rgba(255,255,255,0.86)] px-4 py-4 backdrop-blur-xl sm:px-6">
          <div className={cn("mx-auto w-full", SIMPLE_CHAT_COLUMN_MAX)}>
            <TaskComposer
              value={draft}
              onValueChange={setDraft}
              placeholder="基于历史对话继续追问…"
              mode="普通模式"
              onModeChange={() => {}}
              templates={[]}
              selectedSourceIds={[]}
              onToolSelect={() => {}}
              onSourceRemove={() => {}}
              onTemplateSelect={() => {}}
              onFilesSelected={() => {}}
              onSubmit={() => void send()}
              visualStyle="default"
            />
          </div>
        </div>
      </div>
    </MoreDataShell>
  );
}
