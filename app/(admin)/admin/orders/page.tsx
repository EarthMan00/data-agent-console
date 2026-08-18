import { AdminOrdersWorkspace } from "@/components/admin-orders-workspace";
import { RequirePlatformAdmin } from "@/components/require-platform-admin";

export default function AdminOrdersPage() {
  return (
    <RequirePlatformAdmin>
      <AdminOrdersWorkspace />
    </RequirePlatformAdmin>
  );
}