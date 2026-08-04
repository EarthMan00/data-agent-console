export type ChatRoundE2ECategory =
  | "direct_answer"
  | "multi_step"
  | "no_external_collection"
  | "schedule_create"
  | "favorite_create"
  | "explicit_stop"
  | "partial_data_failure"
  | "report_failure"
  | "disconnect_refresh";

export type ChatRoundE2ELifecycle =
  | "none"
  | "switch_session"
  | "abort_sse"
  | "reload_active"
  | "reopen_page"
  | "explicit_stop";

export type ChatRoundTerminal = "SUCCEEDED" | "PARTIAL_SUCCESS" | "FAILED" | "CANCELLED";
export type ChatRoundCanonicalFault =
  | "fail_boundary:last:data"
  | "fail_boundary:last:report";

export type ChatRoundE2ECase = {
  caseId: string;
  category: ChatRoundE2ECategory;
  prompt: string;
  marker: string;
  expectedTerminal: readonly ChatRoundTerminal[];
  lifecycle: ChatRoundE2ELifecycle;
  fault: ChatRoundCanonicalFault | null;
};

type CaseSeed = {
  caseId: string;
  prompt: string;
  lifecycle?: ChatRoundE2ELifecycle;
  fault?: ChatRoundCanonicalFault;
};

const SUCCESS = ["SUCCEEDED"] as const;
const STOPPED = ["CANCELLED"] as const;
const BOUNDARY_FAILURE = ["PARTIAL_SUCCESS", "FAILED"] as const;

function markerFor(caseId: string): string {
  return `【轮次耐久-${caseId}】`;
}

function publicMarketPrompt(prompt: string): string {
  return prompt
    .replaceAll("我已授权美国站店铺", "Amazon美国站公开市场")
    .replaceAll("我已授权欧洲各站点", "Amazon欧洲公开站点")
    .replaceAll("我已授权多个站点", "Amazon美国站和德国站公开市场")
    .replaceAll("我已授权美国站", "Amazon美国站公开市场")
    .replaceAll("我已授权欧洲站", "Amazon欧洲公开站点")
    .replaceAll("我已授权店铺", "Amazon美国站公开市场");
}

function executableReportPrompt(
  category: ChatRoundE2ECategory,
  prompt: string,
): string {
  const publicPrompt = publicMarketPrompt(prompt);
  if (
    category !== "multi_step" &&
    category !== "explicit_stop" &&
    category !== "disconnect_refresh"
  ) {
    return publicPrompt;
  }
  const collectionLead = category === "explicit_stop" ? "请先分别采集" : "请先采集";
  return publicPrompt
    .replaceAll("Amazon美国站公开关键词", "美国站关键词 ")
    .replace(/^请查询/, collectionLead)
    .replace(/的前(\d+)个(?:真实|实际)商品/, "当前前$1个商品的基础公开信息")
    .replace(/各前(\d+)个(?:真实|实际)商品/, "当前各前$1个商品的基础公开信息")
    .replace(
      /，?并生成(?=[^。]*完整HTML)/,
      "，再严格基于前一步的真实采集结果生成",
    )
    .replace(
      /^(请先(?:分别)?采集.+商品的基础公开信息)，(.+)，再严格基于前一步的真实采集结果生成(.+)。$/,
      "$1，再严格基于前一步的真实采集结果生成$3，报告中$2。",
    );
}

function buildCases(
  category: ChatRoundE2ECategory,
  seeds: readonly CaseSeed[],
): ChatRoundE2ECase[] {
  return seeds.map((seed) => {
    const marker = markerFor(seed.caseId);
    const expectedTerminal = category === "explicit_stop"
      ? STOPPED
      : category === "partial_data_failure" || category === "report_failure"
        ? BOUNDARY_FAILURE
        : SUCCESS;
    return {
      caseId: seed.caseId,
      category,
      prompt: `${executableReportPrompt(category, seed.prompt)} ${marker}`,
      marker,
      expectedTerminal,
      lifecycle: seed.lifecycle ?? "none",
      fault: seed.fault ?? null,
    };
  });
}

