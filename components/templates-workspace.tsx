"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Search } from "lucide-react";

import { InlineNotice } from "@/components/inline-notice";
import { MoreDataShell } from "@/components/more-data-shell";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { demoActions, useDemoState } from "@/lib/mock/store";

const chipOptions = ["全部", "默认"] as const;

export function TemplatesWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentRunId, templates } = useDemoState();
  const [activeChip, setActiveChip] = useState<(typeof chipOptions)[number]>("全部");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formGroup, setFormGroup] = useState("默认");
  const [formSummary, setFormSummary] = useState("");
  const [formBody, setFormBody] = useState("");

  const filteredCards = useMemo(() => {
    return templates.filter((item) => {
      const matchesChip = activeChip === "全部" || item.scope === activeChip;
      const matchesQuery = !query || `${item.title}${item.body}`.toLowerCase().includes(query.toLowerCase());
      return matchesChip && matchesQuery;
    });
  }, [activeChip, query, templates]);

  const selectedId = searchParams.get("templateId") ?? filteredCards[0]?.id;
  const selectedTemplate = filteredCards.find((item) => item.id === selectedId) ?? filteredCards[0];

  useEffect(() => {
    if (!searchParams.get("templateId")) return;
    if (selectedTemplate) return;
    if (filteredCards[0]) {
      router.push(`/templates?templateId=${filteredCards[0].id}`);
      return;
    }
    router.push("/templates");
  }, [filteredCards, router, searchParams, selectedTemplate]);

  const createFromCurrentRun = () => {
    const templateId = demoActions.saveTemplateFromRun(currentRunId);
    setNotice("已从当前任务保存任务指令。");
    router.push(`/templates?templateId=${templateId}`);
  };

  const openCreateDialog = () => {
    setFormTitle("");
    setFormGroup("默认");
    setFormSummary("");
    setFormBody(selectedTemplate?.body ?? "");
    setCreateOpen(true);
  };

  const savePrompt = () => {
    if (!formTitle.trim() || !formBody.trim()) {
      setNotice("请先补全标题和提示词 prompt。");
      return;
    }
    const templateId = demoActions.createTemplate({
      title: formTitle,
      body: formBody,
      scope: formGroup === "全部" ? "全部" : "默认",
      sourceRunId: currentRunId,
      summary: formSummary,
    });
    setQuery("");
    setActiveChip(formGroup === "全部" ? "全部" : "默认");
    setCreateOpen(false);
    setNotice(`已保存任务指令「${formTitle}」。`);
    router.push(`/templates?templateId=${templateId}`);
  };

  return (
    <MoreDataShell currentPath="/templates">
      <div className="px-8 pb-12 pt-8">
        <div className="mx-auto max-w-[1180px]">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <h1 className="font-[family:var(--font-jakarta)] text-[24px] font-semibold text-[#18181b]">任务指令库</h1>
              <div className="mt-7 flex items-center gap-2">
                {chipOptions.map((chip) => (
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
                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-[8px]" onClick={openCreateDialog}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#71717a]" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="搜索任务指令"
                  className="h-9 w-[220px] rounded-[10px] border-[#e5e7eb] pl-9"
                />
              </div>
              <Button className="h-9 rounded-[10px] bg-[#1f2b1f] px-4 text-white hover:bg-[#283728]" onClick={openCreateDialog}>
                <Plus className="h-4 w-4" />
                创建任务指令
              </Button>
            </div>
          </div>

          {notice ? <div className="mt-6"><InlineNotice message={notice} /></div> : null}

          <div className="mt-8 grid max-w-[720px] gap-4">
            {filteredCards.length > 0 ? (
              filteredCards.map((card) => {
                const active = card.id === selectedTemplate?.id;
                return (
                  <button
                    key={card.id}
                    onClick={() => router.push(`/templates?templateId=${card.id}`)}
                    className="w-full text-left"
                  >
                    <Card className={active ? "overflow-hidden border-[#d4d4d8]" : "overflow-hidden border-[#e5e7eb]"}>
                      <div className="min-h-[120px] bg-[#fafafa] px-4 py-4 text-[13px] leading-7 text-[#71717a]">
                        {card.summary || card.body}
                      </div>
                      <CardContent className="border-t border-[#e5e7eb] px-4 py-4">
                        <div className="font-medium text-[#18181b]">{card.title}</div>
                        <div className="mt-2 text-sm text-[#a1a1aa]">{card.createdAt}</div>
                      </CardContent>
                    </Card>
                  </button>
                );
              })
            ) : (
              <Card className="overflow-hidden border-dashed border-[#d4d4d8] bg-[#fafafa]">
                <CardContent className="px-5 py-8">
                  <div className="text-[15px] font-medium text-[#18181b]">当前筛选下没有匹配的任务指令</div>
                  <p className="mt-2 text-sm leading-6 text-[#71717a]">可以调整关键词、切换分组，或直接新建一条任务指令。</p>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="mt-6 flex items-center gap-3">
            <Button variant="secondary" className="rounded-[10px]" onClick={createFromCurrentRun}>
              从当前任务创建
            </Button>
            {selectedTemplate ? (
              <Button
                className="rounded-[10px]"
                onClick={() => {
                  const runId = demoActions.startTaskRun({
                    objective: selectedTemplate.body,
                    mode: "专业模式",
                  });
                  router.push(`/agent?runId=${runId}`);
                }}
              >
                直接发起任务
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-[540px] rounded-[18px] border-[#e5e7eb] p-0">
          <div className="px-8 pb-8 pt-7">
            <DialogTitle className="text-[18px] font-semibold text-[#18181b]">保存提示词</DialogTitle>
            <DialogDescription className="mt-2 text-sm leading-6 text-[#71717a]">
              保存当前提示词后，可继续复用、发起任务或转成定时任务。
            </DialogDescription>

            <div className="mt-6 space-y-5">
              <div className="space-y-2">
                <label className="text-sm text-[#52525b]">标题 *</label>
                <Input
                  value={formTitle}
                  onChange={(event) => setFormTitle(event.target.value)}
                  placeholder="为这个提示词起个名字吧"
                  className="h-12 rounded-[12px] border-[#d4d4d8]"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm text-[#52525b]">分组</label>
                <select
                  value={formGroup}
                  onChange={(event) => setFormGroup(event.target.value)}
                  className="h-12 w-full rounded-[12px] border border-[#e5e7eb] bg-white px-4 text-sm text-[#18181b]"
                >
                  <option value="默认">默认</option>
                  <option value="全部">全部</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm text-[#52525b]">简介</label>
                <Input
                  value={formSummary}
                  onChange={(event) => setFormSummary(event.target.value)}
                  placeholder="请填写简介信息"
                  className="h-11 rounded-[12px] border-[#e5e7eb]"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm text-[#52525b]">提示词 prompt *</label>
                <Textarea
                  value={formBody}
                  onChange={(event) => setFormBody(event.target.value)}
                  placeholder="示例：@卖家精灵-选产品，在亚马逊搜索关键词 ..."
                  className="min-h-[155px] rounded-[12px] border-[#e5e7eb] px-4 py-3"
                />
              </div>
            </div>

            <div className="mt-8 flex justify-end gap-3">
              <Button variant="outline" className="rounded-[10px]" onClick={() => setCreateOpen(false)}>
                取消
              </Button>
              <Button className="rounded-[10px] bg-[#1f2b1f] text-white hover:bg-[#283728]" onClick={savePrompt}>
                保存
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </MoreDataShell>
  );
}
