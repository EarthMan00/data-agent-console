export type LoginResponse = {
  access_token: string;
  refresh_token: string;
  user_id: string;
  plan_code: string;
  /** 服务端 `LoginResponse.user_role`，如 `admin` | `user` */
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
