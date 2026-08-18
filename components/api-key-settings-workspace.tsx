"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import Image from "next/image";

import { AliceShell } from "@/components/alice-shell";
import { AutoToast } from "@/components/auto-toast";
import { useOptionalPlatformAgent } from "@/components/platform-agent-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  ArrowBackUp,
  Copy,
  ExternalLink,
  Loader2,
  Plus,
  Trash2,
} from "@/components/ui/tabler-icons";
import { copyTextToClipboard } from "@/lib/clipboard";
import { cn } from "@/lib/utils";
import {
  createExternalApiKey,
  listExternalApiKeys,
  restoreExternalApiKey,
  revokeExternalApiKey,
  type ExternalApiKeyCreated,
  type ExternalApiKeyItem,
} from "@/lib/agent-api/api-keys";

type LogoSpec = {
  src: string;
  imageClassName?: string;
};

const OPEN_API_BASE_URL = "http://www.mdata.xin/agent-platform";
const OPEN_API_DOCS_URL = `${OPEN_API_BASE_URL}/docs`;
const OPEN_API_SCHEMA_URL = `${OPEN_API_BASE_URL}/openapi.json`;
const MCP_PACKAGE = "@alice/data-fetcher";
const SKILL_COMMAND = `npx skills add ${MCP_PACKAGE}`;

const INTEGRATION_LOGOS = {
  claudeCode: {
    src: "/assets/integrations/claude.png",
  },
  codex: {
    src: "/assets/integrations/openai.svg",
  },
  cursor: {
    src: "/assets/integrations/cursor.png",
    imageClassName: "rounded-[5px]",
  },
  opencode: {
    src: "/assets/integrations/opencode.png",
  },
  workbuddy: {
    src: "/assets/integrations/workbuddy.svg",
    imageClassName: "rounded-full",
  },
} satisfies Record<string, LogoSpec>;

const MCP_PLATFORMS = [
  {
    id: "claude-code",
    name: "Claude Code",
    logo: INTEGRATION_LOGOS.claudeCode,
    command: `claude mcp add alice-data-fetcher -- npx -y ${MCP_PACKAGE} mcp --api-key YOUR_API_KEY`,
  },
  {
    id: "codex",
    name: "Codex",
    logo: INTEGRATION_LOGOS.codex,
    command: `codex mcp add alice-data-fetcher -- npx -y ${MCP_PACKAGE} mcp --api-key YOUR_API_KEY`,
  },
  {
    id: "cursor",
    name: "Cursor",
    logo: INTEGRATION_LOGOS.cursor,
    command: [
      "{",
      '  "mcpServers": {',
      '    "alice-data-fetcher": {',
      '      "command": "npx",',
      `      "args": ["-y", "${MCP_PACKAGE}", "mcp", "--api-key", "YOUR_API_KEY"]`,
      "    }",
      "  }",
      "}",
    ].join("\n"),
  },
  {
    id: "opencode",
    name: "OpenCode",
    logo: INTEGRATION_LOGOS.opencode,
    command: `opencode mcp add alice-data-fetcher -- npx -y ${MCP_PACKAGE} mcp --api-key YOUR_API_KEY`,
  },
  {
    id: "workbuddy",
    name: "WorkBuddy",
    logo: INTEGRATION_LOGOS.workbuddy,
    command: `npx -y ${MCP_PACKAGE} mcp --api-key YOUR_API_KEY`,
  },
] as const;

const SKILL_TARGETS = [
  {
    id: "claude-code",
    name: "Claude Code",
    logo: INTEGRATION_LOGOS.claudeCode,
  },
  {
    id: "codex",
    name: "Codex",
    logo: INTEGRATION_LOGOS.codex,
  },
  {
    id: "cursor",
    name: "Cursor",
    logo: INTEGRATION_LOGOS.cursor,
  },
  {
    id: "opencode",
    name: "OpenCode",
    logo: INTEGRATION_LOGOS.opencode,
  },
  {
    id: "workbuddy",
    name: "WorkBuddy",
    logo: INTEGRATION_LOGOS.workbuddy,
  },
] as const;

type McpPlatformId = (typeof MCP_PLATFORMS)[number]["id"];

