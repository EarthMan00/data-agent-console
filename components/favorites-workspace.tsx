"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, FileText, Search } from "lucide-react";

import { MoreDataShell } from "@/components/more-data-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useDemoState } from "@/lib/workspace-store";

const chips = ["全部", "默认"] as const;

export function FavoritesWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { artifacts } = useDemoState();
  const [activeChip, setActiveChip] = useState<(typeof chips)[number]>("全部");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("全部类型");
  const [open, setOpen] = useState(false);

  const filteredItems = useMemo(() => {
    return artifacts.filter((item) => {
      const matchesScope = activeChip === "全部" || item.scope === activeChip;
      const matchesType = typeFilter === "全部类型" || item.type === typeFilter;
      const matchesSearch = !search || `${item.title}${item.body}`.toLowerCase().includes(search.toLowerCase());
      return matchesScope && matchesType && matchesSearch;
    });
  }, [activeChip, artifacts, search, typeFilter]);

  const selectedId = searchParams.get("artifactId") ?? filteredItems[0]?.id;
  const selectedItem = filteredItems.find((item) => item.id === selectedId) ?? filteredItems[0];

  return (
    <MoreDataShell currentPath="/artifacts">
      <div className="px-8 pb-12 pt-8">
        <div className="mx-auto max-w-[1180px]">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <h1 className="font-[family:var(--font-jakarta)] text-[24px] font-semibold text-[#18181b]">报告中心</h1>
              <div className="mt-7 flex items-center gap-2">
                {chips.map((chip) => (
                  <Button
                    key={chip}
                    onClick={() => setActiveChip(chip)}
                    variant={activeChip === chip ? "secondary" : "ghost"}
                    size="sm"
                    className="h-7 rounded-[8px] px-3 text-xs"
                  >
                    {chip}
                  </Button>
                ))}
                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-[8px]">
                  +
                </Button>
              </div>
            </div>

            <div className="space-y-4">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#71717a]" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="搜索收藏"
                  className="h-9 w-[220px] rounded-[10px] border-[#e5e7eb] pl-9"
                />
              </div>

              <div className="flex justify-end">
                <div className="relative">
                  <button onClick={() => setOpen((value) => !value)} className="inline-flex items-center gap-1 text-sm text-[#7b8ba1]">
                    {typeFilter}
                    <ChevronDown className="h-4 w-4" />
                  </button>
                  {open ? (
                    <div className="absolute right-0 top-8 z-10 w-[120px] rounded-[10px] border border-[#dde4ef] bg-white py-1 shadow-[0_18px_34px_rgba(157,173,196,0.18)]">
                      {["全部类型", "报告", "表格"].map((item) => (
                        <button
                          key={item}
                          onClick={() => {
                            setTypeFilter(item);
                            setOpen(false);
                          }}
                          className="block w-full px-3 py-2 text-left text-sm text-[#6b7d93] hover:bg-[#f5f8fd]"
                        >
                          {item}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 grid max-w-[720px] gap-4">
            {filteredItems.length > 0 ? (
              filteredItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => router.push(`/artifacts?artifactId=${item.id}`)}
                  className="w-full text-left"
                >
                  <Card className={item.id === selectedItem?.id ? "overflow-hidden border-[#d4d4d8]" : "overflow-hidden border-[#e5e7eb]"}>
                    <div className="min-h-[118px] bg-[#fafafa] px-4 py-4 text-[13px] leading-7 text-[#71717a]">
                      {item.body}
                    </div>
                    <CardContent className="flex items-center gap-3 border-t border-[#e5e7eb] px-4 py-4">
                      <div className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-[#3b82f6] text-white">
                        <FileText className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="font-medium text-[#18181b]">{item.title}</div>
                        <div className="mt-1 text-sm text-[#a1a1aa]">{item.createdAt}</div>
                      </div>
                    </CardContent>
                  </Card>
                </button>
              ))
            ) : (
              <Card className="overflow-hidden border-dashed border-[#d4d4d8] bg-[#fafafa]">
                <CardContent className="px-5 py-8">
                  <div className="text-[15px] font-medium text-[#18181b]">当前筛选下没有匹配的收藏结果</div>
                  <p className="mt-2 text-sm leading-6 text-[#71717a]">可以调整关键词、切换类型，或回到任务页重新收藏结果。</p>
                </CardContent>
              </Card>
            )}
          </div>

          {selectedItem ? (
            <div className="mt-6 flex items-center gap-3">
              <Button className="rounded-[10px]" onClick={() => router.push(`/report?reportId=${selectedItem.reportId}`)}>
                打开结果页
              </Button>
              <Button variant="secondary" className="rounded-[10px]" onClick={() => router.push(`/agent?runId=${selectedItem.sourceRunId}`)}>
                返回任务上下文
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </MoreDataShell>
  );
}
