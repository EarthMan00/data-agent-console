"use client";

import { useRouter } from "next/navigation";

import { AliceShell } from "@/components/alice-shell";
import { Button } from "@/components/ui/button";

export function PlanBillingWorkspace() {
  const router = useRouter();
  return (
    <AliceShell currentPath="/plans" showTopHeader={false}>
      <div className="grid min-h-full place-items-center px-6 py-16 text-center">
        <div>
          <p className="text-title-2 font-semibold text-foreground">套餐已移至个人中心</p>
          <p className="mt-2 text-body text-text-secondary">费用与套餐购买已整合到「个人中心 → 费用」。</p>
          <Button
            type="button"
            className="mt-6 min-w-40"
            onClick={() => router.push("/plans?billing=1")}
          >
            打开费用
          </Button>
        </div>
      </div>
    </AliceShell>
  );
}
