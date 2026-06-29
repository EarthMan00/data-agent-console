"use client";

import { useCallback, useEffect, useState } from "react";
import { useOptionalPlatformAgent } from "@/components/platform-agent-provider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  adminCreatePlan,
  adminDeletePlan,
  adminListPlans,
  adminPatchPlan,
  AgentApiError,
  parseFastApiDetail,
} from "@/lib/agent-api/client";
import type { AdminPlan } from "@/lib/agent-api/types";

export function AdminPlansWorkspace() {
  const platformAgent = useOptionalPlatformAgent();
  const [plans, setPlans] = useState<AdminPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AdminPlan | null>(null);
  const [editName, setEditName] = useState("");
  const [editCode, setEditCode] = useState("");
  const [editLevel, setEditLevel] = useState(0);
  const [editCanUseTools, setEditCanUseTools] = useState(false);
  const [editFeatures, setEditFeatures] = useState("");
  const [editBusy, setEditBusy] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<AdminPlan | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!platformAgent?.auth) return;
    setLoading(true);
    setNotice("");
    try {
      await platformAgent.withFreshToken(async (token) => {
        const res = await adminListPlans(token);
        setPlans(res.plans ?? []);
      });
    } catch (e) {
      setNotice(e instanceof AgentApiError ? parseFastApiDetail(e.body) ?? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [platformAgent]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openCreate = () => {
    setEditTarget(null);
    setEditName("");
    setEditCode("");
    setEditLevel(0);
    setEditCanUseTools(false);
    setEditFeatures("");
    setEditOpen(true);
  };

  const openEdit = (plan: AdminPlan) => {
    setEditTarget(plan);
    setEditName(plan.name);
    setEditCode(plan.code);
    setEditLevel(plan.level);
    setEditCanUseTools(plan.can_use_tools);
    setEditFeatures(
      plan.features && typeof plan.features === "object" && Object.keys(plan.features).length > 0
        ? JSON.stringify(plan.features, null, 2)
        : "",
    );
    setEditOpen(true);
  };

  const submitEdit = async () => {
    if (!platformAgent?.auth) return;
    if (editName.trim().length < 1) {
      setNotice("套餐名称不能为空");
      return;
    }
    if (!editTarget && editCode.trim().length < 1) {
      setNotice("套餐代码不能为空");
      return;
    }

    let featuresObj: Record<string, unknown> | undefined;
    if (editFeatures.trim()) {
      try {
        featuresObj = JSON.parse(editFeatures.trim()) as Record<string, unknown>;
      } catch {
        setNotice("features 格式错误，请输入合法 JSON。");
        return;
      }
    }

    setEditBusy(true);
    setNotice("");
    try {
      await platformAgent.withFreshToken(async (token) => {
        if (editTarget) {
          await adminPatchPlan(token, editTarget.id, {
            name: editName.trim(),
            level: editLevel,
            can_use_tools: editCanUseTools,
            features: featuresObj,
          });
        } else {
          await adminCreatePlan(token, {
            code: editCode.trim(),
            name: editName.trim(),
            level: editLevel,
            can_use_tools: editCanUseTools,
            features: featuresObj,
          });
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

  const submitDelete = async () => {
    if (!platformAgent?.auth || !deleteTarget) return;
    setDeleteBusy(true);
    setNotice("");
    try {
      await platformAgent.withFreshToken(async (token) => {
        await adminDeletePlan(token, deleteTarget.id);
      });
      setDeleteTarget(null);
      await refresh();
    } catch (e) {
      if (e instanceof AgentApiError && e.status === 400) {
        setNotice(parseFastApiDetail(e.body) ?? e.message);
      } else {
        setNotice(e instanceof AgentApiError ? parseFastApiDetail(e.body) ?? e.message : String(e));
      }
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-title-3 font-semibold leading-8 text-foreground">套餐管理</h1>
          <p className="mt-2 text-sm leading-6 text-text-tertiary">
            管理账号套餐。当前权限模型只区分是否可使用 skills 工具，不再维护工具白名单。
          </p>
        </div>
        <Button className="rounded-control" onClick={openCreate}>
          新增套餐
        </Button>
      </div>

      {notice ? <p className="mt-4 text-sm text-danger">{notice}</p> : null}

      <div className="mt-8 overflow-hidden rounded-popover border border-border bg-bg-surface shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-fill-hover text-xs font-medium uppercase tracking-wide text-text-tertiary">
            <tr>
              <th className="px-4 py-3">套餐名称</th>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">级别</th>
              <th className="px-4 py-3">权限</th>
              <th className="px-4 py-3">用户数</th>
              <th className="px-4 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-text-disabled">
                  加载中…
                </td>
              </tr>
            ) : plans.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-text-disabled">
                  暂无套餐
                </td>
              </tr>
            ) : (
              plans.map((plan) => (
                <tr key={plan.id} className="border-b border-border-subtle last:border-0">
                  <td className="px-4 py-3 font-medium text-foreground">{plan.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-text-tertiary">{plan.code}</td>
                  <td className="px-4 py-3 text-text-tertiary">{plan.level}</td>
                  <td className="px-4 py-3">
                    {plan.can_use_tools ? (
                      <span className="rounded-full bg-success-bg px-2 py-0.5 text-xs text-success">
                        可使用 skills 工具
                      </span>
                    ) : (
                      <span className="rounded-full bg-fill-hover px-2 py-0.5 text-xs text-text-secondary">
                        仅文本对话
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-text-tertiary">{plan.user_count}</td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 rounded-md"
                      onClick={() => openEdit(plan)}
                    >
                      编辑
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 rounded-md text-danger"
                      onClick={() => setDeleteTarget(plan)}
                    >
                      删除
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={editOpen} onOpenChange={(open) => !open && setEditOpen(false)}>
        <DialogContent className="max-w-lg rounded-card">
          <DialogTitle>{editTarget ? "编辑套餐" : "新增套餐"}</DialogTitle>
          <div className="grid gap-3 pt-2">
            <div className="grid gap-1">
              <label className="text-xs text-text-tertiary">套餐名称</label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="h-9 rounded-control"
              />
            </div>

            {!editTarget ? (
              <div className="grid gap-1">
                <label className="text-xs text-text-tertiary">Code（唯一标识）</label>
                <Input
                  value={editCode}
                  onChange={(e) => setEditCode(e.target.value)}
                  className="h-9 rounded-control"
                  placeholder="premium"
                />
              </div>
            ) : null}

            <div className="grid gap-1">
              <label className="text-xs text-text-tertiary">级别（数值越高优先级越高）</label>
              <Input
                type="number"
                value={editLevel}
                onChange={(e) => setEditLevel(Number(e.target.value))}
                className="h-9 rounded-control"
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-foreground">
              <Checkbox
                checked={editCanUseTools}
                onCheckedChange={(value) => setEditCanUseTools(value === true)}
              />
              <span className="text-xs text-text-tertiary">允许使用 skills 工具</span>
            </label>

            <div className="grid gap-1">
              <label className="text-xs text-text-tertiary">
                附加功能配置
                <span className="ml-1 text-text-disabled">（JSON 格式）</span>
              </label>
              <Textarea
                value={editFeatures}
                onChange={(e) => setEditFeatures(e.target.value)}
                className="min-h-25 rounded-control font-mono text-xs"
                placeholder='{"max_daily_queries": 100, "enable_export": true}'
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                className="rounded-control"
                onClick={() => setEditOpen(false)}
              >
                取消
              </Button>
              <Button
                size="sm"
                className="rounded-control"
                disabled={editBusy}
                onClick={submitEdit}
              >
                {editBusy ? "保存中…" : "保存"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-md rounded-card">
          <DialogTitle>确认删除</DialogTitle>
          <p className="text-sm text-text-tertiary">
            确定删除套餐“{deleteTarget?.name}”？如果仍有用户在使用该套餐，删除会失败。
          </p>
          <div className="flex justify-end gap-2 pt-4">
            <Button
              variant="outline"
              size="sm"
              className="rounded-control"
              onClick={() => setDeleteTarget(null)}
            >
              取消
            </Button>
            <Button
              size="sm"
              className="rounded-control bg-danger hover:bg-danger-hover"
              disabled={deleteBusy}
              onClick={submitDelete}
            >
              {deleteBusy ? "删除中…" : "确认删除"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
