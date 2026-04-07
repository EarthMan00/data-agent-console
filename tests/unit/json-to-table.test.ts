import { describe, expect, it } from "vitest";

import {
  filterArtifactsForTaskResultPanel,
  hasTabularTaskResultFiles,
  pickPrimaryCsvArtifact,
  pickPrimaryTaskDataArtifact,
} from "@/lib/platform-task-artifacts";
import { parseJsonToTableData } from "@/lib/json-to-table";

describe("parseJsonToTableData", () => {
  it("parses array of objects into columns and rows", () => {
    const t = parseJsonToTableData(`[{"a":1,"b":"x"},{"a":2,"b":"y"}]`);
    expect(t?.columns).toEqual(["a", "b"]);
    expect(t?.rows).toEqual([
      ["1", "x"],
      ["2", "y"],
    ]);
  });

  it("parses object into key-value rows", () => {
    const t = parseJsonToTableData(`{"foo":1,"bar":true}`);
    expect(t?.columns).toEqual(["键", "值"]);
    expect(t?.rows).toEqual([
      ["foo", "1"],
      ["bar", "true"],
    ]);
  });
});

describe("pickPrimaryTaskDataArtifact", () => {
  it("prefers markdown over csv", () => {
    const p = pickPrimaryTaskDataArtifact([
      {
        artifact_id: "c",
        artifact_type: "csv",
        original_name: "out.csv",
        download_api: "/c",
      },
      {
        artifact_id: "m",
        artifact_type: "md",
        original_name: "report.md",
        download_api: "/m",
      },
    ]);
    expect(p?.original_name).toBe("report.md");
  });

  it("prefers csv over json", () => {
    const p = pickPrimaryTaskDataArtifact([
      {
        artifact_id: "j",
        artifact_type: "file",
        original_name: "a.json",
        download_api: "/j",
      },
      {
        artifact_id: "c",
        artifact_type: "csv",
        original_name: "out.csv",
        download_api: "/c",
      },
    ]);
    expect(p?.original_name).toBe("out.csv");
  });

  it("falls back to json when no csv", () => {
    const p = pickPrimaryTaskDataArtifact([
      {
        artifact_id: "j",
        artifact_type: "file",
        original_name: "result.json",
        download_api: "/j",
      },
    ]);
    expect(p?.original_name).toBe("result.json");
  });

  it("ignores linkfox_result.txt when picking", () => {
    const p = pickPrimaryTaskDataArtifact([
      {
        artifact_id: "1",
        artifact_type: "log",
        original_name: "linkfox_result.txt",
        download_api: "/a",
      },
      {
        artifact_id: "2",
        artifact_type: "file",
        original_name: "data.json",
        download_api: "/b",
      },
    ]);
    expect(p?.original_name).toBe("data.json");
  });
});

describe("pickPrimaryCsvArtifact", () => {
  it("returns first csv after filtering linkfox", () => {
    const a = pickPrimaryCsvArtifact([
      {
        artifact_id: "1",
        artifact_type: "log",
        original_name: "linkfox_result.txt",
        download_api: "/a",
      },
      {
        artifact_id: "2",
        artifact_type: "csv",
        original_name: "out.csv",
        download_api: "/b",
      },
    ]);
    expect(a?.original_name).toBe("out.csv");
  });

  it("returns null when primary data file is json only", () => {
    const a = pickPrimaryCsvArtifact([
      {
        artifact_id: "j",
        artifact_type: "file",
        original_name: "a.json",
        download_api: "/j",
      },
    ]);
    expect(a).toBeNull();
  });
});

describe("filterArtifactsForTaskResultPanel", () => {
  it("removes linkfox_result.txt", () => {
    const out = filterArtifactsForTaskResultPanel([
      {
        artifact_id: "1",
        artifact_type: "file",
        original_name: "linkfox_result.txt",
        download_api: "/a",
      },
      {
        artifact_id: "2",
        artifact_type: "file",
        original_name: "data.csv",
        download_api: "/b",
      },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.original_name).toBe("data.csv");
  });

  it("keeps chatexcel_result.txt for ChatExcel preview", () => {
    const out = filterArtifactsForTaskResultPanel([
      {
        artifact_id: "1",
        artifact_type: "file",
        original_name: "chatexcel_result.txt",
        download_api: "/a",
      },
      {
        artifact_id: "2",
        artifact_type: "file",
        original_name: "data.csv",
        download_api: "/b",
      },
    ]);
    expect(out).toHaveLength(2);
  });
});

describe("hasTabularTaskResultFiles", () => {
  it("is true when only chatexcel_result.txt exists", () => {
    expect(
      hasTabularTaskResultFiles([
        {
          artifact_id: "x",
          artifact_type: "log",
          original_name: "chatexcel_result.txt",
          download_api: "/x",
        },
      ]),
    ).toBe(true);
  });

  it("is true when only linkfox_result.txt exists", () => {
    expect(
      hasTabularTaskResultFiles([
        {
          artifact_id: "l",
          artifact_type: "log",
          original_name: "linkfox_result.txt",
          download_api: "/l",
        },
      ]),
    ).toBe(true);
  });
});

describe("pickPrimaryTaskDataArtifact chatexcel fallback", () => {
  it("picks chatexcel_result when no csv/json", () => {
    const p = pickPrimaryTaskDataArtifact([
      {
        artifact_id: "x",
        artifact_type: "log",
        original_name: "chatexcel_result.txt",
        download_api: "/x",
      },
    ]);
    expect(p?.original_name).toBe("chatexcel_result.txt");
  });

  it("prefers csv over chatexcel_result", () => {
    const p = pickPrimaryTaskDataArtifact([
      {
        artifact_id: "c",
        artifact_type: "csv",
        original_name: "merged.csv",
        download_api: "/c",
      },
      {
        artifact_id: "x",
        artifact_type: "log",
        original_name: "chatexcel_result.txt",
        download_api: "/x",
      },
    ]);
    expect(p?.original_name).toBe("merged.csv");
  });
});
