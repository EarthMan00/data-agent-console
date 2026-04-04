import { Suspense } from "react";
import { AgentWorkspace } from "@/components/agent-workspace";
import { RequirePlatformLogin } from "@/components/require-platform-login";

export default function AgentPage() {
  return (
    <Suspense fallback={null}>
      <RequirePlatformLogin>
        <AgentWorkspace />
      </RequirePlatformLogin>
    </Suspense>
  );
}
