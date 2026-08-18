import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PlanBillingWorkspace } from "@/components/plan-billing-workspace";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));

vi.mock("@/components/alice-shell", () => ({
  AliceShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));

vi.mock("@/components/platform-agent-provider", () => ({
  useOptionalPlatformAgent: () => ({ auth: { displayName: "sensen" } }),
}));

describe("PlanBillingWorkspace", () => {
  beforeEach(() => {
    push.mockClear();
  });

  it("展示套餐引导并提供打开费用的入口", () => {
    render(<PlanBillingWorkspace />);

    expect(screen.getByText("套餐已移至个人中心")).toBeInTheDocument();
    expect(screen.getByText("费用与套餐购买已整合到「个人中心 → 费用」。")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "打开费用" }));
    expect(push).toHaveBeenCalledWith("/plans?billing=1");
  });
});
