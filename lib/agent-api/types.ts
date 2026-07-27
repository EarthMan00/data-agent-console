export type LoginResponse = {
  access_token: string;
  refresh_token: string;
  user_id: string;
  username?: string;
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
  /** GET /admin/users 扩展字段：当前生效套餐与是否可使用工具 */
  plan_code?: string;
  can_use_tools?: boolean;
};

export type SessionAttachmentUploadItem = {
  attachment_id: string;
  name: string;
  size: number;
};

export type SessionAttachmentUploadResponse = {
  attachments: SessionAttachmentUploadItem[];
};

export type ChatRoundStatus =
  | "QUEUED"
  | "PLANNING"
  | "GENERATING"
  | "EXECUTING"
  | "WAITING_INPUT"
  | "CANCEL_REQUESTED"
  | "SUCCEEDED"
  | "PARTIAL_SUCCESS"
  | "FAILED"
  | "CANCELLED";

export type ChatRoundStep = {
  step_id: string;
  step_index: number;
  label: string;
  status:
    | "PENDING"
    | "RUNNING"
    | "WAITING_INPUT"
    | "SUCCESS"
    | "FAILED"
    | "CANCELLED"
    | "SKIPPED";
  task_id: string | null;
  artifacts: Array<{
    artifact_id: string;
    artifact_type: string;
    original_name: string;
    download_api: string;
  }>;
  evidence: Record<string, unknown> | null;
  error_code: string | null;
  error_message: string | null;
};

export type ChatRoundSnapshot = {
  round_id: string;
  session_id: string;
  status: ChatRoundStatus;
  assistant_message_id: string;
  content: string;
  last_event_seq: number;
  steps: ChatRoundStep[];
  error_code: string | null;
  error_message: string | null;
};

export type RoundAccepted = {
  session_id: string;
  round_id: string;
  assistant_message_id: string;
  status: ChatRoundStatus;
  last_event_seq: number;
};

export type ChatRoundEvent = {
  round_id: string;
  seq: number;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
};

export class RoundEventGapError extends Error {
  constructor(
    public readonly expectedSeq: number,
    public readonly actualSeq: number,
  ) {
    super(`round event gap: expected ${expectedSeq}, received ${actualSeq}`);
    this.name = "RoundEventGapError";
  }
}

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
  result_push_config?: import("@/lib/schedule-result-push-api").ResultPushConfigApi | null;
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
  result_push_config?: import("@/lib/schedule-result-push-api").ResultPushConfigApi | null;
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
  result_push_config?: import("@/lib/schedule-result-push-api").ResultPushConfigApi | null;
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

/** `/api/user/favorite-folders` */
export type FavoriteFolderDto = {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type FavoriteFolderListDto = {
  items: FavoriteFolderDto[];
};

/** `/api/user/favorites` 列表项 */
export type UserFavoriteListItemDto = {
  id: string;
  folder_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  source_task_id: string | null;
  result_kind: string | null;
  card_preview: string | null;
};

export type UserFavoriteListDto = {
  items: UserFavoriteListItemDto[];
  total: number;
  page: number;
  page_size: number;
};

/** `/api/user/favorites/{id}` */
export type UserFavoriteDetailDto = {
  id: string;
  folder_id: string;
  title: string;
  snapshot: Record<string, unknown>;
  stored_file_path: string | null;
  source_task_id: string | null;
  created_at: string;
  updated_at: string;
};

export type UserFavoriteByTaskDto = {
  favorited: boolean;
  favorite_id: string | null;
};

export type UserFavoriteCreateBody = {
  title: string;
  folder_id?: string | null;
  source_task_id?: string | null;
  snapshot: Record<string, unknown>;
  copy_artifact_id?: string | null;
};

export type AdminPlan = {
  id: string;
  code: string;
  name: string;
  level: number;
  can_use_tools: boolean;
  features: Record<string, unknown>;
  user_count: number;
  created_at: string | null;
};

export type AdminPromptCategory = {
  id: string;
  name: string;
  sort_order: number;
};

export type AdminPromptTemplate = {
  id: string;
  category_id: string | null;
  category_name: string | null;
  title: string;
  description: string | null;
  prompt_text: string;
  variables: Record<string, unknown>[];
  meta_line: string | null;
  capability_ids: string[];
  replay_run_id: string | null;
  replay_share_id: string | null;
  status: string;
  sort_order: number;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
};

export type AdminPromptTemplateListResponse = {
  templates: AdminPromptTemplate[];
  total: number;
  page: number;
  page_size: number;
};

export type AdminFeedbackEntry = {
  id: string;
  created_at: string;
  message: string;
  page_path: string;
  context_type: string | null;
  context_id: string | null;
  app_version: string | null;
  user_agent: string | null;
  status: string;
  admin_note: string | null;
  updated_at: string | null;
};

export type AdminModelConfig = {
  id: string;
  name: string;
  api_key: string;
  base_url: string;
  model: string;
  request_timeout: number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type AdminAlicePersonaTemplate = {
  id: string;
  name: string;
  description: string | null;
  identity: string;
  communication_style: string;
  output_contract: string;
  safety_rules: string;
  internal_reasoning_policy: string;
  decompose_prompt: string;
  error_humanize_prompt: string;
  is_active: boolean;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
};
