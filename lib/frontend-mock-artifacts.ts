const FRONTEND_MOCK_ARTIFACT_PREFIX = "/__alice_mock_artifacts__/";

const PRODUCTS_CSV = `ASIN,Title,Price,Rating,Reviews,Delivery,Monthly Sales
B0MOCK001,Stanley style insulated sports bottle 40oz,29.0,4.7,98538,FBA,25154
B0MOCK002,Leakproof stainless steel gym bottle 32oz,22.5,4.6,18421,FBA,13620
B0MOCK003,Wide mouth bottle with straw lid,18.9,4.4,9027,FBA,8790
B0MOCK004,Outdoor cycling water bottle 24oz,15.9,4.2,4311,FBM,2450
B0MOCK005,BPA free kids sports bottle 20oz,13.5,4.5,7280,FBA,5210
`;

const PRODUCTS_JSON = JSON.stringify(
  [
    {
      asin: "B0MOCK001",
      title: "Stanley style insulated sports bottle 40oz",
      price: 29,
      rating: 4.7,
      sales: 25154,
      note: "头部竞品，评论量高，适合做标题关键词基准。",
    },
    {
      asin: "B0MOCK002",
      title: "Leakproof stainless steel gym bottle 32oz",
      price: 22.5,
      rating: 4.6,
      sales: 13620,
      note: "中高价位，卖点集中在 leakproof 和 gym 场景。",
    },
  ],
  null,
  2,
);

const KEYWORD_CSV = `Keyword,Search Volume,Competition,Value Score,Recommendation
stanley cup,82000,High,92,保留但不要作为品牌词硬塞
sports water bottles,41000,Medium,88,主标题前段使用
insulated water bottle,37000,Medium,84,五点描述强化场景
leakproof bottle,18000,Low,76,用于差异化卖点
straw lid tumbler,12000,Medium,71,作为长尾词补充
`;

const KEYWORD_JSON = JSON.stringify(
  {
    market: "amazon-us",
    best_keywords: ["sports water bottles", "insulated water bottle", "leakproof bottle"],
    risky_keywords: ["stanley cup"],
    summary: "高价值词集中在场景、保温、密封和容量表达，品牌词只做竞品识别，不建议作为关键词堆叠。",
  },
  null,
  2,
);

const REPORT_MD = `# 竞品分析与五点描述生成报告

## 核心结论

竞品均价约为 **$29.0**，平均评分 **4.7**。高销量产品集中强调保温、密封、吸管杯盖和车载杯架兼容。

## Listing 建议

- 标题优先使用 sports water bottles、insulated water bottle、leakproof bottle。
- 五点描述避免直接使用竞品品牌词。
- 图片文案突出 40oz、大容量、吸管杯盖、通勤与健身场景。

## 下一步

可以继续生成标题版本、五点描述版本和关键词嵌入检查表。
`;

const COPY_CSV = `Section,Copy
Title,"40oz Insulated Sports Water Bottle with Straw Lid, Leakproof Stainless Steel Tumbler for Gym, Travel and Office"
Bullet 1,"Keeps drinks cold through long workdays and training sessions."
Bullet 2,"Leakproof straw lid supports commute, gym and outdoor use."
Bullet 3,"Fits most cup holders while offering high-capacity hydration."
Bullet 4,"Durable stainless steel body reduces dents and daily wear."
Bullet 5,"Easy-clean wide mouth design works for ice cubes and fruit infusions."
`;

const ERROR_JSON = JSON.stringify(
  {
    status: "failed",
    reason: "示例错误态：数据源临时不可用",
    recoverable: true,
    suggested_action: "切换备用数据源或稍后重试。",
  },
  null,
  2,
);

const ARTIFACT_TEXT_BY_PATH: Record<string, string> = {
  [`${FRONTEND_MOCK_ARTIFACT_PREFIX}products.csv`]: PRODUCTS_CSV,
  [`${FRONTEND_MOCK_ARTIFACT_PREFIX}products.json`]: PRODUCTS_JSON,
  [`${FRONTEND_MOCK_ARTIFACT_PREFIX}keyword_score.csv`]: KEYWORD_CSV,
  [`${FRONTEND_MOCK_ARTIFACT_PREFIX}keyword_score.json`]: KEYWORD_JSON,
  [`${FRONTEND_MOCK_ARTIFACT_PREFIX}listing_report.md`]: REPORT_MD,
  [`${FRONTEND_MOCK_ARTIFACT_PREFIX}copy_variants.csv`]: COPY_CSV,
  [`${FRONTEND_MOCK_ARTIFACT_PREFIX}error_sample.json`]: ERROR_JSON,
};

function normalizeFrontendMockArtifactPath(downloadPath: string): string {
  const raw = (downloadPath || "").trim();
  if (!raw) return "";
  if (raw.startsWith(FRONTEND_MOCK_ARTIFACT_PREFIX)) return raw;
  return raw.startsWith("/") ? raw : `/${raw}`;
}

export function getFrontendMockArtifactText(downloadPath: string): string | null {
  const path = normalizeFrontendMockArtifactPath(downloadPath);
  return ARTIFACT_TEXT_BY_PATH[path] ?? null;
}

export function isFrontendMockArtifactPath(downloadPath: string): boolean {
  return getFrontendMockArtifactText(downloadPath) !== null;
}

export function createFrontendMockArtifactBlob(
  downloadPath: string,
  fallbackFilename: string,
): { blob: Blob; filename: string } | null {
  const text = getFrontendMockArtifactText(downloadPath);
  if (text === null) return null;
  const path = normalizeFrontendMockArtifactPath(downloadPath);
  const filename = path.split("/").pop() || fallbackFilename;
  return {
    blob: new Blob([text], { type: "text/plain;charset=utf-8" }),
    filename,
  };
}

export function openFrontendMockUtf8TextReader(
  downloadPath: string,
): ReadableStreamDefaultReader<string> | null {
  const text = getFrontendMockArtifactText(downloadPath);
  if (text === null) return null;
  return new ReadableStream<string>({
    start(controller) {
      controller.enqueue(text);
      controller.close();
    },
  }).getReader();
}

export { FRONTEND_MOCK_ARTIFACT_PREFIX };
