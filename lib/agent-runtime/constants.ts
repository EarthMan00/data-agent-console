import { homeCapabilityItems } from "@/lib/mock/demo-data";

export const RUNTIME_MODE = process.env.NEXT_PUBLIC_AGENT_RUNTIME_MODE === "mock" ? "mock" : "api";
export const API_BASE = process.env.NEXT_PUBLIC_AGENT_API_BASE_URL?.replace(/\/$/, "");
export const capabilityLabelMap = new Map(homeCapabilityItems.map((item) => [item.id, item.label]));
