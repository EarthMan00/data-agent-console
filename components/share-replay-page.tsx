"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { BookOpen, Expand, FileText, ScanSearch, Sparkles, Workflow, X } from "lucide-react";

import { useDemoState } from "@/lib/mock/store";

type ShareReplayPageProps = {
  shareId: string;
};

function pickRunId(shareId: string) {
  if (shareId === "yM2iGJyrFHeG8SfJojT9rP") return "run-default";
  if (shareId.includes("secondary")) return "run-secondary";
  return "run-default";
}

function getToolViewIndex(detail: string) {
  if (detail.includes("写作要求") || detail.includes("算法") || detail.includes("FABE")) return 1;
  if (detail.includes("关键词")) return 3;
  if (detail.includes("ASIN") || detail.includes("五点描述") || detail.includes("标题")) return 2;
  return 0;
}

function getToolViewLabel(detail: string, tabs: string[]) {
  const targetTab = tabs[getToolViewIndex(detail)] ?? tabs[0] ?? "结果视图";
  return `查看${targetTab}`;
}

type ShareStage = {
  title: string;
  body?: string;
  tools?: Array<{ title: string; detail: string }>;
  splitItems?: string[];
};

function deriveToolCode(detail: string) {
  if (detail.includes("标题、五点描述") || detail.includes("竞品 ASIN")) return "_amazon_product_detail";
  if (detail.includes("流量关键词")) return "_sif_asinKeywords";
  if (detail.includes("写作要求") || detail.includes("COSMO") || detail.includes("FABE")) return "_tsearch_search";
  if (detail.includes("统计 SIF 关键词数据") || detail.includes("关键词价值")) return "_dataQuery_executeDynamicQuery";
  return "_tool_call";
}

function buildShareStages(timeline: Array<{ type: "label" | "body" | "tool"; text?: string; title?: string; detail?: string }>, summary: string) {
  const firstBody = timeline.find((item) => item.type === "body")?.text ?? "";
  const executionGroups: ShareStage[] = [];
  let currentGroup: ShareStage | null = null;

  for (const item of timeline) {
    if (item.type === "label") {
      if (["任务拆解", "整理并向用户汇总任务执行的结果"].includes(item.text ?? "")) continue;
      currentGroup = { title: item.text ?? "任务执行", tools: [] };
      executionGroups.push(currentGroup);
      continue;
    }

    if (!currentGroup) continue;

    if (item.type === "body") {
      currentGroup.body = item.text;
      continue;
    }

    if (item.type === "tool") {
      currentGroup.tools?.push({
        title: item.title ?? "调用工具",
        detail: item.detail ?? "",
      });
    }
  }

  const splitItems = executionGroups.flatMap((group, index) => {
    const firstTool = group.tools?.[0];
    const toolCode = firstTool ? deriveToolCode(firstTool.detail) : "_tool_call";
    const detail = group.body ?? firstTool?.detail ?? "补充该阶段所需的结构化结果。";
    return `${index + 1}. ${toolCode}：${detail}`;
  });

  return {
    intent: {
      title: "完成思考",
      body: firstBody,
    },
    split: {
      title: "任务拆分",
      splitItems,
    },
    execution: {
      title: "任务执行",
      groups: executionGroups,
    },
    result: {
      title: "任务结果",
      body: timeline[timeline.length - 1]?.type === "body" ? timeline[timeline.length - 1]?.text : summary,
    },
  };
}

