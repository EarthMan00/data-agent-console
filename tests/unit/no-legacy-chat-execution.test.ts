import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const PRODUCTION_ROOTS = ["app", "components", "lib"] as const;
const SOURCE_EXTENSIONS = /\.(?:ts|tsx|js|jsx)$/;
const FORBIDDEN_PRODUCTION_PATHS = [
  "components/agent-workspace/platform-step-views.tsx",
  "components/agent-workspace/task-split-section.tsx",
  "components/execution-steps-monitor.tsx",
  "lib/humanize-step-label.ts",
  "lib/mock/store.ts",
  "lib/orchestration-failure-message.ts",
  "lib/parse-decomposition-labels.ts",
  "lib/round-attachment-files.ts",
  "lib/session-clarification-flow.ts",
  "lib/split-reveal-gate.ts",
] as const;
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
  /\bapplyRuntimeEvent\b/g,
  /\bAgentRoundRuntimeEvent\b/g,
  /\bround_ui_layout\b/g,
  /\btask_execution_steps_init\b/g,
  /["']tool_orchestration["']/g,
  /\borchestration_resume\b/g,
  /\bpost_task_guidance\b/g,
  /\balice_clarification_(?:requested|cleared)\b/g,
  /\bstartPlatformTask\b/g,
  /\bqueueFollowupRound\b/g,
  /\bappendUserMessageOnRound\b/g,
  /\buseDemoState\b/g,
  /\bdemoActions\b/g,
  /\bAliceClarificationBubble\b/g,
  /\baliceClarificationBodyForDisplay\b/g,
  /\bpickPrimaryCsvArtifact\b/g,
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
    const productionFiles = PRODUCTION_ROOTS.flatMap((root) =>
      productionSourceFiles(join(process.cwd(), root)),
    );
    const matches = productionFiles.flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return FORBIDDEN_PATTERNS.flatMap((pattern) => {
        pattern.lastIndex = 0;
        return [...source.matchAll(pattern)].map(
          (match) => `${relative(process.cwd(), file)}: ${match[0]}`,
        );
      });
    });
    const productionPaths = new Set(
      productionFiles.map((file) => relative(process.cwd(), file).replaceAll("\\", "/")),
    );
    matches.push(
      ...FORBIDDEN_PRODUCTION_PATHS.filter((path) => productionPaths.has(path)).map(
        (path) => `${path}: forbidden legacy module`,
      ),
    );

    expect(matches).toEqual([]);
  });
});
