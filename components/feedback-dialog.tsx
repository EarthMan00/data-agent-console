"use client";

import { LoaderCircle } from "@/components/ui/tabler-icons";
import { useEffect, useMemo, useState } from "react";

import { getAgentHttpApiBase } from "@/lib/agent-api/config";
import { RequiredAsterisk } from "@/components/required-mark";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

type FeedbackContext = {
  type?: "run" | "report" | "template" | "workflow";
  id?: string;
};

type FeedbackDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pagePath: string;
  context?: FeedbackContext;
  onSuccess?: (message: string) => void;
};

export function FeedbackDialog({
  open,
  onOpenChange,
  pagePath,
  context,
  onSuccess,
}: FeedbackDialogProps) {
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [dialogKey, setDialogKey] = useState(0);

  useEffect(() => {
    if (open) {
      setDialogKey((current) => current + 1);
    } else {
      setNotice("");
      setSubmitting(false);
    }
  }, [open]);

  const contextLabel = useMemo(() => {
    if (!context?.type || !context.id) return "无";
    return `${context.type}:${context.id}`;
  }, [context]);

  const submitFeedback = async () => {
    const value = message.trim();
    if (!value) {
      setNotice("请先输入反馈内容。");
      return;
    }

    try {
      setSubmitting(true);
      setNotice("");

      const base = getAgentHttpApiBase();
      const res = await fetch(`${base}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: value,
          page_path: pagePath,
          context_type: context?.type ?? null,
          context_id: context?.id ?? null,
          app_version: "dev",
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "反馈提交失败");
      }

      setMessage("");
      onOpenChange(false);
      onSuccess?.("问题反馈已提交。");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog key={dialogKey} open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-feedback-dialog rounded-hero border-border-subtle p-0 shadow-modal">
        <div className="px-7 pb-7 pt-6">
          <div className="inline-flex items-center rounded-full border border-border-subtle bg-bg-page px-3 py-1 text-xs font-medium tracking-label-mid text-text-secondary">
            Alice
          </div>
          <DialogTitle className="mt-4 text-title-3 font-semibold tracking-normal text-foreground">
            问题反馈
          </DialogTitle>
          <DialogDescription className="mt-2 text-sm leading-6 text-text-tertiary">
            你的反馈会直接进入 Alice 的反馈表，方便后续排查与迭代。
          </DialogDescription>

          <div className="mt-5 grid gap-3 text-sm text-text-secondary">
            <div className="rounded-field border border-border bg-bg-subtle px-4 py-3">
              <div className="text-xs uppercase tracking-label text-text-disabled">当前页面</div>
              <div className="mt-1 text-foreground">{pagePath}</div>
            </div>
            <div className="rounded-field border border-border bg-bg-subtle px-4 py-3">
              <div className="text-xs uppercase tracking-label text-text-disabled">当前上下文</div>
              <div className="mt-1 text-foreground">{contextLabel}</div>
            </div>
          </div>

          <div className="mt-5">
            <label className="mb-2 block text-sm font-medium text-foreground">
              反馈内容 <RequiredAsterisk />
            </label>
            <Textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="请描述你遇到的问题、期望行为或需要优化的地方。"
              className="min-h-confirm-dialog rounded-panel border-border bg-bg-surface px-4 py-3 focus-visible:ring-primary/15"
            />
          </div>

          {notice ? <p className="mt-4 text-sm text-danger">{notice}</p> : null}

          <div className="mt-6 flex justify-end gap-3">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              取消
            </Button>
            <Button onClick={submitFeedback} disabled={submitting || !message.trim()}>
              {submitting ? (
                <>
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  提交中...
                </>
              ) : "提交反馈"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
