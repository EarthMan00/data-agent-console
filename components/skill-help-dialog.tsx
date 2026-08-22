"use client";

import type { ReactNode } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  BookOpen,
  Download,
  Key,
  Shield,
  Terminal2,
} from "@/components/ui/tabler-icons";

function SectionTitle({ icon: Icon, children }: { icon: typeof BookOpen; children: ReactNode }) {
  return (
    <h3 className="mt-6 flex items-center gap-2 text-body font-semibold leading-6 text-foreground first:mt-0">
      <Icon className="h-4 w-4 text-text-secondary" strokeWidth={1.8} aria-hidden />
      {children}
    </h3>
  );
}

function Paragraph({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-caption leading-6 text-text-secondary">{children}</p>;
}

function CodeLine({ children }: { children: ReactNode }) {
  return (
    <pre className="mt-2 overflow-x-auto whitespace-pre rounded-control border border-border bg-bg-subtle p-3 font-mono text-caption leading-6 text-text-secondary">
      <code>{children}</code>
    </pre>
  );
}

function InfoTable({ rows }: { rows: { label: string; value: ReactNode }[] }) {
  return (
    <div className="mt-2 overflow-x-auto rounded-control border border-border">
      <table className="w-full min-w-[520px] text-left text-caption leading-6">
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b border-border-subtle last:border-0">
              <th className="w-36 shrink-0 bg-bg-subtle px-3 py-2 align-top font-medium text-foreground">
                {row.label}
              </th>
              <td className="px-3 py-2 text-text-secondary">{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SkillHelpDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl rounded-card">
        <DialogTitle className="text-title-1">Skill 使用帮助</DialogTitle>
        <DialogDescription className="text-body leading-6 text-text-secondary">
          Data-Agent 批量取数 Skill（dataagent-platform-1-0-0）的安装、配置与调用说明。
        </DialogDescription>

        <div className="max-h-[min(68vh,640px)] overflow-y-auto pr-1">
          <SectionTitle icon={BookOpen}>功能概览</SectionTitle>
          <Paragraph>
            该 Skill 把 Data-Agent 的批量取数能力封装成外部 Agent 可直接调用的技能，适配
            Claude Code、Codex、Cursor、OpenCode、WorkBuddy 等工具。一次请求即可完成数据采集、
            数据转换或报告生成，服务端会在同一次 Run 内自动拆分执行多个步骤。
          </Paragraph>
          <InfoTable
            rows={[
              {
                label: "支持能力",
                value: "bulk.run：提交批量任务 → 轮询状态 → 下载结果 ZIP",
              },
              {
                label: "不支持",
                value: "定时任务（schedule.create）、收藏（favorite.create）及内部任务接口",
              },
              {
                label: "结果格式",
                value: "ZIP 压缩包（含结果文件与 manifest.json），即使只有一个文件也是 ZIP",
              },
            ]}
          />

          <SectionTitle icon={Download}>安装 Skill</SectionTitle>
          <Paragraph>
            方式一：复制页面上的安装命令 <code className="font-mono">npx skills add @alice/data-fetcher</code>
            ，在对应 Agent 的终端中执行。
          </Paragraph>
          <Paragraph>
            方式二：点击「下载 Skill 包」获取 dataagent-platform-latest.zip，解压到本机 skills
            目录后启用。
          </Paragraph>

          <SectionTitle icon={Key}>使用前配置</SectionTitle>
          <Paragraph>
            调用前需要配置服务地址和 API Key（通过环境变量或密钥库注入，不要写进提示词、源码或日志）：
          </Paragraph>
          <CodeLine>{`DATA_AGENT_BASE_URL=https://agent.example.com`}</CodeLine>
          <CodeLine>{`DATA_AGENT_API_KEY=da_live_...`}</CodeLine>
          <Paragraph>
            API Key 在本页「生成 Key」创建，完整 Key 仅在创建成功时展示一次，默认权限为
            bulk.run、run.read、bundle.download，撤销后立即失效。所有公开接口请求都需要携带
            <code className="font-mono"> X-API-Key</code> 请求头。
          </Paragraph>

          <SectionTitle icon={Terminal2}>调用流程</SectionTitle>
          <Paragraph>
            Step 1 提交任务：<code className="font-mono">POST /api/v1/runs</code>
            ，携带 Idempotency-Key 与结构化请求体，成功返回 HTTP 202 和 run_id。
          </Paragraph>
          <Paragraph>
            Step 2 轮询状态：<code className="font-mono">GET /api/v1/runs/{"{run_id}"}</code>
            ，直到状态变为 completed、failed 或 cancelled。
          </Paragraph>
          <Paragraph>
            Step 3 下载结果：任务完成且返回 bundle 时，调用{" "}
            <code className="font-mono">GET /api/v1/bundles/{"{bundle_key}"}/download</code>
            ，将响应保存为 ZIP 文件；bundle 为 null 时本次没有文件结果。
          </Paragraph>

          <SectionTitle icon={Terminal2}>请求字段</SectionTitle>
          <InfoTable
            rows={[
              { label: "task_type", value: "data_query 或 research_report（必填）" },
              { label: "query", value: "本次完整请求，1–50,000 字符（必填）" },
              { label: "market", value: "目标市场，如 us、cn（必填）" },
              { label: "time_range", value: "时间或周期范围，如 2026-01-01~2026-06-30（必填）" },
              { label: "fields", value: "需要的字段，1–100 项（必填）" },
              { label: "output_format", value: "csv / excel / json，默认 csv（可选）" },
              { label: "context", value: "可选 JSON 对象，如 locale、timezone" },
            ]}
          />
          <CodeLine>{`{
  "task_type": "data_query",
  "query": "收集指定商品的销售数据并按品牌汇总",
  "market": "us",
  "time_range": "2026-01-01~2026-06-30",
  "fields": ["brand", "price", "sales"],
  "output_format": "csv"
}`}</CodeLine>

          <SectionTitle icon={Terminal2}>命令行示例</SectionTitle>
          <Paragraph>提交并立即返回（由调用方自行轮询）：</Paragraph>
          <CodeLine>{`python scripts/data_agent.py run "请生成本周销售汇总报告" --task-type research_report --market cn --time-range "2026-08-01~2026-08-22" --fields 销售额,订单量`}</CodeLine>
          <Paragraph>提交并等待终态：</Paragraph>
          <CodeLine>{`python scripts/data_agent.py run "请生成本周销售汇总报告" --task-type research_report --market cn --time-range "2026-08-01~2026-08-22" --fields 销售额,订单量 --wait --timeout 600`}</CodeLine>
          <Paragraph>提交、等待并自动下载结果 ZIP：</Paragraph>
          <CodeLine>{`python scripts/data_agent.py run "请生成本周销售汇总报告" --task-type research_report --market cn --time-range "2026-08-01~2026-08-22" --fields 销售额,订单量 --wait --download --output ./result.zip`}</CodeLine>
          <Paragraph>查询一次任务状态：</Paragraph>
          <CodeLine>{`python scripts/data_agent.py status run_01J...`}</CodeLine>

          <SectionTitle icon={BookOpen}>状态与结果</SectionTitle>
          <InfoTable
            rows={[
              { label: "queued / running", value: "已接收或执行中，继续轮询" },
              { label: "completed", value: "执行结束，查看 outcome；有 bundle 则下载" },
              { label: "failed / cancelled", value: "无法完成或已取消，停止轮询并报告" },
              { label: "outcome", value: "success 全部完成；partial_success 有可用结果但部分步骤失败" },
            ]}
          />

          <SectionTitle icon={Key}>常见错误处理</SectionTitle>
          <InfoTable
            rows={[
              { label: "401", value: "API Key 缺失、错误或已撤销，请检查或轮换 Key" },
              { label: "403", value: "权限或 Scope 不足，不重试" },
              { label: "404", value: "Run 或 Bundle 不存在、不可用或已过期" },
              { label: "422", value: "请求体校验失败，按字段约束修正后重新提交" },
              { label: "409", value: "Idempotency-Key 冲突，新请求使用新的幂等键" },
              { label: "429 / 5xx", value: "按 Retry-After 有界重试" },
            ]}
          />

          <SectionTitle icon={Shield}>安全提示</SectionTitle>
          <Paragraph>
            API Key 只通过环境变量注入，不写入提示词、源码、日志或 Skill 包；bundle_key 只是资源标识，
            不是凭证，结果必须带 X-API-Key 下载；不向用户暴露内部 task_id、数据库名、存储路径或堆栈信息。
          </Paragraph>
        </div>
      </DialogContent>
    </Dialog>
  );
}
