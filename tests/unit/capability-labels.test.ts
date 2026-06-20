import { beforeEach, describe, expect, it } from "vitest";

import { resolveCapabilityLabelsForApi } from "@/lib/agent-runtime/report-helpers";
import { setDataSourceMenu } from "@/lib/home-capability-items";
import { mockDataSourceGroups } from "@/tests/fixtures/mock-data-source-menu";

describe("resolveCapabilityLabelsForApi", () => {
  beforeEach(() => {
    setDataSourceMenu(mockDataSourceGroups);
  });

  it("maps capability ids to LinkFox tool labels from the data source registry", () => {
    expect(resolveCapabilityLabelsForApi(["amazon"])).toEqual(["亚马逊前端搜索模拟"]);
  });

  it("keeps tool ids as labels when they are already LinkFox names", () => {
    expect(resolveCapabilityLabelsForApi(["eBay前端-商品列表"])).toEqual(["eBay前端-商品列表"]);
  });

  it("dedupes and skips scenarios", () => {
    expect(resolveCapabilityLabelsForApi(["scenarios", "amazon", "amazon"])).toEqual(["亚马逊前端搜索模拟"]);
  });
});
