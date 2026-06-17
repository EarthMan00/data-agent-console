import type { SessionListItem, SessionMessageItem } from "@/lib/agent-api/types";
import type { TaskOrchestrationBundleRow } from "@/lib/merge-orchestration-task-artifacts";
import { FRONTEND_MOCK_ARTIFACT_PREFIX } from "@/lib/frontend-mock-artifacts";

export const FRONTEND_MOCK_SESSION_ID = "mock-sensen-frontend-qa";
export const FRONTEND_MOCK_SESSION_TITLE = "sensen 测试前端修改";

const MOCK_CREATED_AT = "2026-06-14T10:10:00.000+08:00";
const MOCK_LAST_ACTIVE_AT = "2026-06-14T10:42:00.000+08:00";
const MOCK_EXPIRES_AT = "2026-07-14T10:42:00.000+08:00";

const TASK_IDS = [
  "11111111-1111-4111-8111-111111111101",
  "11111111-1111-4111-8111-111111111102",
  "11111111-1111-4111-8111-111111111103",
  "11111111-1111-4111-8111-111111111104",
  "11111111-1111-4111-8111-111111111105",
];

const RUNNING_TASK_ID = "22222222-2222-4222-8222-222222222201";
const ERROR_TASK_ID = "33333333-3333-4333-8333-333333333301";
const LOADING_SHOWCASE_TASK_ID = "44444444-4444-4444-8444-444444444401";

function artifact(id: string, type: string, name: string) {
  return {
    artifact_id: id,
    artifact_type: type,
    original_name: name,
    download_api: `${FRONTEND_MOCK_ARTIFACT_PREFIX}${name}`,
  };
}

const frontendMockBundles: TaskOrchestrationBundleRow[] = [
  {
    taskId: TASK_IDS[0]!,
    stepIndex: 0,
    label: "查询竞品商品详情与销量",
    artifacts: [
      artifact("mock-products-csv", "text/csv", "products.csv"),
      artifact("mock-products-json", "application/json", "products.json"),
    ],
  },
  {
    taskId: TASK_IDS[1]!,
    stepIndex: 1,
    label: "整理关键词价值打分",
    artifacts: [
      artifact("mock-keyword-csv", "text/csv", "keyword_score.csv"),
      artifact("mock-keyword-json", "application/json", "keyword_score.json"),
    ],
  },
  {
    taskId: TASK_IDS[2]!,
    stepIndex: 2,
    label: "生成竞品分析报告",
    artifacts: [artifact("mock-report-md", "text/markdown", "listing_report.md")],
  },
  {
    taskId: TASK_IDS[3]!,
    stepIndex: 3,
    label: "生成标题与五点描述版本",
    artifacts: [artifact("mock-copy-csv", "text/csv", "copy_variants.csv")],
  },
  {
    taskId: TASK_IDS[4]!,
    stepIndex: 4,
    label: "汇总 QA 检查项",
    artifacts: [artifact("mock-error-json", "application/json", "error_sample.json")],
  },
];

export function isFrontendMockSessionId(sessionId: string | null | undefined): boolean {
  return (sessionId || "").trim() === FRONTEND_MOCK_SESSION_ID;
}

export function getFrontendMockHistoryEntry(): SessionListItem & {
  firstMessage: string;
  firstAt: string;
  hasMessages: boolean;
} {
  return {
    session_id: FRONTEND_MOCK_SESSION_ID,
    status: "mock",
    created_at: MOCK_CREATED_AT,
    last_active_at: MOCK_LAST_ACTIVE_AT,
    expires_at: MOCK_EXPIRES_AT,
    firstMessage: FRONTEND_MOCK_SESSION_TITLE,
    firstAt: MOCK_CREATED_AT,
    hasMessages: true,
  };
}

export function getFrontendMockOrchestrationBundles(): TaskOrchestrationBundleRow[] {
  return frontendMockBundles.map((bundle) => ({
    ...bundle,
    artifacts: bundle.artifacts.map((item) => ({ ...item })),
  }));
}

export function getFrontendMockResultPanelData(): {
  bundles: TaskOrchestrationBundleRow[];
  mergedArtifacts: TaskOrchestrationBundleRow["artifacts"];
  finishedAt: string | null;
  errorMessage: string | null;
  lastStatus: string | null;
} {
  const bundles = getFrontendMockOrchestrationBundles();
  return {
    bundles,
    mergedArtifacts: bundles.flatMap((bundle) => bundle.artifacts),
    finishedAt: MOCK_LAST_ACTIVE_AT,
    errorMessage: null,
    lastStatus: "SUCCESS",
  };
}

