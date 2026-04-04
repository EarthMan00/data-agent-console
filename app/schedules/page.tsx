import { Suspense } from "react";
import { SchedulesWorkspace } from "@/components/schedules-workspace";
import { RequirePlatformLogin } from "@/components/require-platform-login";

export default function SchedulesPage() {
  return (
    <Suspense fallback={null}>
      <RequirePlatformLogin>
        <SchedulesWorkspace />
      </RequirePlatformLogin>
    </Suspense>
  );
}
