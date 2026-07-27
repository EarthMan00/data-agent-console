"use client";

/**
 * 浏览器内工作区的报告、分享与用户整理状态。
 * 对话与 Round 执行状态由服务端 Session 快照和事件流负责，不在这里维护。
 */

import { useSyncExternalStore } from "react";

import { safeRandomUUID } from "@/lib/random-uuid";
import type {
  FavoriteItem,
  PromptCard,
  ResultPreview,
  RunRecord,
  ScheduleItem,
} from "@/lib/workspace-domain-types";
import { WORKSPACE_DISPLAY_NAME } from "@/lib/workspace-constants";
import { upsertReportCollection, upsertRunCollection } from "@/lib/workspace-upsert";

export type TaskRun = {
  id: string;
  /** Alice 服务端持久化会话 id；报告返回入口只接受该值。 */
  platformSessionId?: string;
  reportId: string;
  title: string;
  objective: string;
  mode: "专业模式" | "轻量模式";
  status: "queued" | "running" | "success" | "error";
  startedAt: string;
  sections: Array<{
    id: string;
    title: string;
    body: string;
    tools: Array<{
      id: string;
      title: string;
      detail: string;
      resultCount: string;
      previewId: string;
    }>;
  }>;
  notes: string[];
  activePreviewId: string;
  summaryTitle: string;
  summaryBody: string;
  saved: boolean;
  starred: boolean;
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
  groupName?: string;
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

type WorkspaceState = {
  workspaceName: string;
  runs: TaskRun[];
  reports: Report[];
  templates: Template[];
  workflows: Workflow[];
  artifacts: Artifact[];
  runRecords: RunRecordEntry[];
  currentRunId: string;
};

function createId(prefix: string) {
  return `${prefix}-${safeRandomUUID()}`;
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

function createInitialState(): WorkspaceState {
  return {
    workspaceName: WORKSPACE_DISPLAY_NAME,
    runs: [],
    reports: [],
    templates: [],
    workflows: [],
    artifacts: [],
    runRecords: [],
    currentRunId: "",
  };
}

let state = createInitialState();
const listeners = new Set<() => void>();

function emit(nextState: WorkspaceState) {
  state = nextState;
  listeners.forEach((listener) => listener());
}

const MAX_RUNS = 50;
const MAX_RUN_AGE_MS = 24 * 60 * 60 * 1000;

function pruneOldRuns(current: WorkspaceState): WorkspaceState {
  const cutoff = Date.now() - MAX_RUN_AGE_MS;
  let toKeep = current.runs.filter(
    (run) => new Date(run.startedAt).getTime() > cutoff || run.starred,
  );

  const starredBeyondLimit = toKeep.slice(MAX_RUNS).filter((run) => run.starred);
  toKeep = [...toKeep.slice(0, MAX_RUNS), ...starredBeyondLimit];
  const keepIds = new Set(toKeep.map((run) => run.id));

  return {
    ...current,
    runs: toKeep,
    reports: current.reports.filter((report) => keepIds.has(report.runId)),
    artifacts: current.artifacts.filter((artifact) => keepIds.has(artifact.sourceRunId)),
    runRecords: current.runRecords.filter((record) => keepIds.has(record.runId)),
  };
}

function updateState(updater: (current: WorkspaceState) => WorkspaceState) {
  emit(pruneOldRuns(updater(state)));
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

export const workspaceStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot() {
    return state;
  },
};

export function useWorkspaceState() {
  return useSyncExternalStore(
    workspaceStore.subscribe,
    workspaceStore.getSnapshot,
    workspaceStore.getSnapshot,
  );
}

export const workspaceActions = {
  setCurrentRun(runId: string) {
    updateState((current) => ({ ...current, currentRunId: runId }));
  },

  renameRun(runId: string, title: string) {
    const nextTitle = title.trim();
    if (!nextTitle) return;
    updateState((current) => ({
      ...current,
      runs: current.runs.map((run) =>
        run.id === runId ? { ...run, title: nextTitle } : run,
      ),
      runRecords: current.runRecords.map((record) =>
        record.runId === runId ? { ...record, title: nextTitle } : record,
      ),
    }));
  },

  /** 服务端会话删除后，移除本地与之关联的报告、收藏和运行记录。 */
  removeRunById(runId: string) {
    updateState((current) => {
      const remainingRuns = current.runs.filter((run) => run.id !== runId);
      return {
        ...current,
        runs: remainingRuns,
        reports: current.reports.filter((report) => report.runId !== runId),
        artifacts: current.artifacts.filter((artifact) => artifact.sourceRunId !== runId),
        runRecords: current.runRecords.filter((record) => record.runId !== runId),
        currentRunId:
          current.currentRunId === runId
            ? (remainingRuns[0]?.id ?? "")
            : current.currentRunId,
      };
    });
  },

  setActivePreview(runId: string, previewId: string) {
    updateState((current) => ({
      ...current,
      runs: current.runs.map((run) =>
        run.id === runId ? { ...run, activePreviewId: previewId } : run,
      ),
    }));
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
      runs: current.runs.map((run) =>
        run.id === runId ? { ...run, starred: !run.starred } : run,
      ),
    }));
  },

  toggleArtifactForRun(runId: string) {
    let saved = false;

    updateState((current) => {
      const existing = current.artifacts.find(
        (artifact) => artifact.sourceRunId === runId,
      );
      const run = current.runs.find((item) => item.id === runId);
      const report = current.reports.find((item) => item.runId === runId);
      if (!run || !report) return current;

      if (existing) {
        return {
          ...current,
          artifacts: current.artifacts.filter(
            (artifact) => artifact.sourceRunId !== runId,
          ),
          runs: current.runs.map((item) =>
            item.id === runId ? { ...item, saved: false } : item,
          ),
        };
      }

      saved = true;
      const artifact = buildArtifact(run, report);
      return {
        ...current,
        artifacts: [artifact, ...current.artifacts],
        runs: current.runs.map((item) =>
          item.id === runId ? { ...item, saved: true } : item,
        ),
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
      return { ...current, templates: [template, ...current.templates] };
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
    const workflow = createWorkflowFromInput({
      ...input,
      enabled: input.enabled ?? true,
    });
    updateState((current) => ({
      ...current,
      workflows: [workflow, ...current.workflows],
    }));
    return workflow.id;
  },

  deleteWorkflow(workflowId: string) {
    updateState((current) => ({
      ...current,
      workflows: current.workflows.filter((workflow) => workflow.id !== workflowId),
    }));
  },

  setWorkflowEnabled(workflowId: string, enabled: boolean) {
    updateState((current) => ({
      ...current,
      workflows: current.workflows.map((workflow) => {
        if (workflow.id !== workflowId) return workflow;
        if (workflow.status === "已完结") return { ...workflow, enabled: false };
        const nextStatus: ScheduleItem["status"] = !enabled
          ? "已暂停"
          : workflow.status === "已暂停"
            ? "生效中"
            : workflow.status;
        return { ...workflow, enabled, status: nextStatus };
      }),
    }));
  },

  patchWorkflow(
    workflowId: string,
    patch: Partial<
      Pick<
        Workflow,
        "title" | "description" | "frequency" | "nextRun" | "status" | "groupName"
      >
    >,
  ) {
    updateState((current) => ({
      ...current,
      workflows: current.workflows.map((workflow) =>
        workflow.id === workflowId ? { ...workflow, ...patch } : workflow,
      ),
    }));
  },

  deleteRunRecords(recordIds: string[]) {
    if (recordIds.length === 0) return;
    const drop = new Set(recordIds);
    updateState((current) => ({
      ...current,
      runRecords: current.runRecords.filter((record) => !drop.has(record.id)),
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