function StageHeader({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-[#202124]">
      <span className="flex h-5 w-5 items-center justify-center rounded-[6px] bg-[#f4f5f7] text-[#4b4f4d]">
        {icon}
      </span>
      <span>{title}</span>
      <span className="text-[#9aa39e]">^</span>
    </div>
  );
}

function StageParagraph({ children }: { children: ReactNode }) {
  return <p className="text-[12px] leading-6 text-[#5e6763]">{children}</p>;
}

const shareCatalog: Record<
  string,
  {
    topTitle: string;
    generatedAt: string;
    objective: string;
    timeline: Array<
      | { type: "label"; text: string }
      | { type: "body"; text: string }
      | { type: "tool"; title: string; detail: string }
    >;
    reportTitle: string;
    reportSubtitle: string;
    reportColumns: string[];
    reportRows: Array<{
      title: string;
      asin: string;
      price: string;
      rating: string;
      points: string[];
      tint: string;
    }>;
    keywordColumns: string[];
    keywordRows: string[][];
    tabs: string[];
    summary: string;
  }
> = {
  yM2iGJyrFHeG8SfJojT9rP: {
    topTitle: "分析竞品生成内容",
    generatedAt: "2026-01-20 11:30:48",
    objective:
      "努力思考，选择适合以下场景的工具，完美完成以下任务：亚马逊美国站，asin为:B0FPZHSLYR、B0CP9Z56SW、B0FFNF9TK1、B0FS7DRCLZ、B0CP9WRDFV、B0BWMZDCCN，我的竞品就是这些，你参考他们的五点描述和A+页面内容，生成我的商品的标题、五点描述。",
    timeline: [
      { type: "label", text: "任务拆解" },
      {
        type: "body",
        text: "好的，我将为您规划任务。首先，我会获取这 6 个竞品 ASIN 的详细信息和流量关键词。接着，我会搜索最新的亚马逊 Listing 写作规范、COSMO 算法以及 FABE 营销法则。最后，结合竞品数据和理论模型，为您构建关键词价值表，并生成符合要求的标题和五点描述。",
      },
      { type: "label", text: "查询竞品详情" },
      { type: "body", text: "我正在为您查询这 6 个竞品 ASIN 的详细信息，请稍候。" },
      { type: "tool", title: "调用工具", detail: "批量查询 6 个竞品 ASIN 的标题、五点描述、价格等详细信息。（返回 6 条数据）" },
      { type: "label", text: "遍历查询关键词" },
      { type: "body", text: "我将为您遍历查询这 6 个竞品 ASIN 在美国站的流量关键词，以便后续分析它们的搜索量、自然排名及流量占比。" },
      { type: "tool", title: "调用工具", detail: "查询竞品 ASIN B0FPZHSLYR 的流量关键词数据（返回 100 条数据）" },
      { type: "tool", title: "调用工具", detail: "查询竞品 ASIN B0CP9Z56SW 的流量关键词数据（返回 100 条数据）" },
      { type: "tool", title: "调用工具", detail: "查询竞品 ASIN B0FFNF9TK1 的流量关键词数据（返回 100 条数据）" },
      { type: "tool", title: "调用工具", detail: "查询竞品 ASIN B0FS7DRCLZ 的流量关键词数据（返回 48 条数据）" },
      { type: "tool", title: "调用工具", detail: "查询竞品 ASIN B0CP9WRDFV 的流量关键词数据（返回 100 条数据）" },
      { type: "tool", title: "调用工具", detail: "查询竞品 ASIN B0BWMZDCCN 的流量关键词数据（返回 100 条数据）" },
      { type: "label", text: "构建关键词打分表" },
      { type: "body", text: "我将为您统计 SIF 关键词数据，按月搜索量进行降序排列，并提取关键词、月搜索量、自然排名及流量占比等关键指标，为您构建关键词价值打分表。" },
      { type: "tool", title: "调用工具", detail: "统计 SIF 关键词数据，按月搜索量降序排列，包含关键词、月搜索量、自然排名、流量占比等字段，用于分析关键词价值。" },
      { type: "label", text: "搜索写作理论" },
      { type: "body", text: "我将为您联网搜索亚马逊五点描述的最新写作要求、Amazon COSMO 算法逻辑，以及 FABE 和 BAF 营销法则的相关资料，为后续文案创作提供理论支持。" },
      { type: "tool", title: "网页检索", detail: "搜索亚马逊五点描述写作要求、Amazon COSMO 算法、FABE 营销法则以及 BAF 法则的相关资料。" },
      { type: "label", text: "整理并向用户汇总任务执行的结果" },
      { type: "body", text: "我已完成分析。本次通过亚马逊商品详情工具成功获取了 6 个竞品 ASIN 的标题及五点描述；利用 SIF 工具遍历检索到 548 条流量关键词记录；随后通过智能数据查询工具对关键词的搜索量与排名进行了统计，筛选出高价值词汇；最后经网页检索工具获取了 2025 年亚马逊五点描述新规、COSMO 算法及 FABE 法则等核心理论。" },
    ],
    reportTitle: "亚马逊竞品分析与Listing文案生成报告",
    reportSubtitle: "基于竞品ASIN深度调研与COSMO算法应用",
    reportColumns: ["商品信息", "价格", "评分/评论", "核心卖点（五点描述提取）"],
    reportRows: [
      {
        title: "SASEUM 40 oz Tumbler with Handle and Lid",
        asin: "B0FS7DRCLZ",
        price: "$24.99",
        rating: "4.8 (12)",
        points: ["Large Capacity Design: 40 oz with handle", "2-in-1 Lid Feature: Flip-top and straw modes"],
        tint: "from-[#f7f2ec] to-[#efe4d9]",
      },
      {
        title: "STANLEY Quencher ProTour Flip Straw Tumbler",
        asin: "B0FPZHSLYR",
        price: "$40.00",
        rating: "4.7 (12,185)",
        points: ["Leakproof Hydration: Flip Straw lid", "Ice-Cold Refreshment: Double-wall vacuum insulation"],
        tint: "from-[#d65b62] to-[#9d2128]",
      },
      {
        title: "STANLEY Quencher H2.0 FlowState (14oz)",
        asin: "B0CP9WRDFV",
        price: "$17.50",
        rating: "4.7 (93,928)",
        points: ["YOUR DREAM TUMBLER: H2.0 FlowState technology", "ADVANCED LID CONSTRUCTION: Rotating cover with 3 positions"],
        tint: "from-[#faf4f0] to-[#e9ddd4]",
      },
      {
        title: "STANLEY Quencher H2.0 FlowState (40oz)",
        asin: "B0CP9Z56SW",
        price: "$39.95",
        rating: "4.7 (90,826)",
        points: ["EARTH-FRIENDLY DURABILITY: 90% recycled stainless steel", "DISHWASHER SAFE: Easy cleaning"],
        tint: "from-[#f4e9e2] to-[#e4d4ca]",
      },
      {
        title: "Soufull 40 oz Tumbler with Handle and Straw Lid",
        asin: "B0BWMZDCCN",
        price: "$18.99",
        rating: "4.4 (8,783)",
        points: ["100% Leak-Proof Lid: 3in1 MagSlider lid", "Double Wall Vacuum Insulation: Cold 34Hrs/Hot 10Hrs"],
        tint: "from-[#d9f3f1] via-[#ffd6df] to-[#b8d8ff]",
      },
      {
        title: "Ello Oasis 40 oz Tumbler with Handle",
        asin: "B0FFNF9TK1",
        price: "$22.19",
        rating: "4.4 (994)",
        points: ["100% LEAK-PROOF: Retracting straw technology", "HIDE A STRAW TECHNOLOGY: Lid dial tucks straw away"],
        tint: "from-[#d6edf9] to-[#a9d4ee]",
      },
    ],
    keywordColumns: ["关键词", "月搜索量", "自然排名", "流量占比"],
    keywordRows: [
      ["water bottle", "417,909", "134", "1.56%"],
      ["hydrojug", "415,551", "-", "5.95%"],
      ["stanley cup", "365,606", "1", "32.33%"],
      ["stanley", "243,496", "5", "10.87%"],
      ["yeti", "118,393", "60", "0.35%"],
    ],
    tabs: ["竞品与关键词分析", "Listing文案生成", "查询竞品详情", "遍历查询关键词"],
    summary: "我已完成分析。本次通过亚马逊商品详情工具成功获取了多条竞品记录，并补充了关键词、写作理论与结果汇总，可继续复看或做同款。",
  },
};

export function ShareReplayPage({ shareId }: ShareReplayPageProps) {
  const { reports, runs } = useDemoState();
  const runId = pickRunId(shareId);
  const run = runs.find((item) => item.id === runId) ?? runs[0];
  const report = reports.find((item) => item.runId === run.id) ?? reports[0];
  const shareData = shareCatalog[shareId];
  const mainScrollerRef = useRef<HTMLDivElement>(null);

  const timeline = useMemo(() => {
    if (shareData) return shareData.timeline;
    return run.sections.flatMap((section) => [
      { type: "label" as const, text: section.title },
      { type: "body" as const, text: section.body },
      ...section.tools.map((tool) => ({
        type: "tool" as const,
        title: tool.title,
        detail: `${tool.detail}（${tool.resultCount}）`,
      })),
    ]);
  }, [run.sections, shareData]);

  const topTitle = shareData?.topTitle ?? run.title;
  const generatedAt = shareData?.generatedAt ?? report.generatedAt;
  const objective = shareData?.objective ?? run.objective;
  const reportTitle = shareData?.reportTitle ?? report.title;
  const reportSubtitle = shareData?.reportSubtitle ?? report.subtitle;
  const reportColumns = shareData?.reportColumns ?? report.sheetRows[0] ?? [];
  const reportRows = shareData?.reportRows ?? [];
  const keywordColumns = shareData?.keywordColumns ?? [];
  const keywordRows = shareData?.keywordRows ?? [];
  const tabs = shareData?.tabs ?? ["竞品与关键词分析", "Listing文案生成", "查询竞品详情", "遍历查询关键词"];
  const summary = shareData?.summary ?? "我已完成分析。本次通过亚马逊商品详情工具成功获取了多条竞品记录，并补充了关键词、写作理论与结果汇总，可继续复看或做同款。";
  const [activeTab, setActiveTab] = useState(0);
  const stagedFlow = useMemo(() => buildShareStages(timeline, summary), [summary, timeline]);

  useEffect(() => {
    mainScrollerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [activeTab]);

  const activeTabLabel = tabs[activeTab] ?? tabs[0];
  const isInvalidShare = !shareData;

  const selectTab = (index: number) => setActiveTab(Math.max(0, Math.min(index, tabs.length - 1)));
  const openReportView = () => selectTab(0);
  const openToolView = (detail: string) => selectTab(getToolViewIndex(detail));

  return (
    <div className="min-h-screen bg-[#f7f7f8] text-[#202124]">
      <header className="flex h-[44px] items-center justify-between border-b border-[#e5e7eb] bg-[linear-gradient(180deg,#fafafa,#f4f4f5)] px-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-[#171717] text-white">
              <FileText className="h-3.5 w-3.5" />
            </div>
            <div className="text-[13px] font-semibold tracking-[-0.01em] text-[#171717]">MData Agent</div>
          </div>
          <div className="h-4 w-px bg-[#e5e7eb]" />
          <div className="truncate text-[12px] font-medium text-[#27272a]">{topTitle}</div>
          <div className="text-[11px] text-[#8b949e]">{generatedAt}</div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#171717] text-[12px] font-semibold text-white">
            用
          </div>
        </div>
      </header>

      <div className="grid h-[calc(100vh-44px)] grid-cols-[360px_minmax(0,1fr)] overflow-hidden">
        <aside className="flex min-h-0 flex-col overflow-hidden border-r border-[#e5e7eb] bg-[linear-gradient(180deg,#fcfcfd,#f5f5f5)]" data-testid="share-timeline">
          <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
            {isInvalidShare ? (
              <div className="mb-4 rounded-[12px] border border-[#f2d8d8] bg-[#fff6f6] px-3 py-3 text-[12px] leading-6 text-[#8e4b4b]">
                当前分享链接不存在或已失效，以下内容为默认示例回放。
              </div>
            ) : null}
            <div className="mb-4 rounded-[22px] bg-[#f2f2f3] px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
              <div className="space-y-2 text-[14px] leading-8 text-[#202124]">
                {objective.split(/\n+/).map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
              <div className="mt-3 text-right text-[11px] text-[#b0b4b8]">{generatedAt}</div>
            </div>

            <div className="space-y-5">
              <div>
                <div className="mb-3 flex items-center gap-2 text-[14px] font-medium text-[#303734]">
                  <div className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-[#171717] text-white">
                    <FileText className="h-4 w-4" />
                  </div>
                  MData Agent
                </div>

                <div className="space-y-4">
                  <div>
                    <StageHeader icon={<ScanSearch className="h-3.5 w-3.5" />} title={stagedFlow.intent.title} />
                    <div className="rounded-[14px] border border-[#e5e7eb] bg-[#fafafa] px-4 py-4">
                      <StageParagraph>{stagedFlow.intent.body}</StageParagraph>
                    </div>
                  </div>

                  <div>
                    <StageHeader icon={<Workflow className="h-3.5 w-3.5" />} title={stagedFlow.split.title} />
                    <div className="rounded-[14px] border border-[#e5e7eb] bg-white px-4 py-4 shadow-[0_8px_20px_rgba(15,23,42,0.04)]">
                      <div className="space-y-2 text-[12px] leading-6 text-[#5e6763]">
                        {stagedFlow.split.splitItems?.map((item) => (
                          <p key={item}>{item}</p>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div>
                    <StageHeader icon={<Sparkles className="h-3.5 w-3.5" />} title={stagedFlow.execution.title} />
                    <div className="space-y-4">
                      {stagedFlow.execution.groups?.map((group) => (
                        <div key={group.title} className="space-y-3">
                          <div className="text-[13px] font-semibold text-[#202124]">{group.title} ^</div>
                          {group.body ? <StageParagraph>{group.body}</StageParagraph> : null}
                          {group.tools?.map((tool) => (
                            <div
                              key={`${group.title}-${tool.detail}`}
                              className="rounded-[12px] border border-[#eceef1] bg-white px-3 py-2.5 shadow-[0_8px_20px_rgba(15,23,42,0.04)]"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2 text-[12px] font-medium text-[#3f4542]">
                                  <div className="flex h-5 w-5 items-center justify-center rounded-full border border-[#e5e7eb] bg-[#fafafa]">
                                    <FileText className="h-3 w-3" />
                                  </div>
                                  调用工具
                                </div>
                                <button
                                  type="button"
                                  onClick={() => openToolView(tool.detail)}
                                  aria-label={getToolViewLabel(tool.detail, tabs)}
                                  className={`rounded-[8px] border px-2 py-0.5 text-[11px] font-medium ${
                                    activeTabLabel === tabs[3] && tool.detail.includes("关键词")
                                      ? "border-[#171717] bg-[#171717] text-white"
                                      : activeTabLabel === tabs[2] && (tool.detail.includes("ASIN") || tool.detail.includes("五点描述") || tool.detail.includes("标题"))
                                        ? "border-[#171717] bg-[#171717] text-white"
                                        : activeTabLabel === tabs[1] && (tool.detail.includes("写作要求") || tool.detail.includes("算法") || tool.detail.includes("FABE"))
                                          ? "border-[#171717] bg-[#171717] text-white"
                                          : "border-[#e5e7eb] bg-[#fafafa] text-[#3a403d]"
                                  }`}
                                >
                                  查看
                                </button>
                              </div>
                              <div className="mt-2 text-[11px] leading-5 text-[#6c7571]">{tool.detail}</div>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <StageHeader icon={<FileText className="h-3.5 w-3.5" />} title={stagedFlow.result.title} />
                    <div className="mb-3 rounded-[12px] border border-[#d8ebe2] bg-[linear-gradient(180deg,#f6fffb,#eff9f4)] px-3 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-[#16a34a] text-white">
                            <FileText className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="text-[13px] font-medium text-[#24322b]">任务执行结果</div>
                            <div className="text-[11px] text-[#6f7b75]">{reportTitle}</div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={openReportView}
                          className="rounded-[8px] border border-[#e5e7eb] bg-white px-2 py-1 text-[11px] font-medium text-[#303734]"
                        >
                          查看
                        </button>
                      </div>
                    </div>

                    <StageParagraph>{stagedFlow.result.body}</StageParagraph>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </aside>

        <main className="relative min-w-0 overflow-hidden bg-white" data-testid="share-result-reader">
          <div className="flex h-12 items-center justify-between border-b border-[#e5e7eb] px-5">
            <div className="flex items-center gap-2">
              <div className="flex h-5 w-5 items-center justify-center rounded-[4px] bg-[#171717] text-white">
                <FileText className="h-3 w-3" />
              </div>
              <div className="text-[14px] font-semibold text-[#1f2421]">{activeTabLabel}</div>
              <div className="text-[11px] text-[#8b9490]">最后生成时间：{generatedAt.slice(0, 10)}</div>
            </div>
            <div className="flex items-center gap-3 text-[#6f7773]">
              <button type="button"><Expand className="h-4 w-4" /></button>
              <Link href="/" className="inline-flex"><X className="h-4 w-4" /></Link>
            </div>
          </div>

          <div ref={mainScrollerRef} className="min-h-0 overflow-auto">
            <div className="grid min-w-[900px] grid-cols-[44px_repeat(4,minmax(0,1fr))] border-b border-[#e5e7eb] text-center text-[11px] text-[#737b77]">
              <div className="border-r border-[#e5e7eb] bg-[#f8fafc] py-2" />
              {["A", "B", "C", "D"].map((label) => (
                <div key={label} className="border-r border-[#e5e7eb] bg-[#f8fafc] py-2 last:border-r-0">
                  {label}
                </div>
              ))}
            </div>

            <div className="grid min-w-[900px] grid-cols-[44px_minmax(0,1fr)]">
              <div className="border-r border-[#e5e7eb] bg-[#f8fafc] text-[12px] text-[#6e7672]">
                {Array.from({ length: 14 }).map((_, index) => (
                  <div key={index} className="flex h-[66px] items-center justify-center border-b border-[#e5e7eb] last:border-b-0">
                    {index + 1}
                  </div>
                ))}
              </div>

              <div>
                <div className="border-b border-[#e5e7eb] bg-[linear-gradient(90deg,#18181b,#27272a)] px-6 py-8 text-center text-white">
                  <div className="text-[16px] font-semibold md:text-[22px]">{activeTab === 1 ? "Listing 文案建议" : reportTitle}</div>
                  <div className="mt-3 text-[11px] text-white/90 md:text-[13px]">
                    {activeTab === 1 ? "基于竞品、关键词和写作理论整理出的文案方向。" : reportSubtitle}
                  </div>
                </div>

                {activeTab === 1 ? (
                  <div className="space-y-5 bg-white px-6 py-6 text-[13px] leading-7 text-[#39403c]">
                    <div className="rounded-[14px] border border-[#e5e7eb] bg-[#fafafa] px-4 py-4">
                      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7a8380]">推荐标题结构</div>
                      <div className="mt-3 text-[15px] font-medium text-[#1f2421]">
                        40 oz Leakproof Tumbler with Handle, Flip Straw Lid, Vacuum Insulated Stainless Steel Cup for Daily Hydration
                      </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      {[
                        "先强调 Leakproof 和 Straw Lid，优先回应评论里的防漏焦虑。",
                        "材质和保冷能力放在前两条卖点里，减少高客单用户的犹豫。",
                        "兼容场景和随身携带体验放在中段，适合做主图与五点联动。",
                        "避免直接复刻竞品品牌词，把高价值通用词埋入标题和五点描述。",
                      ].map((point) => (
                        <div key={point} className="rounded-[14px] border border-[#e5e7eb] bg-white px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
                          {point}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-4 border-b border-[#edf1ef] bg-white text-[12px] font-medium text-[#313734]">
                      {reportColumns.map((cell, index) => (
                        <div key={`${cell}-${index}`} className="border-r border-[#e5e7eb] px-3 py-3 last:border-r-0">
                          {cell}
                        </div>
                      ))}
                    </div>

                    {reportRows.map((row, rowIndex) => (
                      <div key={rowIndex} className="grid grid-cols-4 border-b border-[#e5e7eb] text-[12px] text-[#444b47]">
                        <div className="min-h-[66px] border-r border-[#e5e7eb] px-3 py-3 leading-5">
                          <div className="flex items-start gap-3">
                            <div className={`h-14 w-10 shrink-0 rounded-[10px] bg-gradient-to-b ${row.tint} shadow-[inset_0_0_0_1px_rgba(255,255,255,0.55)]`} />
                            <div className="min-w-0">
                              <div className="font-medium text-[#414744]">{row.title}</div>
                              <div className="mt-1 text-[10px] text-[#9aa39e]">ASIN: {row.asin}</div>
                            </div>
                          </div>
                        </div>
                        <div className="min-h-[66px] border-r border-[#e5e7eb] px-3 py-3 leading-6">{row.price}</div>
                        <div className="min-h-[66px] border-r border-[#e5e7eb] px-3 py-3 leading-6">{row.rating}</div>
                        <div className="min-h-[66px] px-3 py-3 leading-5">
                          {row.points.map((point) => (
                            <div key={point}>{point}</div>
                          ))}
                          <div className="mt-1 text-[10px] text-[#7e8782]">(来源: [亚马逊前端商品详情模拟])</div>
                        </div>
                      </div>
                    ))}

                    <div className="border-b border-[#e5e7eb] bg-white px-3 py-3 text-[12px] font-semibold text-[#39403c]">
                      {activeTab === 3 ? "关键词趋势与竞争摘要" : "高价值关键词挖掘 (Top 10)"}
                    </div>
                    <div className="grid grid-cols-4 border-b border-[#edf1ef] bg-white text-[12px] font-medium text-[#313734]">
                      {keywordColumns.map((cell, index) => (
                        <div key={`${cell}-${index}`} className="border-r border-[#e5e7eb] px-3 py-3 last:border-r-0">
                          {cell}
                        </div>
                      ))}
                    </div>
                    {keywordRows.map((row, rowIndex) => (
                      <div key={`keyword-${rowIndex}`} className="grid grid-cols-4 border-b border-[#e5e7eb] text-[12px] text-[#444b47]">
                        {row.map((cell, cellIndex) => (
                          <div key={`${cell}-${cellIndex}`} className="min-h-[44px] border-r border-[#e5e7eb] px-3 py-3 last:border-r-0">
                            {cell}
                          </div>
                        ))}
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="border-t border-[#e5e7eb] px-4 py-2">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4 text-[12px]">
                {tabs.map((tab, index) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => selectTab(index)}
                    className={index === activeTab ? "font-medium text-[#171717]" : "text-[#6f7773]"}
                  >
                    {tab}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 text-[#9aa39e]">
                <button type="button">‹</button>
                <button type="button">›</button>
              </div>
            </div>
          </div>

          <div className="pointer-events-none fixed bottom-5 left-4 right-4 z-20 flex items-end justify-between">
            <div className="pointer-events-auto flex items-center gap-3 rounded-[12px] border border-[#e5e7eb] bg-white px-4 py-3 shadow-[0_16px_36px_rgba(15,23,42,0.12)]">
              <div className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-[#f4f5f7] text-[#171717]">
                <FileText className="h-4 w-4" />
              </div>
              <div className="text-[12px] text-[#474d4a]">MData Agent 任务回放完成。</div>
              <button type="button" className="rounded-[8px] bg-[#52525b] px-3 py-1.5 text-[12px] font-medium text-white">
                重看
              </button>
              <button type="button" className="rounded-[8px] bg-[#171717] px-3 py-1.5 text-[12px] font-medium text-white">
                做同款
              </button>
            </div>

            <div className="pointer-events-auto flex flex-col gap-2">
              <button type="button" className="inline-flex items-center gap-2 rounded-full bg-[#4b4f4d] px-4 py-2 text-[12px] text-white">
                <BookOpen className="h-3.5 w-3.5" />
                预约直播
              </button>
              <button type="button" className="inline-flex items-center gap-2 rounded-full bg-[#4b4f4d] px-4 py-2 text-[12px] text-white">
                <BookOpen className="h-3.5 w-3.5" />
                使用手册
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
