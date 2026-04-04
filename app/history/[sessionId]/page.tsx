import { redirect } from "next/navigation";

export default async function HistorySessionPage(props: { params: Promise<Record<string, string>> }) {
  const resolved = await props.params;
  const sessionId = resolved.sessionId ?? resolved.id ?? "";
  if (!sessionId) redirect("/");
  redirect(`/agent?sessionId=${encodeURIComponent(sessionId)}`);
}

