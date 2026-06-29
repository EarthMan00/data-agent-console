"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useOptionalPlatformAgent } from "@/components/platform-agent-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  adminListPromptCategories,
  adminCreatePromptCategory,
  adminPatchPromptCategory,
  adminDeletePromptCategory,
  adminListPromptTemplates,
  adminCreatePromptTemplate,
  adminPatchPromptTemplate,
  adminDeletePromptTemplate,
  adminImportPromptsFromExcel,
  AgentApiError,
  parseFastApiDetail,
} from "@/lib/agent-api/client";
import type { AdminPromptCategory, AdminPromptTemplate } from "@/lib/agent-api/types";

export function AdminPromptsWorkspace() {
  const platformAgent = useOptionalPlatformAgent();
  const [categories, setCategories] = useState<AdminPromptCategory[]>([]);
  const [templates, setTemplates] = useState<AdminPromptTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;

  // category edit
  const [ceOpen, setCeOpen] = useState(false);
  const [ceTarget, setCeTarget] = useState<AdminPromptCategory | null>(null);
  const [ceName, setCeName] = useState("");
  const [ceOrder, setCeOrder] = useState(0);
  const [ceBusy, setCeBusy] = useState(false);

  // category delete
  const [cdTarget, setCdTarget] = useState<AdminPromptCategory | null>(null);
  const [cdBusy, setCdBusy] = useState(false);

  // template edit
  const [teOpen, setTeOpen] = useState(false);
  const [teTarget, setTeTarget] = useState<AdminPromptTemplate | null>(null);
  const [teTitle, setTeTitle] = useState("");
  const [teDesc, setTeDesc] = useState("");
  const [tePrompt, setTePrompt] = useState("");
  const [teCatId, setTeCatId] = useState("");
  const [teStatus, setTeStatus] = useState("draft");
  const [teActive, setTeActive] = useState(false);
  const [teMeta, setTeMeta] = useState("");
  const [teCapIds, setTeCapIds] = useState("");
  const [teRunId, setTeRunId] = useState("");
  const [teShareId, setTeShareId] = useState("");
  const [teVars, setTeVars] = useState("");
  const [teSort, setTeSort] = useState(0);
  const [teBusy, setTeBusy] = useState(false);

  // template delete
  const [tdTarget, setTdTarget] = useState<AdminPromptTemplate | null>(null);
  const [tdBusy, setTdBusy] = useState(false);

  // 导入 Excel
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importBusy, setImportBusy] = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const refresh = useCallback(async () => {
    if (!platformAgent?.auth) return;
    setLoading(true);
    setNotice("");
    try {
      await platformAgent.withFreshToken(async (token) => {
        const cRes = await adminListPromptCategories(token);
        const cats = cRes.categories ?? [];
        setCategories(cats);
        // 若无选中分类，默认选中第一个
        const effectiveCategoryId = selectedCategoryId ?? cats[0]?.id ?? null;
        if (!selectedCategoryId && effectiveCategoryId) {
          setSelectedCategoryId(effectiveCategoryId);
        }
        if (effectiveCategoryId) {
          const tRes = await adminListPromptTemplates(token, effectiveCategoryId, statusFilter || undefined, page, pageSize);
          setTemplates(tRes.templates ?? []);
          setTotal(tRes.total ?? 0);
        } else {
          setTemplates([]);
          setTotal(0);
        }
      });
    } catch (e) {
      setNotice(e instanceof AgentApiError ? parseFastApiDetail(e.body) ?? e.message : String(e));
    } finally { setLoading(false); }
  }, [platformAgent, selectedCategoryId, statusFilter, page]);

  useEffect(() => { void refresh(); }, [refresh]);

  const oc = () => { setCeTarget(null); setCeName(""); setCeOrder(0); setCeOpen(true); };
  const oce = (c: AdminPromptCategory) => { setCeTarget(c); setCeName(c.name); setCeOrder(c.sort_order); setCeOpen(true); };
  const sce = async () => {
    if (!platformAgent?.auth) return;
    if (!ceName.trim()) { setNotice("分类名称不能为空"); return; }
    setCeBusy(true); setNotice("");
    try {
      await platformAgent.withFreshToken(async (token) => {
        if (ceTarget) {
          await adminPatchPromptCategory(token, ceTarget.id, { name: ceName.trim(), sort_order: ceOrder });
          return;
        }
        await adminCreatePromptCategory(token, { name: ceName.trim(), sort_order: ceOrder });
      });
      setCeOpen(false); await refresh();
    } catch (e) {
      setNotice(e instanceof AgentApiError ? parseFastApiDetail(e.body) ?? e.message : String(e));
    } finally { setCeBusy(false); }
  };
  const scd = async () => {
    if (!platformAgent?.auth || !cdTarget) return;
    setCdBusy(true); setNotice("");
    try {
      await platformAgent.withFreshToken(async (t) => { await adminDeletePromptCategory(t, cdTarget.id); });
      if (selectedCategoryId === cdTarget.id) {
        const next = categories.find((c) => c.id !== cdTarget.id);
        setSelectedCategoryId(next?.id ?? null);
      }
      setCdTarget(null); await refresh();
    } catch (e) {
      setNotice(e instanceof AgentApiError ? parseFastApiDetail(e.body) ?? e.message : String(e));
    } finally { setCdBusy(false); }
  };

  const otc = () => {
    setTeTarget(null); setTeTitle(""); setTeDesc(""); setTePrompt(""); setTeCatId(selectedCategoryId ?? "");
    setTeStatus("draft"); setTeActive(false); setTeMeta(""); setTeCapIds(""); setTeRunId(""); setTeShareId("");
    setTeVars(""); setTeSort(0); setTeOpen(true);
  };
  const ote = (t: AdminPromptTemplate) => {
    setTeTarget(t); setTeTitle(t.title); setTeDesc(t.description ?? ""); setTePrompt(t.prompt_text);
    setTeCatId(t.category_id ?? ""); setTeStatus(t.status); setTeActive(t.is_active); setTeMeta(t.meta_line ?? "");
    setTeCapIds((t.capability_ids ?? []).join(", ")); setTeRunId(t.replay_run_id ?? ""); setTeShareId(t.replay_share_id ?? "");
    setTeVars(JSON.stringify(t.variables ?? [], null, 2)); setTeSort(t.sort_order); setTeOpen(true);
  };
  const ste = async () => {
    if (!platformAgent?.auth) return;
    if (!teTitle.trim()) { setNotice("模板标题不能为空"); return; }
    setTeBusy(true); setNotice("");
    try {
      const body: Record<string, unknown> = {
        title: teTitle.trim(), description: teDesc.trim() || undefined, prompt_text: tePrompt,
        category_id: teCatId || undefined, status: teStatus, is_active: teActive,
        meta_line: teMeta.trim() || undefined,
        capability_ids: teCapIds.trim() ? teCapIds.split(",").map((s) => s.trim()).filter(Boolean) : [],
        replay_run_id: teRunId.trim() || undefined, replay_share_id: teShareId.trim() || undefined,
        sort_order: teSort,
      };
      if (teVars.trim()) {
        try { const p = JSON.parse(teVars.trim()); body.variables = Array.isArray(p) ? p : []; }
        catch { setNotice("variables 不是有效的 JSON"); setTeBusy(false); return; }
      }
      await platformAgent.withFreshToken(async (t) => {
        if (teTarget) {
          await adminPatchPromptTemplate(t, teTarget.id, body);
          return;
        }
        await adminCreatePromptTemplate(t, body);
      });
      setTeOpen(false); await refresh();
    } catch (e) {
      setNotice(e instanceof AgentApiError ? parseFastApiDetail(e.body) ?? e.message : String(e));
    } finally { setTeBusy(false); }
  };
  const std = async () => {
    if (!platformAgent?.auth || !tdTarget) return;
    setTdBusy(true); setNotice("");
    try {
      await platformAgent.withFreshToken(async (t) => { await adminDeletePromptTemplate(t, tdTarget.id); });
      setTdTarget(null); await refresh();
    } catch (e) {
      setNotice(e instanceof AgentApiError ? parseFastApiDetail(e.body) ?? e.message : String(e));
    } finally { setTdBusy(false); }
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !platformAgent?.auth) return;
    setImportBusy(true); setNotice("");
    try {
      await platformAgent.withFreshToken(async (token) => {
        const result = await adminImportPromptsFromExcel(token, file);
        setNotice(
          `导入完成：分类 新建 ${result.categories_created} / 删除 ${result.categories_deleted}，` +
          `模板 新建 ${result.templates_created} / 删除 ${result.templates_deleted}` +
          (result.errors.length > 0 ? `（${result.errors.length} 条异常）` : ""),
        );
        await refresh();
      });
    } catch (e) {
      setNotice(e instanceof AgentApiError ? parseFastApiDetail(e.body) ?? e.message : String(e));
    } finally {
      setImportBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const statusBadge = (s: string) => {
    const m: Record<string, string> = { draft: "bg-bg-subtle text-text-secondary", published: "bg-success-bg text-success", archived: "bg-warning-bg text-warning" };
    const l: Record<string, string> = { draft: "草稿", published: "已发布", archived: "已归档" };
    return <span className={`rounded-full px-2 py-0.5 text-xs ${m[s] ?? "bg-bg-subtle text-text-secondary"}`}>{l[s] ?? s}</span>;
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-title-3 font-semibold leading-8 text-foreground">Prompt 模板管理</h1>
          <p className="mt-2 text-sm leading-6 text-text-tertiary">管理提示词分类与模板内容。</p>
        </div>
      </div>

      {notice ? <p className="mt-4 text-sm text-danger">{notice}</p> : null}

      <div className="mt-8 flex gap-6">
        {/* --- categories panel --- */}
        <div className="w-64 shrink-0">
          <div className="rounded-popover border border-border bg-bg-surface shadow-sm">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="text-sm font-semibold text-foreground">分类</span>
              <Button size="sm" className="h-7 rounded-md text-xs" onClick={oc}>新增分类</Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => { void handleImportExcel(e); }}
              />
              <Button
                size="sm"
                className="h-7 rounded-md text-xs"
                disabled={importBusy}
                onClick={() => fileInputRef.current?.click()}
              >
                {importBusy ? "导入中…" : "导入"}
              </Button>
            </div>
            {loading ? (
              <div className="px-4 py-8 text-center text-sm text-text-disabled">加载中…</div>
            ) : categories.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-text-disabled">暂无分类</div>
            ) : (
              <ul className="divide-y divide-border-subtle">
                {categories.map((cat) => (
                  <li
                    key={cat.id}
                    className={`flex cursor-pointer items-center justify-between px-4 py-2.5 text-sm transition-colors hover:bg-fill-hover ${selectedCategoryId === cat.id ? "bg-fill-hover" : ""}`}
                    onClick={() => {
                      setSelectedCategoryId(cat.id);
                      setPage(1);
                    }}
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <span className="truncate text-foreground">{cat.name}</span>
                      <span className="shrink-0 text-xs text-text-disabled"></span>
                    </div>
                    <div className="flex shrink-0 gap-0.5">
                      <Button variant="ghost" size="sm" className="h-6 w-6 rounded-sm p-0 text-xs text-text-tertiary" onClick={(e) => { e.stopPropagation(); oce(cat); }}>✎</Button>
                      <Button variant="ghost" size="sm" className="h-6 w-6 rounded-sm p-0 text-xs text-danger" onClick={(e) => { e.stopPropagation(); setCdTarget(cat); }}>✕</Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* --- templates panel --- */}
        <div className="min-w-0 flex-1">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-foreground">
              {selectedCategoryId ? `模板列表 (${total})` : `模板列表 (${total})`}
            </h2>
            <div className="flex items-center gap-3">
              <select
                className="h-9 rounded-control border border-border bg-bg-surface px-3 text-sm text-foreground outline-none"
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              >
                <option value="">全部状态</option>
                <option value="draft">草稿</option>
                <option value="published">已发布</option>
                <option value="archived">已归档</option>
              </select>
              <Button className="rounded-control" onClick={otc}>新增模板</Button>
            </div>
          </div>

          <div className="overflow-hidden rounded-popover border border-border bg-bg-surface shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-fill-hover text-xs font-medium uppercase tracking-wide text-text-tertiary">
                <tr>
                  <th className="px-4 py-3">标题</th>
                  <th className="px-4 py-3">分类</th>
                  <th className="px-4 py-3">状态</th>
                  <th className="px-4 py-3">启用</th>
                  <th className="px-4 py-3">排序</th>
                  <th className="px-4 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-text-disabled">加载中…</td></tr>
                ) : templates.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-text-disabled">暂无模板</td></tr>
                ) : templates.map((t) => (
                  <tr key={t.id} className="border-b border-border-subtle last:border-0">
                    <td className="max-w-52 truncate px-4 py-3 font-medium text-foreground">{t.title}</td>
                    <td className="px-4 py-3 text-text-tertiary">{t.category_name ?? "—"}</td>
                    <td className="px-4 py-3">{statusBadge(t.status)}</td>
                    <td className="px-4 py-3">{t.is_active ? <span className="rounded-full bg-info-bg px-2 py-0.5 text-xs text-info">是</span> : "—"}</td>
                    <td className="px-4 py-3 text-text-tertiary">{t.sort_order}</td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" size="sm" className="h-8 rounded-md" onClick={() => ote(t)}>编辑</Button>
                      <Button variant="ghost" size="sm" className="h-8 rounded-md text-danger" onClick={() => setTdTarget(t)}>删除</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* --- pagination --- */}
          {total > pageSize && (
            <div className="mt-4 flex items-center justify-between text-sm text-text-tertiary">
              <span>共 {total} 条，第 {page}/{totalPages} 页</span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-md text-xs"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  上一页
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-md text-xs"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  下一页
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Category Create/Edit Dialog */}
      <Dialog open={ceOpen} onOpenChange={(o) => !o && setCeOpen(false)}>
        <DialogContent className="max-w-md rounded-card">
          <DialogTitle>{ceTarget ? "编辑分类" : "新增分类"}</DialogTitle>
          <div className="grid gap-3 pt-2">
            <div className="grid gap-1">
              <label className="text-xs text-text-tertiary">分类名称</label>
              <Input value={ceName} onChange={(e) => setCeName(e.target.value)} className="h-9 rounded-control" />
            </div>
            <div className="grid gap-1">
              <label className="text-xs text-text-tertiary">排序</label>
              <Input type="number" value={ceOrder} onChange={(e) => setCeOrder(Number(e.target.value))} className="h-9 rounded-control" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" className="rounded-control" onClick={() => setCeOpen(false)}>取消</Button>
              <Button size="sm" className="rounded-control" disabled={ceBusy} onClick={sce}>{ceBusy ? "保存中…" : "保存"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Category Delete Dialog */}
      <Dialog open={!!cdTarget} onOpenChange={(o) => !o && setCdTarget(null)}>
        <DialogContent className="max-w-md rounded-card">
          <DialogTitle>确认删除分类</DialogTitle>
          <p className="text-sm text-text-tertiary">确定删除分类「{cdTarget?.name}」？分类下的模板不会自动删除。</p>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" size="sm" className="rounded-control" onClick={() => setCdTarget(null)}>取消</Button>
            <Button size="sm" className="rounded-control bg-danger hover:bg-danger-hover" disabled={cdBusy} onClick={scd}>{cdBusy ? "删除中…" : "确定删除"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Template Create/Edit Dialog */}
      <Dialog open={teOpen} onOpenChange={(o) => !o && setTeOpen(false)}>
        <DialogContent className="max-w-2xl rounded-card">
          <DialogTitle>{teTarget ? "编辑模板" : "新增模板"}</DialogTitle>
          <div className="grid max-h-admin-dialog-list gap-3 overflow-auto pt-2">
            <div className="grid gap-1">
              <label className="text-xs text-text-tertiary">标题</label>
              <Input value={teTitle} onChange={(e) => setTeTitle(e.target.value)} className="h-9 rounded-control" />
            </div>
            <div className="grid gap-1">
              <label className="text-xs text-text-tertiary">描述</label>
              <textarea value={teDesc} onChange={(e) => setTeDesc(e.target.value)} className="min-h-15 rounded-control border border-border bg-bg-surface px-3 py-2 text-sm text-foreground outline-none" rows={2} />
            </div>
            <div className="grid gap-1">
              <label className="text-xs text-text-tertiary">Prompt 文本</label>
              <textarea value={tePrompt} onChange={(e) => setTePrompt(e.target.value)} className="min-h-30 rounded-control border border-border bg-bg-surface px-3 py-2 text-sm font-mono text-foreground outline-none" rows={5} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1">
                <label className="text-xs text-text-tertiary">分类</label>
                <select value={teCatId} onChange={(e) => setTeCatId(e.target.value)} className="h-9 rounded-control border border-border bg-bg-surface px-3 text-sm text-foreground outline-none">
                  <option value="">无分类</option>
                  {categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                </select>
              </div>
              <div className="grid gap-1">
                <label className="text-xs text-text-tertiary">状态</label>
                <select value={teStatus} onChange={(e) => setTeStatus(e.target.value)} className="h-9 rounded-control border border-border bg-bg-surface px-3 text-sm text-foreground outline-none">
                  <option value="draft">草稿</option>
                  <option value="published">已发布</option>
                  <option value="archived">已归档</option>
                </select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="te-active" checked={teActive} onCheckedChange={(v) => setTeActive(v === true)} />
              <label htmlFor="te-active" className="text-xs text-text-tertiary">启用</label>
            </div>
            <div className="grid gap-1">
              <label className="text-xs text-text-tertiary">meta_line</label>
              <Input value={teMeta} onChange={(e) => setTeMeta(e.target.value)} className="h-9 rounded-control" />
            </div>
            <div className="grid gap-1">
              <label className="text-xs text-text-tertiary">capability_ids（逗号分隔）</label>
              <Input value={teCapIds} onChange={(e) => setTeCapIds(e.target.value)} className="h-9 rounded-control" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1">
                <label className="text-xs text-text-tertiary">replay_run_id</label>
                <Input value={teRunId} onChange={(e) => setTeRunId(e.target.value)} className="h-9 rounded-control" />
              </div>
              <div className="grid gap-1">
                <label className="text-xs text-text-tertiary">replay_share_id</label>
                <Input value={teShareId} onChange={(e) => setTeShareId(e.target.value)} className="h-9 rounded-control" />
              </div>
            </div>
            <div className="grid gap-1">
              <label className="text-xs text-text-tertiary">variables（JSON 数组）</label>
              <textarea value={teVars} onChange={(e) => setTeVars(e.target.value)} className="min-h-20 rounded-control border border-border bg-bg-surface px-3 py-2 text-sm font-mono text-foreground outline-none" rows={3} placeholder='[{"key": "var1", "label": "变量1"}]' />
            </div>
            <div className="grid gap-1">
              <label className="text-xs text-text-tertiary">sort_order</label>
              <Input type="number" value={teSort} onChange={(e) => setTeSort(Number(e.target.value))} className="h-9 rounded-control" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" className="rounded-control" onClick={() => setTeOpen(false)}>取消</Button>
              <Button size="sm" className="rounded-control" disabled={teBusy} onClick={ste}>{teBusy ? "保存中…" : "保存"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Template Delete Dialog */}
      <Dialog open={!!tdTarget} onOpenChange={(o) => !o && setTdTarget(null)}>
        <DialogContent className="max-w-md rounded-card">
          <DialogTitle>确认删除模板</DialogTitle>
          <p className="text-sm text-text-tertiary">确定删除模板「{tdTarget?.title}」？此操作不可恢复。</p>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" size="sm" className="rounded-control" onClick={() => setTdTarget(null)}>取消</Button>
            <Button size="sm" className="rounded-control bg-danger hover:bg-danger-hover" disabled={tdBusy} onClick={std}>{tdBusy ? "删除中…" : "确定删除"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
