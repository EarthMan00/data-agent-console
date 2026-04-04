"use client";

import { LoaderCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { InlineNotice } from "@/components/inline-notice";
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

      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: value,
          pagePath,
          context,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { error?: string; success?: boolean }
        | null;

      if (!response.ok) {
        setNotice(payload?.error ?? "反馈提交失败，请稍后再试。");
        return;
      }

      setMessage("");
      onOpenChange(false);
      onSuccess?.("问题反馈已提交。");
    } catch {
      setNotice("反馈提交失败，请检查网络或服务配置。");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog key={dialogKey} open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[580px] rounded-[24px] border-[#ececec] p-0 shadow-[0_28px_80px_rgba(15,23,42,0.14)]">
        <div className="px-7 pb-7 pt-6">
          <div className="inline-flex items-center rounded-full border border-[#ececec] bg-[#fafaf9] px-3 py-1 text-xs font-medium tracking-[0.14em] text-[#52525b]">
            More Data Agent
          </div>
          <DialogTitle className="mt-4 text-[24px] font-semibold tracking-[-0.03em] text-[#18181b]">
            问题反馈
          </DialogTitle>
          <DialogDescription className="mt-2 text-sm leading-6 text-[#71717a]">
            你的反馈会直接进入 More Data Agent 的反馈表，方便后续排查与迭代。
          </DialogDescription>

          <div className="mt-5 grid gap-3 text-sm text-[#52525b]">
            <div className="rounded-[12px] border border-[#e5e7eb] bg-[#fafafa] px-4 py-3">
              <div className="text-xs uppercase tracking-[0.12em] text-[#a1a1aa]">当前页面</div>
              <div className="mt-1 text-[#18181b]">{pagePath}</div>
            </div>
            <div className="rounded-[12px] border border-[#e5e7eb] bg-[#fafafa] px-4 py-3">
              <div className="text-xs uppercase tracking-[0.12em] text-[#a1a1aa]">当前上下文</div>
              <div className="mt-1 text-[#18181b]">{contextLabel}</div>
            </div>
          </div>

          <div className="mt-5">
            <label className="mb-2 block text-sm font-medium text-[#3f3f46]">反馈内容 *</label>
            <Textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="请描述你遇到的问题、期望行为或需要优化的地方。"
              className="min-h-[180px] rounded-[16px] border-[#e5e7eb] bg-[#fcfcfb] px-4 py-3 focus-visible:ring-[rgba(24,24,27,0.15)]"
            />
          </div>

          {notice ? <div className="mt-4"><InlineNotice message={notice} /></div> : null}

          <div className="mt-6 flex justify-end gap-3">
            <Button variant="outline" className="rounded-[10px]" onClick={() => onOpenChange(false)} disabled={submitting}>
              取消
            </Button>
            <Button className="rounded-[10px]" onClick={submitFeedback} disabled={submitting || !message.trim()}>
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
