export type LoginResponse = {
  access_token: string;
  refresh_token: string;
  user_id: string;
  plan_code: string;
  /** 服务端 `LoginResponse.user_role`，如 `admin` | `user` */
  user_role?: string;
};

export type TokenCheckResponse = {
  valid: boolean;
  user_id?: string;
  username?: string;
  user_role?: string;
};

export type AdminUserRow = {
  user_id: string;
  username: string;
  email: string | null;
  role: string;
  status: string;
};

export type CreateSessionResponse = {
  session_id: string;
};

export type SessionListItem = {
  session_id: string;
  status: string;
  created_at: string;
  last_active_at: string;
  expires_at: string;
};

export type SessionListResponse = {
  sessions: SessionListItem[];
  total: number;
  page: number;
  page_size: number;
};

export type SessionMessageItem = {
  id: string;
  role: "user" | "assistant" | "system" | string;
  content: string;
  created_at: string;
  message_index: number;
  message_id?: string | null;
  meta?: Record<string, unknown>;
};

export type SessionMessagesPageResponse = {
  messages: SessionMessageItem[];
  has_more: boolean;
};

export type ChatSendResult =
  | { kind: "completed"; session_id: string; message: string }
  | {
      kind: "accepted";
      task_id: string;
      task_status: string;
      /** 服务端拆解后的步骤文案，用于「任务拆分」与步骤条 */
      execution_steps: string[];
      /** 多步编排时轮询 `/api/tool-orchestrations/{id}` */
      orchestration_id: string | null;
    }
  | { kind: "blocked"; session_id: string; message: string; task_id: string | null };

export type ToolOrchestrationStepApi = {
  index: number;
  label: string;
  task_id: string | null;
  status: string;
};

export type ToolOrchestrationStatusApi = {
  orchestration_id: string;
  finished: boolean;
  success: boolean;
  steps: ToolOrchestrationStepApi[];
};

export type TaskResponse = {
  task_id: string;
  user_id?: string;
  session_id?: string;
  tool_name: string;
  status: string;
  attempt?: number;
  request_payload?: Record<string, unknown> | null;
  response_summary?: Record<string, unknown> | null;
  error_code?: string | null;
  error_message?: string | null;
  message_id?: string | null;
  tool_call_id?: string | null;
  trace_id?: string | null;
  started_at: string;
  duration_ms?: number | null;
  key_hint?: string | null;
  zip_download_api: string | null;
  events: Array<{
    event: string;
    task_id: string;
    message: string | null;
    detail: Record<string, unknown> | null;
    at: string | null;
  }>;
  artifacts: Array<{
    artifact_id: string;
    artifact_type: string;
    original_name: string;
    download_api: string;
  }>;
  finished_at: string | null;
};

export type TaskListResult = {
  tasks: TaskResponse[];
  page: number;
  page_size: number;
};

/** GET /api/home-prompt-recommendations 单条（snake_case 与 OpenAPI 一致） */
export type HomePromptRecommendationDto = {
  id: string;
  title: string;
  description: string;
  prompt: string;
  meta: string;
  capability_ids: string[];
  replay_run_id: string | null;
  replay_share_id: string | null;
  sort_order: number;
};

/** 用户自定义提示词分组 */
export type UserPromptGroupDto = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

export type UserPromptGroupListDto = {
  items: UserPromptGroupDto[];
  total: number;
  page: number;
  page_size: number;
};

/** 用户自定义提示词 */
export type UserPromptDto = {
  id: string;
  group_id: string | null;
  group_name: string | null;
  title: string;
  description: string;
  prompt_text: string;
  created_at: string;
  updated_at: string;
};

export type UserPromptListDto = {
  items: UserPromptDto[];
  total: number;
  page: number;
  page_size: number;
};

/** 定时任务分组，对应 `/api/user-scheduled-task-groups` */
export type UserScheduledTaskGroupDto = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

export type UserScheduledTaskGroupListDto = {
  items: UserScheduledTaskGroupDto[];
  total: number;
  page: number;
  page_size: number;
};

/** 定时任务，对应 `/api/user-scheduled-tasks` */
export type UserScheduledTaskItemApi = {
  id: string;
  group_id: string | null;
  group_name: string | null;
  title: string;
  prompt_text: string;
  enabled: boolean;
  recurrence: "daily" | "weekly" | "monthly" | "once" | string;
  time_hhmm: string;
  weekday: number | null;
  day_of_month: number | null;
  run_once_date: string | null;
  next_run_at: string | null;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
};

export type UserScheduledTaskListDto = {
  items: UserScheduledTaskItemApi[];
  total: number;
  page: number;
  page_size: number;
};

export type UserScheduledTaskCreateBody = {
  title: string;
  prompt_text: string;
  group_id?: string | null;
  enabled?: boolean;
  recurrence: "daily" | "weekly" | "monthly" | "once";
  time_hhmm: string;
  weekday?: number | null;
  day_of_month?: number | null;
  run_once_date?: string | null;
};

export type UserScheduledTaskPatchBody = {
  title?: string;
  prompt_text?: string;
  group_id?: string | null;
  enabled?: boolean | null;
  recurrence?: "daily" | "weekly" | "monthly" | "once";
  time_hhmm?: string;
  weekday?: number | null;
  day_of_month?: number | null;
  run_once_date?: string | null;
};

/** 定时任务运行记录 `/api/scheduled-task-runs` */
export type ScheduledTaskRunItemApi = {
  id: string;
  task_id: string | null;
  trigger_type: string;
  status: string;
  session_id: string | null;
  started_at: string;
  finished_at: string | null;
  error_message: string | null;
  task_title_snapshot: string;
  prompt_snapshot: string;
  group_name_snapshot: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
};

export type ScheduledTaskRunListDto = {
  items: ScheduledTaskRunItemApi[];
  total: number;
  page: number;
  page_size: number;
};
