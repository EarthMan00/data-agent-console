"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

import { AgentRoutePlaceholder } from "@/components/agent-route-placeholder";
import { PlatformSessionAgentWorkspace } from "@/components/agent-workspace/platform-session-agent-workspace";
import {
  useSearchParamFlagSnapshot,
  useSearchParamSnapshot,
} from "@/lib/use-search-param-snapshot";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function AgentWorkspace() {
  const router = useRouter();
  const subscribeClientMounted = useCallback(() => () => {}, []);
  const clientMounted = useSyncExternalStore(subscribeClientMounted, () => true, () => false);
  const sessionId = useSearchParamSnapshot("sessionId");
  const scheduleTrial = useSearchParamFlagSnapshot("scheduleTrial");
  const scheduledRunRecord = useSearchParamFlagSnapshot("scheduledRunRecord");
  const runLabel = useSearchParamSnapshot("runLabel");
  const fallbackTaskId = useSearchParamSnapshot("taskId");
  const validSessionId = UUID_RE.test(sessionId) ? sessionId : null;

  useEffect(() => {
    if (clientMounted && !validSessionId) {
      router.replace("/");
    }
  }, [clientMounted, router, validSessionId]);

  if (!clientMounted || !validSessionId) {
    return <AgentRoutePlaceholder />;
  }

  return (
    <PlatformSessionAgentWorkspace
      key={validSessionId}
      sessionId={validSessionId}
      scheduleTrial={scheduleTrial}
      scheduledRunRecord={scheduledRunRecord}
      runLabel={runLabel || undefined}
      fallbackTaskId={fallbackTaskId || undefined}
    />
  );
}
