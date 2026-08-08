"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { AliceShell } from "@/components/alice-shell";
import { AutoToast } from "@/components/auto-toast";
import { EmptyState } from "@/components/empty-state";
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
  Loader2,
  Plus,
  Trash2,
} from "@/components/ui/tabler-icons";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { copyTextToClipboard } from "@/lib/clipboard";
import {
  createExternalApiKey,
  listExternalApiKeys,
  restoreExternalApiKey,
  revokeExternalApiKey,
  type ExternalApiKeyCreated,
  type ExternalApiKeyItem,
  type ExternalApiKeyScope,
} from "@/lib/agent-api/api-keys";

const SCOPE_LABELS: Record<ExternalApiKeyScope, string> = {
  "bulk.run": "提交任务",
  "run.read": "查询结果",
  "bundle.download": "下载结果",
};

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

export function ApiKeySettingsWorkspace() {
  const platformAgent = useOptionalPlatformAgent();
  const [items, setItems] = useState<ExternalApiKeyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createdKey, setCreatedKey] = useState<ExternalApiKeyCreated | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ExternalApiKeyItem | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<ExternalApiKeyItem | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [toast, setToast] = useState<{ message: string; error?: boolean } | null>(null);

  const activeCount = useMemo(
    () => items.filter((item) => item.status === "active").length,
    [items],
  );

  const refresh = useCallback(async () => {
    if (!platformAgent) return;
    setLoading(true);
    try {
      const next = await platformAgent.withFreshToken(listExternalApiKeys);
      setItems(next);
    } catch (error) {
      setToast({ message: displayError(error, "加载 API 密钥失败"), error: true });
    } finally {
      setLoading(false);
    }
  }, [platformAgent]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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

  const confirmRevoke = useCallback(async () => {
    if (!platformAgent || !revokeTarget || revoking) return;
    setRevoking(true);
    try {
      await platformAgent.withFreshToken((token) =>
        revokeExternalApiKey(token, revokeTarget.key_id),
      );
      setRevokeTarget(null);
      setToast({ message: "API 密钥已撤销" });
      await refresh();
    } catch (error) {
      setToast({ message: displayError(error, "撤销 API 密钥失败"), error: true });
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
      setToast({ message: "API 密钥已恢复" });
      await refresh();
    } catch (error) {
      setToast({ message: displayError(error, "恢复 API 密钥失败"), error: true });
    } finally {
      setRestoring(false);
    }
  }, [platformAgent, refresh, restoreTarget, restoring]);

  const copyCreatedKey = useCallback(async () => {
    if (!createdKey) return;
    const copied = await copyTextToClipboard(createdKey.api_key);
    setToast({
      message: copied ? "API 密钥已复制" : "复制失败，请手动选择密钥",
      error: !copied,
    });
  }, [createdKey]);

  return (
    <AliceShell currentPath="/settings/api-keys" showTopHeader={false}>
      <AutoToast
        message={toast?.message ?? null}
        variant={toast?.error ? "error" : "default"}
        onDismiss={() => setToast(null)}
        durationMs={3000}
      />

      <div className="px-4 pb-14 pt-5 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-page-content">
          <div className="flex flex-col gap-3 border-b border-border pb-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-title-3 font-semibold leading-8 text-foreground">API 密钥</h1>
              <p className="mt-1 text-body text-text-secondary">
                {activeCount} 个有效密钥
              </p>
            </div>
            <Button
              type="button"
              className="self-start rounded-control sm:self-auto"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="h-4 w-4" aria-hidden />
              新建密钥
            </Button>
          </div>

          <div className="mt-5 overflow-hidden rounded-card border border-border bg-bg-surface">
            {loading ? (
              <div className="flex min-h-52 items-center justify-center text-text-secondary" role="status">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden />
                加载中…
              </div>
            ) : items.length === 0 ? (
              <div className="py-16">
                <EmptyState message="暂无 API 密钥" className="mt-0 min-h-40" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table className="min-w-[980px]">
                  <TableHeader className="bg-bg-subtle">
                    <TableRow className="hover:bg-bg-subtle">
                      <TableHead className="min-w-40">名称</TableHead>
                      <TableHead className="min-w-44">密钥</TableHead>
                      <TableHead className="min-w-64">权限</TableHead>
                      <TableHead className="min-w-24">状态</TableHead>
                      <TableHead className="min-w-40">创建时间</TableHead>
                      <TableHead className="min-w-40">最后使用</TableHead>
                      <TableHead className="w-20 text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={item.key_id}>
                        <TableCell className="font-medium text-foreground">{item.name}</TableCell>
                        <TableCell>
                          <code className="whitespace-nowrap font-mono text-caption text-foreground">
                            {item.key_prefix}…{item.key_last4}
                          </code>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-x-3 gap-y-1">
                            {item.scopes.map((scope) => (
                              <span key={scope} className="whitespace-nowrap text-caption text-text-secondary">
                                {SCOPE_LABELS[scope] ?? scope}
                              </span>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className={item.status === "active" ? "text-success" : "text-text-tertiary"}>
                            {item.status === "active" ? "有效" : "已撤销"}
                          </span>
                        </TableCell>
                        <TableCell>{formatDateTime(item.created_at)}</TableCell>
                        <TableCell>{formatDateTime(item.last_used_at)}</TableCell>
                        <TableCell className="text-right">
                          {item.status === "active" ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="iconSm"
                              className="text-text-secondary hover:text-danger"
                              title="撤销密钥"
                              aria-label={`撤销密钥 ${item.name}`}
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
                              title="恢复密钥"
                              aria-label={`恢复密钥 ${item.name}`}
                              onClick={() => setRestoreTarget(item)}
                            >
                              <ArrowBackUp className="h-4 w-4" aria-hidden />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
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
          if (!open) setCreatedKey(null);
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
          <div className="flex justify-end">
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
          <DialogTitle className="text-title-1">撤销 API 密钥</DialogTitle>
          <DialogDescription id="revoke-api-key-description" className="text-body leading-6 text-text-secondary">
            撤销后，使用{'"'}{revokeTarget?.name}{'"'}的外部调用会立即失效，此操作不可恢复。
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
          <DialogTitle className="text-title-1">恢复 API 密钥</DialogTitle>
          <DialogDescription id="restore-api-key-description" className="text-body leading-6 text-text-secondary">
            恢复后，使用{'"'}{restoreTarget?.name}{'"'}的外部调用将重新生效，原密钥串继续有效，无需更换。
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
