import type {
  FavoriteItem,
  HomePromptCard,
  PromptCard,
  ResultPreview,
  RunRecord,
  ScheduleItem,
  SheetTab,
} from "@/lib/workspace-domain-types";

export type {
  FavoriteItem,
  HomePromptCard,
  PromptCard,
  ResultPreview,
  RunRecord,
  ScheduleItem,
  SheetTab,
} from "@/lib/workspace-domain-types";

export { DEFAULT_RESULT_SUMMARY_TITLE as resultSummaryTitle, WORKSPACE_DISPLAY_NAME as workspaceName } from "@/lib/workspace-constants";

export type ToolInvocation = {
  id: string;
  title: string;
  detail: string;
  resultCount: string;
  previewId: string;
};

export type ConversationSection = {
  id: string;
  title: string;
  body: string;
  tools: ToolInvocation[];
};


export const recentRuns = [
  "监控关键词并分析",
  "美国站keyboard tablet case调研",
];

export type { HomeCapabilityItem as CapabilityItem } from "@/lib/home-capability-items";
export { homeCapabilityItems } from "@/lib/home-capability-items";

/** 首页推荐卡片：在已配置 `NEXT_PUBLIC_AGENT_API_ORIGIN`（或代理）且库中有数据时，由 GET /api/home-prompt-recommendations 覆盖；此处为回退数据。 */
export const homePromptCards: HomePromptCard[] = [
  {
    id: "h1",
    title: "一键生成数据驱动的高质量Listing",
    body: "给一组竞品ASIN，一句话描述，AI 给你一个符合Cosmo算法和BAF法则的高质量的商品标题与五点描述。",
    prompt:
      "努力思考，选择适合以下场景的工具，完美完成以下任务：\n" +
      "亚马逊美国站，asin为:B0FPZHSLYR、B0CP9Z56SW、B0FFNF9TK1、B0FS7DRCLZ、B0CP9WRDFV、B0BWMZDCCN，我的竞品就是这些，你参考他们的五点描述和A+页面内容，生成我的商品的标题、五点描述\n" +
      "步骤：\n" +
      "1）查询以上所有asin的商品详情\n" +
      "2）查询每个asin的关键词\n" +
      "3）将上一步的全部关键词，构建关键词价值打分表\n" +
      "4）写作前再次查询亚马逊五点描述的写作要求和，Amazon cosmo 算法，和经典营销理论FABE 法则\n" +
      "5）生成5点描述，要求竞品的品牌词不能作为关键词， 写出符合BAF法则和最新Amazon cosmo算法的五点描述，并且将关键词价值打分表 价值高的词埋入链接",
    meta: "亚马逊前端-商品详情；SIF-查询ASIN的关键词",
    capabilityIds: ["amazon", "seller-sprite"],
    replayRunId: "run-default",
    replayShareId: "yM2iGJyrFHeG8SfJojT9rP",
  },
  {
    id: "h2",
    title: "属性标签化分析与市场画像",
    body: "模拟美国站前台搜索，通过类目经理视角对TOP商品进行“领型/版型/工艺”三维打标，可视化呈现不同属性的销量占比，精准锁定市场主流爆款的产品形态组合。",
    prompt:
      "请围绕目标关键词进入亚马逊美国站前台搜索结果，抓取 Top 商品的标题、价格、评论数、评分、品牌、款式、材质与版型信息。\n" +
      "基于结果做三层标签化：\n" +
      "1）类型标签：品类、适配型号、套装方式\n" +
      "2）结构标签：版型、工艺、主要卖点、配件组合\n" +
      "3）价格标签：高价、中价、低价带\n" +
      "输出不同标签在销量、评论数、价格带上的占比，并总结当前市场画像、主流组合和潜在空位。",
    meta: "@亚马逊前端搜索模拟",
    capabilityIds: ["amazon", "jimu"],
    replayRunId: "run-default",
  },
  {
    id: "h3",
    title: "多品类“高销低评”蓝海商品自动化检索",
    body: "批量扫描多个热门品类首页数据，通过“高销量、少评论、高评分、FBA配送”等严苛过滤算法，快速定位竞争压力小、市场认可度高的潜质商品，实现高效测品与选品决策。",
    prompt:
      "请批量扫描多个热门品类首页货架，筛选高低价带商品。\n" +
      "要求：\n" +
      "1）优先保留评分高、评论真实、FBA 配送、供给压力适中的商品\n" +
      "2）按高价带和低价带分别输出机会款\n" +
      "3）补充每个商品的核心卖点、竞争压力、评论风险和下一步建议\n" +
      "4）最终给出 3 个最值得继续深挖的潜力方向",
    meta: "@亚马逊前端搜索模拟",
    capabilityIds: ["amazon", "store-scan"],
    replayRunId: "run-secondary",
  },
  {
    id: "h4",
    title: "ABA关键词流量周期分析",
    body: "结合ABA数据挖掘能力，精确锁定特定关键词（如crochet bag）的搜索频次排名变化。通过近16周的流量波动曲线，研判类目的季节性爆发规律与市场热度走向，辅助提前布局库存与广告策略。",
    prompt:
      "请结合 ABA 数据挖掘能力，对目标关键词近 15 周的流量、点击和转化变化做周期分析。\n" +
      "输出每周核心波动、可能原因、季节性峰值判断，以及是否值得继续做周期性跟踪。",
    meta: "@ABA-数据挖掘",
    capabilityIds: ["seller-sprite", "keepa"],
    replayRunId: "run-secondary",
  },
  {
    id: "h5",
    title: "跨站点爆款迁移与蓝海匹配",
    body: "结合跨站点数据挖掘与AI图像算法，对标美国站热销新品与德国站蓝海缺口。通过筛选两地高度相似的实物产品，对比销量与竞争维度，精准识别已在美国验证成功、且适合出海德国站的潜力迁移单品。",
    prompt:
      "请对热卖款在不同站点的主图、卖点和价格表现做跨站点迁移分析。\n" +
      "结合图像结构化归因结果，判断哪些卖点适合迁移，哪些风格需要本地化调整，并输出适配建议。",
    meta: "@卖家精灵-选产品；@按商品主图相似度分组",
    capabilityIds: ["walmart", "ebay", "web-search"],
    replayRunId: "run-default",
  },
  {
    id: "h6",
    title: "特定类目品牌集中度（CR5）与卖家国籍分布报告",
    body: "查询类目排名前20页商品，分析“Outlet”等特价关键词的市场渗透率。通过计算品牌与卖家国籍的CR5集中度，评估细分赛道的垄断程度与国货卖家的竞争空间。",
    prompt:
      "请抓取目标类目前 20 页商品，统计品牌出现频次、关键词布局、销量信号和价格带分布。\n" +
      "输出 CR5 集中度、头部品牌策略、跟随空间和切入风险。",
    meta: "@亚马逊前端搜索模拟",
    capabilityIds: ["amazon", "jimu"],
    replayRunId: "run-default",
  },
  {
    id: "h7",
    title: "特定场景下的用户负面反馈与收纳痛点分析",
    body: "针对面包刀细分市场，深度提取用户评价中的负面信息。聚焦“刀座与抽屉”等真实收纳场景，复原用户关于“尺寸不匹配、放不下”的真实吐槽，为产品设计改良提供精准的方向指导。",
    prompt:
      "请围绕指定使用场景抽取差评评论，识别高频负反馈。\n" +
      "重点收敛：真实使用场景、功能缺口、材质问题和可被新品优化的切入点。\n" +
      "最后输出场景化痛点清单和建议改进方向。",
    meta: "@极目-亚马逊-细分市场评论",
    capabilityIds: ["jimu", "amazon"],
    replayRunId: "run-default",
  },
  {
    id: "h8",
    title: "处理Excel新增列",
    body: "批量读取 Excel 表格中“图片”列的商品视觉信息，批量反推图片提示词",
    prompt:
      "请批量读取 Excel 中图片列的视觉信息，提取主体、场景、材质、颜色和关键卖点。\n" +
      "为每一行补充结构化标签和可直接用于图像处理的提示词字段。",
    meta: "@智能Excel处理",
    capabilityIds: ["scenarios", "web-search"],
    replayRunId: "run-secondary",
  },
  {
    id: "h9",
    title: "细分场景专项调研（Wedding款）",
    body: "针对特定关键词商品进行精准提取，量化“婚礼场景”披肩的销量、销售额及增长率，通过市场占有率饼图评估该细分领域的切入价值与竞争空间。",
    prompt:
      "请对目标关键词做机会窗口识别，结合搜索波动、竞品稀疏度、评论缺口和价格带。\n" +
      "筛出短期更容易打透的切入窗口，并按优先级排序。",
    meta: "@亚马逊前端搜索模拟",
    capabilityIds: ["amazon", "jimu"],
    replayRunId: "run-default",
  },
  {
    id: "h10",
    title: "TikTok玩具类目高增长商品潜力评估",
    body: "查询TikTok热销玩具数据，结合销量增速、客单价及评分构建自定义“潜力值”算法，深度排查高增长种子选手，为短视频带货选品提供数据决策支撑。",
    prompt:
      "请拆解头部竞品的标题、主图、五点描述、A+ 页面和评论卖点。\n" +
      "输出卖点图谱、同质化区域、差异化机会以及下一步值得验证的方向。",
    meta: "@EchoTik-TikTok商品搜索",
    capabilityIds: ["tiktok", "web-search"],
    replayRunId: "run-secondary",
  },
  {
    id: "h11",
    title: "竞品多子体评论量化分析",
    body: "自动化联动“变体查询”与“海量评论抓取”，针对竞品Top子体执行全星级评论深度扫描。对评论进行语义结构化处理，从人群画像、使用场景、痛点、未满足需求等六大核心维度生成量化报表，为产品迭代、卖点提炼及精准广告投放提供决策级依据。",
    prompt:
      "请结合 1688 供给深度、价格带变化、同款重复率和多店铺铺货情况，判断方向是否已进入红海。\n" +
      "输出货源成熟度、预估利润空间和风险判断。",
    meta: "@卖家精灵-查竞品；@亚马逊-商品评论",
    capabilityIds: ["seller-sprite", "amazon"],
    replayRunId: "run-default",
  },
  {
    id: "h12",
    title: "项链挂件形状与销售额关联分析",
    body: "结合亚马逊前台搜索与主图识别技术，针对“项链”进行挂件形状拆解。通过量化不同几何形状（如圆环、心形等）的销售额占比，输出精美HTML交互看板，辅助设计师与开发人员锁定高转化视觉元素。",
    prompt:
      "请聚合评论中的功能吐槽、材质反馈和真实使用场景，做情绪与功能缺口聚类。\n" +
      "输出高频情绪问题、功能缺口优先级，以及适合产品优化的建议。",
    meta: "@亚马逊前端搜索模拟",
    capabilityIds: ["amazon", "web-search"],
    replayRunId: "run-default",
  },
];

