"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { AgentRoutePlaceholder } from "@/components/agent-route-placeholder";
import { useOptionalPlatformAgent } from "@/components/platform-agent-provider";
import { isPlatformBackendEnabled } from "@/lib/agent-runtime";
import { isFrontendMockSessionId } from "@/lib/frontend-mock-session";

const subscribeToClientSnapshot = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export function RequirePlatformLogin({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const platformAgent = useOptionalPlatformAgent();
  const clientMounted = useSyncExternalStore(subscribeToClientSnapshot, getClientSnapshot, getServerSnapshot);
  const frontendMockSession = isFrontendMockSessionId(searchParams.get("sessionId"));

  useEffect(() => {
    if (frontendMockSession) return;
    if (!clientMounted || !isPlatformBackendEnabled() || !platformAgent?.authHydrated) return;
    if (!platformAgent.auth) {
      platformAgent.openLogin("请先登录后再继续操作。");
      router.replace("/");
    }
  }, [clientMounted, frontendMockSession, platformAgent, router]);

  if (frontendMockSession) {
    return children;
  }
  if (!platformAgent) {
    return children;
  }
  if (!clientMounted || !platformAgent.authHydrated) {
    return <AgentRoutePlaceholder />;
  }
  if (isPlatformBackendEnabled() && !platformAgent.auth) {
    return <AgentRoutePlaceholder />;
  }
  return children;
}
