import { Suspense } from "react";
import { FavoritesWorkspace } from "@/components/favorites-workspace";
import { RequirePlatformLogin } from "@/components/require-platform-login";

export default function ArtifactsPage() {
  return (
    <Suspense fallback={null}>
      <RequirePlatformLogin>
        <FavoritesWorkspace />
      </RequirePlatformLogin>
    </Suspense>
  );
}
