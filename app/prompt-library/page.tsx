import { Suspense } from "react";
import { PromptLibraryWorkspace } from "@/components/prompt-library-workspace";
import { RequirePlatformLogin } from "@/components/require-platform-login";

export default function PromptLibraryPage() {
  return (
    <Suspense fallback={null}>
      <RequirePlatformLogin>
        <PromptLibraryWorkspace />
      </RequirePlatformLogin>
    </Suspense>
  );
}
