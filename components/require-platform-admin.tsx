"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useOptionalPlatformAgent } from "@/components/platform-agent-provider";
import { isPlatformBackendEnabled } from "@/lib/agent-runtime";

export function RequirePlatformAdmin({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const platformAgent = useOptionalPlatformAgent();

  const isAdmin = platformAgent?.auth?.userRole === "admin";

  useEffect(() => {
    if (!isPlatformBackendEnabled() || !platformAgent) return;
    if (!platformAgent.auth) {
      platformAgent.openLogin("请先登录后再继续操作。");
      router.replace("/");
      return;
    }
    if (!isAdmin) {
      router.replace("/");
    }
  }, [isAdmin, platformAgent, router]);

  if (isPlatformBackendEnabled() && platformAgent && (!platformAgent.auth || !isAdmin)) {
    return null;
  }
  return children;
}
