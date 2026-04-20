"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useOptionalPlatformAgent } from "@/components/platform-agent-provider";
import { isPlatformBackendEnabled } from "@/lib/agent-runtime";

export function RequirePlatformLogin({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const platformAgent = useOptionalPlatformAgent();

  useEffect(() => {
    if (!isPlatformBackendEnabled() || !platformAgent?.authHydrated) return;
    if (!platformAgent.auth) {
      platformAgent.openLogin("请先登录后再继续操作。");
      router.replace("/");
    }
  }, [platformAgent, router]);

  if (!platformAgent) {
    return children;
  }
  if (!platformAgent.authHydrated) {
    return null;
  }
  if (isPlatformBackendEnabled() && !platformAgent.auth) {
    return null;
  }
  return children;
}

