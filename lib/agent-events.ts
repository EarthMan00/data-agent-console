import type { SheetTab } from "@/lib/workspace-domain-types";

export type AgentAttachmentStatus = "queued" | "accepted" | "referenced";
export type AgentAttachmentFileType = "image" | "video" | "audio" | "pdf" | "doc" | "ppt" | "txt";

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
export type TaskExecutionStepStatus = "pending" | "running" | "awaiting_input" | "done" | "error";

export type TaskExecutionStep = {
  id: string;
  roundId: string;
  label: string;
  order: number;
  status: TaskExecutionStepStatus;
  /** 运行中时的可读进度（如 Alice 已等待时长） */
  runtimeHint?: string;
  /** 后端任务实际开始时间；用于前端本地秒表展示，避免跟随轮询间隔跳秒。 */
  runtimeStartedAt?: string;
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
      /** 任务完成后的可点击引导（与 session post_task_guidance 消息一致） */
      type: "post_task_guidance";
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
      type: "task_split_delta";
      roundId: string;
      steps: string[];
    }
  | {
      /** 服务端拆分 SSE 已结束，可判定任务拆分 UI 是否展示完毕 */
      type: "task_split_stream_end";
      roundId: string;
    }
  | {
      /** 任务拆分 UI（含打字机）已展示完毕 */
      type: "split_reveal_complete";
      roundId: string;
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
      runtimeHint?: string;
      runtimeStartedAt?: string;
    }
  | {
      type: "alice_clarification_pending";
      roundId: string;
      message: string;
      shareUrl: string | null;
      stepIndex: number | null;
      orchestrationId?: string | null;
    }
  | {
      type: "platform_orchestration_bound";
      roundId: string;
      orchestrationId: string;
    }
  | {
      type: "alice_clarification_cleared";
      roundId: string;
    }
  | {
      /** 多步澄清后同轮继续编排：仅恢复 running，不清空步骤快照 */
      type: "orchestration_resume";
      roundId: string;
    };

/** 与 Alice 后端服务 TaskResponse.artifacts 对齐，供右侧任务结果区拉取预览 */
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
