import { Suspense } from "react";

import { PlanBillingWorkspace } from "@/components/plan-billing-workspace";
import { RequirePlatformLogin } from "@/components/require-platform-login";

export default function PlansPage() {
  return (
    <Suspense fallback={null}>
      <RequirePlatformLogin>
        <PlanBillingWorkspace />
      </RequirePlatformLogin>
    </Suspense>
  );
}
