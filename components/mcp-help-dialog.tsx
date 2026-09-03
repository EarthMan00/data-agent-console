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
  Key,
  Settings,
  Shield,
  Terminal2,
} from "@/components/ui/tabler-icons";
import { getMcpEndpoint } from "@/lib/agent-api/config";


function SectionTitle({
  icon: Icon,
  children,
}: {
  icon: typeof BookOpen;
  children: ReactNode;
}) {
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

function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="mt-2 list-decimal space-y-1 pl-5 text-caption leading-6 text-text-secondary">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ol>
  );
}

export function McpHelpDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const endpoint = getMcpEndpoint();
  const codexConfig = `[mcp_servers.data-agent]\nurl = "${endpoint}"\nhttp_headers = { "Authorization" = "Bearer da_live_..." }`;
  const workbuddyConfig = `{\n  "mcpServers": {\n    "data-agent": {\n      "url": "${endpoint}",\n      "headers": {\n        "Authorization": "Bearer da_live_..."\n      }\n    }\n  }\n}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl rounded-card">
        <DialogTitle className="text-title-1">MCP 使用帮助</DialogTitle>
        <DialogDescription className="text-body leading-6 text-text-secondary">
          Data-Agent 提供 HTTP MCP 接入能力，本期主要支持 Codex 与 WorkBuddy。
        </DialogDescription>

        <div className="max-h-[min(68vh,640px)] overflow-y-auto pr-1">
          <SectionTitle icon={Key}>接入前准备</SectionTitle>
          <Paragraph>
            请先在下方「API Key」区域生成一个 Key。Key 默认包含
            <code className="font-mono"> bulk.run</code>、<code className="font-mono"> run.read</code>、
            <code className="font-mono"> bundle.download</code> 三个权限，完整 Key 只在创建成功时展示一次。
          </Paragraph>

          <SectionTitle icon={Settings}>安装 MCP 到 Codex</SectionTitle>
          <Steps
            items={[
              <>打开 Codex，找到 MCP 服务器配置入口；也可以直接编辑 <code className="font-mono">~/.codex/config.toml</code>。</>,
              <>添加以下配置块：</>,
              <>将 <code className="font-mono">da_live_...</code> 替换为刚生成的 Key。</>,
              <>重启 Codex 或重新加载 MCP，确认 <code className="font-mono">data-agent</code> 已连接。</>,
            ]}
          />
          <CodeLine>{codexConfig}</CodeLine>

          <SectionTitle icon={Settings}>安装 MCP 到 WorkBuddy</SectionTitle>
          <Steps
            items={[
              <>打开 WorkBuddy 侧边栏「插件 → MCP 服务器 → 配置 MCP」。</>,
              <>将以下 JSON 粘贴到 <code className="font-mono">mcp.json</code>。</>,
              <>将 <code className="font-mono">da_live_...</code> 替换为刚生成的 Key。</>,
              <>保存后确认服务状态为绿色。</>,
            ]}
          />
          <CodeLine>{workbuddyConfig}</CodeLine>

          <SectionTitle icon={Terminal2}>能力说明</SectionTitle>
          <Paragraph>
            连接成功后，Agent 会自动获得数据查询任务提交、任务状态查询、结果文件下载三类能力。
            任务以异步方式执行，Agent 会按需轮询状态，并在完成后下载结果文件。
          </Paragraph>

          <SectionTitle icon={Shield}>安全提示</SectionTitle>
          <Paragraph>
            API Key 不要写入提示词、源码或日志；只通过配置文件的请求头使用。Key 删除后，旧配置会立即失效。
          </Paragraph>
        </div>
      </DialogContent>
    </Dialog>
  );
}
