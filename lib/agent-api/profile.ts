import { getAgentHttpApiBase } from "@/lib/agent-api/config";

export type UserProfile = {
  username: string;
  display_name: string | null;
  avatar_color: string | null;
  email: string | null;
  phone: string | null;
  uuid: string;
};

function profileUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${getAgentHttpApiBase()}${normalized}`;
}

async function profileFetch<T>(
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(profileUrl(path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`profile ${path} failed: ${response.status} ${body}`);
  }
  return response.json() as Promise<T>;
}

export function fetchProfile(accessToken: string): Promise<UserProfile> {
  return profileFetch<UserProfile>(accessToken, "/api/user/profile");
}

export function patchProfile(
  accessToken: string,
  payload: { display_name?: string; avatar_color?: string },
): Promise<{ display_name: string | null; avatar_color: string | null }> {
  return profileFetch(accessToken, "/api/user/profile", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}