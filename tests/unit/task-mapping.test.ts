import { describe, expect, it } from "vitest";

import { mapServerOrchestrationStepStatus } from "@/lib/agent-runtime/task-mapping";

describe("mapServerOrchestrationStepStatus", () => {
  it("maps AWAITING_INPUT to awaiting_input (not running)", () => {
    expect(mapServerOrchestrationStepStatus("AWAITING_INPUT")).toBe("awaiting_input");
  });

  it("maps RUNNING to running", () => {
    expect(mapServerOrchestrationStepStatus("RUNNING")).toBe("running");
  });
});
