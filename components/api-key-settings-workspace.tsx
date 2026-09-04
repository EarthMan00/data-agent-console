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
  Copy,
  Download,
  HelpCircle,
  Loader2,
  Plus,
  Trash2,
} from "@/components/ui/tabler-icons";
import { copyTextToClipboard } from "@/lib/clipboard";
import { cn } from "@/lib/utils";
import { downloadAuthorizedFile } from "@/lib/agent-api/client";
import {
  createExternalApiKey,
  deleteExternalApiKey,
  listExternalApiKeys,
  type ExternalApiKeyCreated,
  type ExternalApiKeyItem,
} from "@/lib/agent-api/api-keys";
import { getMcpEndpoint } from "@/lib/agent-api/config";
import { SkillHelpDialog } from "@/components/skill-help-dialog";
import { McpHelpDialog } from "@/components/mcp-help-dialog";

type LogoSpec = {
  src: string;
  imageClassName?: string;
};

const SKILL_PACKAGE = "@alice/data-fetcher";
const SKILL_COMMAND = `npx skills add ${SKILL_PACKAGE}`;
const SKILL_DOWNLOAD_PATH = "/api/user/skills/dataagent-platform/download";
const SKILL_DOWNLOAD_FILENAME = "dataagent-platform-latest.zip";

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

