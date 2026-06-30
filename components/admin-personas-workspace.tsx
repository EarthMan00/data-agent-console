"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useOptionalPlatformAgent } from "@/components/platform-agent-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  adminActivateAlicePersona,
  adminCreateAlicePersona,
  adminDeleteAlicePersona,
  adminListAlicePersonas,
  adminPatchAlicePersona,
  AgentApiError,
  parseFastApiDetail,
} from "@/lib/agent-api/client";
import type { AdminAlicePersonaTemplate } from "@/lib/agent-api/types";
import { cn } from "@/lib/utils";

const FIELD_LABELS: Array<[keyof AdminAlicePersonaTemplate, string]> = [
  ["identity", "身份定位"],
  ["communication_style", "沟通风格"],
  ["output_contract", "输出约定"],
  ["safety_rules", "安全边界"],
  ["internal_reasoning_policy", "内部思考约束"],
  ["decompose_prompt", "任务拆解提示词"],
  ["error_humanize_prompt", "错误友好化提示词"],
];

export function AdminPersonasWorkspace() {
  const platformAgent = useOptionalPlatformAgent();
  const [personas, setPersonas] = useState<AdminAlicePersonaTemplate[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [activateOpen, setActivateOpen] = useState(false);

  const selected = useMemo(
    () => personas.find((p) => p.id === selectedId) ?? personas[0] ?? null,
    [personas, selectedId],
  );
  const canEditSelected = Boolean(selected && !selected.is_active);

  const refresh = useCallback(async () => {
    if (!platformAgent?.auth) return;
    setLoading(true);
    setNotice("");
    try {
      await platformAgent.withFreshToken(async (token) => {
        const res = await adminListAlicePersonas(token);
        const rows = res.personas ?? [];
        setPersonas(rows);
        setSelectedId((current) => (rows.some((p) => p.id === current) ? current : rows[0]?.id ?? ""));
      });
    } catch (e) {
      setNotice(e instanceof AgentApiError ? parseFastApiDetail(e.body) ?? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [platformAgent]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const patchSelected = async (body: Record<string, unknown>) => {
    if (!selected || !platformAgent?.auth || !canEditSelected) return;
    setBusy(true);
    setNotice("");
    try {
      await platformAgent.withFreshToken(async (token) => {
        const res = await adminPatchAlicePersona(token, selected.id, body);
        setPersonas((items) => items.map((item) => (item.id === selected.id ? res.persona : item)));
      });
    } catch (e) {
      setNotice(e instanceof AgentApiError ? parseFastApiDetail(e.body) ?? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const createTemplate = async () => {
    if (!platformAgent?.auth) return;
    setBusy(true);
    setNotice("");
    try {
      await platformAgent.withFreshToken(async (token) => {
        const res = await adminCreateAlicePersona(token, {
          name: "新 Alice 人设模板",
          description: "从当前启用模板复制的新模板",
        });
        setPersonas((items) => [res.persona, ...items]);
        setSelectedId(res.persona.id);
      });
    } catch (e) {
      setNotice(e instanceof AgentApiError ? parseFastApiDetail(e.body) ?? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const activateSelected = async () => {
    if (!selected || !platformAgent?.auth || selected.is_active) return;
    setBusy(true);
    setNotice("");
    try {
      await platformAgent.withFreshToken(async (token) => {
        await adminActivateAlicePersona(token, selected.id);
      });
      setActivateOpen(false);
      await refresh();
    } catch (e) {
      setNotice(e instanceof AgentApiError ? parseFastApiDetail(e.body) ?? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const deleteSelected = async () => {
    if (!selected || !platformAgent?.auth || selected.is_active) return;
    setBusy(true);
    setNotice("");
    try {
      await platformAgent.withFreshToken(async (token) => {
        await adminDeleteAlicePersona(token, selected.id);
      });
      await refresh();
    } catch (e) {
      setNotice(e instanceof AgentApiError ? parseFastApiDetail(e.body) ?? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Persona 管理</h1>
          <p className="mt-1 text-sm text-text-tertiary">
            管理 Alice 人设模板。启用模板只影响新会话，历史会话继续使用创建时保存的人设快照。
          </p>
        </div>
        <Button onClick={createTemplate} disabled={busy || loading}>
          新增人设模板
        </Button>
      </div>

      {notice && (
        <div className="rounded-control border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">
          {notice}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-text-tertiary">加载中…</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
          <div className="space-y-3">
            {personas.map((persona) => (
              <button
                type="button"
                key={persona.id}
                onClick={() => setSelectedId(persona.id)}
                className={cn(
                  "w-full rounded-control border px-4 py-3 text-left transition-colors",
                  selected?.id === persona.id
                    ? "border-primary/60 bg-primary/5"
                    : "border-border bg-bg-surface hover:bg-fill-hover",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-foreground">{persona.name}</span>
                  {persona.is_active && <span className="text-xs text-primary">当前生效</span>}
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-text-tertiary">
                  {persona.description || (persona.is_active ? "启用模板不可直接修改" : "未启用模板可编辑和删除")}
                </p>
              </button>
            ))}
          </div>

          {selected && (
            <div className="space-y-4 rounded-control border border-border bg-bg-surface p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2">
                  <Input
                    value={selected.name}
                    disabled={!canEditSelected || busy}
                    onChange={(e) =>
                      setPersonas((items) =>
                        items.map((item) => (item.id === selected.id ? { ...item, name: e.target.value } : item)),
                      )
                    }
                    onBlur={(e) => void patchSelected({ name: e.target.value.trim() })}
                  />
                  <Input
                    value={selected.description ?? ""}
                    placeholder="模板说明"
                    disabled={!canEditSelected || busy}
                    onChange={(e) =>
                      setPersonas((items) =>
                        items.map((item) =>
                          item.id === selected.id ? { ...item, description: e.target.value } : item,
                        ),
                      )
                    }
                    onBlur={(e) => void patchSelected({ description: e.target.value.trim() || null })}
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => setActivateOpen(true)} disabled={selected.is_active || busy}>
                    启用模板
                  </Button>
                  <Button variant="outline" onClick={deleteSelected} disabled={selected.is_active || busy}>
                    删除
                  </Button>
                </div>
              </div>

              {selected.is_active && (
                <p className="rounded-control bg-fill-hover px-3 py-2 text-sm text-text-tertiary">
                  当前启用模板不可直接修改或删除。需要调整时，请新增模板，编辑后再启用。
                </p>
              )}

              {FIELD_LABELS.map(([field, label]) => (
                <label key={field} className="block space-y-2">
                  <span className="text-sm font-medium text-foreground">{label}</span>
                  <Textarea
                    value={String(selected[field] ?? "")}
                    disabled={!canEditSelected || busy}
                    rows={field === "output_contract" || field === "decompose_prompt" ? 10 : 6}
                    onChange={(e) =>
                      setPersonas((items) =>
                        items.map((item) => (item.id === selected.id ? { ...item, [field]: e.target.value } : item)),
                      )
                    }
                    onBlur={(e) => void patchSelected({ [field]: e.target.value })}
                  />
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      <Dialog open={activateOpen} onOpenChange={setActivateOpen}>
        <DialogContent>
          <DialogTitle>启用人设模板</DialogTitle>
          <DialogDescription>
            启用后，此模板会成为新会话默认人设。已有会话仍使用创建时保存的人设快照，不受影响。
          </DialogDescription>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setActivateOpen(false)} disabled={busy}>
              取消
            </Button>
            <Button onClick={activateSelected} disabled={busy}>
              确认启用
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
