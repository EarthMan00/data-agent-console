import type { ChatRoundTerminal } from "./chat-round-cases";

type ManifestTerminalExpectation = {
  expected_terminal?: unknown;
  observed_terminal?: unknown;
};

export function isExpectedRoundTerminal(
  observed: unknown,
  expected: unknown,
): observed is ChatRoundTerminal {
  return (
    typeof observed === "string" &&
    Array.isArray(expected) &&
    expected.some((candidate) => candidate === observed)
  );
}

export function assertManifestTerminalExpectations(
  entries: readonly ManifestTerminalExpectation[],
): void {
  for (const entry of entries) {
    if (!isExpectedRoundTerminal(entry.observed_terminal, entry.expected_terminal)) {
      throw new Error("manifest_terminal_mismatch");
    }
  }
}
