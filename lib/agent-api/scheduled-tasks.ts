import { getAgentHttpApiBase } from "@/lib/agent-api/config";
import { AgentApiError } from "@/lib/agent-api/client";
import type {
  ScheduledTaskRunListDto,
  UserScheduledTaskCreateBody,
  UserScheduledTaskGroupDto,
  UserScheduledTaskGroupListDto,
  UserScheduledTaskItemApi,
  UserScheduledTaskListDto,
  UserScheduledTaskPatchBody,
} from "@/lib/agent-api/types";

function apiUrl(path: string): string {
  const base = getAgentHttpApiBase();
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  return JSON.parse(text) as unknown;
}

export async function listUserScheduledTaskGroups(
  accessToken: string,
  page = 1,
  pageSize = 100,
): Promise<UserScheduledTaskGroupListDto> {
  const sp = new URLSearchParams();
  sp.set("page", String(page));
  sp.set("page_size", String(pageSize));
  const res = await fetch(apiUrl(`/api/user-scheduled-task-groups?${sp}`), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await parseJson(res);
  if (!res.ok) {
    throw new AgentApiError("list scheduled task groups failed", res.status, data);
  }
  return data as UserScheduledTaskGroupListDto;
}

export async function fetchAllUserScheduledTaskGroups(accessToken: string): Promise<UserScheduledTaskGroupDto[]> {
  const out: UserScheduledTaskGroupDto[] = [];
  let page = 1;
  const page_size = 100;
  while (true) {
    const r = await listUserScheduledTaskGroups(accessToken, page, page_size);
    out.push(...r.items);
    if (out.length >= r.total || r.items.length === 0) break;
    page += 1;
  }
  return out;
}

export async function createUserScheduledTaskGroup(accessToken: string, name: string): Promise<UserScheduledTaskGroupDto> {
  const res = await fetch(apiUrl("/api/user-scheduled-task-groups"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name }),
  });
  const data = await parseJson(res);
  if (!res.ok) {
    throw new AgentApiError("create scheduled task group failed", res.status, data);
  }
  return data as UserScheduledTaskGroupDto;
}

export type ListUserScheduledTasksParams = {
  page?: number;
  page_size?: number;
  /** 若只查看某分组的任务；不传则拉取全部后由前端按「默认」等筛选 */
  group_id?: string | null;
};

export async function listUserScheduledTasks(
  accessToken: string,
  params?: ListUserScheduledTasksParams,
): Promise<UserScheduledTaskListDto> {
  const sp = new URLSearchParams();
  if (params?.page != null) sp.set("page", String(params.page));
  if (params?.page_size != null) sp.set("page_size", String(params.page_size));
  if (params?.group_id) sp.set("group_id", params.group_id);
  const q = sp.toString();
  const res = await fetch(apiUrl(`/api/user-scheduled-tasks${q ? `?${q}` : ""}`), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await parseJson(res);
  if (!res.ok) {
    throw new AgentApiError("list scheduled tasks failed", res.status, data);
  }
  return data as UserScheduledTaskListDto;
}

/** 拉取某用户下全部任务（多页） */
export async function fetchAllUserScheduledTasks(
  accessToken: string,
  groupIdFilter?: string | null,
): Promise<UserScheduledTaskItemApi[]> {
  const out: UserScheduledTaskItemApi[] = [];
  let page = 1;
  const page_size = 100;
  while (true) {
    const r = await listUserScheduledTasks(accessToken, { page, page_size, group_id: groupIdFilter || undefined });
    out.push(...r.items);
    if (out.length >= r.total || r.items.length === 0) break;
    page += 1;
  }
  return out;
}

export async function getUserScheduledTask(accessToken: string, taskId: string): Promise<UserScheduledTaskItemApi> {
  const res = await fetch(apiUrl(`/api/user-scheduled-tasks/${encodeURIComponent(taskId)}`), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await parseJson(res);
  if (!res.ok) {
    throw new AgentApiError("get scheduled task failed", res.status, data);
  }
  return data as UserScheduledTaskItemApi;
}

export async function createUserScheduledTask(
  accessToken: string,
  body: UserScheduledTaskCreateBody,
): Promise<UserScheduledTaskItemApi> {
  const res = await fetch(apiUrl("/api/user-scheduled-tasks"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await parseJson(res);
  if (!res.ok) {
    throw new AgentApiError("create scheduled task failed", res.status, data);
  }
  return data as UserScheduledTaskItemApi;
}

export async function patchUserScheduledTask(
  accessToken: string,
  taskId: string,
  body: UserScheduledTaskPatchBody,
): Promise<UserScheduledTaskItemApi> {
  const res = await fetch(apiUrl(`/api/user-scheduled-tasks/${encodeURIComponent(taskId)}`), {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await parseJson(res);
  if (!res.ok) {
    throw new AgentApiError("patch scheduled task failed", res.status, data);
  }
  return data as UserScheduledTaskItemApi;
}

export async function deleteUserScheduledTask(accessToken: string, taskId: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/user-scheduled-tasks/${encodeURIComponent(taskId)}`), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.ok || res.status === 204) return;
  const data = await parseJson(res);
  throw new AgentApiError("delete scheduled task failed", res.status, data);
}

export async function runUserScheduledTaskNow(accessToken: string, taskId: string): Promise<{ status: string; message?: string }> {
  const res = await fetch(apiUrl(`/api/user-scheduled-tasks/${encodeURIComponent(taskId)}/run`), {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await parseJson(res);
  if (res.status === 202) {
    return (data as { status: string; message?: string }) ?? { status: "accepted" };
  }
  if (!res.ok) {
    throw new AgentApiError("trigger scheduled task run failed", res.status, data);
  }
  return (data as { status: string; message?: string }) ?? { status: "ok" };
}

export type ListScheduledTaskRunsParams = {
  page?: number;
  page_size?: number;
  task_id?: string | null;
  /** all | running | success | failed | timeout，不传为全部 */
  run_status?: string;
};

export async function listScheduledTaskRuns(
  accessToken: string,
  params?: ListScheduledTaskRunsParams,
): Promise<ScheduledTaskRunListDto> {
  const sp = new URLSearchParams();
  if (params?.page != null) sp.set("page", String(params.page));
  if (params?.page_size != null) sp.set("page_size", String(params.page_size));
  if (params?.task_id) sp.set("task_id", params.task_id);
  if (params?.run_status) sp.set("run_status", params.run_status);
  const q = sp.toString();
  const res = await fetch(apiUrl(`/api/scheduled-task-runs${q ? `?${q}` : ""}`), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await parseJson(res);
  if (!res.ok) {
    throw new AgentApiError("list scheduled task runs failed", res.status, data);
  }
  return data as ScheduledTaskRunListDto;
}

export async function deleteScheduledTaskRun(accessToken: string, runId: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/scheduled-task-runs/${encodeURIComponent(runId)}`), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.ok || res.status === 204) return;
  const data = await parseJson(res);
  throw new AgentApiError("delete scheduled task run failed", res.status, data);
}

export async function fetchAllScheduledTaskRuns(
  accessToken: string,
  opts?: { run_status?: "running" | "success" | "failed" | "timeout"; task_id?: string | null },
) {
  const out: import("@/lib/agent-api/types").ScheduledTaskRunItemApi[] = [];
  let page = 1;
  const page_size = 100;
  while (true) {
    const r = await listScheduledTaskRuns(accessToken, {
      page,
      page_size,
      task_id: opts?.task_id || undefined,
      run_status: opts?.run_status,
    });
    out.push(...r.items);
    if (out.length >= r.total || r.items.length === 0) break;
    page += 1;
  }
  return out;
}
