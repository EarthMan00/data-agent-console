"use client";

import { useCallback, useEffect, useState } from "react";
import { useOptionalPlatformAgent } from "@/components/platform-agent-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  adminListRoles,
  adminListPermissions,
  adminCreateRole,
  adminPatchRole,
  adminDeleteRole,
  AgentApiError,
  parseFastApiDetail,
} from "@/lib/agent-api/client";
import type { AdminRole, AdminPermission } from "@/lib/agent-api/types";

export function AdminRolesWorkspace() {
  const platformAgent = useOptionalPlatformAgent();
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [permissions, setPermissions] = useState<AdminPermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AdminRole | null>(null);
  const [editName, setEditName] = useState("");
  const [editCode, setEditCode] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editPermIds, setEditPermIds] = useState<string[]>([]);
  const [editBusy, setEditBusy] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<AdminRole | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!platformAgent?.auth) return;
    setLoading(true);
    setNotice("");
    try {
      await platformAgent.withFreshToken(async (token) => {
        const [rRes, pRes] = await Promise.all([
          adminListRoles(token),
          adminListPermissions(token),
        ]);
        setRoles(rRes.roles ?? []);
        setPermissions(pRes.permissions ?? []);
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
    setEditDesc("");
    setEditPermIds([]);
    setEditOpen(true);
  };

  const openEdit = (role: AdminRole) => {
    setEditTarget(role);
    setEditName(role.name);
    setEditCode(role.code);
    setEditDesc(role.description ?? "");
    setEditPermIds([...role.permission_ids]);
    setEditOpen(true);
  };

  const submitEdit = async () => {
    if (!platformAgent?.auth) return;
    if (editName.trim().length < 1) { setNotice("角色名称不能为空"); return; }
    setEditBusy(true);
    setNotice("");
    try {
      await platformAgent.withFreshToken(async (token) => {
        if (editTarget) {
          await adminPatchRole(token, editTarget.id, {
            name: editName.trim(),
            description: editDesc.trim() || undefined,
            permission_ids: editPermIds,
          });
        } else {
          await adminCreateRole(token, {
            name: editName.trim(),
            code: editCode.trim(),
            description: editDesc.trim() || undefined,
            permission_ids: editPermIds,
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
        await adminDeleteRole(token, deleteTarget.id);
      });
      setDeleteTarget(null);
      await refresh();
    } catch (e) {
      setNotice(e instanceof AgentApiError ? parseFastApiDetail(e.body) ?? e.message : String(e));
    } finally {
      setDeleteBusy(false);
    }
  };

  const groupedPerms = permissions.reduce<Record<string, AdminPermission[]>>((acc, p) => {
    (acc[p.resource] ??= []).push(p);
    return acc;
  }, {});

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-title-3 font-semibold leading-8 text-foreground">角色权限</h1>
          <p className="mt-2 text-sm leading-6 text-text-tertiary">管理后台角色，为角色分配不同的权限组合。</p>
        </div>
        <Button className="rounded-control" onClick={openCreate}>新增角色</Button>
      </div>

      {notice ? <p className="mt-4 text-sm text-danger">{notice}</p> : null}

      <div className="mt-8 overflow-hidden rounded-popover border border-border bg-bg-surface shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-fill-hover text-xs font-medium uppercase tracking-wide text-text-tertiary">
            <tr>
              <th className="px-4 py-3">角色名称</th>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">描述</th>
              <th className="px-4 py-3">用户数</th>
              <th className="px-4 py-3">系统角色</th>
              <th className="px-4 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-text-disabled">加载中…</td></tr>
            ) : roles.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-text-disabled">暂无角色</td></tr>
            ) : roles.map((role) => (
              <tr key={role.id} className="border-b border-border-subtle last:border-0">
                <td className="px-4 py-3 font-medium text-foreground">{role.name}</td>
                <td className="px-4 py-3 font-mono text-xs text-text-tertiary">{role.code}</td>
                <td className="px-4 py-3 text-text-tertiary">{role.description ?? "—"}</td>
                <td className="px-4 py-3 text-text-tertiary">{role.user_count}</td>
                <td className="px-4 py-3">{role.is_system ? <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs text-violet-800">系统</span> : "—"}</td>
                <td className="px-4 py-3 text-right">
                  <Button variant="ghost" size="sm" className="h-8 rounded-md" onClick={() => openEdit(role)}>编辑</Button>
                  {!role.is_system && (
                    <Button variant="ghost" size="sm" className="h-8 rounded-md text-danger" onClick={() => setDeleteTarget(role)}>删除</Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={(o) => !o && setEditOpen(false)}>
        <DialogContent className="max-w-lg rounded-card">
          <DialogTitle>{editTarget ? "编辑角色" : "新增角色"}</DialogTitle>
          <div className="grid gap-3 pt-2">
            <div className="grid gap-1">
              <label className="text-xs text-text-tertiary">角色名称</label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-9 rounded-control" />
            </div>
            {!editTarget && (
              <div className="grid gap-1">
                <label className="text-xs text-text-tertiary">Code（唯一标识）</label>
                <Input value={editCode} onChange={(e) => setEditCode(e.target.value)} className="h-9 rounded-control" placeholder="如: super_admin" />
              </div>
            )}
            <div className="grid gap-1">
              <label className="text-xs text-text-tertiary">描述</label>
              <Input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} className="h-9 rounded-control" />
            </div>
            <div className="grid gap-2">
              <label className="text-xs font-medium text-text-tertiary">权限</label>
              <div className="max-h-75 overflow-auto rounded-control border border-border p-3">
                {Object.entries(groupedPerms).map(([resource, perms]) => (
                  <div key={resource} className="mb-3 last:mb-0">
                    <p className="mb-1 text-xs font-semibold text-text-secondary">{resource}</p>
                    {perms.map((perm) => (
                      <label key={perm.id} className="flex items-center gap-2 py-0.5 text-sm text-foreground">
                        <Checkbox
                          checked={editPermIds.includes(perm.id)}
                          onCheckedChange={(v) => {
                            setEditPermIds(v ? [...editPermIds, perm.id] : editPermIds.filter((id) => id !== perm.id));
                          }}
                        />
                        <span className="font-mono text-xs text-text-tertiary">{perm.code}</span>
                        <span className="text-xs text-text-disabled">{perm.name}</span>
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" className="rounded-control" onClick={() => setEditOpen(false)}>取消</Button>
              <Button size="sm" className="rounded-control" disabled={editBusy} onClick={submitEdit}>{editBusy ? "保存中…" : "保存"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="max-w-md rounded-card">
          <DialogTitle>确认删除</DialogTitle>
          <p className="text-sm text-text-tertiary">确定删除角色「{deleteTarget?.name}」？已分配此角色的用户将失去对应权限。</p>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" size="sm" className="rounded-control" onClick={() => setDeleteTarget(null)}>取消</Button>
            <Button size="sm" className="rounded-control bg-danger hover:bg-danger-hover" disabled={deleteBusy} onClick={submitDelete}>{deleteBusy ? "删除中…" : "确定删除"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
