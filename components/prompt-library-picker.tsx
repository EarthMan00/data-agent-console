"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { NewConversationTaskComposer } from "@/components/new-conversation-task-composer";
import { useOptionalPlatformAgent } from "@/components/platform-agent-provider";
import { RequiredAsterisk } from "@/components/required-mark";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bookmark, CornerDownLeft, Loader2, Plus, Search } from "@/components/ui/tabler-icons";
import { AgentApiError, parseFastApiDetail } from "@/lib/agent-api/client";
import type { UserPromptDto, UserPromptGroupDto } from "@/lib/agent-api/types";
import { createUserPrompt, listUserPromptGroups, listUserPrompts } from "@/lib/agent-api/user-prompts";
import type { HomeCapabilityItem } from "@/lib/home-capability-items";
import { useHomeDataSourceMenu } from "@/lib/use-home-data-source-menu";
import { cn } from "@/lib/utils";

type PromptFilter = { kind: "all" } | { kind: "default" } | { kind: "group"; id: string };

const DEFAULT_FILTER: PromptFilter = { kind: "all" };
const DEFAULT_GROUP_VALUE = "__default__";

function filterKey(filter: PromptFilter) {
  return filter.kind === "group" ? `group:${filter.id}` : filter.kind;
}

function sortGroupsByCreatedAsc(groups: UserPromptGroupDto[]) {
  return groups
    .map((group, index) => ({ group, index }))
    .sort((a, b) => {
      const at = Date.parse(a.group.created_at);
      const bt = Date.parse(b.group.created_at);
      if (Number.isFinite(at) && Number.isFinite(bt) && at !== bt) return at - bt;
      return a.index - b.index;
    })
    .map(({ group }) => group);
}

async function fetchAllGroups(token: string): Promise<UserPromptGroupDto[]> {
  const out: UserPromptGroupDto[] = [];
  let page = 1;
  const pageSize = 100;
  while (true) {
    const response = await listUserPromptGroups(token, page, pageSize);
    out.push(...response.items);
    if (out.length >= response.total || response.items.length === 0) break;
    page += 1;
  }
  return out;
}

async function fetchAllPromptsForFilter(token: string, filter: PromptFilter): Promise<UserPromptDto[]> {
  const out: UserPromptDto[] = [];
  let page = 1;
  const pageSize = 100;
  while (true) {
    const params =
      filter.kind === "all"
        ? { page, page_size: pageSize }
        : filter.kind === "default"
          ? { page, page_size: pageSize, only_default: true as const }
          : { page, page_size: pageSize, group_id: filter.id };
    const response = await listUserPrompts(token, params);
    out.push(...response.items);
    if (out.length >= response.total || response.items.length === 0) break;
    page += 1;
  }
  return out;
}

function formatPromptError(error: unknown) {
  if (error instanceof AgentApiError) return parseFastApiDetail(error.body) ?? error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}

function filterPrompts(prompts: UserPromptDto[], search: string) {
  const query = search.trim().toLowerCase();
  if (!query) return prompts;
  return prompts.filter(
    (prompt) =>
      prompt.title.toLowerCase().includes(query) ||
      prompt.description.toLowerCase().includes(query) ||
      prompt.prompt_text.toLowerCase().includes(query),
  );
}

function sourceMarkerForPrompt(sourceId: string, dataSourceItems: HomeCapabilityItem[]) {
  const item = dataSourceItems.find((source) => source.id === sourceId);
  const label = item?.label ?? sourceId.replace(/^@+/, "");
  return label ? `@${label}` : "";
}

function serializePromptWithSources(
  promptText: string,
  sourceIds: string[],
  dataSourceItems: HomeCapabilityItem[],
) {
  const prompt = promptText.trim();
  const markers = Array.from(new Set(sourceIds))
    .map((sourceId) => sourceMarkerForPrompt(sourceId, dataSourceItems))
    .filter((marker) => marker && !prompt.includes(marker));
  return [...markers, prompt].filter(Boolean).join(" ");
}

