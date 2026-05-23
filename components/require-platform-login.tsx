"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { AgentRoutePlaceholder } from "@/components/agent-route-placeholder";
import { useOptionalPlatformAgent } from "@/components/platform-agent-provider";
import { isPlatformBackendEnabled } from "@/lib/agent-runtime";

export function RequirePlatformLogin({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const platformAgent = useOptionalPlatformAgent();
  const [clientMounted, setClientMounted] = useState(false);

  useEffect(() => {
    setClientMounted(true);
  }, []);

  useEffect(() => {
    if (!clientMounted || !isPlatformBackendEnabled() || !platformAgent?.authHydrated) return;
    if (!platformAgent.auth) {
      platformAgent.openLogin("请先登录后再继续操作。");
      router.replace("/");
    }
  }, [clientMounted, platformAgent, router]);

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

