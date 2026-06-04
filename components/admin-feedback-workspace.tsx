"use client";

import { useCallback, useEffect, useState } from "react";
import { useOptionalPlatformAgent } from "@/components/platform-agent-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  adminListFeedback,
  adminPatchFeedback,
  AgentApiError,
  parseFastApiDetail,
} from "@/lib/agent-api/client";
import type { AdminFeedbackEntry } from "@/lib/agent-api/types";

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    new: "bg-blue-100 text-blue-800",
    read: "bg-green-100 text-green-800",
    archived: "bg-gray-100 text-gray-600",
  };
  const labels: Record<string, string> = {
    new: "new",
    read: "已读",
    archived: "已归档",
  };
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${colors[status] ?? "bg-gray-100 text-gray-600"}`}
    >
      {labels[status] ?? status}
    </span>
  );
}

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function truncateId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 8)}...`;
}

function truncateMsg(msg: string, max = 80): string {
  if (msg.length <= max) return msg;
  return `${msg.slice(0, max)}...`;
}

export function AdminFeedbackWorkspace() {
  const platformAgent = useOptionalPlatformAgent();
  const [entries, setEntries] = useState<AdminFeedbackEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");

  // Filters
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPagePath, setFilterPagePath] = useState("");
  const [appliedStatus, setAppliedStatus] = useState("");
  const [appliedPagePath, setAppliedPagePath] = useState("");

  // Note dialog
  const [noteTarget, setNoteTarget] = useState<AdminFeedbackEntry | null>(null);
  const [noteText, setNoteText] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!platformAgent?.auth) return;
    setLoading(true);
    setNotice("");
    try {
      await platformAgent.withFreshToken(async (token) => {
        const params: { status?: string; page_path?: string } = {};
        if (appliedStatus) params.status = appliedStatus;
        if (appliedPagePath) params.page_path = appliedPagePath;
        const res = await adminListFeedback(token, params);
        setEntries(res.entries ?? []);
      });
    } catch (e) {
      setNotice(
        e instanceof AgentApiError
          ? parseFastApiDetail(e.body) ?? e.message
          : String(e),
      );
    } finally {
      setLoading(false);
    }
  }, [platformAgent, appliedStatus, appliedPagePath]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleFilter = () => {
    setAppliedStatus(filterStatus);
    setAppliedPagePath(filterPagePath);
  };

  const handleStatusChange = async (
    entry: AdminFeedbackEntry,
    status: string,
  ) => {
    if (!platformAgent?.auth) return;
    setNotice("");
    try {
      await platformAgent.withFreshToken(async (token) => {
        await adminPatchFeedback(token, entry.id, { status });
      });
      setEntries((prev) =>
        prev.map((e) => (e.id === entry.id ? { ...e, status } : e)),
      );
    } catch (e) {
      setNotice(
        e instanceof AgentApiError
          ? parseFastApiDetail(e.body) ?? e.message
          : String(e),
      );
    }
  };

  const openNote = (entry: AdminFeedbackEntry) => {
    setNoteTarget(entry);
    setNoteText(entry.admin_note ?? "");
  };

  const saveNote = async () => {
    if (!platformAgent?.auth || !noteTarget) return;
    setNoteBusy(true);
    setNotice("");
    try {
      await platformAgent.withFreshToken(async (token) => {
        await adminPatchFeedback(token, noteTarget.id, {
          admin_note: noteText || undefined,
        });
      });
      setEntries((prev) =>
        prev.map((e) =>
          e.id === noteTarget.id ? { ...e, admin_note: noteText } : e,
        ),
      );
      setNoteTarget(null);
    } catch (e) {
      setNotice(
        e instanceof AgentApiError
          ? parseFastApiDetail(e.body) ?? e.message
          : String(e),
      );
    } finally {
      setNoteBusy(false);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-semibold leading-8 text-[#111111]">
            反馈管理
          </h1>
          <p className="mt-2 text-sm leading-6 text-[#747571]">
            查看和管理用户提交的反馈。
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="mt-6 flex flex-wrap items-end gap-3">
        <div className="grid gap-1">
          <label className="text-xs text-[#747571]">状态</label>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="h-9 rounded-[10px] border border-[#e2e2df] bg-white px-3 text-sm text-[#111111] outline-none focus:border-[#111111]"
          >
            <option value="">全部</option>
            <option value="new">new</option>
            <option value="read">read</option>
            <option value="archived">archived</option>
          </select>
        </div>
        <div className="grid gap-1">
          <label className="text-xs text-[#747571]">页面路径</label>
          <input
            value={filterPagePath}
            onChange={(e) => setFilterPagePath(e.target.value)}
            className="h-9 rounded-[10px] border border-[#e2e2df] bg-white px-3 text-sm text-[#111111] outline-none placeholder:text-[#a1a1aa] focus:border-[#111111]"
            placeholder="如: /chat"
          />
        </div>
        <Button className="rounded-[10px]" onClick={handleFilter}>
          筛选
        </Button>
      </div>

      {notice ? (
        <p className="mt-4 text-sm text-red-600">{notice}</p>
      ) : null}

      <div className="mt-4 overflow-hidden rounded-[18px] border border-[#e2e2df] bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[#e2e2df] bg-[#f7f7f7] text-xs font-medium uppercase tracking-wide text-[#747571]">
            <tr>
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">时间</th>
              <th className="px-4 py-3">页面</th>
              <th className="px-4 py-3">反馈内容</th>
              <th className="px-4 py-3">状态</th>
              <th className="px-4 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-[#94a3b8]"
                >
                  加载中…
                </td>
              </tr>
            ) : entries.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-[#94a3b8]"
                >
                  暂无反馈
                </td>
              </tr>
            ) : (
              entries.map((entry) => (
                <tr
                  key={entry.id}
                  className="border-b border-[#f0f0ef] last:border-0"
                >
                  <td className="max-w-[100px] truncate px-4 py-3 font-mono text-xs text-[#747571]">
                    {truncateId(entry.id)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-[#747571]">
                    {fmtDate(entry.created_at)}
                  </td>
                  <td className="max-w-[150px] truncate px-4 py-3 text-[#747571]">
                    {entry.page_path}
                  </td>
                  <td
                    className="max-w-[280px] truncate px-4 py-3 text-[#111111]"
                    title={entry.message}
                  >
                    {truncateMsg(entry.message)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={entry.status} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {entry.status !== "read" ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 rounded-[8px]"
                        onClick={() => handleStatusChange(entry, "read")}
                      >
                        已读
                      </Button>
                    ) : null}
                    {entry.status !== "archived" ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 rounded-[8px]"
                        onClick={() => handleStatusChange(entry, "archived")}
                      >
                        归档
                      </Button>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 rounded-[8px]"
                      onClick={() => openNote(entry)}
                    >
                      备注
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Admin Note Dialog */}
      <Dialog
        open={!!noteTarget}
        onOpenChange={(o) => !o && setNoteTarget(null)}
      >
        <DialogContent className="max-w-md rounded-[14px]">
          <DialogTitle>编辑备注</DialogTitle>
          <div className="grid gap-3 pt-2">
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              className="min-h-[120px] rounded-[10px] border border-[#e2e2df] bg-white p-3 text-sm text-[#111111] outline-none focus:border-[#111111]"
              placeholder="管理员备注…"
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                className="rounded-[10px]"
                onClick={() => setNoteTarget(null)}
              >
                取消
              </Button>
              <Button
                size="sm"
                className="rounded-[10px]"
                disabled={noteBusy}
                onClick={saveNote}
              >
                {noteBusy ? "保存中…" : "保存"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