function formatDateTime(value: string | null): string {
  if (!value) return "从未";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function displayError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return fallback;
}

function formatKeyPreview(item: ExternalApiKeyItem): string {
  return `${item.key_prefix}…${item.key_last4}`;
}

function keyStatusLabel(status: ExternalApiKeyItem["status"]): string {
  if (status === "active") return "有效";
  if (status === "revoked") return "已撤销";
  return status || "-";
}

function SectionHeader({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <h2 id={id} className="text-title-1 font-semibold leading-6 text-foreground">
        {title}
      </h2>
      {children}
    </div>
  );
}

function CodeBlock({
  value,
  copyLabel,
  onCopy,
}: {
  value: string;
  copyLabel: string;
  onCopy: () => void;
}) {
  return (
    <div className="relative min-w-0 overflow-hidden rounded-control border border-border bg-bg-subtle">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="absolute right-2 top-2 z-10 h-7 shrink-0 rounded-control bg-bg-surface"
        onClick={onCopy}
      >
        <Copy className="h-4 w-4" aria-hidden />
        {copyLabel}
      </Button>
      <pre className="max-h-48 min-h-[68px] overflow-auto whitespace-pre py-3 pl-3 pr-20 font-mono text-caption leading-6 text-text-secondary">
        <code>{value}</code>
      </pre>
    </div>
  );
}

function CommandLine({
  value,
  copyLabel,
  onCopy,
}: {
  value: string;
  copyLabel: string;
  onCopy: () => void;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-control border border-border bg-bg-subtle p-1">
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap px-2 font-mono text-caption leading-7 text-text-secondary">
        {value}
      </code>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 shrink-0 rounded-control bg-bg-surface"
        onClick={onCopy}
      >
        <Copy className="h-4 w-4" aria-hidden />
        {copyLabel}
      </Button>
    </div>
  );
}

function PlatformInlineLogo({ logo }: { logo: LogoSpec }) {
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center">
      <Image
        src={logo.src}
        alt=""
        width={20}
        height={20}
        unoptimized
        draggable={false}
        className={cn("h-5 w-5 object-contain", logo.imageClassName)}
      />
    </span>
  );
}

function PlatformCard({
  platform,
  selected,
  onSelect,
}: {
  platform: (typeof MCP_PLATFORMS)[number];
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-10 shrink-0 items-center gap-2 rounded-control px-3 text-body font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/15",
        selected
          ? "bg-bg-surface text-foreground shadow-sm"
          : "text-text-secondary hover:bg-fill-hover hover:text-foreground",
      )}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <PlatformInlineLogo logo={platform.logo} />
      <span>{platform.name}</span>
    </button>
  );
}

