export type FaultOutcomeStep = {
  stepIndex: number;
  status: string;
  taskId: string | null;
  errorCode: string | null;
};

export type DeclaredFaultOutcome =
  | { kind: "none" }
  | { kind: "injected" }
  | { kind: "externally_preempted" }
  | {
      kind: "invalid";
      reason: "shape" | "not_observed" | "prior_result_missing";
    };

const EXTERNAL_FAILURE_CODES = new Set([
  "DATA_COLLECTION_FAILED",
  "REPORT_GENERATION_FAILED",
]);

export function classifyDeclaredFaultOutcome(
  fault: string | null,
  steps: readonly FaultOutcomeStep[],
): DeclaredFaultOutcome {
  if (fault === null) return { kind: "none" };
  const match = /^fail_boundary:last:(data|report)$/.exec(fault);
  if (!match) return { kind: "invalid", reason: "shape" };

  const expectedInjectedError = match[1] === "data"
    ? "DATA_COLLECTION_FAILED"
    : "REPORT_GENERATION_FAILED";
  const injected = steps.filter(
    (step) =>
      step.status === "FAILED" &&
      step.errorCode === expectedInjectedError &&
      step.taskId === null,
  );
  if (injected.length === 1) {
    const target = injected[0];
    const retainedPriorResult = steps.some(
      (step) =>
        step.stepIndex < target.stepIndex &&
        step.status === "SUCCESS" &&
        step.taskId !== null,
    );
    return retainedPriorResult
      ? { kind: "injected" }
      : { kind: "invalid", reason: "prior_result_missing" };
  }
  if (injected.length > 1) {
    return { kind: "invalid", reason: "not_observed" };
  }

  const failed = steps.filter((step) => step.status === "FAILED");
  if (failed.length !== 1) {
    return { kind: "invalid", reason: "not_observed" };
  }
  const externalFailure = failed[0];
  const allowedFailureCodes = match[1] === "data"
    ? new Set(["DATA_COLLECTION_FAILED"])
    : EXTERNAL_FAILURE_CODES;
  if (
    externalFailure.taskId === null ||
    externalFailure.errorCode === null ||
    !allowedFailureCodes.has(externalFailure.errorCode)
  ) {
    return { kind: "invalid", reason: "not_observed" };
  }

  const laterSteps = steps.filter(
    (step) => step.stepIndex > externalFailure.stepIndex,
  );
  if (
    laterSteps.length === 0 ||
    laterSteps.some(
      (step) =>
        step.status !== "SKIPPED" ||
        step.taskId !== null ||
        step.errorCode !== null,
    )
  ) {
    return { kind: "invalid", reason: "not_observed" };
  }
  return { kind: "externally_preempted" };
}
