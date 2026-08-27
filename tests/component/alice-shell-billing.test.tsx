import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getBillingMocks,
  installDefaultApiMocks,
  loggedInPlatformAgent,
  getPlatformAgentMock,
  renderAliceShell,
} from "./helpers/alice-shell-test-utils";

describe("AliceShell 费用视图（真实数据）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installDefaultApiMocks();
    getPlatformAgentMock().current = loggedInPlatformAgent();
  });

  afterEach(() => {
    getPlatformAgentMock().current = null;
  });

  it("通过 ?billing=1 自动打开费用面板并展示真实余额与账本", async () => {
    renderAliceShell({ searchParams: "billing=1" });

    const dialog = await screen.findByRole("dialog", { name: "费用" });
    expect(getBillingMocks().fetchBillingSummary).toHaveBeenCalled();
    expect(await within(dialog).findByText("基础版")).toBeInTheDocument();
    expect(within(dialog).getByText("65 次")).toBeInTheDocument();
    expect(within(dialog).getByText("7 次")).toBeInTheDocument();
    expect(await within(dialog).findByText("标准数据查询")).toBeInTheDocument();
    expect(within(dialog).getAllByText("调研报告").length).toBeGreaterThan(0);
  });

  it("订单记录展示真实订单字段", async () => {
    renderAliceShell({ searchParams: "billing=1" });
    const dialog = await screen.findByRole("dialog", { name: "费用" });

    fireEvent.click(within(dialog).getByRole("button", { name: "订单记录" }));
    expect(await within(dialog).findByText("AL202608130001")).toBeInTheDocument();
    expect(within(dialog).getByText("¥159.00")).toBeInTheDocument();
    expect(within(dialog).getByText("待开通")).toBeInTheDocument();
    expect(within(dialog).getByText("续费")).toBeInTheDocument();
  });

  it("账本超过一页时展示加载更多并追加下一页", async () => {
    const pageOne = Array.from({ length: 10 }, (_, index) => ({
      id: `ledger-${index}`,
      entitlement_type: "data_query" as const,
      delta: -1,
      source: "web" as const,
      event_type: "consume" as const,
      task_kind: "standard_query" as const,
      created_at: `2026-08-${String(16 - index).padStart(2, "0")}T10:00:00Z`,
      balance: 65 - index,
    }));
    getBillingMocks().fetchEntitlementLedger
      .mockResolvedValueOnce({ items: pageOne, total: 12, page: 1, page_size: 10 })
      .mockResolvedValueOnce({
        items: [
          { id: "ledger-10", entitlement_type: "research_report", delta: -1, source: "web", event_type: "consume", task_kind: "research_report", created_at: "2026-08-05T10:00:00Z", balance: 7 },
          { id: "ledger-11", entitlement_type: "data_query", delta: 5, source: "web", event_type: "grant", task_kind: "plan_grant", created_at: "2026-08-04T10:00:00Z", balance: 55 },
        ],
        total: 12,
        page: 2,
        page_size: 10,
      });

    renderAliceShell({ searchParams: "billing=1" });
    const dialog = await screen.findByRole("dialog", { name: "费用" });

    fireEvent.click(await within(dialog).findByRole("button", { name: "加载更多" }));
    await waitFor(() => expect(getBillingMocks().fetchEntitlementLedger).toHaveBeenCalledTimes(2));
    expect(await within(dialog).findByText("套餐发放")).toBeInTheDocument();
  });

  it("选择套餐后创建订单并展示订单号与待付款状态", async () => {
    renderAliceShell({ searchParams: "billing=1" });
    const dialog = await screen.findByRole("dialog", { name: "费用" });

    fireEvent.click(await within(dialog).findByRole("button", { name: "续订" }));
    expect(await within(dialog).findByText("80 次数据查询")).toBeInTheDocument();
    expect(within(dialog).getByText("220 次数据查询")).toBeInTheDocument();
    expect(within(dialog).getAllByText("省 20%").length).toBeGreaterThan(0);

    fireEvent.click(within(dialog).getByRole("button", { name: "继续支付" }));
    const orderDialog = await screen.findByRole("dialog", { name: "订单已创建" });
    expect(getBillingMocks().createBillingOrder).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ order_type: "renew", plan_code: "paid_basic", billing_cycle: "monthly" }),
    );
    expect(within(orderDialog).getByText("SO20260817001")).toBeInTheDocument();
    expect(within(orderDialog).getByText("¥99.00")).toBeInTheDocument();
    expect(within(orderDialog).getByText("待付款")).toBeInTheDocument();
  });
});