const directAnswerCases = buildCases("direct_answer", [
  {
    caseId: "direct-answer-01",
    prompt: "请直接解释跨境电商中毛利率与贡献毛利率的区别，并给出适合日常经营复盘的使用场景。",
  },
  {
    caseId: "direct-answer-02",
    prompt: "请直接说明库存周转天数升高通常意味着什么，并列出运营人员应依次检查的三个方面。",
  },
  {
    caseId: "direct-answer-03",
    prompt: "请直接比较广告指标ACoS与TACoS的含义，并说明新品期和成熟期应如何解读二者变化。",
  },
  {
    caseId: "direct-answer-04",
    prompt: "请直接给出跨境卖家管理汇率波动风险的通用框架，包含定价、结算和现金流三个维度。",
  },
  {
    caseId: "direct-answer-05",
    prompt: "请直接解释欧盟VAT与IOSS在跨境零售中的适用边界，并用简洁示例说明两者差异。",
  },
  {
    caseId: "direct-answer-06",
    prompt: "请直接分析商品退货率持续上升的常见原因，并给出从详情页、质量和履约角度排查的顺序。",
  },
  {
    caseId: "direct-answer-07",
    prompt: "请直接说明如何识别跨境商品的季节性，并解释同比、环比和移动平均各自适合回答的问题。",
  },
  {
    caseId: "direct-answer-08",
    prompt: "请直接解释用户分群中的复购率与留存率差异，并给出一个按首购月份观察的分析思路。",
  },
  {
    caseId: "direct-answer-09",
    prompt: "请直接说明价格弹性在电商定价中的意义，并列出做促销前需要控制的关键干扰因素。",
  },
  {
    caseId: "direct-answer-10",
    prompt: "请直接给出一份跨境销售数据质量检查清单，覆盖缺失、重复、币种、时区和异常值。",
  },
]);

const multiStepCases = buildCases("multi_step", [
  {
    caseId: "multi-step-01",
    prompt: "请查询Amazon美国站公开关键词wireless earbuds的前5个真实商品，比较售价、评分与评论数，并生成一份包含结论、图表与明细的完整HTML报告。",
  },
  {
    caseId: "multi-step-02",
    prompt: "请查询Amazon美国站公开关键词portable charger的前8个真实商品，比较价格、评分与评论热度，给出选品排序，并生成完整HTML报告。",
  },
  {
    caseId: "multi-step-03",
    prompt: "请查询Amazon美国站公开关键词yoga mat的前6个真实商品，比较价格区间、评分与评论数量，说明竞争差异，并生成完整HTML报告。",
  },
  {
    caseId: "multi-step-04",
    prompt: "请查询Amazon美国站公开关键词air fryer liners的前7个真实商品，比较标题卖点、售价与评分，提出差异化建议，并生成完整HTML报告。",
  },
  {
    caseId: "multi-step-05",
    prompt: "请查询Amazon美国站公开关键词pet grooming vacuum的前5个真实商品，比较售价、评分、评论数与核心卖点，并生成完整HTML报告。",
  },
  {
    caseId: "multi-step-06",
    prompt: "请查询Amazon美国站公开关键词laptop stand的前8个真实商品，按价格、评分与评论热度分析市场梯队，并生成完整HTML报告。",
  },
  {
    caseId: "multi-step-07",
    prompt: "请查询Amazon美国站公开关键词insulated tumbler的前6个真实商品，比较容量卖点、售价、评分与评论数，并生成完整HTML报告。",
  },
  {
    caseId: "multi-step-08",
    prompt: "请查询Amazon美国站公开关键词car phone holder的前7个真实商品，比较安装方式、售价、评分与评论热度，并生成完整HTML报告。",
  },
  {
    caseId: "multi-step-09",
    prompt: "请查询Amazon美国站公开关键词travel backpack的前5个真实商品，比较容量、价格、评分与评论数，并生成完整HTML市场分析报告。",
  },
  {
    caseId: "multi-step-10",
    prompt: "请查询Amazon美国站公开关键词desk lamp的前8个真实商品，比较功能卖点、价格、评分与评论热度，给出机会优先级，并生成完整HTML报告。",
  },
]);

