import { getAgentHttpApiBase } from "@/lib/agent-api/config";

export type SubmitFeedbackPayload = {
  message: string;
  page_path: string;
  context_type?: string | null;
  context_id?: string | null;
  client_version?: string;
};

function feedbackUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${getAgentHttpApiBase()}${normalized}`;
}

export async function submitFeedback(
  accessToken: string,
  payload: SubmitFeedbackPayload,
): Promise<{ id: string }> {
  const response = await fetch(feedbackUrl("/api/feedback"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`submit feedback failed: ${response.status} ${body}`);
  }
  return response.json() as Promise<{ id: string }>;
}