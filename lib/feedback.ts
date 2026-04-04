import "server-only";

export type FeedbackContext = {
  type?: "run" | "report" | "template" | "workflow";
  id?: string;
};

export type FeedbackPayload = {
  message: string;
  pagePath: string;
  context?: FeedbackContext;
};

export type FeedbackEntry = {
  id: string;
  created_at: string;
  message: string;
  page_path: string;
  context_type: string | null;
  context_id: string | null;
  app_version: string | null;
  user_agent: string | null;
};

const FEEDBACK_TABLE = "feedback_entries";

function getSupabaseConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return { supabaseUrl, serviceRoleKey };
}

function getRestUrl(path = FEEDBACK_TABLE) {
  const config = getSupabaseConfig();
  if (!config) {
    throw new Error("Supabase 未配置。请设置 NEXT_PUBLIC_SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY。");
  }
  return `${config.supabaseUrl.replace(/\/$/, "")}/rest/v1/${path}`;
}

function getHeaders() {
  const config = getSupabaseConfig();
  if (!config) {
    throw new Error("Supabase 未配置。");
  }

  return {
    "Content-Type": "application/json",
    apikey: config.serviceRoleKey,
    Authorization: `Bearer ${config.serviceRoleKey}`,
  };
}

export function getSupabaseDashboardUrl() {
  const config = getSupabaseConfig();
  if (!config) return null;
  try {
    const ref = new URL(config.supabaseUrl).host.split(".")[0];
    return `https://supabase.com/dashboard/project/${ref}/editor`;
  } catch {
    return null;
  }
}

export function isFeedbackConfigured() {
  return Boolean(getSupabaseConfig());
}

export async function createFeedbackEntry(
  payload: FeedbackPayload,
  userAgent: string | null,
): Promise<FeedbackEntry> {
  const version =
    process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ??
    process.env.NEXT_PUBLIC_APP_VERSION ??
    "dev";

  const response = await fetch(getRestUrl(), {
    method: "POST",
    headers: {
      ...getHeaders(),
      Prefer: "return=representation",
    },
    body: JSON.stringify([
      {
        message: payload.message.trim(),
        page_path: payload.pagePath,
        context_type: payload.context?.type ?? null,
        context_id: payload.context?.id ?? null,
        app_version: version,
        user_agent: userAgent,
      },
    ]),
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Supabase 写入失败。");
  }

  const rows = (await response.json()) as FeedbackEntry[];
  return rows[0];
}

export async function listFeedbackEntries(filters?: {
  pagePath?: string;
  query?: string;
}) {
  const query = new URLSearchParams();
  query.set("select", "id,created_at,message,page_path,context_type,context_id,app_version,user_agent");
  query.set("order", "created_at.desc");
  query.set("limit", "100");

  if (filters?.pagePath) {
    query.set("page_path", `eq.${filters.pagePath}`);
  }

  if (filters?.query) {
    query.set("message", `ilike.*${filters.query}*`);
  }

  const response = await fetch(`${getRestUrl()}?${query.toString()}`, {
    headers: getHeaders(),
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Supabase 读取失败。");
  }

  return (await response.json()) as FeedbackEntry[];
}
