import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  CHAT_ROUND_E2E_CASES,
  CHAT_ROUND_E2E_CATEGORY_COUNTS,
  type ChatRoundE2ECase,
  type ChatRoundE2ECategory,
} from "../e2e/chat-round-cases";
import { resolveRealRoundE2EConfig } from "../e2e/config";
import {
  assertManifestTerminalExpectations,
  isExpectedRoundTerminal,
} from "../e2e/chat-round-manifest";
import { formatPreflightFailure, RealPreflightError } from "../e2e/preflight";
import { classifyRoundPollingStatus } from "../e2e/chat-round-status";

const EXPECTED_CATEGORY_COUNTS: Readonly<Record<ChatRoundE2ECategory, number>> = {
  direct_answer: 10,
  multi_step: 10,
  no_external_collection: 5,
  schedule_create: 3,
  favorite_create: 3,
  explicit_stop: 3,
  partial_data_failure: 2,
  report_failure: 2,
  disconnect_refresh: 22,
};

const CHINESE_CHARACTER_RE = /[\u3400-\u9fff]/;
const PLACEHOLDER_RE = /(?:测试任务|case)\s*[0-9]+/i;
const EXPLICIT_FUTURE_DATE_RE = /20(?:3[0-9]|[4-9][0-9])年(?:0?[1-9]|1[0-2])月(?:0?[1-9]|[12][0-9]|3[01])日/;
const EXPLICIT_TIME_RE = /(?:[01]?[0-9]|2[0-3])(?:[:：][0-5][0-9]|点(?:[0-5][0-9]分)?)/;
const RECURRENCE_RE = /每天|每日|每周|每月|每年/;
const RUN_ONCE_RE = /一次性|仅执行一次/;
const PROHIBITED_COLLECTION_RE = /禁止.{0,20}(?:外部采集|联网采集|外部数据源)|不得.{0,20}(?:外部采集|联网采集|外部数据源)/;
const REAL_SELECTION_THEN_FAVORITE_RE = /(?:先|首先)[\s\S]{0,240}(?:真实|实际)[\s\S]{0,80}(?:选品|筛选|选择)[\s\S]{0,240}(?:再|然后|随后)[\s\S]{0,120}收藏/;
const AUTHORIZED_STORE_DEPENDENCY_RE = /已授权(?:店铺|站点|账号)/;
const REAL_TOOL_CATEGORIES = new Set<ChatRoundE2ECategory>([
  "multi_step",
  "schedule_create",
  "favorite_create",
  "explicit_stop",
  "partial_data_failure",
  "report_failure",
  "disconnect_refresh",
]);
const REPORT_FLOW_CATEGORIES = new Set<ChatRoundE2ECategory>([
  "multi_step",
  "explicit_stop",
  "disconnect_refresh",
]);

function casesIn(category: ChatRoundE2ECategory): ChatRoundE2ECase[] {
  return CHAT_ROUND_E2E_CASES.filter((item) => item.category === category);
}

