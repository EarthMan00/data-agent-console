import { Suspense } from "react";

import { HelpWorkspace } from "@/components/help-workspace";
import { RequirePlatformLogin } from "@/components/require-platform-login";

export default function HelpPage() {
  return (
    <Suspense fallback={null}>
      <RequirePlatformLogin>
        <HelpWorkspace />
      </RequirePlatformLogin>
    </Suspense>
  );
}
