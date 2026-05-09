"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ChevronDown,
  Download,
  EllipsisVertical,
  FileSpreadsheet,
  FileText,
  FolderInput,
  PackageOpen,
  Pencil,
  Search,
  StarOff,
} from "lucide-react";
import { MoreDataShell } from "@/components/more-data-shell";
import { useOptionalPlatformAgent } from "@/components/platform-agent-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
    <div className="flex flex-col items-center justify-center py-16">
      <div className="relative flex flex-col items-center">
        <div
          className="pointer-events-none absolute left-1/2 top-[55%] h-10 w-[min(280px,72vw)] -translate-x-1/2 rounded-[50%] bg-[#eef2f7]/90 blur-[2px]"
          aria-hidden
        />
        <span className="relative mb-1 flex h-[140px] w-[140px] items-center justify-center rounded-full bg-[#fafbfc] shadow-[inset_0_0_0_1px_#eef2f7]">
          <PackageOpen className="h-[72px] w-[72px] text-[#d1d9e6]" strokeWidth={1.15} aria-hidden />
        </span>
        <span className="pointer-events-none absolute left-[18%] top-[22%] h-1.5 w-1.5 rounded-full bg-[#e2e8f0]" aria-hidden />
        <span className="pointer-events-none absolute right-[16%] top-[28%] h-1 w-1 rounded-full bg-[#e2e8f0]" aria-hidden />
        <span className="pointer-events-none absolute right-[22%] top-[40%] h-1.5 w-1.5 rounded-full bg-[#e8edf4]" aria-hidden />
        <p className="relative mt-10 text-sm text-[#94a3b8]">暂无数据</p>
      </div>
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
      setError(formatAgentApiErrorForUser(e));
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
    if (k === "csv" || k === "json" || k === "chatexcel") return "bg-[#16a34a]";
    return "bg-[#3b82f6]";
  };

  return (
    <MoreDataShell currentPath="/artifacts">
      <div className="px-8 pb-12 pt-8">
        <div className="mx-auto max-w-[1180px]">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="min-w-0 flex-1">
              <h1 className="font-[family:var(--font-jakarta)] text-[24px] font-semibold text-[#18181b]">我的收藏夹</h1>
              <div className="mt-7 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  onClick={() => setActiveChip("全部")}
                  variant={activeChip === "全部" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-7 rounded-[8px] px-3 text-xs"
                >
                  全部
                </Button>
                <Button
                  type="button"
                  onClick={() => setActiveChip("默认")}
                  variant={activeChip === "默认" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-7 rounded-[8px] px-3 text-xs"
                >
                  默认
                </Button>
                {chipFolders.map((name) => (
                  <Button
                    key={name}
                    type="button"
                    onClick={() => setActiveChip(name)}
                    variant={activeChip === name ? "secondary" : "ghost"}
                    size="sm"
                    className="h-7 rounded-[8px] px-3 text-xs"
                  >
                    {name}
                  </Button>
                ))}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-[8px]"
                  title="新建文件夹"
                  onClick={() => setNewFolderOpen(true)}
                >
                  +
                </Button>
              </div>
            </div>

            <div className="flex shrink-0 flex-col items-end gap-2">
              <div className="relative w-full min-w-[220px] max-w-[280px] sm:w-[220px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#71717a]" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="搜索收藏"
                  className="h-9 w-full rounded-[10px] border-[#e5e7eb] pl-9"
                />
              </div>
              <div className="relative w-full min-w-[220px] max-w-[280px] sm:w-[220px]">
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="h-9 w-full cursor-pointer appearance-none rounded-[10px] border border-[#e5e7eb] bg-white py-0 pl-3 pr-9 text-sm text-[#52525b] outline-none transition hover:border-[#d4d4d8] focus-visible:ring-2 focus-visible:ring-[rgba(24,24,27,0.08)]"
                  aria-label="按类型筛选"
                >
                  {TYPE_FILTER_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94a3b8]"
                  aria-hidden
                />
              </div>
            </div>
          </div>

          {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
          {busy ? <p className="mt-6 text-sm text-[#71717a]">加载中…</p> : null}

          <div
            className={cn(
              "mt-8",
              !busy && filteredItems.length > 0 ? "grid gap-4 sm:grid-cols-2" : "min-h-[min(420px,calc(100vh-280px))]",
            )}
          >
            {!busy && filteredItems.length > 0 ? (
              filteredItems.map((item) => (
                <Card
                  key={item.id}
                  className="overflow-hidden border-[#e5e7eb] transition hover:border-[#d4d4d8]"
                >
                  <button
                    type="button"
                    onClick={() => openFavoriteReport(item.id)}
                    className="block w-full text-left"
                  >
                    <div className="min-h-[140px] bg-[#fafafa] px-4 py-3 text-[12px] leading-relaxed text-[#64748b]">
                      {(item.card_preview ?? "").slice(0, 600) || "（无预览摘要）"}
                    </div>
                  </button>
                  <CardContent className="flex items-start justify-between gap-2 border-t border-[#e5e7eb] px-4 py-4">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div
                        className={cn(
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px]",
                          iconBgFor(item.result_kind),
                        )}
                      >
                        {iconFor(item.result_kind)}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate font-medium text-[#18181b]">{item.title}</div>
                        <div className="mt-1 text-sm text-[#a1a1aa]">{formatCardTime(item.updated_at)}</div>
                      </div>
                    </div>
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-[#71717a] hover:bg-[#f4f4f5]"
                          aria-label="更多操作"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <EllipsisVertical className="h-4 w-4" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-48 p-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-[#f4f4f5]"
                          onClick={() => {
                            setRenameTarget(item);
                            setRenameValue(item.title);
                          }}
                        >
                          <Pencil className="h-4 w-4 shrink-0" />
                          重命名
                        </button>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-[#f4f4f5]"
                          onClick={() => setMoveItem(item)}
                        >
                          <FolderInput className="h-4 w-4 shrink-0" />
                          移动到
                        </button>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-red-700 hover:bg-red-50"
                          onClick={() => setUnfavoriteTarget(item)}
                        >
                          <StarOff className="h-4 w-4 shrink-0" />
                          取消收藏
                        </button>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-[#f4f4f5]"
                          onClick={() => onDownload(item.id, item.title)}
                        >
                          <Download className="h-4 w-4 shrink-0" />
                          下载报告
                        </button>
                      </PopoverContent>
                    </Popover>
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
                <Button type="button" variant="outline" className="rounded-[10px]" onClick={() => setUnfavoriteTarget(null)}>
                  再想想
                </Button>
                <Button
                  type="button"
                  className="rounded-[10px] border-0 bg-[#ef5350] text-white shadow-none hover:bg-[#e53935]"
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
                <Button type="button" className="rounded-[10px]" onClick={() => void submitRename()}>
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
                  <button
                    key={f.id}
                    type="button"
                    disabled={moveItem ? f.id === moveItem.folder_id : true}
                    className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-[#f4f4f5] disabled:cursor-not-allowed disabled:opacity-40"
                    onClick={() => {
                      if (!moveItem) return;
                      void moveToFolder(moveItem.id, f.id);
                      setMoveItem(null);
                    }}
                  >
                    {f.name}
                  </button>
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
                <Button type="button" className="rounded-[10px]" onClick={() => void submitNewFolder()}>
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