export const promptCards: PromptCard[] = [
  {
    id: "p1",
    title: "赛道调研日报模板",
    body:
      "@极目-亚马逊-细分市场信息查询 “{{keyword}}” 关键信息数据，并补充 @SIF-关键词竞品数量 输出竞争强度变化、风险和下一步建议。",
    scope: "默认",
    createdAt: "2026-03-23 14:18:12",
  },
  {
    id: "p2",
    title: "评论痛点收敛模板",
    body:
      "围绕高意图关键词抽取美国站评论，提炼消费者真实需求与高频负反馈，输出可直接进入下一轮研究的提问清单。",
    scope: "全部",
    createdAt: "2026-03-22 20:12:09",
  },
];

export const scheduleItems: ScheduleItem[] = [
  {
    id: "s1",
    title: "测试任务",
    frequency: "每天",
    nextRun: "2026-04-18 21:30",
    status: "已完结",
    scope: "默认",
  },
  {
    id: "s2",
    title: "美国站平板键盘套周监控",
    frequency: "每周一 09:00",
    nextRun: "2026-03-30 09:00",
    status: "生效中",
    scope: "默认",
  },
];

export const runRecords: RunRecord[] = [
  {
    id: "r1",
    title: "亚马逊搜索computer desk并返回前100条数据",
    startedAt: "2026-04-21 09:30:00",
    completedAt: "2026-04-21 09:32:06",
    result: "生成 1 份结构化竞品报告",
    status: "成功",
    summary:
      "I have completed the search task for the keyword \"computer desk\" on Amazon US. I browsed 5 pages of search results and fetched 276 product records including title, price, rating and BSR for your analysis.",
  },
  {
    id: "r2",
    title: "平板键盘套评论痛点扫描",
    startedAt: "2026-03-22 09:00:00",
    completedAt: "2026-03-22 09:18:22",
    result: "关键词无结果，建议调整型号词",
    status: "失败",
    summary: "扫描未返回足够评论样本，建议缩小 ASIN 范围或更换关键词后重试。",
  },
];

