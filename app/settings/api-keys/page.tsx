import { Suspense } from "react";

import { ApiKeySettingsWorkspace } from "@/components/api-key-settings-workspace";
import { RequirePlatformLogin } from "@/components/require-platform-login";

export default function ApiKeysPage() {
  return (
    <Suspense fallback={null}>
      <RequirePlatformLogin>
        <ApiKeySettingsWorkspace />
      </RequirePlatformLogin>
    </Suspense>
  );
}
