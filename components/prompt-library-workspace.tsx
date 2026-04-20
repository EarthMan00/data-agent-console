"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRightLeft,
  Copy,
  Eye,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";

import { AutoToast } from "@/components/auto-toast";
import { MoreDataShell } from "@/components/more-data-shell";
import { useOptionalPlatformAgent } from "@/components/platform-agent-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { AgentApiError, parseFastApiDetail } from "@/lib/agent-api/client";
import { AGENT_COMPOSER_PREFILL_STORAGE_KEY } from "@/lib/agent-api/session";
import type { UserPromptDto, UserPromptGroupDto } from "@/lib/agent-api/types";
import {
  createUserPrompt,
  createUserPromptGroup,
  deleteUserPrompt,
  deleteUserPromptGroup,
  listUserPromptGroups,
  listUserPrompts,
  patchUserPrompt,
} from "@/lib/agent-api/user-prompts";
import { cn } from "@/lib/utils";

type FilterTab = { kind: "all" } | { kind: "default" } | { kind: "group"; id: string };

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

async function fetchAllGroups(token: string): Promise<UserPromptGroupDto[]> {
  const out: UserPromptGroupDto[] = [];
  let page = 1;
  const page_size = 100;
  while (true) {
    const r = await listUserPromptGroups(token, page, page_size);
    out.push(...r.items);
    if (out.length >= r.total || r.items.length === 0) break;
    page += 1;
  }
  return out;
}

async function fetchAllPromptsForFilter(
  token: string,
  tab: FilterTab,
): Promise<UserPromptDto[]> {
  const out: UserPromptDto[] = [];
  let page = 1;
  const page_size = 100;
  while (true) {
    const params =
      tab.kind === "all"
        ? { page, page_size }
        : tab.kind === "default"
          ? { page, page_size, only_default: true as const }
          : { page, page_size, group_id: tab.id };
    const r = await listUserPrompts(token, params);
    out.push(...r.items);
    if (out.length >= r.total || r.items.length === 0) break;
    page += 1;
  }
  return out;
}