const noExternalCollectionCases = buildCases("no_external_collection", [
  {
    caseId: "no-external-01",
    prompt: "禁止使用任何外部采集或外部数据源，只根据我给出的假设：销售额100万元、退款10万元、广告20万元，计算净销售额和广告占比并解释结果。",
  },
  {
    caseId: "no-external-02",
    prompt: "禁止进行联网采集，也不得访问外部数据源，只用通用经营知识说明新品上市首月应该建立哪些核心指标看板。",
  },
  {
    caseId: "no-external-03",
    prompt: "禁止调用任何外部采集能力或外部数据源，只基于题面数据：期初库存800件、期末库存600件、本月销量400件，计算库存周转并说明限制。",
  },
  {
    caseId: "no-external-04",
    prompt: "不得使用外部采集或联网采集，只从方法论角度给出判断广告预算是否应增加的决策树，并说明每个分支需要观察的指标。",
  },
  {
    caseId: "no-external-05",
    prompt: "禁止访问任何外部数据源或执行外部采集，只根据常识解释为什么销售额增长但现金流可能恶化，并给出四个核查方向。",
  },
]);

const scheduleCases = buildCases("schedule_create", [
  {
    caseId: "schedule-create-01",
    prompt: "请创建一个真实的一次性定时任务：在2035年8月1日09:30仅执行一次，查询Amazon美国站公开关键词wireless earbuds的前5个真实商品，并输出价格与评分摘要。",
  },
  {
    caseId: "schedule-create-02",
    prompt: "请创建一个真实的一次性定时任务：在2035年9月1日20:15仅执行一次，查询Amazon美国站公开关键词portable charger的前5个真实商品，列出价格与评论热度摘要。",
  },
  {
    caseId: "schedule-create-03",
    prompt: "请创建一个真实的一次性定时任务：在2035年10月15日10:00仅执行一次，查询Amazon美国站公开关键词yoga mat的前8个真实商品，并形成竞争格局摘要。",
  },
]);

const favoriteCases = buildCases("favorite_create", [
  {
    caseId: "favorite-create-01",
    prompt: "请先查询Amazon美国站公开关键词wireless earbuds的前5个真实商品，排除价格、评分或评论数缺失的商品，再依次按评分降序、评论数降序、价格升序排序并取前3个真实选品结果，然后基于这3个结果创建收藏快照。",
  },
  {
    caseId: "favorite-create-02",
    prompt: "请首先查询Amazon美国站公开关键词portable charger的前8个真实商品，排除价格、评分或评论数缺失的商品，再依次按评论数降序、评分降序、价格升序排序并取前4个真实选品结果，随后把这4个结果收藏起来。",
  },
  {
    caseId: "favorite-create-03",
    prompt: "请先查询Amazon美国站公开关键词travel backpack的前6个真实商品，排除价格、评分或评论数缺失的商品，再依次按评分降序、评论数降序、价格升序排序并取前3个真实选品结果，在结果中保留可识别的容量卖点，然后收藏这3个结果并保留快照。",
  },
]);

const explicitStopCases = buildCases("explicit_stop", [
  {
    caseId: "explicit-stop-01",
    prompt: "请查询Amazon美国站公开关键词wireless earbuds、portable charger和yoga mat各前20个真实商品，交叉比较并生成包含完整明细和图表的完整HTML报告。",
    lifecycle: "explicit_stop",
  },
  {
    caseId: "explicit-stop-02",
    prompt: "请查询Amazon美国站公开关键词desk lamp、laptop stand和office chair各前20个真实商品，完成品类与价格带分析，并生成完整HTML报告。",
    lifecycle: "explicit_stop",
  },
  {
    caseId: "explicit-stop-03",
    prompt: "请查询Amazon美国站公开关键词travel backpack、carry on luggage和packing cubes各前20个真实商品，识别竞争结构并生成完整HTML报告。",
    lifecycle: "explicit_stop",
  },
]);

