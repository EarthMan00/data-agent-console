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
    if (!isPlatformBackendEnabled() || !platformAgent?.authHydrated) return;
    if (!platformAgent.auth || !isAdmin) {
      router.replace("/admin/login");
    }
  }, [isAdmin, platformAgent, router]);

  if (!platformAgent) {
    return children;
  }
  if (!platformAgent.authHydrated) {
    return null;
  }
  if (isPlatformBackendEnabled() && (!platformAgent.auth || !isAdmin)) {
    return null;
  }
  return children;
}
