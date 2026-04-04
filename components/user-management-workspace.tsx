"use client";

import { useCallback, useEffect, useState } from "react";

import { InlineNotice } from "@/components/inline-notice";
import { MoreDataShell } from "@/components/more-data-shell";
import { useOptionalPlatformAgent } from "@/components/platform-agent-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  adminCreateUser,
  adminDeleteUser,
  adminListUsers,
  adminPatchUser,
  AgentApiError,
  parseFastApiDetail,
} from "@/lib/agent-api/client";
import type { AdminUserRow } from "@/lib/agent-api/types";

export function UserManagementWorkspace() {
  const platformAgent = useOptionalPlatformAgent();
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"user" | "admin">("user");
  const [createBusy, setCreateBusy] = useState(false);

  const [pwdTarget, setPwdTarget] = useState<AdminUserRow | null>(null);
  const [pwdValue, setPwdValue] = useState("");
  const [pwdBusy, setPwdBusy] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<AdminUserRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!platformAgent?.auth) return;
    setLoading(true);
    setNotice("");
    try {
      await platformAgent.withFreshToken(async (token) => {
        const res = await adminListUsers(token);
        setUsers(res.users ?? []);
      });
    } catch (e) {
      setNotice(
        e instanceof AgentApiError ? parseFastApiDetail(e.body) ?? e.message : e instanceof Error ? e.message : String(e),
      );
    } finally {
      setLoading(false);
    }
  }, [platformAgent]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const submitCreate = async () => {
    if (!platformAgent?.auth) return;
    const u = newUsername.trim();
    const p = newPassword;
    if (u.length < 2 || p.length < 4) {
      setNotice("用户名至少 2 个字符，密码至少 4 个字符。");
      return;
    }
    setCreateBusy(true);
    setNotice("");
    try {
      await platformAgent.withFreshToken(async (token) => {
        await adminCreateUser(token, {
          username: u,
          password: p,
          role: newRole,
          status: "active",
        });
      });
      setCreateOpen(false);
      setNewUsername("");
      setNewPassword("");
      setNewRole("user");
      await refresh();
    } catch (e) {
      setNotice(
        e instanceof AgentApiError ? parseFastApiDetail(e.body) ?? e.message : e instanceof Error ? e.message : String(e),
      );
    } finally {
      setCreateBusy(false);
    }
  };

  const submitPassword = async () => {
    if (!platformAgent?.auth || !pwdTarget) return;
    if (pwdValue.length < 4) {
      setNotice("新密码至少 4 个字符。");
      return;
    }
    setPwdBusy(true);
    setNotice("");
    try {
      await platformAgent.withFreshToken(async (token) => {
        await adminPatchUser(token, pwdTarget.user_id, { password: pwdValue });
      });
      setPwdTarget(null);
      setPwdValue("");
      await refresh();
    } catch (e) {
      setNotice(
        e instanceof AgentApiError ? parseFastApiDetail(e.body) ?? e.message : e instanceof Error ? e.message : String(e),
      );
    } finally {
      setPwdBusy(false);
    }
  };

  const submitDelete = async () => {
    if (!platformAgent?.auth || !deleteTarget) return;
    setDeleteBusy(true);
    setNotice("");
    try {
      await platformAgent.withFreshToken(async (token) => {
        await adminDeleteUser(token, deleteTarget.user_id);
      });
      setDeleteTarget(null);
      await refresh();
    } catch (e) {
      setNotice(
        e instanceof AgentApiError ? parseFastApiDetail(e.body) ?? e.message : e instanceof Error ? e.message : String(e),
      );
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <MoreDataShell currentPath="/user-management" currentRunLabel="用户管理">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-[#1e293b]">用户管理</h1>
            <p className="mt-1 text-sm text-[#64748b]">查看、新增账号，重置密码或删除非管理员账号。</p>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" className="rounded-[10px]" onClick={() => void refresh()}>
              刷新
            </Button>
            <Button type="button" size="sm" className="rounded-[10px]" onClick={() => setCreateOpen(true)}>
              新增账号
            </Button>
          </div>
        </div>

        {notice ? (
          <div className="mt-4">
            <InlineNotice message={notice} />
          </div>
        ) : null}

        <div className="mt-6 overflow-hidden rounded-[14px] border border-[#e2e8f0] bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[#e2e8f0] bg-[#f8fafc] text-xs font-medium uppercase tracking-wide text-[#64748b]">
              <tr>
                <th className="px-4 py-3">用户名</th>
                <th className="px-4 py-3">用户 ID</th>
                <th className="px-4 py-3">邮箱</th>
                <th className="px-4 py-3">角色</th>
                <th className="px-4 py-3">状态</th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-[#94a3b8]">
                    加载中…
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-[#94a3b8]">
                    暂无用户
                  </td>
                </tr>
              ) : (
                users.map((row) => {
                  const isAdminRole = row.role === "admin";
                  return (
                    <tr key={row.user_id} className="border-b border-[#f1f5f9] last:border-0">
                      <td className="px-4 py-3 font-medium text-[#334155]">{row.username}</td>
                      <td className="max-w-[200px] truncate px-4 py-3 font-mono text-xs text-[#64748b]" title={row.user_id}>
                        {row.user_id}
                      </td>
                      <td className="px-4 py-3 text-[#64748b]">{row.email ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs ${
                            isAdminRole ? "bg-violet-100 text-violet-800" : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {row.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[#64748b]">{row.status}</td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 rounded-[8px] text-[13px] text-[#475569]"
                          onClick={() => {
                            setPwdTarget(row);
                            setPwdValue("");
                          }}
                        >
                          修改密码
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 rounded-[8px] text-[13px] text-red-600 hover:text-red-700 disabled:opacity-40"
                          disabled={isAdminRole}
                          title={isAdminRole ? "不可删除管理员账号" : undefined}
                          onClick={() => setDeleteTarget(row)}
                        >
                          删除
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={createOpen} onOpenChange={(o) => !o && setCreateOpen(false)}>
        <DialogContent className="max-w-md rounded-[14px]" aria-describedby={undefined}>
          <DialogTitle className="text-lg text-[#1e293b]">新增账号</DialogTitle>
          <div className="grid gap-3 pt-2">
            <div className="grid gap-1">
              <label className="text-xs text-[#64748b]">用户名</label>
              <Input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} className="h-9 rounded-[10px]" />
            </div>
            <div className="grid gap-1">
              <label className="text-xs text-[#64748b]">密码</label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="h-9 rounded-[10px]"
                autoComplete="new-password"
              />
            </div>
            <div className="grid gap-1">
              <label className="text-xs text-[#64748b]">角色</label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as "user" | "admin")}
                className="h-9 rounded-[10px] border border-[#e2e8f0] bg-white px-3 text-sm"
              >
                <option value="user">user</option>
                <option value="admin">admin</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" className="rounded-[10px]" onClick={() => setCreateOpen(false)}>
                取消
              </Button>
              <Button type="button" size="sm" className="rounded-[10px]" disabled={createBusy} onClick={() => void submitCreate()}>
                {createBusy ? "提交中…" : "创建"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pwdTarget} onOpenChange={(o) => !o && setPwdTarget(null)}>
        <DialogContent className="max-w-md rounded-[14px]" aria-describedby={undefined}>
          <DialogTitle className="text-lg text-[#1e293b]">
            修改密码{pwdTarget ? `：${pwdTarget.username}` : ""}
          </DialogTitle>
          <p className="text-sm text-[#64748b]">直接设置新密码，无需验证旧密码。</p>
          <div className="grid gap-3 pt-2">
            <div className="grid gap-1">
              <label className="text-xs text-[#64748b]">新密码</label>
              <Input
                type="password"
                value={pwdValue}
                onChange={(e) => setPwdValue(e.target.value)}
                className="h-9 rounded-[10px]"
                autoComplete="new-password"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" className="rounded-[10px]" onClick={() => setPwdTarget(null)}>
                取消
              </Button>
              <Button type="button" size="sm" className="rounded-[10px]" disabled={pwdBusy} onClick={() => void submitPassword()}>
                {pwdBusy ? "保存中…" : "保存"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="max-w-md rounded-[14px]" aria-describedby={undefined}>
          <DialogTitle className="text-lg text-[#1e293b]">确认删除</DialogTitle>
          <p className="text-sm text-[#64748b]">
            确定删除用户「{deleteTarget?.username}」？该用户在库中的会话、任务等关联数据将一并删除，且不可恢复。
          </p>
          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" size="sm" className="rounded-[10px]" onClick={() => setDeleteTarget(null)}>
              取消
            </Button>
            <Button
              type="button"
              size="sm"
              className="rounded-[10px] bg-red-600 hover:bg-red-700"
              disabled={deleteBusy}
              onClick={() => void submitDelete()}
            >
              {deleteBusy ? "删除中…" : "确定删除"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </MoreDataShell>
  );
}
