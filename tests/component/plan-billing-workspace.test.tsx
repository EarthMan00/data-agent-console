import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { PlanBillingWorkspace } from "@/components/plan-billing-workspace";

vi.mock("@/components/alice-shell", () => ({
  AliceShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));

vi.mock("@/components/platform-agent-provider", () => ({
  useOptionalPlatformAgent: () => ({ auth: { displayName: "sensen" } }),
}));

describe("PlanBillingWorkspace", () => {
  it("directs plan routes back to the single billing entry in personal center", () => {
    render(<PlanBillingWorkspace />);

    expect(screen.getByText("套餐已移至个人中心")).toBeInTheDocument();
    expect(screen.getByText("请从左下角账户菜单进入「个人中心 → 费用」。")).toBeInTheDocument();
  });
});
