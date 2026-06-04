"use client";

import { useCallback, useEffect, useState } from "react";
import { useOptionalPlatformAgent } from "@/components/platform-agent-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  adminListPlans,
  adminCreatePlan,
  adminPatchPlan,
  adminDeletePlan,
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
  const [editToolAllowlist, setEditToolAllowlist] = useState("");
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

  useEffect(() => { void refresh(); }, [refresh]);

  const openCreate = () => {
    setEditTarget(null);
    setEditName("");
    setEditCode("");
    setEditLevel(0);
    setEditCanUseTools(false);
    setEditToolAllowlist("");
    setEditFeatures("");
    setEditOpen(true);
  };

  const openEdit = (plan: AdminPlan) => {
    setEditTarget(plan);
    setEditName(plan.name);
    setEditCode(plan.code);
    setEditLevel(plan.level);
    setEditCanUseTools(plan.can_use_tools);
    setEditToolAllowlist((plan.tool_allowlist ?? []).join("\n"));
    setEditFeatures(
      plan.features && typeof plan.features === "object" && Object.keys(plan.features).length > 0
        ? JSON.stringify(plan.features, null, 2)
        : "",
    );
    setEditOpen(true);
  };

  const submitEdit = async () => {
    if (!platformAgent?.auth) return;
    if (editName.trim().length < 1) { setNotice("套餐名称不能为空"); return; }
    if (!editTarget && editCode.trim().length < 1) { setNotice("套餐代码不能为空"); return; }

    let featuresObj: Record<string, unknown> | undefined;
    if (editFeatures.trim()) {
      try {
        featuresObj = JSON.parse(editFeatures.trim()) as Record<string, unknown>;
      } catch {
        setNotice("features 格式错误，请输入合法 JSON。");
        return;
      }
    }

    const toolAllowlistArr = editToolAllowlist
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    setEditBusy(true);
    setNotice("");
    try {
      await platformAgent.withFreshToken(async (token) => {
        if (editTarget) {
          await adminPatchPlan(token, editTarget.id, {
            name: editName.trim(),
            level: editLevel,
            can_use_tools: editCanUseTools,
            tool_allowlist: toolAllowlistArr,
            features: featuresObj,
          });
        } else {
          await adminCreatePlan(token, {
            code: editCode.trim(),
            name: editName.trim(),
            level: editLevel,
            can_use_tools: editCanUseTools,
            tool_allowlist: toolAllowlistArr,
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
        const detail = parseFastApiDetail(e.body) ?? e.message;
        setNotice(detail);
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
          <h1 className="text-[24px] font-semibold leading-8 text-[#111111]">套餐管理</h1>
          <p className="mt-2 text-sm leading-6 text-[#747571]">
            管理用户套餐与工具权限配置。每个套餐可独立控制是否启用工具、允许哪些工具，以及附加功能特性。
          </p>
        </div>
        <Button className="rounded-[10px]" onClick={openCreate}>新增套餐</Button>
      </div>

      {notice ? <p className="mt-4 text-sm text-red-600">{notice}</p> : null}

      <div className="mt-8 overflow-hidden rounded-[18px] border border-[#e2e2df] bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[#e2e2df] bg-[#f7f7f7] text-xs font-medium uppercase tracking-wide text-[#747571]">
            <tr>
              <th className="px-4 py-3">套餐名称</th>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">级别</th>
              <th className="px-4 py-3">工具权限</th>
              <th className="px-4 py-3">用户数</th>
              <th className="px-4 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-[#94a3b8]">加载中…</td></tr>
            ) : plans.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-[#94a3b8]">暂无套餐</td></tr>
            ) : plans.map((plan) => (
              <tr key={plan.id} className="border-b border-[#f0f0ef] last:border-0">
                <td className="px-4 py-3 font-medium text-[#111111]">{plan.name}</td>
                <td className="px-4 py-3 font-mono text-xs text-[#747571]">{plan.code}</td>
                <td className="px-4 py-3 text-[#747571]">{plan.level}</td>
                <td className="px-4 py-3">
                  {plan.can_use_tools ? (
                    <span className="rounded-full bg-[#e9f7ef] px-2 py-0.5 text-xs text-[#166534]">允许使用工具</span>
                  ) : (
                    <span className="rounded-full bg-[#f0f0ef] px-2 py-0.5 text-xs text-[#52524f]">仅对话</span>
                  )}
                </td>
                <td className="px-4 py-3 text-[#747571]">{plan.user_count}</td>
                <td className="px-4 py-3 text-right">
                  <Button variant="ghost" size="sm" className="h-8 rounded-[8px]" onClick={() => openEdit(plan)}>编辑</Button>
                  <Button variant="ghost" size="sm" className="h-8 rounded-[8px] text-red-600" onClick={() => setDeleteTarget(plan)}>删除</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={(o) => !o && setEditOpen(false)}>
        <DialogContent className="max-w-lg rounded-[14px]">
          <DialogTitle>{editTarget ? "编辑套餐" : "新增套餐"}</DialogTitle>
          <div className="grid gap-3 pt-2">
            <div className="grid gap-1">
              <label className="text-xs text-[#747571]">套餐名称</label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-9 rounded-[10px]" />
            </div>
            {!editTarget && (
              <div className="grid gap-1">
                <label className="text-xs text-[#747571]">Code（唯一标识）</label>
                <Input value={editCode} onChange={(e) => setEditCode(e.target.value)} className="h-9 rounded-[10px]" placeholder="如: premium" />
              </div>
            )}
            <div className="grid gap-1">
              <label className="text-xs text-[#747571]">级别（数字，数值越高优先级越高）</label>
              <Input
                type="number"
                value={editLevel}
                onChange={(e) => setEditLevel(Number(e.target.value))}
                className="h-9 rounded-[10px]"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-[#111111]">
              <Checkbox
                checked={editCanUseTools}
                onCheckedChange={(v) => setEditCanUseTools(v === true)}
              />
              <span className="text-xs text-[#747571]">允许使用工具</span>
            </label>
            <div className="grid gap-1">
              <label className="text-xs text-[#747571]">
                工具白名单
                <span className="ml-1 text-[#a1a1aa]">（每行一个工具名称）</span>
              </label>
              <Textarea
                value={editToolAllowlist}
                onChange={(e) => setEditToolAllowlist(e.target.value)}
                className="min-h-[80px] rounded-[10px]"
                placeholder={"tool_a\ntool_b\ntool_c"}
              />
            </div>
            <div className="grid gap-1">
              <label className="text-xs text-[#747571]">
                附加功能配置
                <span className="ml-1 text-[#a1a1aa]">（JSON 格式）</span>
              </label>
              <Textarea
                value={editFeatures}
                onChange={(e) => setEditFeatures(e.target.value)}
                className="min-h-[100px] rounded-[10px] font-mono text-xs"
                placeholder='{"max_daily_queries": 100, "enable_export": true}'
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" className="rounded-[10px]" onClick={() => setEditOpen(false)}>取消</Button>
              <Button size="sm" className="rounded-[10px]" disabled={editBusy} onClick={submitEdit}>{editBusy ? "保存中…" : "保存"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="max-w-md rounded-[14px]">
          <DialogTitle>确认删除</DialogTitle>
          <p className="text-sm text-[#747571]">
            确定删除套餐「{deleteTarget?.name}」？若有用户正在使用此套餐，删除将失败。
          </p>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" size="sm" className="rounded-[10px]" onClick={() => setDeleteTarget(null)}>取消</Button>
            <Button size="sm" className="rounded-[10px] bg-red-600 hover:bg-red-700" disabled={deleteBusy} onClick={submitDelete}>{deleteBusy ? "删除中…" : "确定删除"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
