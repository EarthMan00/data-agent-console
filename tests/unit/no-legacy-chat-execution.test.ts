import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const PRODUCTION_ROOTS = ["app", "components", "lib"] as const;
const SOURCE_EXTENSIONS = /\.(?:ts|tsx|js|jsx)$/;
const FORBIDDEN_PATTERNS = [
  /\/send\/stream/g,
  /\bsendChatMessageStream\b/g,
  /streaming-session-manager/g,
  /\bpollAcceptedPlatformTaskInSession\b/g,
  /\bcancelToolOrchestration\b/g,
  /\bstreamAgentRound\b/g,
  /\bcreateSession\s*\(/g,
  /\breleaseSession\s*\(/g,
  /\bpostTaskTerminatedMessage\b/g,
  /session-chat-send/g,
  /session-live-status-poll/g,
  /session-task-execution-step-resolver/g,
  /tool-orchestrations/g,
  /task-execution-steps/g,
  /task-terminated/g,
] as const;

function productionSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return productionSourceFiles(path);
    }
    return SOURCE_EXTENSIONS.test(entry.name) ? [path] : [];
  });
}

describe("legacy chat execution removal", () => {
  it("contains no legacy chat execution path in production sources", () => {
    const matches = PRODUCTION_ROOTS.flatMap((root) =>
      productionSourceFiles(join(process.cwd(), root)).flatMap((file) => {
        const source = readFileSync(file, "utf8");
        return FORBIDDEN_PATTERNS.flatMap((pattern) => {
          pattern.lastIndex = 0;
          return [...source.matchAll(pattern)].map(
            (match) => `${relative(process.cwd(), file)}: ${match[0]}`,
          );
        });
      }),
    );

    expect(matches).toEqual([]);
  });
});