export function PromptLibraryWorkspace() {
  const router = useRouter();
  const platformAgent = useOptionalPlatformAgent();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [groups, setGroups] = useState<UserPromptGroupDto[]>([]);
  const [prompts, setPrompts] = useState<UserPromptDto[]>([]);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<FilterTab>({ kind: "all" });

  const [addGroupOpen, setAddGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");

  const [saveOpen, setSaveOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formPrompt, setFormPrompt] = useState("");
  const [formGroupId, setFormGroupId] = useState<string | null>(null);

  const [preview, setPreview] = useState<UserPromptDto | null>(null);
  const [moveTarget, setMoveTarget] = useState<UserPromptDto | null>(null);
  const [moveGroupId, setMoveGroupId] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [renameOpen, setRenameOpen] = useState(false);
  const [renamePromptId, setRenamePromptId] = useState<string | null>(null);
  const [deletePromptId, setDeletePromptId] = useState<string | null>(null);
  const [deleteGroupId, setDeleteGroupId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!platformAgent?.auth) return;
    setBusy(true);
    setError("");
    try {
      await platformAgent.withFreshToken(async (token) => {
        const [g, p] = await Promise.all([fetchAllGroups(token), fetchAllPromptsForFilter(token, tab)]);
        setGroups(g);
        setPrompts(p);
      });
    } catch (e) {
      const msg =
        e instanceof AgentApiError
          ? parseFastApiDetail(e.body) ?? e.message
          : e instanceof Error
            ? e.message
            : String(e);
      setError(msg || "加载失败");
    } finally {
      setBusy(false);
    }
  }, [platformAgent, tab]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filteredPrompts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return prompts;
    return prompts.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.prompt_text.toLowerCase().includes(q),
    );
  }, [prompts, search]);

  const openCreate = () => {
    setError("");
    setEditingId(null);
    setFormTitle("");
    setFormDescription("");
    setFormPrompt("");
    setFormGroupId(tab.kind === "default" ? null : tab.kind === "group" ? tab.id : null);
    setSaveOpen(true);
  };

  const openEdit = (p: UserPromptDto) => {
    setError("");
    setEditingId(p.id);
    setFormTitle(p.title);
    setFormDescription(p.description);
    setFormPrompt(p.prompt_text);
    setFormGroupId(p.group_id);
    setSaveOpen(true);
  };

  const submitSave = async () => {
    if (!platformAgent?.auth) return;
    if (!formTitle.trim() || !formPrompt.trim()) {
      setError("请填写标题与提示词 prompt。");
      return;
    }
    setError("");
    try {
      await platformAgent.withFreshToken(async (token) => {
        if (editingId) {
          await patchUserPrompt(token, editingId, {
            title: formTitle.trim(),
            description: formDescription,
            prompt_text: formPrompt.trim(),
            group_id: formGroupId,
          });
        } else {
          await createUserPrompt(token, {
            title: formTitle.trim(),
            description: formDescription,
            prompt_text: formPrompt.trim(),
            group_id: formGroupId,
          });
        }
      });
      setSaveOpen(false);
      await refresh();
    } catch (e) {
      const msg =
        e instanceof AgentApiError
          ? parseFastApiDetail(e.body) ?? e.message
          : e instanceof Error
            ? e.message
            : String(e);
      setError(msg || "保存失败");
    }
  };

  const submitNewGroup = async () => {
    if (!platformAgent?.auth) return;
    try {
      await platformAgent.withFreshToken(async (token) => {
        const g = await createUserPromptGroup(token, newGroupName.trim());
        setGroups((prev) => [g, ...prev.filter((x) => x.id !== g.id)]);
        setTab({ kind: "group", id: g.id });
        setAddGroupOpen(false);
        setNewGroupName("");
      });
    } catch (e) {
      const msg =
        e instanceof AgentApiError
          ? parseFastApiDetail(e.body) ?? e.message
          : e instanceof Error
            ? e.message
            : String(e);
      setError(msg || "创建分组失败");
    }
  };

  const handleDeleteGroup = async (id: string) => {
    if (!platformAgent?.auth) return;
    try {
      await platformAgent.withFreshToken(async (token) => {
        await deleteUserPromptGroup(token, id);
      });
      setDeleteGroupId(null);
      if (tab.kind === "group" && tab.id === id) setTab({ kind: "all" });
      await refresh();
    } catch (e) {
      const msg =
        e instanceof AgentApiError
          ? parseFastApiDetail(e.body) ?? e.message
          : e instanceof Error
            ? e.message
            : String(e);
      setError(msg || "删除分组失败");
    }
  };

  const handleUsePrompt = (text: string) => {
    if (!platformAgent) return;
    if (!platformAgent.auth) {
      platformAgent.openLogin("请先登录后再使用提示词。");
      return;
    }
    try {
      sessionStorage.setItem(AGENT_COMPOSER_PREFILL_STORAGE_KEY, text);
    } catch {
      /* ignore */
    }
    /** 进入首页落地页（跨境运营助手 + 输入区），与「新的对话」一致；由首页读取预填文案 */
    router.push("/");
  };

  const copyText = async (t: string) => {
    try {
      await navigator.clipboard.writeText(t);
      setToastMessage("复制成功");
    } catch {
      /* 静默失败 */
    }
  };

  const submitRename = async () => {
    if (!platformAgent?.auth || !renamePromptId) return;
    if (!renameTitle.trim()) return;
    try {
      await platformAgent.withFreshToken(async (token) => {
        await patchUserPrompt(token, renamePromptId, { title: renameTitle.trim() });
      });
      setRenameOpen(false);
      setRenamePromptId(null);
      await refresh();
    } catch (e) {
      const msg =
        e instanceof AgentApiError
          ? parseFastApiDetail(e.body) ?? e.message
          : e instanceof Error
            ? e.message
            : String(e);
      setError(msg || "重命名失败");
    }
  };

  const submitMove = async () => {
    if (!platformAgent?.auth || !moveTarget) return;
    try {
      await platformAgent.withFreshToken(async (token) => {
        await patchUserPrompt(token, moveTarget.id, { group_id: moveGroupId });
      });
      setMoveTarget(null);
      setToastMessage("移动成功");
      await refresh();
    } catch (e) {
      const msg =
        e instanceof AgentApiError
          ? parseFastApiDetail(e.body) ?? e.message
          : e instanceof Error
            ? e.message
            : String(e);
      setError(msg || "移动失败");
    }
  };

  return (
    <MoreDataShell currentPath="/prompt-library">
      <AutoToast
        message={toastMessage}
        onDismiss={() => setToastMessage(null)}
        durationMs={2000}
      />
      <div className="px-8 pb-12 pt-8">
        <div className="mx-auto max-w-[1180px]">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="min-w-0 flex-1">
              <h1 className="font-[family:var(--font-jakarta)] text-[24px] font-semibold text-[#18181b]">我的提示词</h1>

              <div className="mt-5 flex flex-wrap items-center gap-2">
                <FilterChip
                  active={tab.kind === "all"}
                  onClick={() => setTab({ kind: "all" })}
                  label="全部"
                  deletable={false}
                />
                <FilterChip
                  active={tab.kind === "default"}
                  onClick={() => setTab({ kind: "default" })}
                  label="默认"
                  deletable={false}
                />
                {groups.map((g) => (
                  <FilterChip
                    key={g.id}
                    active={tab.kind === "group" && tab.id === g.id}
                    onClick={() => setTab({ kind: "group", id: g.id })}
                    label={g.name || "未命名"}
                    deletable
                    onDelete={() => setDeleteGroupId(g.id)}
                  />
                ))}
                {addGroupOpen ? (
                  <div className="flex items-center gap-1">
                    <Input
                      autoFocus
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      placeholder="请输入分组名称"
                      className="h-8 w-[160px] rounded-[8px] border-[#d4d4d8] text-sm"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void submitNewGroup();
                        if (e.key === "Escape") {
                          setAddGroupOpen(false);
                          setNewGroupName("");
                        }
                      }}
                    />
                    <Button type="button" size="sm" variant="ghost" className="h-8 px-2" onClick={() => void submitNewGroup()}>
                      确定
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 rounded-[8px] border-[#e5e7eb]"
                    aria-label="新建分组"
                    onClick={() => setAddGroupOpen(true)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#71717a]" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="搜索提示词"
                  className="h-9 w-[220px] rounded-[10px] border-[#e5e7eb] pl-9"
                />
              </div>
              <Button
                className="h-9 rounded-[10px] bg-[#18181b] px-4 text-white hover:bg-[#27272a]"
                onClick={openCreate}
              >
                <Plus className="mr-1.5 h-4 w-4" />
                创建提示词
              </Button>
            </div>
          </div>

          {error ? (
            <div className="mt-6 text-sm text-red-600">
              {error}
            </div>
          ) : null}
          {busy ? <div className="mt-6 text-sm text-[#71717a]">加载中…</div> : null}

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredPrompts.map((p) => (
              <Card key={p.id} className="overflow-hidden border-[#e5e7eb]">
                <div className="min-h-[140px] bg-[#f5f5f5] px-4 py-4 text-[13px] leading-relaxed text-[#3f3f46]">
                  <p className="line-clamp-6 whitespace-pre-wrap">{p.prompt_text}</p>
                </div>
                <CardContent className="border-t border-[#e5e7eb] px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-[#18181b]">{p.title}</div>
                      <div className="mt-1 text-xs text-[#a1a1aa]">{formatDateTime(p.updated_at)}</div>
                    </div>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 rounded-[8px]">
                          <MoreVertical className="h-4 w-4 text-[#71717a]" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-48 p-1" align="end">
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-[#f4f4f5]"
                          onClick={() => openEdit(p)}
                        >
                          <Pencil className="h-4 w-4" />
                          编辑
                        </button>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-[#f4f4f5]"
                          onClick={() => {
                            setMoveTarget(p);
                            setMoveGroupId(p.group_id);
                          }}
                        >
                          <ArrowRightLeft className="h-4 w-4" />
                          移动到
                        </button>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-[#f4f4f5]"
                          onClick={() => {
                            setRenamePromptId(p.id);
                            setRenameTitle(p.title);
                            setRenameOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                          重命名
                        </button>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-[#f4f4f5]"
                          onClick={() => void copyText(p.prompt_text)}
                        >
                          <Copy className="h-4 w-4" />
                          复制提示词
                        </button>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                          onClick={() => setDeletePromptId(p.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                          删除
                        </button>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-[8px]"
                      onClick={() => setPreview(p)}
                    >
                      <Eye className="mr-1 h-3.5 w-3.5" />
                      预览
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="rounded-[8px] bg-[#1f2b1f] text-white hover:bg-[#283728]"
                      onClick={() => void handleUsePrompt(p.prompt_text)}
                    >
                      使用
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {!busy && filteredPrompts.length === 0 ? (
            <Card className="mt-8 border-dashed border-[#d4d4d8] bg-[#fafafa]">
              <CardContent className="px-5 py-8">
                <div className="text-[15px] font-medium text-[#18181b]">暂无提示词</div>
                <p className="mt-2 text-sm leading-6 text-[#71717a]">切换分组或点击「创建提示词」添加一条。</p>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="max-w-[540px] rounded-[18px] border-[#e5e7eb] p-0">
          <div className="px-8 pb-8 pt-7">
            <DialogTitle className="text-[18px] font-semibold text-[#18181b]">
              {editingId ? "编辑提示词" : "保存提示词"}
            </DialogTitle>
            <DialogDescription className="mt-2 text-sm leading-6 text-[#71717a]">
              标题与提示词为必填；分组留空为默认分组。可使用 {"{{}}"} 与 [[]] 编写可编辑参数（示例见占位）。
            </DialogDescription>
            <div className="mt-6 space-y-5">
              <div className="space-y-2">
                <label className="text-sm text-[#52525b]">标题 *</label>
                <Input
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="为这个提示词起个名字吧"
                  className="h-12 rounded-[12px] border-[#d4d4d8]"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-[#52525b]">分组</label>
                <select
                  value={formGroupId ?? ""}
                  onChange={(e) => setFormGroupId(e.target.value === "" ? null : e.target.value)}
                  className="h-12 w-full rounded-[12px] border border-[#e5e7eb] bg-white px-4 text-sm text-[#18181b]"
                >
                  <option value="">默认</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name || "未命名"}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm text-[#52525b]">简介</label>
                <Input
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="请填写简介信息"
                  className="h-11 rounded-[12px] border-[#e5e7eb]"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-[#52525b]">提示词 prompt *</label>
                <Textarea
                  value={formPrompt}
                  onChange={(e) => setFormPrompt(e.target.value)}
                  placeholder={
                    "示例：@卖家精灵-选产品 在亚马逊[[美国站]]搜索关键词 '{{Sports Water Bottles}}' 产品…\n可通过 {{}} 设置可编辑参数，如 [[亚马逊美国站]]"
                  }
                  className="min-h-[180px] rounded-[12px] border-[#e5e7eb] px-4 py-3"
                />
              </div>
            </div>
            <div className="mt-8 flex justify-end gap-3">
              <Button variant="outline" className="rounded-[10px]" onClick={() => setSaveOpen(false)}>
                取消
              </Button>
              <Button className="rounded-[10px] bg-[#18181b] text-white hover:bg-[#27272a]" onClick={() => void submitSave()}>
                保存
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(preview)} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-[520px] rounded-[16px] p-0">
          {preview ? (
            <div className="px-6 pb-6 pt-5">
              <DialogTitle className="pr-8 text-lg font-semibold text-[#18181b]">{preview.title}</DialogTitle>
              {preview.description ? (
                <p className="mt-2 text-sm text-[#71717a]">{preview.description}</p>
              ) : null}
              <div className="mt-4 rounded-[12px] bg-[#f5f5f5] p-4">
                <div className="flex items-center justify-between border-b border-[#e5e7eb] pb-2 text-xs text-[#71717a]">
                  <span>提示词(Prompt)</span>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-[#18181b] hover:underline"
                    onClick={() => void copyText(preview.prompt_text)}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    复制
                  </button>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-[#18181b]">{preview.prompt_text}</p>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <Button variant="outline" className="rounded-[10px]" onClick={() => setPreview(null)}>
                  取消
                </Button>
                <Button
                  className="rounded-[10px] bg-[#1f2b1f] text-white hover:bg-[#283728]"
                  onClick={() => {
                    void handleUsePrompt(preview.prompt_text);
                    setPreview(null);
                  }}
                >
                  使用
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(moveTarget)} onOpenChange={(o) => !o && setMoveTarget(null)}>
        <DialogContent className="max-w-[400px] rounded-[16px]">
          <DialogTitle>移动到</DialogTitle>
          <DialogDescription>选择目标分组（默认表示未分组）</DialogDescription>
          <select
            value={moveGroupId ?? ""}
            onChange={(e) => setMoveGroupId(e.target.value === "" ? null : e.target.value)}
            className="mt-4 h-11 w-full rounded-[10px] border border-[#e5e7eb] px-3"
          >
            <option value="">默认</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name || "未命名"}
              </option>
            ))}
          </select>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setMoveTarget(null)}>
              取消
            </Button>
            <Button className="bg-[#18181b] text-white" onClick={() => void submitMove()}>
              确定
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="max-w-[400px] rounded-[16px]">
          <DialogTitle>重命名</DialogTitle>
          <Input value={renameTitle} onChange={(e) => setRenameTitle(e.target.value)} className="mt-4" placeholder="新标题" />
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRenameOpen(false)}>
              取消
            </Button>
            <Button className="bg-[#18181b] text-white" onClick={() => void submitRename()}>
              保存
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deletePromptId)} onOpenChange={(o) => !o && setDeletePromptId(null)}>
        <DialogContent className="max-w-[400px] rounded-[16px]">
          <DialogTitle>删除提示词</DialogTitle>
          <DialogDescription>确定删除？此操作不可恢复。</DialogDescription>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeletePromptId(null)}>
              取消
            </Button>
            <Button
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={async () => {
                if (!platformAgent?.auth || !deletePromptId) return;
                try {
                  await platformAgent.withFreshToken(async (token) => {
                    await deleteUserPrompt(token, deletePromptId);
                  });
                  setDeletePromptId(null);
                  await refresh();
                } catch (e) {
                  const msg =
                    e instanceof AgentApiError
                      ? parseFastApiDetail(e.body) ?? e.message
                      : e instanceof Error
                        ? e.message
                        : String(e);
                  setError(msg || "删除失败");
                }
              }}
            >
              删除
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteGroupId)}
        onOpenChange={(o) => {
          if (!o) setDeleteGroupId(null);
        }}
      >
        <DialogContent className="max-w-[420px] rounded-[16px] border-[#e8e8ea] p-0 pt-8 [&>button]:hidden">
          <div className="px-8 pb-8">
            <DialogTitle className="text-[17px] font-semibold leading-snug text-[#18181b]">
              是否确认删除分组？
            </DialogTitle>
            <DialogDescription className="mt-3 text-sm leading-relaxed text-[#71717a]">
              删除后，该分组的提示词，可在【默认】查看
            </DialogDescription>
            <div className="mt-8 flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                className="h-9 min-w-[88px] rounded-[10px] border-[#e4e4e7] bg-white text-[#18181b] hover:bg-[#fafafa]"
                onClick={() => setDeleteGroupId(null)}
              >
                取消
              </Button>
              <Button
                type="button"
                className="h-9 min-w-[88px] rounded-[10px] border-0 bg-[#f26b5b] text-white hover:bg-[#e05548]"
                onClick={() => {
                  if (deleteGroupId) void handleDeleteGroup(deleteGroupId);
                }}
              >
                删除
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </MoreDataShell>
  );
}

function FilterChip({
  label,
  active,
  onClick,
  deletable,
  onDelete,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  deletable: boolean;
  onDelete?: () => void;
}) {
  return (
    <div
      className={cn(
        "group relative inline-flex items-center rounded-[8px] border px-3 py-1.5 text-sm transition",
        active
          ? "border-[#e4e4e7] bg-[linear-gradient(180deg,#f5f5f5,#efefef)] font-medium text-[#18181b]"
          : "border-transparent bg-[#f4f4f5] text-[#52525b] hover:bg-[#e4e4e7]/50",
      )}
    >
      <button type="button" className="max-w-[200px] truncate pr-0.5 text-left" onClick={onClick}>
        {label}
      </button>
      {deletable && onDelete ? (
        <button
          type="button"
          className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#e4e4e7] text-[#52525b] opacity-0 shadow-sm transition hover:bg-[#d4d4d8] group-hover:opacity-100"
          aria-label={`删除分组 ${label}`}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <X className="h-3 w-3" />
        </button>
      ) : null}
    </div>
  );
}
