"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRightLeft,
  Copy,
  Eye,
  MoreVertical,
  Package,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "@/components/ui/tabler-icons";

import { AutoToast } from "@/components/auto-toast";
import { MoreDataShell } from "@/components/more-data-shell";
import { PageLostState } from "@/components/page-lost-state";
import { RequiredAsterisk } from "@/components/required-mark";
import { useOptionalPlatformAgent } from "@/components/platform-agent-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { copyTextToClipboard } from "@/lib/clipboard";
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

type FilterTab = { kind: "all" } | { kind: "default" } | { kind: "group"; id: string };
const DEFAULT_GROUP_VALUE = "__default__";

const tabToValue = (tab: FilterTab) => (tab.kind === "group" ? `group:${tab.id}` : tab.kind);

function valueToTab(value: string): FilterTab {
  if (value === "default") return { kind: "default" };
  if (value.startsWith("group:")) return { kind: "group", id: value.slice("group:".length) };
  return { kind: "all" };
}

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
  const [loadError, setLoadError] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastVariant, setToastVariant] = useState<"default" | "error">("default");
  const [groups, setGroups] = useState<UserPromptGroupDto[]>([]);
  const [prompts, setPrompts] = useState<UserPromptDto[]>([]);
  const [search, setSearch] = useState("");
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);
  const searchDialogInputRef = useRef<HTMLInputElement | null>(null);
  const [tab, setTab] = useState<FilterTab>({ kind: "all" });

  const [addGroupOpen, setAddGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const newGroupInputRef = useRef<HTMLInputElement | null>(null);

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

  useEffect(() => {
    if (!searchDialogOpen) return;
    const timer = window.setTimeout(() => searchDialogInputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [searchDialogOpen]);

  const refresh = useCallback(async () => {
    if (!platformAgent?.auth) return;
    setBusy(true);
    setError("");
    setLoadError("");
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
      setLoadError(msg || "加载失败");
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
  const showLoadError = Boolean(loadError && !busy && groups.length === 0 && prompts.length === 0);

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

  const commitNewGroupInput = useCallback(async () => {
    if (!addGroupOpen) return;
    const name = newGroupName.trim();
    if (!name) {
      setAddGroupOpen(false);
      setNewGroupName("");
      return;
    }
    if (!platformAgent?.auth) return;

    const duplicate = groups.some((g) => (g.name || "").trim() === name);
    if (duplicate) {
      setToastMessage("已存在同名分组");
      setToastVariant("error");
      window.requestAnimationFrame(() => newGroupInputRef.current?.focus());
      return;
    }

    setError("");
    try {
      await platformAgent.withFreshToken(async (token) => {
        const g = await createUserPromptGroup(token, name);
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
  }, [addGroupOpen, newGroupName, groups, platformAgent]);

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
    const ok = await copyTextToClipboard(t);
    if (ok) {
      setToastVariant("default");
      setToastMessage("复制成功");
    } else {
      setToastVariant("default");
      setToastMessage("复制失败，请手动选中复制或为站点启用 HTTPS");
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
      setToastVariant("default");
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
    <MoreDataShell currentPath="/prompt-library" showTopHeader={false}>
      <AutoToast
        message={toastMessage}
        variant={toastVariant}
        onDismiss={() => {
          setToastMessage(null);
          setToastVariant("default");
        }}
        durationMs={2000}
      />
      <div className="px-8 pb-14 pt-5">
        <div className="mx-auto max-w-[1040px]">
          <div className="space-y-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h1 className="shrink-0 whitespace-nowrap text-[24px] font-semibold leading-8 text-[#111111]">我的提示词</h1>
              <div className="flex w-full min-w-0 flex-wrap items-center justify-end gap-2 sm:w-auto sm:justify-end">
                <div className="relative w-full min-w-0 max-[960px]:hidden sm:w-[220px]">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#71717a]" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="搜索提示词"
                    className="h-9 w-full rounded-[10px] border-[#e2e2df] pl-9"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="搜索提示词"
                  className="hidden h-9 w-9 shrink-0 rounded-[10px] border-[#e2e2df] bg-white text-[#34322d] hover:bg-[#f7f7f5] max-[960px]:inline-flex"
                  onClick={() => setSearchDialogOpen(true)}
                >
                  <Search className="h-4 w-4" />
                </Button>
                <Button
                  className="h-9 shrink-0 rounded-[10px] bg-[#111111] px-3 text-white hover:bg-[#2a2a2a] sm:px-4"
                  onClick={openCreate}
                >
                  <Plus />
                  创建提示词
                </Button>
              </div>
            </div>

            <div className="flex min-h-[40px] flex-wrap items-center justify-between gap-x-4 gap-y-3">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                <Tabs value={tabToValue(tab)} onValueChange={(value) => setTab(valueToTab(value))}>
                  <TabsList className="flex-wrap justify-start">
                    <TabsTrigger value="all">全部</TabsTrigger>
                    <TabsTrigger value="default">默认</TabsTrigger>
                    {groups.map((g) => (
                      <div key={g.id} className="group/chip relative inline-flex items-center rounded-[8px]">
                        <TabsTrigger value={`group:${g.id}`}>
                          <span className="max-w-[160px] truncate">{g.name || "未命名"}</span>
                        </TabsTrigger>
                        <Button
                          type="button"
                          variant="ghost"
                          aria-label={`删除分组 ${g.name || "未命名"}`}
                          className="pointer-events-none absolute -right-1 -top-1 z-10 h-4 w-4 rounded-full p-0 text-[#71717a] opacity-0 transition hover:bg-red-50 hover:text-red-600 focus-visible:pointer-events-auto focus-visible:opacity-100 group-hover/chip:pointer-events-auto group-hover/chip:opacity-100"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setDeleteGroupId(g.id);
                          }}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </TabsList>
                </Tabs>
                <Button
                  type="button"
                  variant="outline"
                  size="iconSm"
                  aria-label="新建分组"
                  onClick={() => {
                    setNewGroupName("");
                    setAddGroupOpen(true);
                  }}
                >
                  <Plus />
                </Button>
              </div>
            </div>
          </div>

          {error && !showLoadError ? (
            <div className="mt-6 text-sm text-red-600">
              {error}
            </div>
          ) : null}
          {busy ? <div className="mt-8 text-sm text-[#71717a]">加载中…</div> : null}

          {showLoadError ? (
            <PageLostState onRetry={() => void refresh()} />
          ) : !busy && filteredPrompts.length === 0 ? (
            prompts.length === 0 ? (
              <div className="mt-8 flex min-h-[calc(100vh-260px)] flex-col items-center justify-center px-4 text-center">
                <Package className="mb-4 text-[#b1b2ae]" strokeWidth={1.35} aria-hidden />
                <p className="max-w-md text-center text-[14px] leading-relaxed text-[#71717a]">
                  {tab.kind === "all"
                    ? "暂无提示词"
                    : tab.kind === "default"
                      ? "默认分组下暂无提示词"
                      : "该分组下暂无提示词"}{" "}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-auto px-1 py-0 align-baseline text-[14px] font-medium text-[#18181b] hover:bg-transparent hover:text-[#27272a]"
                    onClick={openCreate}
                  >
                    马上创建提示词
                  </Button>
                </p>
              </div>
            ) : (
              <div className="mt-16 flex flex-col items-center justify-center px-4 text-center">
                <p className="text-[14px] text-[#71717a]">未找到匹配的提示词</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-2 h-8 px-2 text-sm text-[#18181b] underline decoration-[#d4d4d8] underline-offset-4 hover:text-[#27272a]"
                  onClick={() => setSearch("")}
                >
                  清空搜索条件
                </Button>
              </div>
            )
          ) : (
            <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {filteredPrompts.map((p) => (
                <Card
                  key={p.id}
                  className="group relative overflow-hidden rounded-[18px] border border-white/70 bg-white/72 text-left shadow-[0_1px_2px_rgba(17,17,17,0.03)] transition duration-200 hover:bg-white hover:shadow-[0_10px_24px_rgba(17,17,17,0.06)]"
                >
                  <CardContent className="flex min-h-[198px] flex-col px-5 py-[18px]">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="line-clamp-1 text-[16px] font-semibold leading-6 text-[#111111]">{p.title}</div>
                        <div className="mt-1 text-xs text-[#8b8c87]">{formatDateTime(p.updated_at)}</div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button type="button" variant="ghost" size="iconSm">
                            <MoreVertical className="h-4 w-4 text-[#71717a]" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="w-48" align="end">
                          <DropdownMenuGroup>
                          <DropdownMenuItem onSelect={() => openEdit(p)}>
                            <Pencil className="h-4 w-4" />
                            编辑
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => {
                              setMoveTarget(p);
                              setMoveGroupId(p.group_id);
                            }}
                          >
                            <ArrowRightLeft className="h-4 w-4" />
                            移动到
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => {
                              setRenamePromptId(p.id);
                              setRenameTitle(p.title);
                              setRenameOpen(true);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                            重命名
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => void copyText(p.prompt_text)}>
                            <Copy className="h-4 w-4" />
                            复制提示词
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-600 data-[highlighted]:bg-red-50 data-[highlighted]:text-red-600"
                            onSelect={() => setDeletePromptId(p.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                            删除
                          </DropdownMenuItem>
                          </DropdownMenuGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <p className="mt-3 line-clamp-4 whitespace-pre-wrap text-[14px] leading-6 text-[#747571]">{p.prompt_text}</p>
                    <div className="mt-auto flex flex-wrap justify-end gap-2 pt-4">
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
                        className="rounded-[8px] bg-[#111111] text-white hover:bg-[#2a2a2a]"
                        onClick={() => void handleUsePrompt(p.prompt_text)}
                      >
                        使用
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      <Dialog open={searchDialogOpen} onOpenChange={setSearchDialogOpen}>
        <DialogContent className="max-w-[420px] rounded-[16px] p-5">
          <DialogTitle className="text-[18px] font-semibold text-[#111111]">搜索提示词</DialogTitle>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#71717a]" />
            <Input
              ref={searchDialogInputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") setSearchDialogOpen(false);
              }}
              placeholder="搜索提示词"
              className="h-10 w-full rounded-[12px] border-[#e2e2df] pl-9"
            />
          </div>
          <div className="flex justify-end gap-2">
            {search ? (
              <Button
                type="button"
                variant="outline"
                className="h-9 rounded-[10px] border-[#e2e2df] px-3 text-[14px]"
                onClick={() => setSearch("")}
              >
                清空
              </Button>
            ) : null}
            <Button
              type="button"
              className="h-9 rounded-[10px] bg-[#111111] px-4 text-[14px] text-white hover:bg-[#2a2a2a]"
              onClick={() => setSearchDialogOpen(false)}
            >
              完成
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={addGroupOpen}
        onOpenChange={(open) => {
          setAddGroupOpen(open);
          if (!open) setNewGroupName("");
        }}
      >
        <DialogContent className="max-w-[400px] rounded-[16px] p-5">
          <DialogTitle className="text-[18px] font-semibold text-[#111111]">新建分组</DialogTitle>
          <div>
            <Input
              id="prompt-library-new-group-name"
              ref={newGroupInputRef}
              autoFocus
              aria-label="分组名称"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void commitNewGroupInput();
                }
              }}
              placeholder="请输入分组名称"
              className="h-10 rounded-[12px] border-[#e2e2df] text-[14px]"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-9 rounded-[10px] border-[#e2e2df] px-3 text-[14px]"
              onClick={() => {
                setAddGroupOpen(false);
                setNewGroupName("");
              }}
            >
              取消
            </Button>
            <Button
              type="button"
              className="h-9 rounded-[10px] bg-[#111111] px-4 text-[14px] text-white hover:bg-[#2a2a2a]"
              onClick={() => void commitNewGroupInput()}
            >
              创建
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
                <label className="text-sm text-[#52525b]">
                  标题 <RequiredAsterisk />
                </label>
                <Input
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="为这个提示词起个名字吧"
                  className="h-12 rounded-[12px] border-[#d4d4d8]"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-[#52525b]">分组</label>
                <Select
                  value={formGroupId ?? DEFAULT_GROUP_VALUE}
                  onValueChange={(value) => setFormGroupId(value === DEFAULT_GROUP_VALUE ? null : value)}
                >
                  <SelectTrigger className="h-12 rounded-[12px] border-[#e2e2df] text-[#34322d]">
                    <SelectValue placeholder="默认" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value={DEFAULT_GROUP_VALUE}>默认</SelectItem>
                      {groups.map((g) => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.name || "未命名"}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
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
                <label className="text-sm text-[#52525b]">
                  提示词 prompt <RequiredAsterisk />
                </label>
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
              <Button variant="outline" onClick={() => setSaveOpen(false)}>
                取消
              </Button>
              <Button onClick={() => void submitSave()}>
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
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void copyText(preview.prompt_text)}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    复制
                  </Button>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-[#18181b]">{preview.prompt_text}</p>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <Button variant="outline" onClick={() => setPreview(null)}>
                  取消
                </Button>
                <Button
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
          <Select
            value={moveGroupId ?? DEFAULT_GROUP_VALUE}
            onValueChange={(value) => setMoveGroupId(value === DEFAULT_GROUP_VALUE ? null : value)}
          >
            <SelectTrigger className="mt-4 h-11 rounded-[10px] border-[#e2e2df]">
              <SelectValue placeholder="默认" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={DEFAULT_GROUP_VALUE}>默认</SelectItem>
                {groups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name || "未命名"}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setMoveTarget(null)}>
              取消
            </Button>
            <Button onClick={() => void submitMove()}>
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
            <Button onClick={() => void submitRename()}>
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
            <DialogTitle className="text-[16px] font-semibold leading-snug text-[#18181b]">
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