const partialDataFailureCases = buildCases("partial_data_failure", [
  {
    caseId: "partial-data-failure-01",
    prompt: "请完成两个独立的真实数据采集目标：先查询Amazon美国站公开关键词wireless earbuds的前5个真实商品并完成基础汇总；再查询公开关键词noise cancelling headphones的前5个真实商品数据并与前一批结果比较。允许根据能力组合增加必要的数据处理步骤，不限制最终计划步骤数；如果最后一个数据采集或处理边界失败，仍须保留此前取得的真实结果并如实说明。",
    fault: "fail_boundary:last:data",
  },
  {
    caseId: "partial-data-failure-02",
    prompt: "请完成两个独立的真实数据采集目标：先查询Amazon美国站公开关键词portable charger的前5个真实商品并识别价格最低商品；再查询公开关键词power bank的前5个实际商品数据，用于比较评分与评论数。允许根据能力组合为识别最低价和比较数据增加必要的处理步骤，不限制最终计划步骤数；如果最后一个数据采集或处理边界失败，仍须返回此前已经取得的真实结果。",
    fault: "fail_boundary:last:data",
  },
]);

const reportFailureCases = buildCases("report_failure", [
  {
    caseId: "report-failure-01",
    prompt: "请完成以下逻辑目标：先查询Amazon美国站公开关键词wireless earbuds的前5个真实商品数据；再基于已取得的真实数据完成价格、评分与评论数分析并保留可追溯结果；最后基于此前真实产物生成包含图表和明细的完整HTML报告。允许根据能力组合增加必要的采集、处理或报告子步骤，不限制最终计划步骤数；如果最后的报告生成边界失败，仍须返回此前已经取得的真实数据与分析结果。",
    fault: "fail_boundary:last:report",
  },
  {
    caseId: "report-failure-02",
    prompt: "请完成以下逻辑目标：先查询Amazon美国站公开关键词travel backpack的前6个真实商品数据；再基于已取得的真实数据识别价格与评分异常商品并保留可追溯分析结果；最后基于此前真实产物制作包含明细和图表的完整HTML选品报告。允许根据能力组合增加必要的采集、处理或报告子步骤，不限制最终计划步骤数；如果最后的报告生成边界失败，仍须如实返回此前已经取得的真实数据与分析结果。",
    fault: "fail_boundary:last:report",
  },
]);

