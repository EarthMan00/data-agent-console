"use client";

import { useCallback, useEffect, useState } from "react";
import { useOptionalPlatformAgent } from "@/components/platform-agent-provider";
import { Button } from "@/components/ui/button";
import {
  adminConfirmOrderPayment,
  adminFulfillOrder,
  adminListOrders,
  AgentApiError,
  parseFastApiDetail,
} from "@/lib/agent-api/client";
import type { AdminOrder } from "@/lib/agent-api/types";

const STATUS_META: Record<string, { label: string; className: string }> = {
  created: { label: "待付款", className: "bg-warning-bg text-warning" },
  paid: { label: "已收款待开通", className: "bg-info-bg text-info" },
  fulfilled: { label: "已开通", className: "bg-success-bg text-success" },
  closed: { label: "已关闭", className: "bg-bg-subtle text-text-tertiary" },
};

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? {
    label: status,
    className: "bg-bg-subtle text-text-tertiary",
  };
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${meta.className}`}
    >
      {meta.label}
    </span>
  );
}

function fmtDate(iso: string | null): string {
  if (!iso) return "-";
  try {
    const d = new Date(iso);
    return d.toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

const ORDER_TYPE_LABELS: Record<string, string> = {
  new: "新购",
  renew: "续费",
  upgrade: "升级",
};

const CYCLE_LABELS: Record<string, string> = {
  weekly: "周付",
  monthly: "月付",
  yearly: "年付",
};

function formatMoney(cents: number): string {
  return `¥${(cents / 100).toFixed(2)}`;
}

export function AdminOrdersWorkspace() {
  const platformAgent = useOptionalPlatformAgent();
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!platformAgent?.auth) return;
    setLoading(true);
    setNotice("");
    try {
      await platformAgent.withFreshToken(async (token) => {
        const res = await adminListOrders(token);
        setOrders(res.orders ?? []);
      });
    } catch (e) {
      setNotice(
        e instanceof AgentApiError
          ? parseFastApiDetail(e.body) ?? e.message
          : String(e),
      );
    } finally {
      setLoading(false);
    }
  }, [platformAgent]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleConfirmPayment = async (order: AdminOrder) => {
    if (!platformAgent?.auth) return;
    setBusyId(order.id);
    setNotice("");
    try {
      await platformAgent.withFreshToken(async (token) => {
        const res = await adminConfirmOrderPayment(token, order.id);
        setOrders((prev) =>
          prev.map((o) => (o.id === order.id ? res.order : o)),
        );
      });
    } catch (e) {
      setNotice(
        e instanceof AgentApiError
          ? parseFastApiDetail(e.body) ?? e.message
          : String(e),
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleFulfill = async (order: AdminOrder) => {
    if (!platformAgent?.auth) return;
    setBusyId(order.id);
    setNotice("");
    try {
      await platformAgent.withFreshToken(async (token) => {
        const res = await adminFulfillOrder(token, order.id);
        setOrders((prev) =>
          prev.map((o) => (o.id === order.id ? res.order : o)),
        );
      });
    } catch (e) {
      setNotice(
        e instanceof AgentApiError
          ? parseFastApiDetail(e.body) ?? e.message
          : String(e),
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-title-3 font-semibold leading-8 text-foreground">
            订单管理
          </h1>
          <p className="mt-2 text-sm leading-6 text-text-tertiary">
            查看订单并处理收款与套餐开通。
          </p>
        </div>
      </div>

      {notice ? (
        <p className="mt-4 text-sm text-danger">{notice}</p>
      ) : null}

      <div className="mt-4 overflow-hidden rounded-popover border border-border bg-bg-surface shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-fill-hover text-xs font-medium uppercase tracking-wide text-text-tertiary">
            <tr>
              <th className="px-4 py-3">订单号</th>
              <th className="px-4 py-3">用户</th>
              <th className="px-4 py-3">类型</th>
              <th className="px-4 py-3">套餐</th>
              <th className="px-4 py-3">周期</th>
              <th className="px-4 py-3">金额</th>
              <th className="px-4 py-3">状态</th>
              <th className="px-4 py-3">创建时间</th>
              <th className="px-4 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={9}
                  className="px-4 py-8 text-center text-text-disabled"
                >
                  加载中…
                </td>
              </tr>
            ) : orders.length === 0 ? (
              <tr>
                <td
                  colSpan={9}
                  className="px-4 py-8 text-center text-text-disabled"
                >
                  暂无订单
                </td>
              </tr>
            ) : (
              orders.map((order) => {
                const snapshot = order.plan_snapshot as Record<string, unknown>;
                const planName =
                  typeof snapshot.name === "string" ? snapshot.name : order.order_no;
                return (
                  <tr
                    key={order.id}
                    className="border-b border-border-subtle last:border-0"
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-text-tertiary">
                      {order.order_no}
                    </td>
                    <td className="max-w-24 truncate px-4 py-3 font-mono text-xs text-text-tertiary">
                      {order.user_id ?? "-"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {ORDER_TYPE_LABELS[order.order_type] ?? order.order_type}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">{planName}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {CYCLE_LABELS[order.billing_cycle] ?? order.billing_cycle}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {formatMoney(order.amount_cents)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <StatusBadge status={order.status} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-text-tertiary">
                      {fmtDate(order.created_at)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {order.status === "created" ? (
                        <Button
                          className="h-8 rounded-control px-3 text-xs"
                          disabled={busyId === order.id}
                          onClick={() => void handleConfirmPayment(order)}
                        >
                          确认收款
                        </Button>
                      ) : null}
                      {order.status === "paid" ? (
                        <Button
                          className="ml-2 h-8 rounded-control px-3 text-xs"
                          disabled={busyId === order.id}
                          onClick={() => void handleFulfill(order)}
                        >
                          开通
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}