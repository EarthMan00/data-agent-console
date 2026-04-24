import type { AttachmentType } from "tdesign-web-components/lib/chatbot/core/type";
import type { SheetTab } from "@/lib/workspace-domain-types";

export type AgentAttachmentStatus = "queued" | "accepted" | "referenced";
export type AgentAttachmentFileType = AttachmentType;

export type AgentAttachment = {
  id: string;
  name: string;
  size?: number;
  fileType?: AgentAttachmentFileType;
  extension?: string;
  status: AgentAttachmentStatus;
};

export type DataSourceChainStatus = "queued" | "running" | "success" | "error";

/** 平台任务在界面上的分步执行状态（与真实轮询并行 mock） */
export type TaskExecutionStepStatus = "pending" | "running" | "done" | "error";

export type TaskExecutionStep = {
  id: string;
  roundId: string;
  label: string;
  order: number;
  status: TaskExecutionStepStatus;
};

export type DataSourceChain = {
  id: string;
  roundId: string;
  sourceId: string;
  sourceLabel: string;
  status: DataSourceChainStatus;
  intent: string;
  progressText: string;
  resultCountText?: string;
  resultPreviewId?: string;
};

type ConversationNodeBase = {
  id: string;
  roundId: string;
  createdAt: string;
};

export type ConversationNode =
  | (ConversationNodeBase & {
      kind: "user_message";
      text: string;
    })
  | (ConversationNodeBase & {
      kind: "attachment_group";
      attachments: AgentAttachment[];
    })
  | (ConversationNodeBase & {
      kind: "assistant_thinking";
      text: string;
    })
  | (ConversationNodeBase & {
      kind: "assistant_loading";
      text: string;
    })
  | (ConversationNodeBase & {
      kind: "data_source_chain";
      chainId: string;
    })
  | (ConversationNodeBase & {
      kind: "assistant_stream";
      text: string;
      status: "streaming" | "complete";
    })
  | (ConversationNodeBase & {
      kind: "assistant_final";
      text: string;
    })
  | (ConversationNodeBase & {
      kind: "report_patch";
      summary: string[];
    })
  | (ConversationNodeBase & {
      kind: "error";
      message: string;
    });

export type AgentReportPatch = {
  previewKey: string;
  title: string;
  subtitle: string;
  generatedAt: string;
  mode: "sheet" | "report";
  summary: string[];
  sheetTabs: SheetTab[];
  sheetRows: string[][];
  summaryBody: string;
};

export type AgentRoundRuntimeEvent =
  | {
      type: "round_started";
      roundId: string;
    }
  | {
      type: "round_ui_layout";
      roundId: string;
      layout: "simple_chat" | "tool_orchestration";
    }
  | {
      type: "attachments_received";
      roundId: string;
      attachments: AgentAttachment[];
    }
  | {
      type: "thinking";
      roundId: string;
      text: string;
    }
  | {
      type: "loading";
      roundId: string;
      text: string;
    }
  | {
      type: "source_started";
      roundId: string;
      chain: DataSourceChain;
    }
  | {
      type: "source_progress";
      roundId: string;
      chainId: string;
      progressText: string;
    }
  | {
      type: "source_completed";
      roundId: string;
      chainId: string;
      progressText: string;
      resultCountText?: string;
      resultPreviewId?: string;
      /** 默认 success；失败时可标 error 以更新链路状态 */
      chainOutcome?: "success" | "error";
    }
  | {
      type: "delta";
      roundId: string;
      text: string;
    }
  | {
      type: "final";
      roundId: string;
      text: string;
    }
  | {
      type: "report_updated";
      roundId: string;
      patch: AgentReportPatch;
    }
  | {
      type: "round_completed";
      roundId: string;
    }
  | {
      type: "error";
      roundId: string;
      message: string;
    }
  | {
      type: "platform_task_snapshot";
      roundId: string;
      taskId: string;
      artifacts: PlatformTaskArtifactRef[];
      zipDownloadApi?: string | null;
    }
  | {
      type: "platform_subtask_snapshot";
      roundId: string;
      stepIndex: number;
      stepId: string;
      label: string;
      taskId: string;
      outcome: "success" | "failed";
      taskStatus: string;
      errorMessage?: string | null;
      artifacts: PlatformTaskArtifactRef[];
      zipDownloadApi: string | null;
    }
  | {
      type: "task_execution_steps_init";
      roundId: string;
      steps: Array<{ id: string; label: string }>;
    }
  | {
      type: "task_execution_step_update";
      roundId: string;
      stepId: string;
      status: TaskExecutionStepStatus;
    };

/** 与 Data Agent Server TaskResponse.artifacts 对齐，供右侧任务结果区拉取预览 */
export type PlatformTaskArtifactRef = {
  artifact_id: string;
  artifact_type: string;
  original_name: string;
  download_api: string;
};

/** 多步编排中单个步骤完成后的快照（聊天区卡片 + 右侧可切换预览） */
export type PlatformSubtaskSnapshot = {
  stepIndex: number;
  stepId: string;
  label: string;
  taskId: string;
  outcome: "success" | "failed";
  taskStatus: string;
  errorMessage?: string | null;
  artifacts: PlatformTaskArtifactRef[];
  zipDownloadApi: string | null;
};
