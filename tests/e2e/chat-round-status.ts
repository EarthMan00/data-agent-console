export type RoundPollingClassification =
  | "terminal"
  | "pending"
  | "unexpected_waiting_input";

const TERMINAL_STATUS_VALUES = new Set([
  "SUCCEEDED",
  "PARTIAL_SUCCESS",
  "FAILED",
  "CANCELLED",
]);

export function classifyRoundPollingStatus(status: string): RoundPollingClassification {
  if (TERMINAL_STATUS_VALUES.has(status)) return "terminal";
  if (status === "WAITING_INPUT") return "unexpected_waiting_input";
  return "pending";
}