export function ApiKeySettingsWorkspace() {
  const platformAgent = useOptionalPlatformAgent();
  const [items, setItems] = useState<ExternalApiKeyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createdKey, setCreatedKey] = useState<ExternalApiKeyCreated | null>(null);
  const [testingConnectivity, setTestingConnectivity] = useState(false);
  const [testResult, setTestResult] = useState<null | "ok" | "fail">(null);
  const [revokeTarget, setRevokeTarget] = useState<ExternalApiKeyItem | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<ExternalApiKeyItem | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [selectedMcpPlatform, setSelectedMcpPlatform] = useState<McpPlatformId>("claude-code");
  const [toast, setToast] = useState<{ message: string; error?: boolean } | null>(null);

  const sortedApiKeys = useMemo(
    () =>
      [...items]
        .sort(
          (left, right) => {
            if (left.status === "active" && right.status !== "active") return -1;
            if (left.status !== "active" && right.status === "active") return 1;
            return Date.parse(right.created_at ?? "") - Date.parse(left.created_at ?? "");
          },
        ),
    [items],
  );

  const selectedMcp = MCP_PLATFORMS.find((item) => item.id === selectedMcpPlatform) ?? MCP_PLATFORMS[0];

  const refresh = useCallback(async () => {
    if (!platformAgent) return;
    setLoading(true);
    try {
      const next = await platformAgent.withFreshToken(listExternalApiKeys);
      setItems(next);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [platformAgent]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const copyText = useCallback(async (value: string, successMessage: string) => {
    const copied = await copyTextToClipboard(value);
    setToast({
      message: copied ? successMessage : "复制失败，请手动选中复制",
      error: !copied,
    });
  }, []);

  const submitCreate = useCallback(async () => {
    const name = keyName.trim();
    if (!platformAgent || !name || creating) return;
    setCreating(true);
    try {
      const created = await platformAgent.withFreshToken((token) =>
        createExternalApiKey(token, name),
      );
      setCreateOpen(false);
      setKeyName("");
      setCreatedKey(created);
      await refresh();
    } catch (error) {
      setToast({ message: displayError(error, "创建 API 密钥失败"), error: true });
    } finally {
      setCreating(false);
    }
  }, [creating, keyName, platformAgent, refresh]);

  const copyCreatedKey = useCallback(async () => {
    if (!createdKey) return;
    await copyText(createdKey.api_key, "API 密钥已复制");
  }, [copyText, createdKey]);

  const runConnectivityTest = useCallback(async () => {
    if (!createdKey || testingConnectivity) return;
    setTestingConnectivity(true);
    setTestResult(null);
    try {
      const response = await fetch(`${OPEN_API_BASE_URL}/v1/whoami`, {
        headers: { "X-API-Key": createdKey.api_key },
      });
      setTestResult(response.ok ? "ok" : "fail");
    } catch {
      setTestResult("fail");
    } finally {
      setTestingConnectivity(false);
    }
  }, [createdKey, testingConnectivity]);

  const confirmRevoke = useCallback(async () => {
    if (!platformAgent || !revokeTarget || revoking) return;
    setRevoking(true);
    try {
      await platformAgent.withFreshToken((token) =>
        revokeExternalApiKey(token, revokeTarget.key_id),
      );
      setRevokeTarget(null);
      setToast({ message: "API Key 已撤销" });
      await refresh();
    } catch (error) {
      setToast({ message: displayError(error, "撤销 API Key 失败"), error: true });
    } finally {
      setRevoking(false);
    }
  }, [platformAgent, refresh, revokeTarget, revoking]);

  const confirmRestore = useCallback(async () => {
    if (!platformAgent || !restoreTarget || restoring) return;
    setRestoring(true);
    try {
      await platformAgent.withFreshToken((token) =>
        restoreExternalApiKey(token, restoreTarget.key_id),
      );
      setRestoreTarget(null);
      setToast({ message: "API Key 已恢复" });
      await refresh();
    } catch (error) {
      setToast({ message: displayError(error, "恢复 API Key 失败"), error: true });
    } finally {
      setRestoring(false);
    }
  }, [platformAgent, refresh, restoreTarget, restoring]);

  return (
    <AliceShell currentPath="/settings/api-keys" showTopHeader={false}>
      <AutoToast
        message={toast?.message ?? null}
        variant={toast?.error ? "error" : "default"}
        onDismiss={() => setToast(null)}
        durationMs={3000}
      />

      <div className="px-4 pb-14 pt-4 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-page-content">
          <header>
            <h1 className="text-title-3 font-semibold leading-8 text-foreground">API&Skills</h1>
          </header>

          <div className="mt-4 space-y-5">
            <section id="skill" className="scroll-mt-6" aria-labelledby="skill-title">
              <SectionHeader id="skill-title" title="Skill" />
              <div className="mt-3 rounded-card border border-border bg-bg-surface p-4 shadow-surface">
                <CommandLine
                  value={SKILL_COMMAND}
                  copyLabel="复制"
                  onCopy={() => void copyText(SKILL_COMMAND, "Skill 安装命令已复制")}
                />
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-caption text-text-secondary">适用于：</span>
                  {SKILL_TARGETS.map((target) => (
                    <span
                      key={target.id}
                      className="inline-flex h-6 w-6 items-center justify-center"
                      title={target.name}
                      aria-label={target.name}
                    >
                      <PlatformInlineLogo logo={target.logo} />
                    </span>
                  ))}
                </div>
              </div>
            </section>

            <section id="mcp" className="scroll-mt-6" aria-labelledby="mcp-title">
              <SectionHeader id="mcp-title" title="MCP" />
              <div className="mt-3 overflow-hidden rounded-card border border-border bg-bg-surface shadow-surface">
                <div className="flex min-w-0 gap-1 overflow-x-auto border-b border-border-subtle bg-bg-subtle p-2">
                  {MCP_PLATFORMS.map((platform) => (
                    <PlatformCard
                      key={platform.id}
                      platform={platform}
                      selected={selectedMcpPlatform === platform.id}
                      onSelect={() => setSelectedMcpPlatform(platform.id)}
                    />
                  ))}
                </div>
                <div className="p-4">
                  <CodeBlock
                    value={selectedMcp.command}
                    copyLabel="复制"
                    onCopy={() => void copyText(selectedMcp.command, "配置已复制")}
                  />
                </div>
              </div>
            </section>

            <section id="api-key" className="scroll-mt-6" aria-labelledby="api-key-title">
              <SectionHeader id="api-key-title" title="API Key">
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="outline" size="sm" className="h-8 rounded-control">
                    <a href={OPEN_API_DOCS_URL} target="_blank" rel="noreferrer">
                      查看文档
                      <ExternalLink className="h-4 w-4" aria-hidden />
                    </a>
                  </Button>
                  <Button asChild variant="outline" size="sm" className="h-8 rounded-control">
                    <a href={OPEN_API_SCHEMA_URL} target="_blank" rel="noreferrer">
                      OpenAPI JSON
                      <ExternalLink className="h-4 w-4" aria-hidden />
                    </a>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-control"
                    onClick={() => setCreateOpen(true)}
                  >
                    <Plus className="h-4 w-4" aria-hidden />
                    生成 Key
                  </Button>
                </div>
              </SectionHeader>

              <div className="mt-3 overflow-hidden rounded-card border border-border bg-bg-surface shadow-surface">
                {loading ? (
                  <div className="flex min-h-24 items-center px-4 text-body text-text-secondary" role="status">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                    加载中…
                  </div>
                ) : sortedApiKeys.length === 0 ? (
                  <div className="px-4 py-5 text-body text-text-secondary">
                    暂无 API Key
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-left text-body">
                      <thead className="bg-bg-subtle text-caption text-text-secondary">
                        <tr className="border-b border-border-subtle">
                          <th className="px-4 py-3 font-medium">名称</th>
                          <th className="px-4 py-3 font-medium">API Key</th>
                          <th className="px-4 py-3 font-medium">状态</th>
                          <th className="px-4 py-3 font-medium">最近调用</th>
                          <th className="w-16 px-4 py-3 text-right font-medium">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedApiKeys.map((item) => (
                          <tr
                            key={item.key_id}
                            className="border-b border-border-subtle transition-colors last:border-0 hover:bg-bg-subtle"
                          >
                            <td className="px-4 py-3 font-medium text-foreground">
                              {item.name || "未命名 Key"}
                            </td>
                            <td className="px-4 py-3">
                              <code className="font-mono text-caption text-text-secondary">
                                {formatKeyPreview(item)}
                              </code>
                            </td>
                            <td className="px-4 py-3">
                              <span className={item.status === "active" ? "text-success" : "text-text-tertiary"}>
                                {keyStatusLabel(item.status)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-text-secondary">
                              {formatDateTime(item.last_used_at)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {item.status === "active" ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="iconSm"
                                  className="text-text-secondary hover:text-danger"
                                  title="撤销 Key"
                                  aria-label={`撤销 Key ${item.name || formatKeyPreview(item)}`}
                                  onClick={() => setRevokeTarget(item)}
                                >
                                  <Trash2 className="h-4 w-4" aria-hidden />
                                </Button>
                              ) : (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="iconSm"
                                  className="text-text-secondary hover:text-success"
                                  title="恢复 Key"
                                  aria-label={`恢复 Key ${item.name || formatKeyPreview(item)}`}
                                  onClick={() => setRestoreTarget(item)}
                                >
                                  <ArrowBackUp className="h-4 w-4" aria-hidden />
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          if (!creating) {
            setCreateOpen(open);
            if (!open) setKeyName("");
          }
        }}
      >
        <DialogContent className="max-w-md rounded-card" aria-describedby="create-api-key-description">
          <DialogTitle className="text-title-1">新建 API 密钥</DialogTitle>
          <DialogDescription id="create-api-key-description" className="text-body leading-6 text-text-secondary">
            使用一个便于识别的名称区分调用方。
          </DialogDescription>
          <label className="space-y-2 text-body font-medium text-foreground">
            <span>名称</span>
            <Input
              value={keyName}
              maxLength={100}
              autoFocus
              autoComplete="off"
              placeholder="例如：数据分析工作流"
              onChange={(event) => setKeyName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void submitCreate();
              }}
            />
          </label>
          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={creating} onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button type="button" disabled={!keyName.trim() || creating} onClick={() => void submitCreate()}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
              {creating ? "创建中…" : "创建"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(createdKey)}
        onOpenChange={(open) => {
          if (!open) {
            setCreatedKey(null);
            setTestResult(null);
          }
        }}
      >
        <DialogContent className="max-w-xl rounded-card" aria-describedby="created-api-key-description">
          <DialogTitle className="text-title-1">API 密钥已创建</DialogTitle>
          <DialogDescription id="created-api-key-description" className="text-body leading-6 text-text-secondary">
            关闭后无法再次查看，请立即存放在安全位置。
          </DialogDescription>
          <div className="flex min-w-0 items-center gap-2 rounded-control border border-border bg-bg-subtle p-2">
            <code className="min-w-0 flex-1 select-all overflow-x-auto whitespace-nowrap px-2 font-mono text-sm text-foreground">
              {createdKey?.api_key}
            </code>
            <Button type="button" variant="outline" size="icon" title="复制密钥" aria-label="复制 API 密钥" onClick={() => void copyCreatedKey()}>
              <Copy className="h-4 w-4" aria-hidden />
            </Button>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3 rounded-control border border-border bg-bg-subtle px-3 py-2.5">
            <p className="text-caption leading-5 text-text-secondary">密钥仅在创建时展示一次，可先发起连通测试确认可用。</p>
            <Button type="button" variant="outline" size="sm" disabled={testingConnectivity} onClick={() => void runConnectivityTest()}>
              {testingConnectivity ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {testingConnectivity ? "测试中…" : "测试连通"}
            </Button>
          </div>
          {testResult ? (
            <p role="status" className={cn("mt-2 text-caption", testResult === "ok" ? "text-success" : "text-danger")}>
              {testResult === "ok" ? "连通正常，可安全关闭弹窗并保存密钥。" : "连通失败，请确认密钥无误后重试。"}
            </p>
          ) : null}
          <div className="mt-4 flex justify-end">
            <Button type="button" onClick={() => setCreatedKey(null)}>完成</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(revokeTarget)}
        onOpenChange={(open) => {
          if (!open && !revoking) setRevokeTarget(null);
        }}
      >
        <DialogContent className="max-w-md rounded-card" aria-describedby="revoke-api-key-description">
          <DialogTitle className="text-title-1">撤销 API Key</DialogTitle>
          <DialogDescription id="revoke-api-key-description" className="text-body leading-6 text-text-secondary">
            撤销后，使用“{revokeTarget?.name || "未命名 Key"}”的外部调用会立即失效。
          </DialogDescription>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={revoking} onClick={() => setRevokeTarget(null)}>
              取消
            </Button>
            <Button type="button" variant="destructive" disabled={revoking} onClick={() => void confirmRevoke()}>
              {revoking ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />}
              {revoking ? "撤销中…" : "确认撤销"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(restoreTarget)}
        onOpenChange={(open) => {
          if (!open && !restoring) setRestoreTarget(null);
        }}
      >
        <DialogContent className="max-w-md rounded-card" aria-describedby="restore-api-key-description">
          <DialogTitle className="text-title-1">恢复 API Key</DialogTitle>
          <DialogDescription id="restore-api-key-description" className="text-body leading-6 text-text-secondary">
            恢复后，使用“{restoreTarget?.name || "未命名 Key"}”的外部调用将重新生效。
          </DialogDescription>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={restoring} onClick={() => setRestoreTarget(null)}>
              取消
            </Button>
            <Button type="button" disabled={restoring} onClick={() => void confirmRestore()}>
              {restoring ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ArrowBackUp className="h-4 w-4" aria-hidden />}
              {restoring ? "恢复中…" : "确认恢复"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </AliceShell>
  );
}
