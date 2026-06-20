import { describe, expect, it } from "vitest";

import { resolveCapabilityLabelsForApi } from "@/lib/agent-runtime/report-helpers";

describe("resolveCapabilityLabelsForApi", () => {
  it("maps static capability ids to LinkFox tool labels", () => {
    expect(resolveCapabilityLabelsForApi(["ebay"])).toEqual(["eBay供需结构验证"]);
  });

  it("keeps dynamic prompt-card capability ids as labels", () => {
    expect(resolveCapabilityLabelsForApi(["eBay前端-商品列表"])).toEqual(["eBay前端-商品列表"]);
  });

  it("dedupes and skips scenarios", () => {
    expect(resolveCapabilityLabelsForApi(["scenarios", "ebay", "ebay"])).toEqual(["eBay供需结构验证"]);
  });
});
