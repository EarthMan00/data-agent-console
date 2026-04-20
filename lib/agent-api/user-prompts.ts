import { getAgentHttpApiBase } from "@/lib/agent-api/config";
import { AgentApiError } from "@/lib/agent-api/client";
import type {
  UserPromptDto,
  UserPromptGroupDto,
  UserPromptGroupListDto,
  UserPromptListDto,
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

export async function listUserPromptGroups(
  accessToken: string,
  page = 1,
  pageSize = 100,
): Promise<UserPromptGroupListDto> {
  const sp = new URLSearchParams();
  sp.set("page", String(page));
  sp.set("page_size", String(pageSize));
  const res = await fetch(apiUrl(`/api/user-prompt-groups?${sp}`), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await parseJson(res);
  if (!res.ok) {
    throw new AgentApiError("list user prompt groups failed", res.status, data);
  }
  return data as UserPromptGroupListDto;
}

export async function createUserPromptGroup(accessToken: string, name: string): Promise<UserPromptGroupDto> {
  const res = await fetch(apiUrl("/api/user-prompt-groups"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name }),
  });
  const data = await parseJson(res);
  if (!res.ok) {
    throw new AgentApiError("create user prompt group failed", res.status, data);
  }
  return data as UserPromptGroupDto;
}

export async function patchUserPromptGroup(accessToken: string, groupId: string, name: string): Promise<UserPromptGroupDto> {
  const res = await fetch(apiUrl(`/api/user-prompt-groups/${encodeURIComponent(groupId)}`), {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name }),
  });
  const data = await parseJson(res);
  if (!res.ok) {
    throw new AgentApiError("patch user prompt group failed", res.status, data);
  }
  return data as UserPromptGroupDto;
}

export async function deleteUserPromptGroup(accessToken: string, groupId: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/user-prompt-groups/${encodeURIComponent(groupId)}`), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.ok || res.status === 204) return;
  const data = await parseJson(res);
  throw new AgentApiError("delete user prompt group failed", res.status, data);
}

export type ListUserPromptsParams = {
  page?: number;
  page_size?: number;
  group_id?: string | null;
  only_default?: boolean;
};

export async function listUserPrompts(accessToken: string, params?: ListUserPromptsParams): Promise<UserPromptListDto> {
  const sp = new URLSearchParams();
  if (params?.page != null) sp.set("page", String(params.page));
  if (params?.page_size != null) sp.set("page_size", String(params.page_size));
  if (params?.group_id) sp.set("group_id", params.group_id);
  if (params?.only_default) sp.set("only_default", "true");
  const q = sp.toString();
  const res = await fetch(apiUrl(`/api/user-prompts${q ? `?${q}` : ""}`), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await parseJson(res);
  if (!res.ok) {
    throw new AgentApiError("list user prompts failed", res.status, data);
  }
  return data as UserPromptListDto;
}

export async function createUserPrompt(
  accessToken: string,
  body: { title: string; prompt_text: string; description?: string; group_id?: string | null },
): Promise<UserPromptDto> {
  const res = await fetch(apiUrl("/api/user-prompts"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await parseJson(res);
  if (!res.ok) {
    throw new AgentApiError("create user prompt failed", res.status, data);
  }
  return data as UserPromptDto;
}

export async function patchUserPrompt(
  accessToken: string,
  promptId: string,
  body: { title?: string; description?: string; prompt_text?: string; group_id?: string | null },
): Promise<UserPromptDto> {
  const res = await fetch(apiUrl(`/api/user-prompts/${encodeURIComponent(promptId)}`), {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await parseJson(res);
  if (!res.ok) {
    throw new AgentApiError("patch user prompt failed", res.status, data);
  }
  return data as UserPromptDto;
}

export async function deleteUserPrompt(accessToken: string, promptId: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/user-prompts/${encodeURIComponent(promptId)}`), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.ok || res.status === 204) return;
  const data = await parseJson(res);
  throw new AgentApiError("delete user prompt failed", res.status, data);
}
