import { Suspense } from "react";
import { RequirePlatformAdmin } from "@/components/require-platform-admin";
import { AdminShell } from "@/components/admin-shell";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <RequirePlatformAdmin>
        <AdminShell>{children}</AdminShell>
      </RequirePlatformAdmin>
    </Suspense>
  );
}
