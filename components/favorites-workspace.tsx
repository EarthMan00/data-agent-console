"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Download,
  EllipsisVertical,
  FileSpreadsheet,
  FileText,
  FolderInput,
  PackageOpen,
  Pencil,
  Plus,
  Search,
  StarOff,
} from "@/components/ui/tabler-icons";
import { MoreDataShell } from "@/components/more-data-shell";
import { PageLostState } from "@/components/page-lost-state";
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
  return (
    <div className="mt-8 flex min-h-[calc(100vh-300px)] flex-col items-center justify-center px-4 text-center">
      <PackageOpen className="mb-4 text-[#b1b2ae]" strokeWidth={1.35} aria-hidden />
      <p className="text-[14px] text-[#71717a]">暂无数据</p>
    </div>
  );
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
  const [typeFilter, setTypeFilter] = useState(TYPE_FILTER_ALL);
  const [activeChip, setActiveChip] = useState<ChipFilter>("全部");
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renameTarget, setRenameTarget] = useState<UserFavoriteListItemDto | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [moveItem, setMoveItem] = useState<UserFavoriteListItemDto | null>(null);
  const [unfavoriteTarget, setUnfavoriteTarget] = useState<UserFavoriteListItemDto | null>(null);

  const defaultFolderId = useMemo(
    () => folders.find((f) => f.name === "默认")?.id ?? null,
    [folders],
  );

  const folderIdForRequest = useMemo(() => {
    if (activeChip === "全部") return undefined;
    if (activeChip === "默认") return defaultFolderId ?? undefined;
    const match = folders.find((f) => f.name === activeChip);
    return match?.id;
  }, [activeChip, defaultFolderId, folders]);

  const reload = useCallback(async () => {
    if (!platformAgent?.withFreshToken) return;
    setBusy(true);
    setError("");
    setLoadError("");
    try {
      await platformAgent.withFreshToken(async (token) => {
        const fr = await listFavoriteFolders(token);
        setFolders(fr.items ?? []);
        const list = await listUserFavorites(token, {
          folderId: folderIdForRequest ?? null,
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
    if (!platformAgent?.withFreshToken) return;
    const name = newFolderName.trim();
    if (!name) return;
    try {
      await platformAgent.withFreshToken(async (token) => {
        await createFavoriteFolder(token, name);
      });
      setNewFolderOpen(false);
      setNewFolderName("");
      await reload();
    } catch (e) {
      setError(formatAgentApiErrorForUser(e));
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

  const deleteEmptyFolder = async (folderId: string, folderName: string) => {
    if (folderName === "默认") return;
    if (!platformAgent?.withFreshToken) return;
    try {
      await platformAgent.withFreshToken(async (token) => {
        await deleteFavoriteFolder(token, folderId);
      });
      if (activeChip === folderName) setActiveChip("全部");
      await reload();
    } catch (e) {
      setError(formatAgentApiErrorForUser(e));
    }
  };

  const chipFolders = useMemo(() => {
    const extras = folders.filter((f) => f.name !== "默认").map((f) => f.name);
    return extras;
  }, [folders]);

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
              <h1 className="text-[24px] font-semibold leading-8 text-[#111111]">我的收藏夹</h1>
              <div className="flex w-full min-w-0 flex-wrap items-center justify-end gap-2 sm:w-auto sm:justify-end">
                <div className="relative w-full min-w-0 sm:w-[220px]">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#71717a]" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="搜索收藏"
                    className="h-9 w-full rounded-[10px] border-[#e2e2df] pl-9"
                  />
                </div>
              </div>
            </div>

            <div className="mt-5 flex min-h-[40px] flex-wrap items-center justify-between gap-x-4 gap-y-3">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                <Tabs value={activeChip} onValueChange={setActiveChip}>
                  <TabsList className="flex-wrap justify-start">
                    <TabsTrigger value="全部">全部</TabsTrigger>
                    <TabsTrigger value="默认">默认</TabsTrigger>
                    {chipFolders.map((name) => (
                      <TabsTrigger key={name} value={name}>
                        <span className="max-w-[160px] truncate">{name}</span>
                      </TabsTrigger>
                    ))}
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
                  <Plus />
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
                    <DropdownMenu>
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
                            onSelect={() => setUnfavoriteTarget(item)}
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
                  </CardContent>
                </Card>
              ))
            ) : !busy ? (
              <FavoritesEmptyIllustration />
            ) : null}
          </div>

          <Dialog open={Boolean(unfavoriteTarget)} onOpenChange={(o) => !o && setUnfavoriteTarget(null)}>
            <DialogContent className="max-w-[420px] gap-3">
              <DialogTitle className="text-[16px] font-semibold leading-snug text-[#18181b]">
                确定取消收藏吗？
              </DialogTitle>
              <DialogDescription className="text-sm leading-6 text-[#71717a]">
                取消收藏后，内容将从收藏列表移除，之后可重新收藏。
              </DialogDescription>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setUnfavoriteTarget(null)}>
                  再想想
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => void confirmUnfavorite()}
                >
                  确定取消
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

          <Dialog open={newFolderOpen} onOpenChange={setNewFolderOpen}>
            <DialogContent>
              <DialogTitle>新建文件夹</DialogTitle>
              <Input
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="文件夹名称"
                className="rounded-[10px]"
              />
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setNewFolderOpen(false)}>
                  取消
                </Button>
                <Button type="button" onClick={() => void submitNewFolder()}>
                  创建
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {folders.filter((f) => f.name !== "默认").length > 0 ? (
            <div className="mt-10 border-t border-[#e5e7eb] pt-6 text-sm text-[#71717a]">
              <span className="font-medium text-[#18181b]">管理文件夹</span>
              <ul className="mt-2 space-y-1">
                {folders
                  .filter((f) => f.name !== "默认")
                  .map((f) => (
                    <li key={f.id} className="flex items-center justify-between gap-2">
                      <span>{f.name}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs text-red-600 hover:bg-red-50"
                        onClick={() => void deleteEmptyFolder(f.id, f.name)}
                      >
                        删除（需为空）
                      </Button>
                    </li>
                  ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </MoreDataShell>
  );
}
