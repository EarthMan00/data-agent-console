import { Suspense } from "react";
import { TemplatesWorkspace } from "@/components/templates-workspace";
import { RequirePlatformLogin } from "@/components/require-platform-login";

export default function TemplatesPage() {
  return (
    <Suspense fallback={null}>
      <RequirePlatformLogin>
        <TemplatesWorkspace />
      </RequirePlatformLogin>
    </Suspense>
  );
}
