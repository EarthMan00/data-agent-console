import { Suspense } from "react";
import { ReportView } from "@/components/report-view";
import { RequirePlatformLogin } from "@/components/require-platform-login";

export default function ReportPage() {
  return (
    <Suspense fallback={null}>
      <RequirePlatformLogin>
        <ReportView />
      </RequirePlatformLogin>
    </Suspense>
  );
}
