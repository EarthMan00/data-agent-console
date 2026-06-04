export type HomeCapabilityCategory = {
  id: string;
  label: string;
  accent: string;
  icon: string;
};

export type HomeCapabilityItem = HomeCapabilityCategory & {
  promptHint: string;
  promptTemplate?: string;
  parentId: string;
  parentLabel: string;
};

export type HomeCapabilityGroup = HomeCapabilityCategory & {
  items: HomeCapabilityItem[];
};

const scenariosCategory: HomeCapabilityCategory = {
  id: "scenarios",
  label: "应用场景",
  accent: "#8b9bb0",
  icon: "grid",
};

function item(
  group: HomeCapabilityCategory,
  id: string,
  label: string,
  promptHint: string,
  promptTemplate?: string,
): HomeCapabilityItem {
  return {
    id,
    label,
    promptHint,
    promptTemplate,
    parentId: group.id,
    parentLabel: group.label,
    accent: group.accent,
    icon: group.icon,
  };
}

const keepaGroup: HomeCapabilityCategory = { id: "keepa-group", label: "Keepa", accent: "#f08a36", icon: "keepa" };
const amazonGroup: HomeCapabilityCategory = { id: "amazon-group", label: "亚马逊前台", accent: "#ff9900", icon: "amazon" };
const sifGroup: HomeCapabilityCategory = { id: "sif-group", label: "Sif数据分析工具", accent: "#6ca8ff", icon: "store" };
const sellerSpriteGroup: HomeCapabilityCategory = { id: "seller-sprite-group", label: "卖家精灵", accent: "#ff6b00", icon: "sprite" };
const searchGroup: HomeCapabilityCategory = { id: "search-group", label: "实时与全网检索", accent: "#89a7ff", icon: "search" };
const googleGroup: HomeCapabilityCategory = { id: "google-group", label: "谷歌趋势", accent: "#4285f4", icon: "google" };
const alibabaGroup: HomeCapabilityCategory = { id: "alibaba-group", label: "店雷达(1688)", accent: "#ff6a00", icon: "alibaba" };
const tiktokGroup: HomeCapabilityCategory = { id: "tiktok-group", label: "TikTok电商数据助手", accent: "#111111", icon: "tiktok" };
const jimuGroup: HomeCapabilityCategory = { id: "jimu-group", label: "极目系列", accent: "#8affc8", icon: "jimu" };
const walmartGroup: HomeCapabilityCategory = { id: "walmart-group", label: "Walmart前台", accent: "#0071ce", icon: "walmart" };
const ebayGroup: HomeCapabilityCategory = { id: "ebay-group", label: "eBay前台", accent: "#e53238", icon: "ebay" };
const patentGroup: HomeCapabilityCategory = { id: "patent-group", label: "专利检索", accent: "#7f8b99", icon: "patent" };

/** 首页/编排器数据源分组（静态样式结构，后续可直接由接口替换 items）。 */
export const homeCapabilityGroups: HomeCapabilityGroup[] = [
  {
    ...keepaGroup,
    items: [
      item(
        keepaGroup,
        "keepa",
        "Keepa-亚马逊-商品搜索",
        "逆向筛选、条件过滤",
        "亚马逊{{美国站}},搜索关键词 “{{Sports Water Bottles}}” 产品，配送方式{{FBA}},按销量倒序的前{{50}}个",
      ),
      item(keepaGroup, "keepa-product-detail", "Keepa-亚马逊-商品详情", "商品详情，一键获取"),
      item(keepaGroup, "keepa-price-history", "Keepa-亚马逊价格历史", "定价策略、价格历史记录"),
    ],
  },
  {
    ...amazonGroup,
    items: [
      item(amazonGroup, "amazon", "亚马逊前端搜索模拟", "全域覆盖、极速获取"),
      item(amazonGroup, "amazon-product-detail", "亚马逊前端-商品详情", "获取五点 附图 A+"),
      item(amazonGroup, "amazon-review", "亚马逊-商品评论", "获取评论、洞察优缺"),
    ],
  },
  {
    ...sifGroup,
    items: [
      item(sifGroup, "store-scan", "店铺商品结构扫描", "先扫描店铺商品结构、主卖点与价格带，再做机会判断。"),
    ],
  },
  {
    ...sellerSpriteGroup,
    items: [
      item(sellerSpriteGroup, "seller-sprite", "关键词与竞品监控", "结合关键词和竞品监控能力做一轮赛道摸底。"),
    ],
  },
  {
    ...searchGroup,
    items: [
      item(searchGroup, "web-search", "站外实时信息检索", "补全站外信息、趋势证据与竞品背景。"),
    ],
  },
  {
    ...googleGroup,
    items: [
      item(googleGroup, "google", "关键词趋势热度", "先验证关键词趋势与区域热度，再决定是否继续深挖。"),
    ],
  },
  {
    ...alibabaGroup,
    items: [
      item(alibabaGroup, "alibaba", "1688供给与货源分析", "从 1688 供给与货源变化判断款式成熟度和价格空间。"),
    ],
  },
  {
    ...tiktokGroup,
    items: [
      item(tiktokGroup, "tiktok", "热门视频与达人线索", "先看 TikTok 热门视频和达人线索，确认内容热度。"),
    ],
  },
  {
    ...jimuGroup,
    items: [
      item(jimuGroup, "jimu", "细分市场结构化分析", "调用细分市场、评论和竞品工具，做结构化行业分析。"),
    ],
  },
  {
    ...walmartGroup,
    items: [
      item(walmartGroup, "walmart", "Walmart竞品验证", "切到 Walmart 前台验证站外迁移机会和竞品差异。"),
    ],
  },
  {
    ...ebayGroup,
    items: [
      item(ebayGroup, "ebay", "eBay供需结构验证", "补充 eBay 前台结果，验证多平台供给与需求结构。"),
    ],
  },
  {
    ...patentGroup,
    items: [
      item(patentGroup, "patent", "专利风险检索", "在推进前先补一轮专利检索，避开高风险方向。"),
    ],
  },
];

export const homeDataSourceItems: HomeCapabilityItem[] = homeCapabilityGroups.flatMap((group) => group.items);

export const homeCapabilityCategories: HomeCapabilityCategory[] = [
  scenariosCategory,
  ...homeCapabilityGroups.map((group) => ({
    id: group.id,
    label: group.label,
    accent: group.accent,
    icon: group.icon,
  })),
];

/** 兼容旧调用方：这里代表可选的二级数据源，不再包含一级分类。 */
export const homeCapabilityItems: HomeCapabilityItem[] = homeDataSourceItems;

export function getHomeCapabilityItem(id: string | null | undefined) {
  if (!id) return null;
  return homeDataSourceItems.find((item) => item.id === id) ?? null;
}

export function getHomeCapabilityCategory(id: string | null | undefined) {
  if (!id) return null;
  return homeCapabilityCategories.find((category) => category.id === id) ?? null;
}

export function getHomeCapabilityGroup(id: string | null | undefined) {
  if (!id) return null;
  return homeCapabilityGroups.find((group) => group.id === id || group.items.some((item) => item.id === id)) ?? null;
}

export function getHomeCapabilityFilterIds(id: string | null | undefined) {
  if (!id || id === scenariosCategory.id) return [];
  const itemMatch = getHomeCapabilityItem(id);
  if (itemMatch) return [itemMatch.id];
  const groupMatch = homeCapabilityGroups.find((group) => group.id === id);
  return groupMatch ? groupMatch.items.map((item) => item.id) : [id];
}
