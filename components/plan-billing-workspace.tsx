"use client";

import { useState } from "react";

import { AliceShell } from "@/components/alice-shell";

export function PlanBillingWorkspace() {
  return (
    <AliceShell currentPath="/plans" showTopHeader={false}>
      <div className="grid min-h-full place-items-center px-6 py-16 text-center">
        <div><p className="text-title-2 font-semibold text-foreground">套餐已移至个人中心</p><p className="mt-2 text-body text-text-secondary">请从左下角账户菜单进入「个人中心 → 费用」。</p></div>
      </div>
    </AliceShell>
  );
}
