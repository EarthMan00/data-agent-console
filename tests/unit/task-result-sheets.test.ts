import { describe, expect, it } from "vitest";

import type { PlatformTaskArtifactRef } from "@/lib/agent-events";
import {
  artifactDisplayLabelForUi,
  artifactDownloadNameForUi,
  projectTaskArtifactForUi,
  projectTaskArtifactsForUi,
} from "@/lib/platform-task-artifacts";
import { buildTaskResultSheets } from "@/lib/task-result-sheets";

describe("buildTaskResultSheets public labels", () => {
  it("pairs anonymous Durable Round CSV/JSON artifacts and names them from the step label", () => {
    const csvId = "11111111-1111-4111-8111-111111111111";
    const jsonId = "22222222-2222-4222-8222-222222222222";
    const displayLabel = "在亚马逊美国站搜索关键词 cup，获取排名前三的爆品信息";
    const projected = projectTaskArtifactsForUi(
      [
        {
          artifact_id: csvId,
          artifact_type: "csv",
          original_name: `csv-1-${csvId}.csv`,
          download_api: `/api/chat/rounds/round-1/artifacts/${csvId}`,
        },
        {
          artifact_id: jsonId,
          artifact_type: "json",
          original_name: `json-2-${jsonId}.json`,
          download_api: `/api/chat/rounds/round-1/artifacts/${jsonId}`,
        },
      ],
      { displayLabel },
    );

    expect(projected.map((artifact) => artifact.original_name)).toEqual([
      `${displayLabel}.csv`,
      `${displayLabel}.json`,
    ]);
    const [sheet] = buildTaskResultSheets(projected);
    expect(sheet).toMatchObject({
      label: displayLabel,
      csv: { artifact_id: csvId },
      json: { artifact_id: jsonId },
    });
  });

  it("keeps separate names for multiple anonymous result pairs", () => {
    const ids = [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333333",
      "44444444-4444-4444-8444-444444444444",
    ];
    const projected = projectTaskArtifactsForUi(
      [
        {
          artifact_id: ids[0]!,
          artifact_type: "csv",
          original_name: `csv-1-${ids[0]}.csv`,
          download_api: "/csv-1",
        },
        {
          artifact_id: ids[1]!,
          artifact_type: "json",
          original_name: `json-2-${ids[1]}.json`,
          download_api: "/json-1",
        },
        {
          artifact_id: ids[2]!,
          artifact_type: "csv",
          original_name: `csv-3-${ids[2]}.csv`,
          download_api: "/csv-2",
        },
        {
          artifact_id: ids[3]!,
          artifact_type: "json",
          original_name: `json-4-${ids[3]}.json`,
          download_api: "/json-2",
        },
      ],
      { displayLabel: "亚马逊商品结果" },
    );

    expect(projected.map((artifact) => artifact.original_name)).toEqual([
      "亚马逊商品结果 (1).csv",
      "亚马逊商品结果 (1).json",
      "亚马逊商品结果 (2).csv",
      "亚马逊商品结果 (2).json",
    ]);
    expect(buildTaskResultSheets(projected).map((sheet) => sheet.label)).toEqual([
      "亚马逊商品结果 (2)",
      "亚马逊商品结果 (1)",
    ]);
  });

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