const MCP_TARGETS = [
  {
    id: "codex",
    name: "Codex",
    logo: INTEGRATION_LOGOS.codex,
  },
  {
    id: "claude",
    name: "Claude",
    logo: INTEGRATION_LOGOS.claudeCode,
  },
  {
    id: "workbuddy",
    name: "WorkBuddy",
    logo: INTEGRATION_LOGOS.workbuddy,
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

export function ApiKeySettingsWorkspace() {
  const platformAgent = useOptionalPlatformAgent();
  const [items, setItems] = useState<ExternalApiKeyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createdKey, setCreatedKey] = useState<ExternalApiKeyCreated | null>(null);
  const [downloadingSkill, setDownloadingSkill] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [mcpHelpOpen, setMcpHelpOpen] = useState(false);
  const [mcpTarget, setMcpTarget] = useState<(typeof MCP_TARGETS)[number]["id"]>("codex");
  const [deleteTarget, setDeleteTarget] = useState<ExternalApiKeyItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<{ message: string; error?: boolean } | null>(null);

  const sortedApiKeys = useMemo(
    () =>
      [...items]
        .sort(
          (left, right) =>
            Date.parse(right.created_at ?? "") - Date.parse(left.created_at ?? ""),
        ),
    [items],
  );

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

  const downloadSkill = useCallback(async () => {
    if (!platformAgent || downloadingSkill) return;
    setDownloadingSkill(true);
    try {
      await platformAgent.withFreshToken((token) =>
        downloadAuthorizedFile(token, SKILL_DOWNLOAD_PATH, SKILL_DOWNLOAD_FILENAME),
      );
      setToast({ message: "Skill 包已开始下载" });
    } catch (error) {
      setToast({ message: displayError(error, "Skill 包下载失败"), error: true });
    } finally {
      setDownloadingSkill(false);
    }
  }, [downloadingSkill, platformAgent]);

  const confirmDelete = useCallback(async () => {
    if (!platformAgent || !deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await platformAgent.withFreshToken((token) =>
        deleteExternalApiKey(token, deleteTarget.key_id),
      );
      setDeleteTarget(null);
      setToast({ message: "API Key 已删除" });
      await refresh();
    } catch (error) {
      setToast({ message: displayError(error, "删除 API Key 失败"), error: true });
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, deleting, platformAgent, refresh]);

  const mcpEndpoint = getMcpEndpoint();
  const mcpConfig =
    mcpTarget === "codex"
      ? `[mcp_servers.data-agent]\nurl = "${mcpEndpoint}"\nhttp_headers = { "Authorization" = "Bearer da_live_..." }`
      : mcpTarget === "claude"
        ? `{\n  "mcpServers": {\n    "data-agent": {\n      "type": "http",\n      "url": "${mcpEndpoint}",\n      "headers": {\n        "Authorization": "Bearer da_live_..."\n      }\n    }\n  }\n}`
        : `{\n  "mcpServers": {\n    "data-agent": {\n      "url": "${mcpEndpoint}",\n      "headers": {\n        "Authorization": "Bearer da_live_..."\n      }\n    }\n  }\n}`;

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
              <SectionHeader id="skill-title" title="Skill">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-control"
                  onClick={() => setHelpOpen(true)}
                >
                  <HelpCircle className="h-4 w-4" aria-hidden />
                  使用帮助
                </Button>
              </SectionHeader>
              <div className="mt-3 rounded-card border border-border bg-bg-surface p-4 shadow-surface">
                <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <CommandLine
                      value={SKILL_COMMAND}
                      copyLabel="复制"
                      onCopy={() => void copyText(SKILL_COMMAND, "Skill 安装命令已复制")}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 shrink-0 rounded-control sm:h-8"
                    disabled={downloadingSkill}
                    onClick={() => void downloadSkill()}
                  >
                    {downloadingSkill ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Download className="h-4 w-4" aria-hidden />
                    )}
                    {downloadingSkill ? "下载中…" : "下载 Skill 包"}
                  </Button>
                </div>
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
              <SectionHeader id="mcp-title" title="MCP">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-control"
                  onClick={() => setMcpHelpOpen(true)}
                >
                  <HelpCircle className="h-4 w-4" aria-hidden />
                  配置说明
                </Button>
              </SectionHeader>
              <div className="mt-3 rounded-card border border-border bg-bg-surface p-4 shadow-surface">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-caption text-text-secondary">选择平台：</span>
                  {MCP_TARGETS.map((target) => {
                    const selected = target.id === mcpTarget;
                    return (
                      <button
                        key={target.id}
                        type="button"
                        className={cn(
                          "inline-flex h-8 items-center gap-2 rounded-control border px-3 text-caption font-medium transition-colors",
                          selected
                            ? "border-primary bg-bg-subtle text-foreground"
                            : "border-border text-text-secondary hover:bg-bg-subtle hover:text-foreground",
                        )}
                        onClick={() => setMcpTarget(target.id)}
                      >
                        <PlatformInlineLogo logo={target.logo} />
                        {target.name}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3">
                  <CommandLine
                    value={mcpConfig}
                    copyLabel="复制配置"
                    onCopy={() => void copyText(mcpConfig, "MCP 配置已复制")}
                  />
                </div>
              </div>
            </section>

            <section id="api-key" className="scroll-mt-6" aria-labelledby="api-key-title">
              <SectionHeader id="api-key-title" title="API Key">
                <div className="flex flex-wrap gap-2">
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
                            <td className="px-4 py-3 text-text-secondary">
                              {formatDateTime(item.last_used_at)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <Button
                                type="button"
                                variant="ghost"
                                size="iconSm"
                                className="text-text-secondary hover:text-danger"
                                title="删除 Key"
                                aria-label={`删除 Key ${item.name || formatKeyPreview(item)}`}
                                onClick={() => setDeleteTarget(item)}
                              >
                                <Trash2 className="h-4 w-4" aria-hidden />
                              </Button>
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
        <DialogContent className="max-w-md rounded-card">
          <DialogTitle className="text-title-1">新建 API 密钥</DialogTitle>
          <DialogDescription className="text-body leading-6 text-text-secondary">
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
          }
        }}
      >
        <DialogContent className="max-w-xl rounded-card">
          <DialogTitle className="text-title-1">API 密钥已创建</DialogTitle>
          <DialogDescription className="text-body leading-6 text-text-secondary">
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
          <div className="mt-4 flex justify-end">
            <Button type="button" onClick={() => setCreatedKey(null)}>完成</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
      >
        <DialogContent className="max-w-md rounded-card">
          <DialogTitle className="text-title-1">删除 API Key</DialogTitle>
          <DialogDescription className="text-body leading-6 text-text-secondary">
            删除后，使用“{deleteTarget?.name || "未命名 Key"}”的外部调用会立即失效，且无法恢复；历史消费记录将保留。
          </DialogDescription>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={deleting} onClick={() => setDeleteTarget(null)}>
              取消
            </Button>
            <Button type="button" variant="destructive" disabled={deleting} onClick={() => void confirmDelete()}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />}
              {deleting ? "删除中…" : "确认删除"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <SkillHelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
      <McpHelpDialog open={mcpHelpOpen} onOpenChange={setMcpHelpOpen} />

    </AliceShell>
  );
}
