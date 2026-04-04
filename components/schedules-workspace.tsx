"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronDown, List, Plus, Search } from "lucide-react";

import { InlineNotice } from "@/components/inline-notice";
import { MoreDataShell } from "@/components/more-data-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { demoActions, useDemoState, type RunRecordEntry, type Workflow } from "@/lib/mock/store";

const primaryTabs = ["已定时", "运行记录"] as const;
const chips = ["全部", "默认"] as const;

export function SchedulesWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { runRecords, templates, workflows } = useDemoState();

  const [primaryTab, setPrimaryTab] = useState<(typeof primaryTabs)[number]>("已定时");
  const [activeChip, setActiveChip] = useState<(typeof chips)[number]>("全部");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("全部状态");
  const [filterOpen, setFilterOpen] = useState(false);
  const [notice, setNotice] = useState("");

  const currentTemplateId = searchParams.get("templateId");
  const createMode = searchParams.get("create") === "1";
  const currentTemplate = currentTemplateId ? templates.find((item) => item.id === currentTemplateId) : null;

  const [title, setTitle] = useState(currentTemplate?.title ?? "");
  const [prompt, setPrompt] = useState(currentTemplate?.body ?? "");
  const [frequency, setFrequency] = useState("每天");
  const [timeValue, setTimeValue] = useState("06:30");

  const filteredScheduled = useMemo(() => {
    return workflows.filter((item) => {
      const matchesScope = activeChip === "全部" || item.scope === activeChip;
      const matchesStatus = statusFilter === "全部状态" || item.status === statusFilter;
      const matchesSearch = !search || item.title.toLowerCase().includes(search.toLowerCase());
      return matchesScope && matchesStatus && matchesSearch;
    });
  }, [activeChip, search, statusFilter, workflows]);

  const filteredRuns = useMemo(
    () => runRecords.filter((item) => `${item.title}${item.result}`.toLowerCase().includes(search.toLowerCase())),
    [runRecords, search],
  );

  const selectedWorkflowId = searchParams.get("workflowId") ?? filteredScheduled[0]?.id;
  const selectedRunId = searchParams.get("runId") ?? filteredRuns[0]?.runId;
  const selectedWorkflow = filteredScheduled.find((item) => item.id === selectedWorkflowId) ?? filteredScheduled[0];
  const selectedRun = filteredRuns.find((item) => item.runId === selectedRunId) ?? filteredRuns[0];

  useEffect(() => {
    if (createMode) return;
    if (primaryTab === "已定时") {
      if (!searchParams.get("workflowId")) return;
      if (selectedWorkflow) return;
      if (filteredScheduled[0]) {
        router.push(`/schedules?workflowId=${filteredScheduled[0].id}`);
        return;
      }
      router.push("/schedules");
      return;
    }

    if (!searchParams.get("runId")) return;
    if (selectedRun) return;
    if (filteredRuns[0]) {
      router.push(`/schedules?runId=${filteredRuns[0].runId}`);
      return;
    }
    router.push("/schedules");
  }, [createMode, filteredRuns, filteredScheduled, primaryTab, router, searchParams, selectedRun, selectedWorkflow]);

  const createWorkflow = () => {
    const normalizedTitle = title.trim();
    const normalizedPrompt = prompt.trim();
    const nextRun = `${new Date().toISOString().slice(0, 10)} ${timeValue}`;

    setPrimaryTab("已定时");
    setStatusFilter("全部状态");
    setActiveChip(formGroupToScope(currentTemplate?.scope ?? "默认"));
    setSearch("");

    if (currentTemplate) {
      const workflowId = demoActions.createWorkflow({
        templateId: currentTemplate.id,
        title: normalizedTitle || `${currentTemplate.title} · 周期执行`,
        prompt: normalizedPrompt || currentTemplate.body,
        frequency: `${frequency} ${timeValue}`,
        nextRun,
        scope: currentTemplate.scope,
      });
      setNotice(`已根据「${currentTemplate.title}」创建定时任务。`);
      router.push(`/schedules?workflowId=${workflowId}&templateId=${currentTemplate.id}`);
      return;
    }

    const nextScope = "默认" as const;
    const { workflowId, templateId } = demoActions.createWorkflowWithTemplate({
      title: normalizedTitle,
      prompt: normalizedPrompt,
      frequency: `${frequency} ${timeValue}`,
      nextRun,
      scope: nextScope,
    });
    setNotice(`已创建定时任务「${normalizedTitle}」。`);
    router.push(`/schedules?workflowId=${workflowId}&templateId=${templateId}`);
  };

  const submitCreate = () => {
    if (!title.trim() || !prompt.trim()) {
      setNotice("请先补全标题和提示词。");
      return;
    }
    createWorkflow();
  };

  if (createMode) {
    return (
      <MoreDataShell currentPath="/schedules">
        <div className="px-8 pb-12 pt-8">
          <div className="mx-auto max-w-[760px]">
            {notice ? <div className="mb-6"><InlineNotice message={notice} /></div> : null}
            <button
              onClick={() => router.push("/schedules")}
              className="inline-flex items-center gap-2 text-sm text-[#52525b]"
            >
              <ChevronLeft className="h-4 w-4" />
              返回
            </button>
            <h1 className="mt-4 text-[18px] font-semibold text-[#18181b]">创建定时任务</h1>
            <p className="mt-2 text-sm text-[#71717a]">定时任务将按设定频率执行，请留意积分消耗</p>

            <div className="mt-8 space-y-8">
              <Card className="border-[#e5e7eb] bg-[#fafafa]">
                <CardContent className="flex items-center justify-between px-4 py-4">
                  <div>
                    <div className="font-medium text-[#18181b]">任务启用</div>
                    <div className="mt-2 text-sm text-[#a1a1aa]">关闭后，More Data Agent 将暂停此任务</div>
                  </div>
                  <button className="flex h-6 w-8 items-center rounded-full bg-[#18181b] px-0.5">
                    <span className="ml-auto block h-5 w-5 rounded-full bg-white" />
                  </button>
                </CardContent>
              </Card>

              <div className="space-y-6">
                <Field label="标题 *">
                  <Input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="请输入定时任务标题"
                    className="h-12 rounded-[12px] border-[#e5e7eb]"
                  />
                </Field>

                <Field label="提示词 *">
                  <Textarea
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    placeholder="需要一份关于亚马逊的商品详情？试试输入 @卖家精灵..."
                    className="min-h-[140px] rounded-[12px] border-[#e5e7eb] px-4 py-4"
                  />
                  <div className="mt-3 flex items-center gap-2">
                    <span className="inline-flex h-8 items-center rounded-[10px] border border-[#e5e7eb] bg-[#f5f5f5] px-3 text-sm text-[#52525b]">
                      @数据源
                    </span>
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-[#e5e7eb] bg-[#f5f5f5] text-[#71717a]">
                      +
                    </span>
                  </div>
                </Field>

                <Field label="执行时间">
                  <div className="grid gap-3 md:grid-cols-[1fr_1fr]">
                    <select
                      value={frequency}
                      onChange={(event) => setFrequency(event.target.value)}
                      className="h-12 rounded-[12px] border border-[#e5e7eb] bg-white px-4 text-sm text-[#18181b]"
                    >
                      <option>每天</option>
                      <option>每周一</option>
                      <option>每周三</option>
                    </select>
                    <select
                      value={timeValue}
                      onChange={(event) => setTimeValue(event.target.value)}
                      className="h-12 rounded-[12px] border border-[#e5e7eb] bg-white px-4 text-sm text-[#18181b]"
                    >
                      <option>06:30</option>
                      <option>09:00</option>
                      <option>18:00</option>
                    </select>
                  </div>
                  <div className="mt-3 text-sm text-[#a1a1aa]">{frequency}{timeValue} 执行</div>
                </Field>

                <Field label="结果推送">
                  <button className="flex h-11 w-full items-center justify-center gap-2 rounded-[12px] border border-[#e5e7eb] text-[#52525b]">
                    <Plus className="h-4 w-4" />
                    添加提醒
                  </button>
                </Field>
              </div>
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 border-t border-[#e5e7eb] bg-white px-8 py-4">
          <div className="mx-auto flex max-w-[760px] items-center justify-end gap-3">
            <Button variant="outline" className="rounded-[10px]" onClick={() => router.push("/schedules")}>
              取消
            </Button>
            <Button className="rounded-[10px] bg-[#1f2b1f] text-white hover:bg-[#283728]" onClick={submitCreate}>
              试运行
            </Button>
          </div>
        </div>
      </MoreDataShell>
    );
  }

  return (
    <MoreDataShell currentPath="/schedules">
      <div className="px-8 pb-12 pt-8">
        <div className="mx-auto max-w-[1180px]">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <h1 className="font-[family:var(--font-jakarta)] text-[24px] font-semibold text-[#18181b]">定时任务</h1>
              <Tabs value={primaryTab} onValueChange={(value) => setPrimaryTab(value as (typeof primaryTabs)[number])} className="mt-7">
                <TabsList className="h-auto bg-transparent p-0">
                  {primaryTabs.map((tab) => (
                    <TabsTrigger
                      key={tab}
                      value={tab}
                      className="rounded-none border-b-2 border-transparent bg-transparent px-0 pb-2 pt-0 text-[15px] text-[#8a97aa] data-[state=active]:border-[#18181b] data-[state=active]:bg-transparent data-[state=active]:text-[#18181b] data-[state=active]:shadow-none"
                    >
                      {tab}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>

              <div className="mt-5 flex items-center gap-2">
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
                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-[8px]" onClick={() => router.push("/schedules?create=1")}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#71717a]" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="搜索定时任务"
                    className="h-9 w-[220px] rounded-[10px] border-[#e5e7eb] pl-9"
                  />
                </div>
                <Button className="h-9 rounded-[10px] bg-[#1f2b1f] text-white hover:bg-[#283728]" onClick={() => router.push("/schedules?create=1")}>
                  <Plus className="h-4 w-4" />
                  创建定时任务
                </Button>
              </div>

              <div className="flex items-center justify-end gap-6 text-sm text-[#7b8ba1]">
                <div className="relative">
                  <button onClick={() => setFilterOpen((open) => !open)} className="inline-flex items-center gap-1.5">
                    {statusFilter}
                    <ChevronDown className="h-4 w-4" />
                  </button>
                  {filterOpen ? (
                    <div className="absolute right-0 top-8 z-10 w-[116px] rounded-[10px] border border-[#dde4ef] bg-white py-1 shadow-[0_18px_34px_rgba(157,173,196,0.18)]">
                      {["全部状态", "运行中", "已暂停"].map((item) => (
                        <button
                          key={item}
                          onClick={() => {
                            setStatusFilter(item);
                            setFilterOpen(false);
                          }}
                          className="block w-full px-3 py-2 text-left text-sm text-[#6b7d93] hover:bg-[#f5f8fd]"
                        >
                          {item}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <List className="h-4 w-4 text-[#8d9caf]" />
              </div>
            </div>
          </div>

          {notice ? <div className="mt-6"><InlineNotice message={notice} /></div> : null}

          {primaryTab === "已定时" && filteredScheduled.length === 0 ? (
            <div className="mt-10 flex min-h-[480px] flex-col items-center justify-center rounded-[24px] text-center">
              <div className="flex h-28 w-28 items-center justify-center rounded-full bg-[radial-gradient(circle,rgba(24,24,27,0.04),rgba(255,255,255,0.94))] shadow-[0_22px_44px_rgba(24,24,27,0.08)]">
                <div className="h-14 w-16 rounded-b-[14px] rounded-t-[10px] border border-[#e5e7eb] bg-white" />
              </div>
              <p className="mt-6 text-[15px] text-[#a1a1aa]">暂无定时任务</p>
              <button className="mt-1 text-[15px] font-medium text-[#18181b]" onClick={() => router.push("/schedules?create=1")}>
                立即创建
              </button>
            </div>
          ) : (
            <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {(primaryTab === "已定时" ? filteredScheduled : filteredRuns).map((item) =>
                primaryTab === "已定时" ? (
                  <ScheduleCard
                    key={(item as Workflow).id}
                    title={(item as Workflow).title}
                    meta={`${(item as Workflow).frequency} · ${(item as Workflow).nextRun}`}
                    status={(item as Workflow).status}
                    active={(item as Workflow).id === selectedWorkflow?.id}
                    onClick={() => router.push(`/schedules?workflowId=${(item as Workflow).id}`)}
                  />
                ) : (
                  <ScheduleCard
                    key={(item as RunRecordEntry).id}
                    title={(item as RunRecordEntry).title}
                    meta={`${(item as RunRecordEntry).startedAt} · ${(item as RunRecordEntry).result}`}
                    active={(item as RunRecordEntry).runId === selectedRun?.runId}
                    onClick={() => router.push(`/schedules?runId=${(item as RunRecordEntry).runId}`)}
                  />
                ),
              )}
            </div>
          )}
        </div>
      </div>
    </MoreDataShell>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-3 text-sm font-medium text-[#52525b]">{label}</div>
      {children}
    </div>
  );
}

function ScheduleCard({
  title,
  meta,
  status,
  active,
  onClick,
}: {
  title: string;
  meta: string;
  status?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="w-full text-left">
      <Card className={active ? "border-[#d4d4d8]" : "border-[#e5e7eb]"}>
        <CardContent className="px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="font-medium text-[#18181b]">{title}</div>
            {status ? (
              <span className="rounded-full border border-[#dbe4ee] bg-[#f8fafc] px-2.5 py-1 text-xs text-[#617285]">
                {status}
              </span>
            ) : null}
          </div>
          <div className="mt-2 text-sm text-[#a1a1aa]">{meta}</div>
        </CardContent>
      </Card>
    </button>
  );
}

function formGroupToScope(scope: "全部" | "默认") {
  return scope === "全部" ? "全部" : "默认";
}