export const favoriteItems: FavoriteItem[] = [
  {
    id: "f1",
    title: "美国站keyboard tablet case赛道调研",
    body:
      "请帮我做一份美国站 keyboard tablet case 赛道调研，输出 3 个值得切入的机会方向。对每个方向分别说明：1）需求信号；2）竞争强度；3）主要风险；4）适合怎样的卖家切入；5）如果我要继续深挖，下一步应该调用哪些研究动作。",
    scope: "全部",
    type: "报告",
    createdAt: "2026-03-23 14:22:43",
  },
];

export const conversationSections: ConversationSection[] = [
  {
    id: "c1",
    title: "键盘市场信息",
    body:
      "我将为您查询美国站关键词 “keyboard case” 的细分市场信息，以便深入分析该市场的需求趋势与竞争格局。",
    tools: [
      {
        id: "t1",
        title: "调用工具",
        detail:
          "查询美国站关键词 keyboard case 的细分市场信息，分析需求与竞争变化。",
        resultCount: "返回 50 条数据",
        previewId: "market-report",
      },
    ],
  },
  {
    id: "c2",
    title: "键盘壳评论分析",
    body:
      "我将查询美国站关键词 “keyboard case” 的细分市场评论，以洞察消费者的真实需求与痛点。",
    tools: [
      {
        id: "t2",
        title: "调用工具",
        detail:
          "查询美国站关键词 keyboard case 的细分市场评论，洞察消费者痛点。",
        resultCount: "返回 60 条数据",
        previewId: "review-report",
      },
    ],
  },
  {
    id: "c3",
    title: "键盘壳竞争概览",
    body:
      "我将为您查询美国站关键词 “keyboard case” 的竞品数量与供需比，以评估该市场的竞争程度。",
    tools: [
      {
        id: "t3",
        title: "调用工具",
        detail:
          "查询美国站关键词 keyboard case 的竞品数量与供需比。",
        resultCount: "返回 1 条数据",
        previewId: "competition-report",
      },
    ],
  },
];

