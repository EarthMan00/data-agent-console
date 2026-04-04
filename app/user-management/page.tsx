import { Suspense } from "react";

import { RequirePlatformAdmin } from "@/components/require-platform-admin";
import { UserManagementWorkspace } from "@/components/user-management-workspace";

export default function UserManagementPage() {
  return (
    <Suspense fallback={null}>
      <RequirePlatformAdmin>
        <UserManagementWorkspace />
      </RequirePlatformAdmin>
    </Suspense>
  );
}
