"use client";

import { useCallback, useEffect, useState } from "react";
import { useOptionalPlatformAgent } from "@/components/platform-agent-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  adminListModelConfigs,
  adminCreateModelConfig,
  adminPatchModelConfig,
  adminDeleteModelConfig,
  adminActivateModelConfig,
  AgentApiError,
  parseFastApiDetail,
} from "@/lib/agent-api/client";
import type { AdminModelConfig } from "@/lib/agent-api/types";

export function AdminModelsWorkspace() {
  const platformAgent = useOptionalPlatformAgent();
  const [configs, setConfigs] = useState<AdminModelConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AdminModelConfig | null>(null);
  const [editName, setEditName] = useState("");
  const [editApiKey, setEditApiKey] = useState("");
  const [editBaseUrl, setEditBaseUrl] = useState("");
  const [editModel, setEditModel] = useState("");
  const [editTimeout, setEditTimeout] = useState(300);
  const [editBusy, setEditBusy] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<AdminModelConfig | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!platformAgent?.auth) return;
    setLoading(true);
    setNotice("");
    try {
      await platformAgent.withFreshToken(async (token) => {
        const res = await adminListModelConfigs(token);
        setConfigs(res.configs ?? []);
      });
    } catch (e) {
      setNotice(e instanceof AgentApiError ? parseFastApiDetail(e.body) ?? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [platformAgent]);

  useEffect(() => { void refresh(); }, [refresh]);

  const openCreate = () => {
    setEditTarget(null);
    setEditName("");
    setEditApiKey("");
    setEditBaseUrl("");
    setEditModel("");
    setEditTimeout(300);
    setEditOpen(true);
  };

  const openEdit = (config: AdminModelConfig) => {
    setEditTarget(config);
    setEditName(config.name);
    setEditApiKey(config.api_key);
    setEditBaseUrl(config.base_url);
    setEditModel(config.model);
    setEditTimeout(config.request_timeout);
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!platformAgent?.auth) return;
    setEditBusy(true);
    setNotice("");
    try {
      await platformAgent.withFreshToken(async (token) => {
        const body = {
          name: editName.trim(),
          api_key: editApiKey.trim(),
          base_url: editBaseUrl.trim(),
          model: editModel.trim(),
          request_timeout: editTimeout,
        };
        if (editTarget) {
          await adminPatchModelConfig(token, editTarget.id, body);
        } else {
          await adminCreateModelConfig(token, body);
        }
      });
      setEditOpen(false);
      await refresh();
    } catch (e) {
      setNotice(e instanceof AgentApiError ? parseFastApiDetail(e.body) ?? e.message : String(e));
    } finally {
      setEditBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || !platformAgent?.auth) return;
    setDeleteBusy(true);
    setNotice("");
    try {
      await platformAgent.withFreshToken(async (token) => {
        await adminDeleteModelConfig(token, deleteTarget.id);
      });
      setDeleteTarget(null);
      await refresh();
    } catch (e) {
      setNotice(e instanceof AgentApiError ? parseFastApiDetail(e.body) ?? e.message : String(e));
    } finally {
      setDeleteBusy(false);
    }
  };

  const handleActivate = async (config: AdminModelConfig) => {
    if (!platformAgent?.auth) return;
    setNotice("");
    try {
      await platformAgent.withFreshToken(async (token) => {
        await adminActivateModelConfig(token, config.id);
      });
      await refresh();
    } catch (e) {
      setNotice(e instanceof AgentApiError ? parseFastApiDetail(e.body) ?? e.message : String(e));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">模型管理</h1>
          <p className="mt-1 text-sm text-text-tertiary">
            配置模型 API，切换当前使用的模型预设
          </p>
        </div>
        <Button onClick={openCreate} disabled={loading}>
          新建预设
        </Button>
      </div>

      {notice && (
        <div className="rounded-control border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">
          {notice}
        </div>
      )}

      {loading && (
        <p className="text-sm text-text-tertiary">加载中…</p>
      )}

      {/* Config cards */}
      {!loading && (
        <div className="space-y-3">
          {configs.length === 0 && (
            <div className="rounded-control border border-border-subtle bg-bg-surface px-6 py-10 text-center text-sm text-text-tertiary">
              暂无模型配置，请点击「新建预设」添加
            </div>
          )}
          {configs.map((config) => (
            <div
              key={config.id}
              className="flex items-center justify-between rounded-control border border-border-subtle bg-bg-surface px-5 py-4"
            >
              <div className="flex items-center gap-4 min-w-0">
                {/* Active indicator */}
                <div
                  className={`shrink-0 h-2.5 w-2.5 rounded-full ${
                    config.is_active ? "bg-green-500" : "bg-border-subtle"
                  }`}
                  title={config.is_active ? "当前使用中" : "未激活"}
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground truncate">
                      {config.name}
                    </span>
                    {config.is_active && (
                      <span className="shrink-0 rounded-full bg-green-500/10 px-2 py-0.5 text-[11px] font-medium text-green-600">
                        当前使用中
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-3 text-xs text-text-tertiary">
                    <span className="font-mono">{config.model}</span>
                    <span>·</span>
                    <span className="truncate max-w-[320px]">{config.base_url}</span>
                    <span>·</span>
                    <span>{config.request_timeout}s</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-4">
                {!config.is_active && (
                  <Button variant="outline" size="sm" onClick={() => handleActivate(config)}>
                    切换
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => openEdit(config)}>
                  编辑
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={config.is_active}
                  onClick={() => setDeleteTarget(config)}
                  className={config.is_active ? "opacity-40" : ""}
                >
                  删除
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogTitle>{editTarget ? "编辑预设" : "新建预设"}</DialogTitle>
          <DialogDescription className="sr-only">
            配置模型名称、API Key、Base URL、Model 和请求超时时间
          </DialogDescription>
          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">名称</label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="例如：智谱 GLM-5.2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">API Key</label>
              <Input
                type="password"
                value={editApiKey}
                onChange={(e) => setEditApiKey(e.target.value)}
                placeholder="sk-..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Base URL</label>
              <Input
                value={editBaseUrl}
                onChange={(e) => setEditBaseUrl(e.target.value)}
                placeholder="https://api.minimax.com/v1"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Model</label>
              <Input
                value={editModel}
                onChange={(e) => setEditModel(e.target.value)}
                placeholder="例如：MiniMax-M2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Request Timeout（秒）
              </label>
              <Input
                type="number"
                value={String(editTimeout)}
                onChange={(e) => setEditTimeout(Number(e.target.value) || 300)}
              />
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              取消
            </Button>
            <Button
              onClick={saveEdit}
              disabled={
                editBusy ||
                !editName.trim() ||
                !editApiKey.trim() ||
                !editBaseUrl.trim() ||
                !editModel.trim()
              }
            >
              {editBusy ? "保存中…" : "保存"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogTitle>确认删除</DialogTitle>
          <DialogDescription className="sr-only">
            删除预设后不可恢复
          </DialogDescription>
          <p className="mt-2 text-sm text-text-secondary">
            确定要删除预设「{deleteTarget?.name}」吗？该操作不可撤销。
          </p>
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteBusy}>
              {deleteBusy ? "删除中…" : "确认删除"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