describe("real chat Round E2E case matrix", () => {
  it("has exactly 60 cases and the exact accepted category counts", () => {
    expect(CHAT_ROUND_E2E_CASES).toHaveLength(60);
    expect(CHAT_ROUND_E2E_CATEGORY_COUNTS).toEqual(EXPECTED_CATEGORY_COUNTS);

    const observed = Object.fromEntries(
      Object.keys(EXPECTED_CATEGORY_COUNTS).map((category) => [
        category,
        casesIn(category as ChatRoundE2ECategory).length,
      ]),
    );
    expect(observed).toEqual(EXPECTED_CATEGORY_COUNTS);
  });

  it("uses stable unique case IDs and marker strings", () => {
    const ids = CHAT_ROUND_E2E_CASES.map((item) => item.caseId);
    const markers = CHAT_ROUND_E2E_CASES.map((item) => item.marker);

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(markers).size).toBe(markers.length);
    expect(ids.every((value) => /^[a-z0-9][a-z0-9_-]{0,63}$/.test(value))).toBe(true);
    expect(markers.every((value) => value.trim() === value && value.length >= 8)).toBe(true);
  });

  it("uses concrete, distinct Chinese prompts containing their own marker", () => {
    const prompts = CHAT_ROUND_E2E_CASES.map((item) => item.prompt);

    expect(new Set(prompts).size).toBe(prompts.length);
    for (const item of CHAT_ROUND_E2E_CASES) {
      expect(item.prompt).toContain(item.marker);
      expect(CHINESE_CHARACTER_RE.test(item.prompt)).toBe(true);
      expect(item.prompt.trim()).toBe(item.prompt);
      expect(item.prompt.length).toBeGreaterThan(24);
      expect(PLACEHOLDER_RE.test(item.prompt)).toBe(false);
    }
  });

  it("makes every schedule request explicitly future, timed, and one-time", () => {
    const scheduleCases = casesIn("schedule_create");
    expect(scheduleCases).toHaveLength(3);
    for (const item of scheduleCases) {
      expect(EXPLICIT_FUTURE_DATE_RE.test(item.prompt)).toBe(true);
      expect(EXPLICIT_TIME_RE.test(item.prompt)).toBe(true);
      expect(RUN_ONCE_RE.test(item.prompt)).toBe(true);
      expect(RECURRENCE_RE.test(item.prompt)).toBe(false);
      expect(item.expectedTerminal).toEqual(["SUCCEEDED"]);
    }
  });

  it("requires a real selection before each favorite is created", () => {
    const favoriteCases = casesIn("favorite_create");
    expect(favoriteCases).toHaveLength(3);
    for (const item of favoriteCases) {
      expect(REAL_SELECTION_THEN_FAVORITE_RE.test(item.prompt)).toBe(true);
      expect(item.expectedTerminal).toEqual(["SUCCEEDED"]);
    }
  });

  it("keeps real-tool cases executable for a user without an authorized store binding", () => {
    for (const item of CHAT_ROUND_E2E_CASES) {
      if (REAL_TOOL_CATEGORIES.has(item.category)) {
        expect(AUTHORIZED_STORE_DEPENDENCY_RE.test(item.prompt)).toBe(false);
      }
    }
  });

  it("forces report cases through real collection before report generation", () => {
    for (const item of CHAT_ROUND_E2E_CASES) {
      if (!REPORT_FLOW_CATEGORIES.has(item.category)) continue;
      expect(item.prompt).toMatch(/先(?:分别)?采集/);
      expect(item.prompt).toMatch(/商品的基础公开信息/);
      expect(item.prompt).toMatch(/商品的基础公开信息，再严格基于前一步的真实采集结果生成/);
      expect(item.prompt).toMatch(/完整HTML[^。]*，报告中/);
      expect(item.prompt).toMatch(/完整HTML/);
      expect(item.prompt).not.toMatch(/Amazon美国站公开关键词/);
    }
  });

  it("explicitly prohibits external collection in all five prohibited-collection prompts", () => {
    const prohibitedCases = casesIn("no_external_collection");
    expect(prohibitedCases).toHaveLength(5);
    for (const item of prohibitedCases) {
      expect(PROHIBITED_COLLECTION_RE.test(item.prompt)).toBe(true);
      expect(item.expectedTerminal).toEqual(["SUCCEEDED"]);
    }
  });

  it("declares only canonical boundary faults and never embeds returned data", () => {
    const failureCases = [
      ...casesIn("partial_data_failure"),
      ...casesIn("report_failure"),
    ];
    expect(failureCases).toHaveLength(4);

    for (const item of CHAT_ROUND_E2E_CASES) {
      if (item.category === "partial_data_failure") {
        expect(item.fault).toBe("fail_step:1:data");
        expect(item.prompt).toMatch(/(?:至少|不少于|严格分成)[\s\S]{0,20}(?:两个|2个)[\s\S]{0,20}步骤|第一步[\s\S]{0,200}第二步/);
        expect(item.prompt).toMatch(/第二步[\s\S]{0,100}(?:查询|筛选|读取)[\s\S]{0,80}(?:真实|实际)[\s\S]{0,40}数据/);
      } else if (item.category === "report_failure") {
        expect(item.fault).toBe("fail_step:2:report");
        expect(item.prompt).toMatch(
          /第一阶段[\s\S]{0,180}(?:真实|实际)[\s\S]{0,40}数据[\s\S]{0,180}第二阶段[\s\S]{0,180}分析[\s\S]{0,180}第三阶段[\s\S]{0,180}(?:报告|报表)/,
        );
      } else {
        expect(item.fault).toBeNull();
      }
    }

    for (const item of failureCases) {
      expect(item.expectedTerminal).toEqual(["PARTIAL_SUCCESS", "FAILED"]);
      expect(Object.keys(item).sort()).toEqual(
        ["caseId", "category", "expectedTerminal", "fault", "lifecycle", "marker", "prompt"].sort(),
      );
      expect(item).not.toHaveProperty("returnedData");
      expect(item).not.toHaveProperty("fakeResult");
      expect(item).not.toHaveProperty("result");
    }
  });

  it("covers every required disruption and assigns explicit Stop to the stop cases", () => {
    const lifecycles = new Set(CHAT_ROUND_E2E_CASES.map((item) => item.lifecycle));
    expect(lifecycles).toEqual(
      new Set(["none", "switch_session", "abort_sse", "reload_active", "reopen_page", "explicit_stop"]),
    );

    expect(casesIn("explicit_stop")).toHaveLength(3);
    for (const item of casesIn("explicit_stop")) {
      expect(item.lifecycle).toBe("explicit_stop");
      expect(item.expectedTerminal).toEqual(["CANCELLED"]);
      expect(item.fault).toBeNull();
    }

    for (const item of casesIn("disconnect_refresh")) {
      expect(["switch_session", "abort_sse", "reload_active", "reopen_page"]).toContain(item.lifecycle);
      expect(item.expectedTerminal).toEqual(["SUCCEEDED"]);
    }
  });
});

