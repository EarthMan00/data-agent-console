"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Download,
  EllipsisVertical,
  FileSpreadsheet,
  FileText,
  FolderInput,
  InfoCircle,
  Loader2,
  Pencil,
  PlusThin,
  Search,
  StarOff,
  X,
} from "@/components/ui/tabler-icons";
import { EmptyState } from "@/components/empty-state";
import { MoreDataShell } from "@/components/more-data-shell";
import { PageLostState } from "@/components/page-lost-state";
import { useOptionalPlatformAgent } from "@/components/platform-agent-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  createFavoriteFolder,
  deleteFavoriteFolder,
  deleteUserFavorite,
  downloadAuthorizedFile,
  formatAgentApiErrorForUser,
  listFavoriteFolders,
  listUserFavorites,
  moveUserFavorite,
  patchUserFavoriteTitle,
} from "@/lib/agent-api/client";
import type { FavoriteFolderDto, UserFavoriteListItemDto } from "@/lib/agent-api/types";
import { cn } from "@/lib/utils";

type ChipFilter = "全部" | string;

const TYPE_FILTER_ALL = "__all__";

function sortFoldersForDisplay(folders: FavoriteFolderDto[]) {
  return folders
    .map((folder, index) => ({ folder, index }))
    .sort((a, b) => {
      if (a.folder.name === "默认" && b.folder.name !== "默认") return -1;
      if (a.folder.name !== "默认" && b.folder.name === "默认") return 1;
      const at = Date.parse(a.folder.created_at);
      const bt = Date.parse(b.folder.created_at);
      if (Number.isFinite(at) && Number.isFinite(bt) && at !== bt) return at - bt;
      return a.index - b.index;
    })
    .map(({ folder }) => folder);
}

const TYPE_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: TYPE_FILTER_ALL, label: "全部类型" },
  { value: "csv", label: "CSV" },
  { value: "json", label: "JSON" },
  { value: "md", label: "Markdown" },
  { value: "html", label: "HTML" },
  { value: "pdf", label: "PDF" },
  { value: "file", label: "文件" },
  { value: "chatexcel", label: "ChatExcel" },
  { value: "linkfox", label: "LinkFox" },
];

function FavoritesEmptyIllustration() {
  return <EmptyState message="暂无数据" />;
}