const disconnectRefreshCases = buildCases("disconnect_refresh", [
  {
    caseId: "disconnect-refresh-01",
    prompt: "请查询Amazon美国站公开关键词wireless earbuds的前5个真实商品，比较价格、评分与评论数，并生成完整HTML报告。",
    lifecycle: "switch_session",
  },
  {
    caseId: "disconnect-refresh-02",
    prompt: "请查询Amazon美国站公开关键词portable charger的前5个真实商品，比较价格、评分与评论热度，并生成完整HTML报告。",
    lifecycle: "abort_sse",
  },
  {
    caseId: "disconnect-refresh-03",
    prompt: "请查询Amazon美国站公开关键词yoga mat的前5个真实商品，比较材质卖点、价格与评分，并生成完整HTML报告。",
    lifecycle: "reload_active",
  },
  {
    caseId: "disconnect-refresh-04",
    prompt: "请查询Amazon美国站公开关键词air fryer liners的前5个真实商品，比较规格、价格与评论数，并生成完整HTML报告。",
    lifecycle: "reopen_page",
  },
  {
    caseId: "disconnect-refresh-05",
    prompt: "请查询Amazon美国站公开关键词pet grooming vacuum的前5个真实商品，比较售价、评分与核心卖点，并生成完整HTML报告。",
    lifecycle: "switch_session",
  },
  {
    caseId: "disconnect-refresh-06",
    prompt: "请查询Amazon美国站公开关键词laptop stand的前5个真实商品，比较价格、评分与评论热度，并生成完整HTML报告。",
    lifecycle: "abort_sse",
  },
  {
    caseId: "disconnect-refresh-07",
    prompt: "请查询Amazon美国站公开关键词insulated tumbler的前5个真实商品，比较容量、价格与评分，并生成完整HTML报告。",
    lifecycle: "reload_active",
  },
  {
    caseId: "disconnect-refresh-08",
    prompt: "请查询Amazon美国站公开关键词car phone holder的前5个真实商品，比较安装方式、价格与评论数，并生成完整HTML报告。",
    lifecycle: "reopen_page",
  },
  {
    caseId: "disconnect-refresh-09",
    prompt: "请查询Amazon美国站公开关键词travel backpack的前5个真实商品，比较容量、价格与评分，并生成完整HTML报告。",
    lifecycle: "switch_session",
  },
  {
    caseId: "disconnect-refresh-10",
    prompt: "请查询Amazon美国站公开关键词desk lamp的前5个真实商品，比较功能卖点、价格与评论数，并生成完整HTML报告。",
    lifecycle: "abort_sse",
  },
  {
    caseId: "disconnect-refresh-11",
    prompt: "请查询Amazon美国站公开关键词mechanical keyboard的前5个真实商品，比较轴体卖点、价格与评分，并生成完整HTML报告。",
    lifecycle: "reload_active",
  },
  {
    caseId: "disconnect-refresh-12",
    prompt: "请查询Amazon美国站公开关键词gaming mouse的前5个真实商品，比较重量、价格与评论热度，并生成完整HTML报告。",
    lifecycle: "reopen_page",
  },
  {
    caseId: "disconnect-refresh-13",
    prompt: "请查询Amazon美国站公开关键词webcam的前5个真实商品，比较分辨率卖点、价格与评分，并生成完整HTML报告。",
    lifecycle: "switch_session",
  },
  {
    caseId: "disconnect-refresh-14",
    prompt: "请查询Amazon美国站公开关键词phone tripod的前5个真实商品，比较高度、价格与评论数，并生成完整HTML报告。",
    lifecycle: "abort_sse",
  },
  {
    caseId: "disconnect-refresh-15",
    prompt: "请查询Amazon美国站公开关键词standing desk的前5个真实商品，比较尺寸、价格与评分，并生成完整HTML报告。",
    lifecycle: "reload_active",
  },
  {
    caseId: "disconnect-refresh-16",
    prompt: "请查询Amazon美国站公开关键词office chair的前5个真实商品，比较人体工学卖点、价格与评论热度，并生成完整HTML报告。",
    lifecycle: "reopen_page",
  },
  {
    caseId: "disconnect-refresh-17",
    prompt: "请查询Amazon美国站公开关键词packing cubes的前5个真实商品，比较套装规格、价格与评分，并生成完整HTML报告。",
    lifecycle: "switch_session",
  },
  {
    caseId: "disconnect-refresh-18",
    prompt: "请查询Amazon美国站公开关键词carry on luggage的前5个真实商品，比较尺寸、价格与评论数，并生成完整HTML报告。",
    lifecycle: "abort_sse",
  },
  {
    caseId: "disconnect-refresh-19",
    prompt: "请查询Amazon美国站公开关键词coffee grinder的前5个真实商品，比较研磨档位、价格与评分，并生成完整HTML报告。",
    lifecycle: "reload_active",
  },
  {
    caseId: "disconnect-refresh-20",
    prompt: "请查询Amazon美国站公开关键词milk frother的前5个真实商品，比较功能、价格与评论热度，并生成完整HTML报告。",
    lifecycle: "reopen_page",
  },
  {
    caseId: "disconnect-refresh-21",
    prompt: "请查询Amazon美国站公开关键词vacuum sealer的前5个真实商品，比较吸力卖点、价格与评分，并生成完整HTML报告。",
    lifecycle: "switch_session",
  },
  {
    caseId: "disconnect-refresh-22",
    prompt: "请查询Amazon美国站公开关键词food scale的前5个真实商品，比较精度卖点、价格与评论数，并生成完整HTML报告。",
    lifecycle: "abort_sse",
  },
]);

export const CHAT_ROUND_E2E_CASES: readonly ChatRoundE2ECase[] = [
  ...directAnswerCases,
  ...multiStepCases,
  ...noExternalCollectionCases,
  ...scheduleCases,
  ...favoriteCases,
  ...explicitStopCases,
  ...partialDataFailureCases,
  ...reportFailureCases,
  ...disconnectRefreshCases,
];

export const CHAT_ROUND_E2E_CATEGORY_COUNTS: Readonly<Record<ChatRoundE2ECategory, number>> = {
  direct_answer: directAnswerCases.length,
  multi_step: multiStepCases.length,
  no_external_collection: noExternalCollectionCases.length,
  schedule_create: scheduleCases.length,
  favorite_create: favoriteCases.length,
  explicit_stop: explicitStopCases.length,
  partial_data_failure: partialDataFailureCases.length,
  report_failure: reportFailureCases.length,
  disconnect_refresh: disconnectRefreshCases.length,
};