export function PromptLibraryPicker({
  isHeroMinimal = false,
  onBeforeOpen,
  onPromptUse,
}: {
  isHeroMinimal?: boolean;
  onBeforeOpen?: () => void;
  onPromptUse: (promptText: string) => void;
}) {
  const platformAgent = useOptionalPlatformAgent();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [groups, setGroups] = useState<UserPromptGroupDto[]>([]);
  const [prompts, setPrompts] = useState<UserPromptDto[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<PromptFilter>(DEFAULT_FILTER);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formPrompt, setFormPrompt] = useState("");
  const [formSourceIds, setFormSourceIds] = useState<string[]>([]);
  const [formGroupId, setFormGroupId] = useState<string | null>(null);
  const {
    dataSourceGroups: composerDataSourceGroups,
    dataSourceItems: composerDataSourceItems,
  } = useHomeDataSourceMenu({ logLabel: "[prompt-library-source-menu-capabilities]" });

  const visiblePrompts = useMemo(() => filterPrompts(prompts, search), [prompts, search]);
  const filterItems = useMemo(
    () => [
      { key: "all", label: "全部", filter: { kind: "all" } as PromptFilter, count: null as number | null },
      { key: "default", label: "默认", filter: { kind: "default" } as PromptFilter, count: null as number | null },
      ...groups.map((group) => ({
        key: `group:${group.id}`,
        label: group.name || "未命名",
        filter: { kind: "group", id: group.id } as PromptFilter,
        count: null as number | null,
      })),
    ],
    [groups],
  );

  const refresh = useCallback(async (force = false) => {
    if ((!open && !force) || !platformAgent?.auth) return;
    setBusy(true);
    setError("");
    try {
      let nextGroups: UserPromptGroupDto[] = [];
      let nextPrompts: UserPromptDto[] = [];
      await platformAgent.withFreshToken(async (token) => {
        const [groupRows, promptRows] = await Promise.all([
          fetchAllGroups(token),
          fetchAllPromptsForFilter(token, filter),
        ]);
        nextGroups = sortGroupsByCreatedAsc(groupRows);
        nextPrompts = promptRows;
      });
      setGroups(nextGroups);
      setPrompts(nextPrompts);
    } catch (fetchError) {
      setError(formatPromptError(fetchError) || "加载提示词失败");
      setPrompts([]);
    } finally {
      setBusy(false);
    }
  }, [filter, open, platformAgent]);

  useEffect(() => {
    if (!open) return;
    void refresh();
  }, [open, refresh]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      onBeforeOpen?.();
    }
    setOpen(nextOpen);
  };

  const handleUsePrompt = (promptText: string) => {
    onPromptUse(promptText);
    setOpen(false);
  };

  const openCreateDialog = () => {
    if (!platformAgent?.authHydrated) return;
    if (!platformAgent.auth) {
      platformAgent.openLogin("请先登录后再创建提示词。");
      return;
    }
    setSaveError("");
    setFormTitle("");
    setFormPrompt("");
    setFormSourceIds([]);
    setFormGroupId(filter.kind === "group" ? filter.id : null);
    setSaveOpen(true);
  };

  const addFormSource = useCallback((capabilityId: string) => {
    setFormSourceIds((current) => (current.includes(capabilityId) ? current : [...current, capabilityId]));
  }, []);

  const removeFormSource = useCallback((capabilityId: string) => {
    setFormSourceIds((current) => current.filter((id) => id !== capabilityId));
  }, []);

  const submitCreate = async () => {
    if (!platformAgent?.auth) return;
    if (!formTitle.trim() || !formPrompt.trim()) {
      setSaveError("请填写标题与提示词。");
      return;
    }

    setSaveBusy(true);
    setSaveError("");
    try {
      await platformAgent.withFreshToken(async (token) => {
        await createUserPrompt(token, {
          title: formTitle.trim(),
          prompt_text: serializePromptWithSources(formPrompt, formSourceIds, composerDataSourceItems),
          group_id: formGroupId,
        });
      });
      setSaveOpen(false);
      await refresh(true);
    } catch (saveError) {
      setSaveError(formatPromptError(saveError) || "保存失败");
    } finally {
      setSaveBusy(false);
    }
  };

  return (
    <>
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="提示词库"
            aria-expanded={open}
            className={cn(
              "h-8 rounded-control border px-3 text-body font-medium",
              isHeroMinimal
                ? "border-transparent text-foreground hover:border-border hover:bg-fill-hover hover:text-foreground"
                : "border-transparent text-text-tertiary hover:border-border hover:bg-bg-subtle hover:text-foreground",
            )}
          >
            <Bookmark className="h-4 w-4" />
            提示词库
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={10}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          className="pointer-events-auto w-[min(calc(100vw-32px),720px)] overflow-hidden rounded-popover border border-border bg-bg-surface p-0 shadow-menu-wide"
        >
          <div className="grid h-[min(430px,calc(100vh-160px))] min-h-80 grid-cols-[168px_minmax(0,1fr)] overflow-hidden max-sm:grid-cols-1">
            <div className="min-h-0 overflow-y-auto border-r border-border-subtle bg-bg-surface p-2 max-sm:hidden">
              <div className="px-2 pb-2 pt-1 text-caption font-medium leading-5 text-text-tertiary">提示词分组</div>
              {filterItems.map((item) => {
                const active = filterKey(filter) === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    className={cn(
                      "flex h-9 w-full items-center rounded-control px-2 text-left text-body leading-5 transition hover:bg-fill-hover",
                      active ? "bg-fill-hover font-medium text-foreground" : "text-text-secondary",
                    )}
                    onClick={() => setFilter(item.filter)}
                  >
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex min-h-0 flex-col bg-bg-surface">
              <div className="shrink-0 border-b border-border-subtle p-3">
                <div className="flex items-center gap-2 max-sm:flex-col max-sm:items-stretch">
                  <div className="relative min-w-0 flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
                    <Input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="搜索提示词"
                      className="h-9 rounded-control border-border pl-9"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 shrink-0 rounded-control border-border px-3 text-body font-medium"
                    onClick={openCreateDialog}
                  >
                    <Plus className="h-4 w-4" />
                    新建提示词
                  </Button>
                </div>
                <div className="mt-2 hidden gap-1 overflow-x-auto max-sm:flex">
                  {filterItems.map((item) => {
                    const active = filterKey(filter) === item.key;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        className={cn(
                          "h-8 shrink-0 rounded-control px-2.5 text-caption leading-5 transition",
                          active ? "bg-fill-hover font-medium text-foreground" : "text-text-secondary hover:bg-fill-hover",
                        )}
                        onClick={() => setFilter(item.filter)}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
                {!platformAgent?.authHydrated ? (
                  <div className="flex h-full items-center justify-center text-body text-text-tertiary">正在读取账号状态…</div>
                ) : !platformAgent.auth ? (
                  <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                    <div className="text-body font-medium text-foreground">登录后使用提示词库</div>
                    <div className="max-w-64 text-caption leading-5 text-text-tertiary">
                      登录后可在这里快速调用你保存的提示词。
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      className="rounded-control bg-primary text-primary-foreground hover:bg-primary/85"
                      onClick={() => platformAgent.openLogin("请先登录后再使用提示词库。")}
                    >
                      去登录
                    </Button>
                  </div>
                ) : busy ? (
                  <div className="flex h-full items-center justify-center gap-2 text-body text-text-tertiary">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    加载中…
                  </div>
                ) : error ? (
                  <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                    <div className="max-w-80 text-body text-danger">{error}</div>
                    <Button type="button" variant="outline" size="sm" className="rounded-control" onClick={() => void refresh()}>
                      重试
                    </Button>
                  </div>
                ) : visiblePrompts.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-body text-text-tertiary">
                    {prompts.length === 0 ? "暂无提示词" : "未找到匹配的提示词"}
                  </div>
                ) : (
                  <div className="grid gap-2">
                    {visiblePrompts.map((prompt) => (
                      <button
                        key={prompt.id}
                        type="button"
                        role="option"
                        aria-selected="false"
                        aria-label={`使用提示词 ${prompt.title}`}
                        data-testid="prompt-library-picker-item"
                        className="group flex min-h-24 w-full items-start gap-3 rounded-field border border-border-subtle bg-bg-surface px-3 py-3 text-left transition hover:border-border-strong hover:bg-fill-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
                        onClick={() => handleUsePrompt(prompt.prompt_text)}
                      >
                        <span className="mt-0.5 h-4 w-0.5 shrink-0 rounded-full bg-primary" />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-body font-medium leading-5 text-foreground">{prompt.title}</span>
                            {prompt.group_name ? (
                              <span className="shrink-0 rounded-control bg-fill-hover px-1.5 py-0.5 text-caption leading-4 text-text-tertiary">
                                {prompt.group_name}
                              </span>
                            ) : null}
                          </span>
                          {prompt.description ? (
                            <span className="mt-1 block truncate text-caption leading-5 text-text-secondary">
                              {prompt.description}
                            </span>
                          ) : null}
                          <span className="mt-1 line-clamp-2 whitespace-pre-wrap text-caption leading-5 text-text-tertiary">
                            {prompt.prompt_text}
                          </span>
                        </span>
                        <CornerDownLeft className="mt-1 h-3.5 w-3.5 shrink-0 text-text-tertiary transition group-hover:text-foreground" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <Dialog
        open={saveOpen}
        onOpenChange={(nextOpen) => {
          setSaveOpen(nextOpen);
          if (!nextOpen) setSaveError("");
        }}
      >
        <DialogContent className="max-w-xl rounded-popover border-border p-0">
          <div className="px-8 pb-8 pt-7">
            <DialogTitle className="text-title-1 font-semibold text-foreground">新建提示词</DialogTitle>
            <div className="mt-6 space-y-5">
              <div className="grid gap-2">
                <label className="text-sm text-text-secondary">
                  标题 <RequiredAsterisk />
                </label>
                <Input
                  value={formTitle}
                  onChange={(event) => setFormTitle(event.target.value)}
                  placeholder="为这个提示词起个名字吧"
                  className="h-12 rounded-field border-border"
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm text-text-secondary">分组</label>
                <Select
                  value={formGroupId ?? DEFAULT_GROUP_VALUE}
                  onValueChange={(value) => setFormGroupId(value === DEFAULT_GROUP_VALUE ? null : value)}
                >
                  <SelectTrigger className="h-12 rounded-field border-border text-foreground">
                    <SelectValue placeholder="默认" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value={DEFAULT_GROUP_VALUE}>默认</SelectItem>
                      {groups.map((group) => (
                        <SelectItem key={group.id} value={group.id}>
                          {group.name || "未命名"}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <label className="text-sm text-text-secondary">
                  提示词 <RequiredAsterisk />
                </label>
                <NewConversationTaskComposer
                  value={formPrompt}
                  onValueChange={setFormPrompt}
                  placeholder={
                    "示例：@卖家精灵-选产品 在亚马逊[[美国站]]搜索关键词 '{{Sports Water Bottles}}' 产品…\n可通过 {{}} 设置可编辑参数，如 [[亚马逊美国站]]"
                  }
                  mode="普通模式"
                  onModeChange={() => undefined}
                  selectedSourceIds={formSourceIds}
                  onToolSelect={addFormSource}
                  onSourceRemove={removeFormSource}
                  dataSourceGroups={composerDataSourceGroups}
                  dataSourceItems={composerDataSourceItems}
                  onFilesSelected={() => undefined}
                  onSubmit={() => undefined}
                  showSubmitButton={false}
                  showPromptLibraryButton={false}
                  submitOnEnter={false}
                  containerClassName="!rounded-field !shadow-none sm:!rounded-field"
                  textareaClassName="min-h-28 max-h-48 sm:min-h-28"
                />
              </div>
              {saveError ? <div className="text-body text-danger">{saveError}</div> : null}
            </div>
            <div className="mt-8 flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setSaveOpen(false)} disabled={saveBusy}>
                取消
              </Button>
              <Button type="button" onClick={() => void submitCreate()} disabled={saveBusy}>
                {saveBusy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    保存中
                  </>
                ) : (
                  "保存"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