export function FavoritesWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const platformAgent = useOptionalPlatformAgent();
  const [folders, setFolders] = useState<FavoriteFolderDto[]>([]);
  const [items, setItems] = useState<UserFavoriteListItemDto[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);
  const searchDialogInputRef = useRef<HTMLInputElement | null>(null);
  const [typeFilter, setTypeFilter] = useState(TYPE_FILTER_ALL);
  const [activeChip, setActiveChip] = useState<ChipFilter>("全部");
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderSaving, setNewFolderSaving] = useState(false);
  const [newFolderNameConflict, setNewFolderNameConflict] = useState(false);
  const [deleteFolderId, setDeleteFolderId] = useState<string | null>(null);
  const [deletingFolderId, setDeletingFolderId] = useState<string | null>(null);
  const newFolderNameTrimmed = newFolderName.trim();
  const newFolderNameReserved = newFolderNameTrimmed === "全部";
  const newFolderNameDuplicate = folders.some((folder) => (folder.name || "").trim() === newFolderNameTrimmed);
  const newFolderCreateDisabled = newFolderSaving || !newFolderNameTrimmed;
  const [renameTarget, setRenameTarget] = useState<UserFavoriteListItemDto | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [moveItem, setMoveItem] = useState<UserFavoriteListItemDto | null>(null);
  const [unfavoriteTarget, setUnfavoriteTarget] = useState<UserFavoriteListItemDto | null>(null);

  const defaultFolderId = useMemo(
    () => folders.find((f) => f.name === "默认")?.id ?? null,
    [folders],
  );

  useEffect(() => {
    if (!searchDialogOpen) return;
    const timer = window.setTimeout(() => searchDialogInputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [searchDialogOpen]);

  const folderIdForRequest = useMemo(() => {
    if (activeChip === "全部") return undefined;
    if (activeChip === "默认") return defaultFolderId ?? undefined;
    const match = folders.find((f) => f.name === activeChip);
    return match?.id;
  }, [activeChip, defaultFolderId, folders]);

  const reload = useCallback(async (folderIdOverride?: string | null) => {
    if (!platformAgent?.withFreshToken) return;
    setBusy(true);
    setError("");
    setLoadError("");
    try {
      await platformAgent.withFreshToken(async (token) => {
        const fr = await listFavoriteFolders(token);
        setFolders(sortFoldersForDisplay(fr.items ?? []));
        const list = await listUserFavorites(token, {
          folderId: folderIdOverride !== undefined ? folderIdOverride : folderIdForRequest ?? null,
          page: 1,
          pageSize: 100,
        });
        setItems(list.items ?? []);
      });
    } catch (e) {
      const msg = formatAgentApiErrorForUser(e);
      setError(msg);
      setLoadError(msg);
      setFolders([]);
      setItems([]);
    } finally {
      setBusy(false);
    }
  }, [platformAgent, folderIdForRequest]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const favoriteIdFromUrl = searchParams.get("favoriteId");
  useEffect(() => {
    if (!favoriteIdFromUrl) return;
    router.replace(`/favorite/report/${encodeURIComponent(favoriteIdFromUrl)}`);
  }, [favoriteIdFromUrl, router]);

  const typeFilteredItems = useMemo(() => {
    if (typeFilter === TYPE_FILTER_ALL) return items;
    const want = typeFilter.toLowerCase();
    return items.filter((it) => (it.result_kind ?? "").toLowerCase() === want);
  }, [items, typeFilter]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return typeFilteredItems;
    return typeFilteredItems.filter(
      (it) =>
        it.title.toLowerCase().includes(q) ||
        (it.card_preview ?? "").toLowerCase().includes(q),
    );
  }, [typeFilteredItems, search]);
  const showLoadError = Boolean(loadError && !busy && folders.length === 0 && items.length === 0);

  const formatCardTime = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };

  const onDownload = (id: string, title: string) => {
    if (!platformAgent?.withFreshToken) return;
    void platformAgent.withFreshToken(async (token) => {
      await downloadAuthorizedFile(token, `/api/user/favorites/${id}/download`, `${title || "report"}.bin`);
    });
  };

  const confirmUnfavorite = async () => {
    if (!unfavoriteTarget || !platformAgent?.withFreshToken) return;
    const id = unfavoriteTarget.id;
    try {
      await platformAgent.withFreshToken(async (token) => {
        await deleteUserFavorite(token, id);
      });
      setUnfavoriteTarget(null);
      await reload();
    } catch (e) {
      setError(formatAgentApiErrorForUser(e));
    }
  };

  const openFavoriteReport = (id: string) => {
    router.push(`/favorite/report/${encodeURIComponent(id)}`);
  };

  const submitRename = async () => {
    if (!renameTarget || !platformAgent?.withFreshToken) return;
    const t = renameValue.trim();
    if (!t) return;
    try {
      await platformAgent.withFreshToken(async (token) => {
        await patchUserFavoriteTitle(token, renameTarget.id, t);
      });
      setRenameTarget(null);
      await reload();
    } catch (e) {
      setError(formatAgentApiErrorForUser(e));
    }
  };

  const submitNewFolder = async () => {
    if (!platformAgent?.withFreshToken || newFolderSaving) return;
    const name = newFolderNameTrimmed;
    if (!name) return;
    if (newFolderNameReserved || newFolderNameDuplicate) {
      setNewFolderNameConflict(true);
      return;
    }
    setNewFolderNameConflict(false);
    setNewFolderSaving(true);
    try {
      await platformAgent.withFreshToken(async (token) => {
        await createFavoriteFolder(token, name);
      });
      setNewFolderOpen(false);
      setNewFolderName("");
      setNewFolderNameConflict(false);
      await reload();
    } catch (e) {
      setError(formatAgentApiErrorForUser(e));
    } finally {
      setNewFolderSaving(false);
    }
  };

  const moveToFolder = async (itemId: string, folderId: string) => {
    if (!platformAgent?.withFreshToken) return;
    try {
      await platformAgent.withFreshToken(async (token) => {
        await moveUserFavorite(token, itemId, folderId);
      });
      await reload();
    } catch (e) {
      setError(formatAgentApiErrorForUser(e));
    }
  };

  const deleteFolderAndMoveFilesToDefault = async (folderId: string, folderName: string) => {
    if (folderName === "默认") return;
    if (!platformAgent?.withFreshToken) return;
    if (!defaultFolderId) {
      setError("未找到默认分组，暂时无法删除该分组。");
      return;
    }
    setDeletingFolderId(folderId);
    try {
      await platformAgent.withFreshToken(async (token) => {
        const pageSize = 100;
        while (true) {
          const list = await listUserFavorites(token, {
            folderId,
            page: 1,
            pageSize,
          });
          const folderItems = list.items ?? [];
          if (folderItems.length === 0) break;
          for (const item of folderItems) {
            if (item.folder_id !== defaultFolderId) {
              await moveUserFavorite(token, item.id, defaultFolderId);
            }
          }
        }
        await deleteFavoriteFolder(token, folderId);
      });
      const shouldSwitchToDefault = activeChip === folderName;
      if (shouldSwitchToDefault) setActiveChip("默认");
      setDeleteFolderId(null);
      await reload(shouldSwitchToDefault ? defaultFolderId : undefined);
    } catch (e) {
      setError(formatAgentApiErrorForUser(e));
    } finally {
      setDeletingFolderId(null);
    }
  };

  const chipFolders = useMemo(() => folders.filter((f) => f.name !== "默认"), [folders]);

  const iconFor = (kind: string | null | undefined) => {
    const k = (kind ?? "").toLowerCase();
    if (k === "csv" || k === "json") {
      return <FileSpreadsheet className="h-4 w-4 text-white" />;
    }
    return <FileText className="h-4 w-4 text-white" />;
  };

  const iconBgFor = (kind: string | null | undefined) => {
    const k = (kind ?? "").toLowerCase();
    if (k === "csv" || k === "json" || k === "chatexcel") return "bg-[#34322d]";
    return "bg-[#747571]";
  };

  return (
    <MoreDataShell currentPath="/artifacts" showTopHeader={false}>
      <div className="px-8 pb-14 pt-5">
        <div className="mx-auto max-w-[1040px]">
          <div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h1 className="shrink-0 whitespace-nowrap text-[24px] font-semibold leading-8 text-[#111111]">我的收藏夹</h1>
              <div className="flex w-full min-w-0 flex-wrap items-center justify-end gap-2 sm:w-auto sm:justify-end">
                <div className="relative w-full min-w-0 max-[960px]:hidden sm:w-[220px]">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#71717a]" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="搜索收藏"
                    className="h-9 w-full rounded-[10px] border-[#e2e2df] pl-9"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="搜索收藏"
                  className="hidden h-9 w-9 shrink-0 rounded-[10px] border-[#e2e2df] bg-white text-[#34322d] hover:bg-[rgba(55,53,47,0.06)] max-[960px]:inline-flex"
                  onClick={() => setSearchDialogOpen(true)}
                >
                  <Search className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="mt-5 flex min-h-[40px] flex-wrap items-center justify-between gap-x-4 gap-y-3">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                <Tabs value={activeChip} onValueChange={setActiveChip}>
                  <TabsList className="flex-wrap justify-start">
                    <TabsTrigger value="全部">全部</TabsTrigger>
                    <TabsTrigger value="默认">默认</TabsTrigger>
                    {chipFolders.map((folder) => {
                      const name = folder.name || "未命名";
                      return (
                        <div key={folder.id} className="group/chip relative inline-flex items-center rounded-[8px]">
                          <TabsTrigger value={name}>
                            <span className="max-w-[160px] truncate">{name}</span>
                          </TabsTrigger>
                          <Popover
                            open={deleteFolderId === folder.id}
                            onOpenChange={(open) => setDeleteFolderId(open ? folder.id : null)}
                          >
                            <PopoverAnchor asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                aria-label={`删除文件夹 ${name}`}
                                aria-expanded={deleteFolderId === folder.id}
                                className="pointer-events-auto absolute -right-1 -top-1 z-10 h-4 w-4 rounded-full p-0 text-[#71717a] opacity-0 transition hover:bg-transparent hover:text-red-600 focus-visible:opacity-100 group-hover/chip:opacity-100 data-[state=open]:opacity-100"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                }}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setDeleteFolderId(folder.id);
                                }}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </PopoverAnchor>
                            <PopoverContent
                              side="bottom"
                              align="end"
                              sideOffset={8}
                              className="w-[min(300px,calc(100vw-2rem))] rounded-[16px] border border-[#e5e5e2] bg-white p-4 shadow-[0_18px_48px_rgba(15,23,42,0.12)]"
                              onCloseAutoFocus={(e) => e.preventDefault()}
                            >
                              <p className="text-[14px] leading-6 text-[#34322d]">
                                确定删除该分组吗？该分组下的文件将移回默认分组
                              </p>
                              <div className="mt-4 flex justify-end gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-9 rounded-[10px] border-[#e2e2df] bg-white px-4 text-[14px] text-[#747571] hover:bg-[rgba(55,53,47,0.06)]"
                                  onClick={() => setDeleteFolderId(null)}
                                >
                                  取消
                                </Button>
                                <Button
                                  type="button"
                                  variant="destructive"
                                  size="sm"
                                  className="h-9 rounded-[10px] bg-red-600 px-4 text-[14px] text-white hover:bg-red-700"
                                  disabled={deletingFolderId === folder.id}
                                  onClick={() => void deleteFolderAndMoveFilesToDefault(folder.id, name)}
                                >
                                  {deletingFolderId === folder.id ? "处理中…" : "确定删除"}
                                </Button>
                              </div>
                            </PopoverContent>
                          </Popover>
                        </div>
                      );
                    })}
                  </TabsList>
                </Tabs>
                <Button
                  type="button"
                  variant="outline"
                  size="iconSm"
                  className="shrink-0"
                  title="新建文件夹"
                  aria-label="新建文件夹"
                  onClick={() => setNewFolderOpen(true)}
                >
                  <PlusThin />
                </Button>
              </div>
              <div className="flex w-full min-w-0 items-center justify-end sm:w-auto sm:shrink-0">
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="h-9 w-[128px] rounded-[10px] border-[#e2e2df]">
                    <SelectValue placeholder="全部类型" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {TYPE_FILTER_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {error && !showLoadError ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
          {busy ? <p className="mt-8 text-sm text-[#71717a]">加载中…</p> : null}

          <div
            className={cn(
              !busy && filteredItems.length > 0 ? "mt-8" : "",
              !busy && filteredItems.length > 0 ? "grid gap-5 md:grid-cols-2" : "",
            )}
          >
            {showLoadError ? (
              <PageLostState onRetry={() => void reload()} />
            ) : !busy && filteredItems.length > 0 ? (
              filteredItems.map((item) => (
                <Card
                  key={item.id}
                  className="group relative overflow-hidden rounded-[18px] border border-white/70 bg-white/72 text-left shadow-[0_1px_2px_rgba(17,17,17,0.03)] transition duration-200 hover:bg-white hover:shadow-[0_10px_24px_rgba(17,17,17,0.06)]"
                >
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => openFavoriteReport(item.id)}
                    className="block h-auto w-full whitespace-normal rounded-none p-0 text-left font-normal hover:bg-transparent"
                  >
                    <CardContent className="flex min-h-[178px] flex-col px-5 py-[18px]">
                      <div className="flex min-w-0 items-start gap-3">
                        <div
                          className={cn(
                            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]",
                            iconBgFor(item.result_kind),
                          )}
                        >
                          {iconFor(item.result_kind)}
                        </div>
                        <div className="min-w-0">
                          <div className="line-clamp-1 text-[16px] font-semibold leading-6 text-[#111111]">{item.title}</div>
                          <div className="mt-1 text-xs text-[#8b8c87]">{formatCardTime(item.updated_at)}</div>
                        </div>
                      </div>
                      <p className="mt-3 line-clamp-4 text-[14px] leading-6 text-[#747571]">
                        {(item.card_preview ?? "").slice(0, 600) || "（无预览摘要）"}
                      </p>
                    </CardContent>
                  </Button>
                  <CardContent className="flex items-center justify-end gap-2 border-t border-[#e2e2df] px-4 py-3">
                    <Popover
                      open={unfavoriteTarget?.id === item.id}
                      onOpenChange={(open) => setUnfavoriteTarget(open ? item : null)}
                    >
                      <DropdownMenu>
                        <PopoverAnchor asChild>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="iconSm"
                              className="shrink-0"
                              aria-label="更多操作"
                            >
                              <EllipsisVertical />
                            </Button>
                          </DropdownMenuTrigger>
                        </PopoverAnchor>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuGroup>
                            <DropdownMenuItem
                              onSelect={() => {
                                setRenameTarget(item);
                                setRenameValue(item.title);
                              }}
                            >
                              <Pencil className="h-4 w-4 shrink-0" />
                              重命名
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => setMoveItem(item)}>
                              <FolderInput className="h-4 w-4 shrink-0" />
                              移动到
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-red-700 data-[highlighted]:bg-red-50 data-[highlighted]:text-red-700"
                              onSelect={(event) => {
                                event.preventDefault();
                                setUnfavoriteTarget(item);
                              }}
                            >
                              <StarOff className="h-4 w-4 shrink-0" />
                              取消收藏
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => onDownload(item.id, item.title)}>
                              <Download className="h-4 w-4 shrink-0" />
                              下载报告
                            </DropdownMenuItem>
                          </DropdownMenuGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <PopoverContent
                        side="bottom"
                        align="end"
                        sideOffset={8}
                        className="w-[min(300px,calc(100vw-2rem))] rounded-[16px] border border-[#e5e5e2] bg-white p-4 shadow-[0_18px_48px_rgba(15,23,42,0.12)]"
                        onCloseAutoFocus={(e) => e.preventDefault()}
                      >
                        <p className="text-[14px] leading-6 text-[#34322d]">
                          确定删除该任务吗？删除后会话记忆与产出物将永久删除且不可恢复
                        </p>
                        <div className="mt-4 flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-9 rounded-[10px] border-[#e2e2df] bg-white px-4 text-[14px] text-[#747571] hover:bg-[rgba(55,53,47,0.06)]"
                            onClick={() => setUnfavoriteTarget(null)}
                          >
                            取消
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            className="h-9 rounded-[10px] bg-red-600 px-4 text-[14px] text-white hover:bg-red-700"
                            onClick={() => void confirmUnfavorite()}
                          >
                            确定删除
                          </Button>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </CardContent>
                </Card>
              ))
            ) : !busy ? (
              <FavoritesEmptyIllustration />
            ) : null}
          </div>

          <Dialog open={searchDialogOpen} onOpenChange={setSearchDialogOpen}>
            <DialogContent className="max-w-[420px] rounded-[16px] p-5">
              <DialogTitle className="text-[16px] font-semibold text-[#111111]">搜索收藏</DialogTitle>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#71717a]" />
                <Input
                  ref={searchDialogInputRef}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") setSearchDialogOpen(false);
                  }}
                  placeholder="搜索收藏"
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

          <Dialog open={Boolean(renameTarget)} onOpenChange={(o) => !o && setRenameTarget(null)}>
            <DialogContent>
              <DialogTitle>重命名</DialogTitle>
              <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} className="rounded-[10px]" />
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setRenameTarget(null)}>
                  取消
                </Button>
                <Button type="button" onClick={() => void submitRename()}>
                  保存
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={Boolean(moveItem)} onOpenChange={(o) => !o && setMoveItem(null)}>
            <DialogContent>
              <DialogTitle>移动到文件夹</DialogTitle>
              <div className="max-h-64 space-y-1 overflow-y-auto">
                {folders.map((f) => (
                  <Button
                    key={f.id}
                    type="button"
                    variant="ghost"
                    disabled={moveItem ? f.id === moveItem.folder_id : true}
                    className="h-9 w-full justify-start rounded-md px-3 text-left text-sm"
                    onClick={() => {
                      if (!moveItem) return;
                      void moveToFolder(moveItem.id, f.id);
                      setMoveItem(null);
                    }}
                  >
                    {f.name}
                  </Button>
                ))}
              </div>
              <div className="flex justify-end pt-2">
                <Button type="button" variant="outline" onClick={() => setMoveItem(null)}>
                  取消
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog
            open={newFolderOpen}
            onOpenChange={(open) => {
              if (newFolderSaving) return;
              setNewFolderOpen(open);
              if (!open) {
                setNewFolderName("");
                setNewFolderNameConflict(false);
              }
            }}
          >
            <DialogContent>
              <DialogTitle>新建文件夹</DialogTitle>
              <Input
                value={newFolderName}
                disabled={newFolderSaving}
                onChange={(e) => {
                  setNewFolderName(e.target.value);
                  setNewFolderNameConflict(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void submitNewFolder();
                  }
                }}
                placeholder="文件夹名称"
                className={`rounded-[10px] ${
                  newFolderNameConflict
                    ? "!border-red-500 focus-visible:!ring-red-500/20"
                    : ""
                }`}
              />
              {newFolderNameConflict ? (
                <p className="flex items-center gap-1.5 text-[14px] leading-5 text-red-600">
                  <InfoCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  名称已存在
                </p>
              ) : null}
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={newFolderSaving}
                  onClick={() => {
                    setNewFolderOpen(false);
                    setNewFolderName("");
                    setNewFolderNameConflict(false);
                  }}
                >
                  取消
                </Button>
                <Button type="button" disabled={newFolderCreateDisabled} onClick={() => void submitNewFolder()}>
                  {newFolderSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      创建中
                    </>
                  ) : (
                    "创建"
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

        </div>
      </div>
    </MoreDataShell>
  );
}
