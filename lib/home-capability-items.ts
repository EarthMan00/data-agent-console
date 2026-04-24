export type HomeCapabilityItem = {
  id: string;
  label: string;
  promptHint: string;
  accent: string;
  icon: string;
};

/** 首页/编排器数据源项（静态配置，非 mock 运行数据） */
export const homeCapabilityItems: HomeCapabilityItem[] = [
  { id: "scenarios", label: "应用场景", promptHint: "从应用场景模板出发，快速发起一轮跨平台研究。", accent: "#8b9bb0", icon: "grid" },
  { id: "keepa", label: "Keepa", promptHint: "围绕价格波动、BSR 趋势和历史曲线做跟踪分析。", accent: "#f08a36", icon: "keepa" },
  { id: "amazon", label: "亚马逊前台", promptHint: "从亚马逊前台搜索结果、类目页和竞品结构出发调研。", accent: "#ff9900", icon: "amazon" },
  { id: "store-scan", label: "Sif数据分析工具", promptHint: "先扫描店铺商品结构、主卖点与价格带，再做机会判断。", accent: "#6ca8ff", icon: "store" },
  { id: "seller-sprite", label: "卖家精灵", promptHint: "结合关键词和竞品监控能力做一轮赛道摸底。", accent: "#ff6b00", icon: "sprite" },
  { id: "web-search", label: "实时与全网检索", promptHint: "补全站外信息、趋势证据与竞品背景。", accent: "#89a7ff", icon: "search" },
  { id: "google", label: "谷歌趋势", promptHint: "先验证关键词趋势与区域热度，再决定是否继续深挖。", accent: "#4285f4", icon: "google" },
  { id: "alibaba", label: "店雷达(1688)", promptHint: "从 1688 供给与货源变化判断款式成熟度和价格空间。", accent: "#ff6a00", icon: "alibaba" },
  { id: "tiktok", label: "TikTok电商数据助手", promptHint: "先看 TikTok 热门视频和达人线索，确认内容热度。", accent: "#111111", icon: "tiktok" },
  { id: "jimu", label: "极目系列", promptHint: "调用细分市场、评论和竞品工具，做结构化行业分析。", accent: "#8affc8", icon: "jimu" },
  { id: "walmart", label: "Walmart前台", promptHint: "切到 Walmart 前台验证站外迁移机会和竞品差异。", accent: "#0071ce", icon: "walmart" },
  { id: "ebay", label: "eBay前台", promptHint: "补充 eBay 前台结果，验证多平台供给与需求结构。", accent: "#e53238", icon: "ebay" },
  { id: "patent", label: "专利检索", promptHint: "在推进前先补一轮专利检索，避开高风险方向。", accent: "#7f8b99", icon: "patent" },
];
