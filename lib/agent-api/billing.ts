import { getAgentHttpApiBase } from "@/lib/agent-api/config";

export type BillingSummary = {
  has_active_cycle: boolean;
  plan_code: string | null;
  plan_name: string | null;
  cycle_status: string | null;
  kind: string | null;
  starts_at: string | null;
  ends_at: string | null;
  data_query_remaining: number;
  research_report_remaining: number;
};

export type LedgerItem = {
  id: string;
  entitlement_type: "data_query" | "research_report";
  delta: number;
  source: "web" | "api";
  event_type: "grant" | "reserve" | "consume" | "release" | "expire" | "adjust";
  task_kind: string | null;
  created_at: string;
};

export type BillingOrder = {
  id: string;
  order_no: string;
  order_type: "new" | "renew" | "upgrade";
  plan_snapshot: { code: string; name: string; sale_price_cents: number };
  amount_cents: number;
  billing_cycle: string;
  status: "created" | "paid" | "fulfilled" | "closed";
  created_at: string;
};

export type UserPlanSpec = {
  code: string;
  name: string;
  billing_cycle: string;
  catalog_price_cents: number;
  sale_price_cents: number;
  campaign_label: string | null;
  data_query_quota: number;
  research_report_quota: number;
};

function billingUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${getAgentHttpApiBase()}${normalized}`;
}

async function billingFetch<T>(
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(billingUrl(path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`billing ${path} failed: ${response.status} ${body}`);
  }
  return response.json() as Promise<T>;
}

export function fetchBillingSummary(
  accessToken: string,
): Promise<BillingSummary> {
  return billingFetch<BillingSummary>(accessToken, "/api/billing/summary");
}

export function fetchEntitlementLedger(
  accessToken: string,
  params: {
    page: number;
    page_size?: number;
    entitlement_type?: string;
  },
): Promise<{
  items: LedgerItem[];
  total: number;
  page: number;
  page_size: number;
}> {
  const qs = new URLSearchParams({
    page: String(params.page),
    page_size: String(params.page_size ?? 10),
  });
  if (params.entitlement_type) qs.set("entitlement_type", params.entitlement_type);
  return billingFetch(accessToken, `/api/billing/ledger?${qs.toString()}`);
}

export function fetchBillingOrders(
  accessToken: string,
): Promise<{ orders: BillingOrder[] }> {
  return billingFetch(accessToken, "/api/billing/orders");
}

export function fetchUserPlans(
  accessToken: string,
): Promise<{ plans: UserPlanSpec[] }> {
  return billingFetch(accessToken, "/api/billing/plans");
}

export function createBillingOrder(
  accessToken: string,
  payload: {
    order_type: "new" | "renew" | "upgrade";
    plan_code: string;
    billing_cycle: string;
    idempotency_key: string;
  },
): Promise<{ order: BillingOrder }> {
  return billingFetch(accessToken, "/api/billing/orders", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}