export function getFrontendMockSessionMessages(): SessionMessageItem[] {
  const sharedMeta = {
    orchestration_id: "mock-orchestration-sensen-frontend-qa",
    orchestration_step_task_ids: TASK_IDS,
  };

  return [
    {
      id: "mock-user-1",
      role: "user",
      content:
        "@Keepa-亚马逊-商品搜索 亚马逊美国站，搜索关键词 “Sports Water Bottles” 产品，配送方式 FBA，按销量倒序的前 50 个。请结合附件中的竞品清单做对比。",
      created_at: "2026-06-14T10:10:00.000+08:00",
      message_index: 0,
      meta: {
        attachments: [
          {
            name: "competitor-asin-list.xlsx",
            size: 183240,
            extension: "xlsx",
          },
          {
            name: "reference-image.png",
            size: 284912,
            extension: "png",
          },
        ],
      },
    },
    {
      id: "mock-assistant-clarification",
      role: "assistant",
      content:
        "执行前需要确认一个筛选条件：是否只保留 FBA 且评分高于 4.3 的商品？\n\n1. 只保留 FBA 且评分高于 4.3\n2. 保留全部配送方式，先按销量排序\n3. 额外加入价格区间分组",
      created_at: "2026-06-14T10:11:15.000+08:00",
      message_index: 1,
      meta: {
        kind: "linkfox_clarification",
      },
    },
    {
      id: "mock-user-2",
      role: "user",
      content: "只保留 FBA 且评分高于 4.3，同时把价格区间分出来。",
      created_at: "2026-06-14T10:12:04.000+08:00",
      message_index: 2,
      meta: {},
    },
    {
      id: "mock-assistant-split",
      role: "assistant",
      content: "已收到筛选条件，开始执行。",
      created_at: "2026-06-14T10:12:30.000+08:00",
      message_index: 3,
      meta: {},
    },
    {
      id: "mock-assistant-running-steps",
      role: "assistant",
      content: "正在执行一轮用于检查 loading / pending / awaiting_input 的 mock 步骤。",
      created_at: "2026-06-14T10:13:20.000+08:00",
      message_index: 4,
      meta: {
        kind: "task_execution_steps",
        round_id: "mock-round-running",
        task_id: RUNNING_TASK_ID,
        orchestration_id: "mock-orchestration-running",
        orchestration_step_task_ids: [RUNNING_TASK_ID],
        steps: [
          { id: "running-step-1", label: "读取附件并校验字段", status: "done" },
          {
            id: "running-step-2",
            label: "等待数据源返回样例结果",
            status: "running",
            runtime_hint: "已等待 24 秒",
            runtime_started_at: "2026-06-14T10:13:35.000+08:00",
          },
          { id: "running-step-3", label: "需要用户确认是否继续扩展关键词", status: "awaiting_input" },
        ],
      },
    },
    {
      id: "mock-assistant-error-steps",
      role: "assistant",
      content: "这里模拟一条失败分支，方便检查错误气泡与失败步骤状态。",
      created_at: "2026-06-14T10:16:00.000+08:00",
      message_index: 5,
      meta: {
        kind: "orchestration_failure",
        round_id: "mock-round-error",
        task_id: ERROR_TASK_ID,
        task_status: "FAILED",
        error_message: "示例错误态：备用数据源超时。",
        steps: [
          { id: "error-step-1", label: "连接备用数据源", status: "done" },
          { id: "error-step-2", label: "读取竞品销量曲线", status: "error" },
        ],
      },
    },
    {
      id: "mock-user-3",
      role: "user",
      content: "继续，用已拿到的数据生成分析报告和 Listing 文案。",
      created_at: "2026-06-14T10:18:48.000+08:00",
      message_index: 6,
      meta: {},
    },
    {
      id: "mock-assistant-final-steps",
      role: "assistant",
      content: "任务执行完成，下面这条用于检查步骤收起、结果卡片、右侧结果面板和底部 sheet 切换。",
      created_at: "2026-06-14T10:25:40.000+08:00",
      message_index: 7,
      meta: {
        kind: "task_execution_steps",
        round_id: "mock-round-final",
        task_id: TASK_IDS[4],
        has_artifacts: true,
        task_status: "SUCCESS",
        ...sharedMeta,
        steps: [
          { id: "final-step-1", label: "查询竞品商品详情与销量", status: "done" },
          { id: "final-step-2", label: "整理关键词价值打分", status: "done" },
          { id: "final-step-3", label: "生成竞品分析报告", status: "done" },
          { id: "final-step-4", label: "生成标题与五点描述版本", status: "done" },
          { id: "final-step-5", label: "汇总 QA 检查项", status: "done" },
        ],
      },
    },
    {
      id: "mock-assistant-loading-showcase",
      role: "assistant",
      content: "用于检查 loading / pending / awaiting_input 的任务执行状态。",
      created_at: "2026-06-14T10:25:55.000+08:00",
      message_index: 8,
      meta: {
        kind: "task_execution_steps",
        round_id: "mock-round-loading-showcase",
        task_id: LOADING_SHOWCASE_TASK_ID,
        orchestration_id: "mock-orchestration-loading-showcase",
        orchestration_step_task_ids: [LOADING_SHOWCASE_TASK_ID],
        steps: [
          { id: "showcase-step-1", label: "读取附件并校验字段", status: "done" },
          {
            id: "showcase-step-2",
            label: "抓取实时样例结果",
            status: "running",
            runtime_hint: "正在获取数据",
            runtime_started_at: "2026-06-14T10:25:46.000+08:00",
          },
          { id: "showcase-step-3", label: "等待用户确认价格区间", status: "awaiting_input" },
          { id: "showcase-step-4", label: "生成可视化结果", status: "pending" },
        ],
      },
    },
    {
      id: "mock-assistant-guidance",
      role: "assistant",
      content:
        "1. 查看结果数据详情，并生成销售分析报告\n2. 对比不同竞品的关键词价值打分表现\n3. 优化生成的五点描述，调整关键词嵌入效果\n4. 生成商品标题的详细优化建议",
      created_at: "2026-06-14T10:26:20.000+08:00",
      message_index: 9,
      meta: {
        kind: "post_task_guidance",
      },
    },
  ];
}

export function mergeFrontendMockSessionMessages(
  cached: SessionMessageItem[] | null | undefined,
): SessionMessageItem[] {
  const baseMessages = getFrontendMockSessionMessages();
  if (!cached?.length) return baseMessages;

  const baseIds = new Set(baseMessages.map((message) => message.id));
  const cachedExtras = cached.filter((message) => !baseIds.has(message.id) && message.role !== "system");
  if (cachedExtras.length === 0) return baseMessages;

  return [
    ...baseMessages,
    ...cachedExtras.map((message, index) => ({
      ...message,
      message_index: baseMessages.length + index,
    })),
  ];
}
