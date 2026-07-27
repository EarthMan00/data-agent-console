import { describe, expect, it } from "vitest";

import type { PlatformTaskArtifactRef } from "@/lib/agent-events";
import {
  artifactDisplayLabelForUi,
  artifactDownloadNameForUi,
  projectTaskArtifactForUi,
} from "@/lib/platform-task-artifacts";
import { buildTaskResultSheets } from "@/lib/task-result-sheets";

describe("buildTaskResultSheets public labels", () => {
  it("sanitizes a fuzzy CSV/JSON pair stem before using it as a tab label", () => {
    const artifacts: PlatformTaskArtifactRef[] = [
      {
        artifact_id: "csv",
        artifact_type: "csv",
        original_name:
          "C:\\Users\\svc\\managed\\20260727-provider=raw-model operation=commerce_data.collect credential=sk-secret.csv",
        download_api: "/api/chat-rounds/round-1/artifacts/csv/download",
      },
      {
        artifact_id: "json",
        artifact_type: "json",
        original_name:
          "/var/lib/agent/result_2_provider=raw-model operation=commerce_data.collect credential=sk-secret.json",
        download_api: "/api/chat-rounds/round-1/artifacts/json/download",
      },
    ];

    const [sheet] = buildTaskResultSheets(artifacts);
    expect(sheet?.csv?.artifact_id).toBe("csv");
    expect(sheet?.json?.artifact_id).toBe("json");
    expect(sheet?.label).toBe("结果");
    for (const forbidden of [
      "provider",
      "raw-model",
      "operation",
      "commerce_data.collect",
      "credential",
      "sk-secret",
      "C:\\Users\\svc",
      "/var/lib/agent",
    ]) {
      expect(sheet?.label).not.toContain(forbidden);
    }
  });

  it.each([
    "tool=run_linkfox_task.csv",
    "capability=commerce_data.collect.csv",
    "operation=seller_search.csv",
    "raw_args=user_payload.csv",
    "provider=raw-model.csv",
    "credential=managed.csv",
    "token=abc123.csv",
    "secret=abc123.csv",
  ])("replaces forbidden artifact assignments in %s", (name) => {
    expect(artifactDisplayLabelForUi(name)).toBe("结果");
    expect(artifactDownloadNameForUi(name, "csv")).toBe("结果.csv");
  });

  it("keeps a normal basename and extension while discarding paths and unknown raw fields", () => {
    const artifact = {
      artifact_id: "csv",
      artifact_type: "csv",
      original_name: "C:\\Users\\svc\\managed\\销售趋势.csv",
      download_api: "/api/chat-rounds/round-1/artifacts/csv/download",
      raw_args: { managed_path: "C:\\secret" },
      provider: "internal-provider",
    } as unknown as PlatformTaskArtifactRef;

    expect(projectTaskArtifactForUi(artifact)).toEqual({
      artifact_id: "csv",
      artifact_type: "csv",
      original_name: "销售趋势.csv",
      download_api: "/api/chat-rounds/round-1/artifacts/csv/download",
    });
  });
});
