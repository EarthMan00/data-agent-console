import { homeCapabilityItems } from "@/lib/home-capability-items";

export const API_BASE = process.env.NEXT_PUBLIC_AGENT_API_BASE_URL?.replace(/\/$/, "");
export const capabilityLabelMap = new Map(homeCapabilityItems.map((item) => [item.id, item.label]));
