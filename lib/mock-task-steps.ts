/**
 * Mock 执行步骤：用「人工调研时常见的先后顺序」作参考，但文案统一写成
 * **后台工具 / 服务侧任务流水线** 在做什么，不假装用户在浏览器里逐一点击。
 * 不出现具体自动化产品名；tool_name 仅用于内部分支，不写入 label。
 */

export type MockToolStepContext = {
  prompt: string;
  selectedCapabilities: string[];
};

function stepId(roundId: string, i: number) {
  return `${roundId}-step-${i}`;
}

/** 无法归类时：通用的后台编排流程 */
function defaultManualSteps(roundId: string): { id: string; label: string }[] {
  const id = (i: number) => stepId(roundId, i);
  return [
    {
      id: id(1),
      label: "根据任务说明在后端拼装查询条件（地区、时间窗、类目、关键词等），向数据源发起检索或列表拉取",
    },
    {
      id: id(2),
      label: "分页遍历返回记录，抽取任务要求的字段写入结构化结果；在达到约定条数或时间覆盖前持续请求下一页",
    },
    {
      id: id(3),
      label: "校验汇总行数与覆盖度，生成本轮简要结论（分布、异常项或趋势要点），必要时附带可追溯引用",
    },
  ];
}

/** 编排类任务：各场景按同一原则写成服务侧步骤 */
function stepsManualOrchestration(roundId: string, ctx: MockToolStepContext): { id: string; label: string }[] {
  const id = (i: number) => stepId(roundId, i);
  const p = ctx.prompt.toLowerCase();

  if (/百度|baidu/.test(ctx.prompt) || /百度搜索/.test(ctx.prompt)) {
    return [
      {
        id: id(1),
        label: "后端向配置的检索通道提交关键词，获取结果页候选条目（标题、摘要、链接等）",
      },
      {
        id: id(2),
        label: "对排名靠前的条目依次拉取正文或摘要片段，过滤与任务意图明显无关的结果",
      },
      {
        id: id(3),
        label: "将保留条目整理为要点列表：每条含标题、可点开复核的链接及一句话摘要",
      },
    ];
  }

  if (/亚马逊|amazon/.test(p) || ctx.selectedCapabilities.includes("amazon")) {
    return [
      {
        id: id(1),
        label: "按任务指定站点与关键词（或 ASIN）在后端发起商品检索，拉取结果列表",
      },
      {
        id: id(2),
        label: "对列表中的商品逐个解析标题、当前价、星级、评论量等字段，写入结构化输出",
      },
      {
        id: id(3),
        label: "若存在颜色、尺码等变体，在后端逐项展开价格与可选信息，避免漏记",
      },
    ];
  }

  if (
    /搜索|search|谷歌|google|网页|bing/.test(ctx.prompt) ||
    ctx.selectedCapabilities.some((c) => ["web-search", "google"].includes(c))
  ) {
    return [
      {
        id: id(1),
        label: "后端组装检索请求：使用完整问题或关键词；若接口支持语言、地区等参数，先按任务要求设定后再执行查询",
      },
      {
        id: id(2),
        label: "从结果集中按顺序选取若干条（通常 3～8 条）拉取正文，快速扫描全文并截取与任务相关的要点句",
      },
      {
        id: id(3),
        label: "将摘录整理为要点清单，每条附带来源链接，便于事后点开核对",
      },
    ];
  }

  if (/极目|评论分析/.test(ctx.prompt) || ctx.selectedCapabilities.includes("jimu")) {
    return [
      {
        id: id(1),
        label: "后端拉取商品评价数据，按任务需要应用排序策略（如最新或差评优先）",
      },
      {
        id: id(2),
        label: "分页加载评价正文与星级，写入分析用结构化记录",
      },
      {
        id: id(3),
        label: "汇总高频正负面主题，输出简要结论（常见好评点、常见差评点等）",
      },
    ];
  }

  if (/tiktok|抖音/.test(p)) {
    return [
      {
        id: id(1),
        label: "校验任务中的国家/站点与查询时间窗、类目筛选，在后端发起榜单或商品列表查询",
      },
      {
        id: id(2),
        label: "在支持时按销量或热度排序拉取列表，解析标题、标价、页面上可得的销量或热度指标，并分页汇总",
      },
      {
        id: id(3),
        label: "对汇总结果做简单排序与对比，输出趋势要点（爆款、价位带、类目倾向等）",
      },
    ];
  }

  return defaultManualSteps(roundId);
}

/**
 * @param toolName 来自任务接口，仅用于选择分支，不会出现在步骤文案中
 */
export function buildMockToolExecutionSteps(
  roundId: string,
  toolName: string,
  ctx: MockToolStepContext,
): { id: string; label: string }[] {
  const normalized = (toolName || "").trim().toLowerCase();
  if (normalized === "run_linkfox_task") {
    return stepsManualOrchestration(roundId, ctx);
  }
  if (normalized === "run_chatexcel_task") {
    const sid = (i: number) => stepId(roundId, i);
    return [
      { id: sid(0), label: "解析任务 JSON 并校验 action 与文件路径" },
      { id: sid(1), label: "加载表格并执行 ChatExcel 工具链" },
      { id: sid(2), label: "汇总执行结果与产物路径" },
    ];
  }
  return defaultManualSteps(roundId);
}