describe("real chat Round E2E configuration", () => {
  it("enables the real suite only for the exact inclusion flag", () => {
    expect(resolveRealRoundE2EConfig({ RUN_REAL_CHAT_ROUND_E2E: "1" }).realRoundE2E).toBe(true);
    for (const value of [undefined, "", " 1", "1 ", "true", "TRUE", "01"]) {
      expect(resolveRealRoundE2EConfig({ RUN_REAL_CHAT_ROUND_E2E: value }).realRoundE2E).toBe(false);
    }
  });

  it("uses a long default timeout and resolves manifest overrides absolutely", () => {
    const defaults = resolveRealRoundE2EConfig({});
    expect(defaults.roundTimeoutMs).toBe(1_200_000);
    expect(defaults.manifestPath).toBe(
      path.resolve("test-results", "chat-round-acceptance-manifest.json"),
    );

    const overridden = resolveRealRoundE2EConfig({
      PLAYWRIGHT_REAL_ROUND_TIMEOUT_MS: " 900001 ",
      PLAYWRIGHT_REAL_MANIFEST_PATH: " acceptance/rounds.json ",
    });
    expect(overridden.roundTimeoutMs).toBe(900_001);
    expect(overridden.manifestPath).toBe(path.resolve("acceptance/rounds.json"));
  });

  it("rejects non-positive timeout overrides without changing credential requirements", () => {
    for (const value of ["0", "-1", "1.5", "NaN", "900000ms"]) {
      expect(
        resolveRealRoundE2EConfig({ PLAYWRIGHT_REAL_ROUND_TIMEOUT_MS: value }).roundTimeoutMs,
      ).toBe(1_200_000);
    }
    expect(resolveRealRoundE2EConfig({})).toMatchObject({ username: "", password: "" });
  });
});

describe("real chat Round polling status", () => {
  it("fails fast when an expected-success case unexpectedly waits for input", () => {
    expect(classifyRoundPollingStatus("WAITING_INPUT")).toBe("unexpected_waiting_input");
    expect(classifyRoundPollingStatus("EXECUTING")).toBe("pending");
    expect(classifyRoundPollingStatus("SUCCEEDED")).toBe("terminal");
  });
});

describe("real chat Round manifest terminal acceptance", () => {
  it("accepts success, explicit cancellation, and either allowed partial-data terminal", () => {
    expect(isExpectedRoundTerminal("SUCCEEDED", ["SUCCEEDED"])).toBe(true);
    expect(isExpectedRoundTerminal("CANCELLED", ["CANCELLED"])).toBe(true);
    expect(
      isExpectedRoundTerminal("PARTIAL_SUCCESS", ["PARTIAL_SUCCESS", "FAILED"]),
    ).toBe(true);
    expect(isExpectedRoundTerminal("FAILED", ["PARTIAL_SUCCESS", "FAILED"])).toBe(true);

    expect(() =>
      assertManifestTerminalExpectations([
        { expected_terminal: ["SUCCEEDED"], observed_terminal: "SUCCEEDED" },
        { expected_terminal: ["CANCELLED"], observed_terminal: "CANCELLED" },
        {
          expected_terminal: ["PARTIAL_SUCCESS", "FAILED"],
          observed_terminal: "PARTIAL_SUCCESS",
        },
      ])
    ).not.toThrow();
  });

  it("rejects an unexpected terminal before it can enter an acceptance manifest", () => {
    expect(isExpectedRoundTerminal("FAILED", ["SUCCEEDED"])).toBe(false);
    expect(isExpectedRoundTerminal("SUCCEEDED", ["CANCELLED"])).toBe(false);
    expect(() =>
      assertManifestTerminalExpectations([
        { expected_terminal: ["SUCCEEDED"], observed_terminal: "FAILED" },
      ])
    ).toThrowError("manifest_terminal_mismatch");
  });
});

describe("real chat Round E2E preflight safety", () => {
  const context = { baseURL: "http://127.0.0.1:3000", preflightTimeoutMs: 15_000 };

  it("reports missing dedicated credentials without echoing error values", () => {
    const secretValue = "should-never-be-reported";
    const message = formatPreflightFailure(
      "realUserCredentials",
      new Error(secretValue),
      context,
    );
    expect(message).toContain("PLAYWRIGHT_REAL_USERNAME and PLAYWRIGHT_REAL_PASSWORD");
    expect(message).not.toContain(secretValue);
  });

  it("classifies real-user authentication without exposing credential values", () => {
    const secretValue = "credential-value-must-stay-private";
    const error = new RealPreflightError("authentication_rejected", 401);
    error.message = secretValue;
    const message = formatPreflightFailure("realUserLogin", error, context);
    expect(message).toContain("HTTP 401");
    expect(message).toContain("credential values are intentionally not reported");
    expect(message).not.toContain(secretValue);
  });
});