export const resultSummaryBody =
  "我已完成对美国站 iPad keyboard case、Samsung tablet keyboard case 及 keyboard case 三组关键词的深度分析。本次调研通过极目工具获取了 150 个细分市场的容量、趋势及 180 条核心评论痛点数据，并结合 SIF 工具分析了各关键词的竞品分布与供需概览。数据已涵盖需求变化、竞争格局及消费者反馈等核心维度，能够为您提供持续跟踪的机会方向参考。";

export const feedbackActions = ["喜欢", "不喜欢", "重试", "更多"];

export const previewResults: ResultPreview[] = [
  {
    id: "market-report",
    title: "任务执行结果",
    subtitle: "最后生成时间：2026-03-23",
    mode: "sheet",
    summary: [
      "需求变化：iPad 第 10 代相关需求强势驱动，增长 11.6%，而 Pro 11 英寸相关搜索呈现小幅下滑。",
      "痛点预警：iPad Pro 12.9 英寸相关产品的触控板存在不稳定与连接差评，导致高价位产品未达用户预期。",
      "品牌壁垒：Zugu 等品牌词的高搜索量和高点击份额表明该细分领域品牌效应显著，自举空间难度较大。",
    ],
    sheetTabs: [
      { id: "tab1", label: "市场需求与竞争" },
      { id: "tab2", label: "评论痛点分析" },
      { id: "tab3", label: "关键词竞争概览" },
      { id: "tab4", label: "iPad 键盘壳市场信息" },
    ],
    sheetRows: [
      ["细分市场关键词", "季度搜索量(趋势)", "竞争度(品牌份额)", "平均价格", "退货率(痛点信号)"],
      ["ipad keyboard", "3,107,511 ▲7.8%", "55.6%", "$47.29", "4.07%"],
      ["ipad 10th generation case with keyboard", "1,351,915 ▲11.6%", "57.5%", "$43.43", "4.17%"],
      ["ipad pro 11 inch case with keyboard", "652,775 ▼-15.7%", "64.6%", "$70.42", "6.14%"],
      ["zugu case for ipad 10.2 inch", "186,515 ▲38.2%", "91.3%", "$31.70", "4.04%"],
    ],
  },
  {
    id: "review-report",
    title: "评论痛点报告",
    subtitle: "最后生成时间：2026-03-23",
    mode: "report",
    summary: [
      "触控板延迟、磁吸稳定性和不同型号兼容信息模糊，是评论里最影响购买决策的三类问题。",
      "用户希望在标题和主图阶段直接确认型号匹配，不愿在详情页继续自行判断。",
      "差评集中在高客单产品，说明高价位产品对体验一致性的容忍度更低。",
    ],
    sheetTabs: [
      { id: "tab1", label: "评论摘要" },
      { id: "tab2", label: "痛点聚类" },
      { id: "tab3", label: "用户原话" },
    ],
    sheetRows: [],
  },
  {
    id: "competition-report",
    title: "关键词竞争概览",
    subtitle: "最后生成时间：2026-03-23",
    mode: "report",
    summary: [
      "泛词 keyboard case 的竞品密度高，不适合作为第一轮切入方向。",
      "型号词在搜索意图和页面竞争结构上更利于快速验证。",
      "如果继续深挖，建议优先围绕 iPad Pro 11 和 iPad 10th generation 两组词推进。",
    ],
    sheetTabs: [
      { id: "tab1", label: "竞争摘要" },
      { id: "tab2", label: "关键词排序" },
    ],
    sheetRows: [],
  },
];

export const standaloneReportTabs = [
  { id: "overview", label: "报告摘要" },
  { id: "sheet", label: "结构化表格" },
];
