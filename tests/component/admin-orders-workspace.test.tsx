import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdminOrdersWorkspace } from "@/components/admin-orders-workspace";

const api = vi.hoisted(() => ({
  listOrders: vi.fn(),
  confirmPayment: vi.fn(),
  fulfill: vi.fn(),
}));

const agent = vi.hoisted(() => ({
  auth: { accessToken: "opaque-token" },
  withFreshToken: async <T,>(run: (token: string) => Promise<T>) =>
    run("opaque-token"),
}));

vi.mock("@/components/platform-agent-provider", () => ({
  useOptionalPlatformAgent: () => agent,
}));

vi.mock("@/lib/agent-api/client", () => ({
  AgentApiError: class AgentApiError extends Error {},
  parseFastApiDetail: () => null,
  adminListOrders: api.listOrders,
  adminConfirmOrderPayment: api.confirmPayment,
  adminFulfillOrder: api.fulfill,
}));

function order(overrides: Record<string, unknown> = {}) {
  return {
    id: "order-1",
    user_id: "00000000-0000-0000-0000-000000000001",
    order_no: "AL20260817000001",
    order_type: "new",
    plan_snapshot: { code: "paid_basic", name: "基础版" },
    prev_plan_snapshot: null,
    amount_cents: 19900,
    original_amount_cents: 19900,
    billing_cycle: "monthly",
    status: "created",
    payment_method: null,
    paid_at: null,
    fulfilled_at: null,
    created_at: "2026-08-17T10:00:00Z",
    ...overrides,
  };
}

describe("AdminOrdersWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listOrders.mockResolvedValue({ orders: [order()] });
    api.confirmPayment.mockResolvedValue({
      order: order({
        status: "paid",
        payment_method: "bank",
        paid_at: "2026-08-17T11:00:00Z",
      }),
    });
    api.fulfill.mockResolvedValue({
      order: order({
        status: "fulfilled",
        fulfilled_at: "2026-08-17T12:00:00Z",
      }),
    });
  });

  it("renders order rows with plan, amount and status", async () => {
    render(<AdminOrdersWorkspace />);

    await screen.findByText("AL20260817000001");
    expect(screen.getByText("基础版")).toBeInTheDocument();
    expect(screen.getByText("¥199.00")).toBeInTheDocument();
    expect(screen.getByText("待付款")).toBeInTheDocument();
    expect(api.listOrders).toHaveBeenCalledWith("opaque-token");
  });

  it("moves order from created to paid after confirming payment", async () => {
    render(<AdminOrdersWorkspace />);

    await screen.findByText("AL20260817000001");
    fireEvent.click(screen.getByRole("button", { name: "确认收款" }));

    await waitFor(() => {
      expect(screen.getByText("已收款待开通")).toBeInTheDocument();
    });
    expect(api.confirmPayment).toHaveBeenCalledWith("opaque-token", "order-1");
  });

  it("moves order from paid to fulfilled after fulfillment", async () => {
    api.listOrders.mockResolvedValue({
      orders: [order({ status: "paid" })],
    });
    render(<AdminOrdersWorkspace />);

    await screen.findByText("AL20260817000001");
    fireEvent.click(screen.getByRole("button", { name: "开通" }));

    await waitFor(() => {
      expect(screen.getByText("已开通")).toBeInTheDocument();
    });
    expect(api.fulfill).toHaveBeenCalledWith("opaque-token", "order-1");
  });

  it("shows empty state when there are no orders", async () => {
    api.listOrders.mockResolvedValue({ orders: [] });
    render(<AdminOrdersWorkspace />);

    await screen.findByText("暂无订单");
  });
});