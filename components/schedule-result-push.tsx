"use client";

import { useEffect, useId, useState } from "react";
import { Plus, Trash2 } from "@/components/ui/tabler-icons";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const CHANNEL_LABEL = {
  email: "邮箱",
  dingtalk: "钉钉",
  feishu: "飞书",
} as const;

type ChannelKey = keyof typeof CHANNEL_LABEL;

function newId() {
  return `rp-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

type EmailBlock = { id: string; type: "email"; address: string; touched: boolean };
type DingTalkBlock = {
  id: string;
  type: "dingtalk";
  security: "signature" | "keyword";
  webhook: string;
  secret: string;
  keyword: string;
};
type FeishuBlock = { id: string; type: "feishu"; webhook: string; signSecret: string };

export type ResultPushBlock = EmailBlock | DingTalkBlock | FeishuBlock;
type PushBlock = ResultPushBlock;

function ChannelLogo({ type, className = "h-5 w-5" }: { type: ChannelKey; className?: string }) {
  if (type === "email") {
    return (
      <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
        <path fill="var(--color-brand-email-green)" d="M45,16.2l-5,2.75l-5,4.75L35,40h7c1.657,0,3-1.343,3-3V16.2z" />
        <path fill="var(--color-brand-email-blue)" d="M3,16.2l3.614,1.71L13,23.7V40H6c-1.657,0-3-1.343-3-3V16.2z" />
        <polygon fill="var(--color-brand-email-red)" points="35,11.2 24,19.45 13,11.2 12,17 13,23.7 24,31.95 35,23.7 36,17" />
        <path fill="var(--color-brand-email-red)" d="M3,12.298V16.2l10,7.5V11.2L9.876,8.859C9.132,8.301,8.228,8,7.298,8h0C4.924,8,3,9.924,3,12.298z" />
        <path fill="var(--color-brand-email-yellow)" d="M45,12.298V16.2l-10,7.5V11.2l3.124-2.341C38.868,8.301,39.772,8,40.702,8h0 C43.076,8,45,9.924,45,12.298z" />
      </svg>
    );
  }

  if (type === "dingtalk") {
    return (
      <svg viewBox="0 0 1024 1024" className={className} aria-hidden="true">
        <path
          fill="var(--color-brand-dingtalk)"
          d="M573.7 252.5C422.5 197.4 201.3 96.7 201.3 96.7c-15.7-4.1-17.9 11.1-17.9 11.1-5 61.1 33.6 160.5 53.6 182.8 19.9 22.3 319.1 113.7 319.1 113.7S326 357.9 270.5 341.9c-55.6-16-37.9 17.8-37.9 17.8 11.4 61.7 64.9 131.8 107.2 138.4 42.2 6.6 220.1 4 220.1 4s-35.5 4.1-93.2 11.9c-42.7 5.8-97 12.5-111.1 17.8-33.1 12.5 24 62.6 24 62.6 84.7 76.8 129.7 50.5 129.7 50.5 33.3-10.7 61.4-18.5 85.2-24.2L565 743.1h84.6L603 928l205.3-271.9H700.8l22.3-38.7c0.3 0.5 0.4 0.8 0.4 0.8S799.8 496.1 829 433.8l0.6-1h-0.1c5-10.8 8.6-19.7 10-25.8 17-71.3-114.5-99.4-265.8-154.5z"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 1024 1024" className={className} aria-hidden="true">
      <path d="M144.27516326 116.98308522h480.26874726s135.02396377 124.46623895 135.02396376 295.54447359l-225.08782102 155.4930223S414.46673211 288.06131985 144.27516326 116.98308522z" fill="var(--color-brand-feishu-a)" />
      <path d="M1014.7488005 381.42895405s-165.11707043-62.26902944-270.11974744-15.58521234c-105.0744999 46.6838171-150.1064278 108.8810266-195.13835719 155.5648437-59.97074913 62.1972095-165.04524903 171.07823465-255.10910481 108.88102514-90.06385728-62.26902944 360.18360471 217.76205173 360.18360472 217.76205172s187.74076645-105.50542681 255.1091063-280.03108116C969.7168726 412.52755881 1014.7488005 381.42895405 1014.7488005 381.42895405z" fill="var(--color-brand-feishu-b)" />
      <path d="M9.2511995 350.33034929v466.55088832s165.40435602 203.4696216 555.25013901 93.36763417c165.11707043-46.6838171 300.21285559-264.44586883 300.21285559-264.44586884S669.50401702 972.44607982 9.2511995 350.40217069z" fill="var(--color-brand-feishu-b)" />
    </svg>
  );
}

const emptyDing = (): DingTalkBlock => ({
  id: newId(),
  type: "dingtalk",
  security: "signature",
  webhook: "",
  secret: "",
  keyword: "",
});
const emptyFei = (): FeishuBlock => ({ id: newId(), type: "feishu", webhook: "", signSecret: "" });

type ScheduleResultPushProps = {
  /** 从草稿还原时的初始块 */
  defaultBlocks?: ResultPushBlock[] | null;
  /** 弹窗表单内使用：标题与「添加提醒」放在同一行 */
  headerLabel?: string;
  inlineAddTrigger?: boolean;
  /** 配置变更时回传当前 blocks（定时任务草稿等） */
  onConfigSnapshot?: (payload: { blocks: ResultPushBlock[] }) => void;
};

export function validateResultPushBlocks(blocks: ResultPushBlock[]): string | null {
  for (const b of blocks) {
    if (b.type === "email" && !b.address.trim()) {
      return "请填写所有结果推送的邮箱地址。";
    }
    if (b.type === "dingtalk") {
      if (!b.webhook.trim()) {
        return "请填写钉钉的 Webhook 地址。";
      }
      if (!b.secret.trim()) {
        return "请填写钉钉的签名密钥。";
      }
    }
    if (b.type === "feishu" && !b.webhook.trim()) {
      return "请填写飞书的 Webhook 地址。";
    }
  }
  return null;
}

/**
 * 结果推送：多选渠道（图一）+ 邮箱/钉钉/飞书配置 cards（图二~五）。
 * 保存任务时写入服务端 `result_push_config`，执行结束后按渠道推送执行结果通知。
 */
export function ScheduleResultPushSection({
  defaultBlocks,
  headerLabel,
  inlineAddTrigger = false,
  onConfigSnapshot,
}: ScheduleResultPushProps) {
  const [blocks, setBlocks] = useState<PushBlock[]>(defaultBlocks != null ? defaultBlocks : []);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (defaultBlocks == null) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        setBlocks(defaultBlocks);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [defaultBlocks]);

  const hasEmail = blocks.some((b) => b.type === "email");
  const hasDing = blocks.some((b) => b.type === "dingtalk");
  const hasFei = blocks.some((b) => b.type === "feishu");

  const setBlocksWithNotify = (updater: (prev: PushBlock[]) => PushBlock[]) => {
    setBlocks((prev) => {
      const n = updater(prev);
      queueMicrotask(() => onConfigSnapshot?.({ blocks: n }));
      return n;
    });
  };

  const toggleChannel = (key: ChannelKey, nextChecked: boolean) => {
    setBlocksWithNotify((prev) => {
      if (key === "email") {
        if (nextChecked) {
          if (prev.some((b) => b.type === "email")) return prev;
          return [...prev, { id: newId(), type: "email" as const, address: "", touched: false }];
        }
        return prev.filter((b) => b.type !== "email");
      }
      if (key === "dingtalk") {
        if (nextChecked) {
          if (prev.some((b) => b.type === "dingtalk")) return prev;
          return [...prev, emptyDing()];
        }
        return prev.filter((b) => b.type !== "dingtalk");
      }
      if (key === "feishu") {
        if (nextChecked) {
          if (prev.some((b) => b.type === "feishu")) return prev;
          return [...prev, emptyFei()];
        }
        return prev.filter((b) => b.type !== "feishu");
      }
      return prev;
    });
  };

  const removeBlock = (id: string) => {
    setBlocksWithNotify((prev) => prev.filter((b) => b.id !== id));
  };

  const updateBlock = (id: string, patch: Partial<PushBlock>) => {
    setBlocksWithNotify((prev) =>
      prev.map((b) => {
        if (b.id !== id) return b;
        return { ...b, ...patch } as PushBlock;
      }),
    );
  };

  const addTrigger = (
    <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={inlineAddTrigger ? "ghost" : "outline"}
          className={cn(
            inlineAddTrigger
              ? "h-auto gap-1 rounded-md px-0 py-0 text-body font-medium text-foreground hover:bg-transparent hover:text-foreground"
              : "h-11 w-full justify-center gap-1.5 rounded-field border-border text-text-secondary shadow-sm",
          )}
        >
          <Plus className="h-4 w-4" />
          添加提醒
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-responsive-popover-xs p-0" align="end" onOpenAutoFocus={(e) => e.preventDefault()}>
        <ChannelPickerBody
          hasEmail={hasEmail}
          hasDing={hasDing}
          hasFei={hasFei}
          onToggle={toggleChannel}
        />
      </PopoverContent>
    </Popover>
  );

  return (
    <div className="space-y-4">
      {headerLabel ? (
        <div className="flex items-center justify-between gap-4">
          <div className="text-body font-medium text-text-secondary">{headerLabel}</div>
          {inlineAddTrigger ? addTrigger : null}
        </div>
      ) : null}

      {blocks.length === 0 && !inlineAddTrigger ? <div>{addTrigger}</div> : null}

      {blocks.map((b) => {
        if (b.type === "email")
          return (
            <EmailCard
              key={b.id}
              b={b}
              onUpdate={(p) => updateBlock(b.id, p)}
              onTouch={() => {
                setBlocksWithNotify((prev) =>
                  prev.map((x) => (x.id === b.id && x.type === "email" ? { ...x, touched: true } : x)),
                );
              }}
              onRemove={() => removeBlock(b.id)}
            />
          );
        if (b.type === "dingtalk")
          return (
            <DingTalkCard
              key={b.id}
              b={b}
              onUpdate={(p) => updateBlock(b.id, p)}
              onRemove={() => removeBlock(b.id)}
            />
          );
        return (
          <FeishuCard
            key={b.id}
            b={b}
            onUpdate={(p) => updateBlock(b.id, p)}
            onRemove={() => removeBlock(b.id)}
          />
        );
      })}

      {blocks.length > 0 && !inlineAddTrigger ? (
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full justify-center gap-1.5 rounded-field border-border text-text-secondary"
            >
              <Plus className="h-4 w-4" />
              添加提醒
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-responsive-popover-xs p-0" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
            <ChannelPickerBody
              hasEmail={hasEmail}
              hasDing={hasDing}
              hasFei={hasFei}
              onToggle={toggleChannel}
            />
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );
}

function ChannelPickerBody({
  hasEmail,
  hasDing,
  hasFei,
  onToggle,
}: {
  hasEmail: boolean;
  hasDing: boolean;
  hasFei: boolean;
  onToggle: (key: ChannelKey, checked: boolean) => void;
}) {
  const rows: { key: ChannelKey; label: string; checked: boolean }[] = [
    { key: "email", label: CHANNEL_LABEL.email, checked: hasEmail },
    { key: "dingtalk", label: CHANNEL_LABEL.dingtalk, checked: hasDing },
    { key: "feishu", label: CHANNEL_LABEL.feishu, checked: hasFei },
  ];

  return (
    <ul className="max-h-60 space-y-0.5 p-1 py-2">
      {rows.map((row) => (
        <li key={row.key}>
          <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm hover:bg-fill-active">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-border-strong accent-primary"
              checked={row.checked}
              onChange={(e) => {
                onToggle(row.key, e.target.checked);
              }}
            />
            <ChannelLogo type={row.key} className="h-5 w-5 shrink-0" />
            <span className="text-foreground">{row.label}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}

function HowToLink({ id, href }: { id: string; href: string }) {
  return (
    <a
      href={href}
      id={id}
      target="_blank"
      rel="noreferrer"
      className="text-xs text-link hover:underline"
    >
      如何获取？
    </a>
  );
}

function EmailCard({
  b,
  onUpdate,
  onTouch,
  onRemove,
}: {
  b: EmailBlock;
  onUpdate: (p: Partial<EmailBlock>) => void;
  onTouch: () => void;
  onRemove: () => void;
}) {
  const emailId = useId();
  return (
    <div className="rounded-field border border-border bg-bg-surface p-4 shadow-none">
      <div className="flex items-center justify-between gap-2 border-b border-border-subtle pb-3">
        <div className="flex items-center gap-2.5">
          <ChannelLogo type="email" className="h-8 w-8 shrink-0" />
          <span className="text-body font-medium text-foreground">邮箱</span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-text-disabled hover:text-danger"
          onClick={onRemove}
          aria-label="删除邮箱推送"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <div className="mt-4">
        <label className="mb-1.5 block text-sm text-text-secondary" htmlFor={emailId}>
          邮箱地址
        </label>
        <Input
          id={emailId}
          value={b.address}
          onChange={(e) => onUpdate({ address: e.target.value, touched: true })}
          onBlur={onTouch}
          placeholder="请输入邮箱地址"
          className="h-10 rounded-control border-border text-sm"
          autoComplete="email"
        />
        {b.touched && !b.address.trim() ? <p className="mt-1.5 text-sm text-danger">地址不能为空</p> : null}
      </div>
    </div>
  );
}

function DingTalkCard({
  b,
  onUpdate,
  onRemove,
}: {
  b: DingTalkBlock;
  onUpdate: (p: Partial<DingTalkBlock>) => void;
  onRemove: () => void;
}) {
  const hWebhook = useId();
  const hSec = useId();
  return (
    <div className="rounded-field border border-border bg-bg-surface p-4 shadow-none">
      <div className="flex items-center justify-between gap-2 border-b border-border-subtle pb-3">
        <div className="flex items-center gap-2.5">
          <ChannelLogo type="dingtalk" className="h-8 w-8 shrink-0" />
          <span className="text-body font-medium text-foreground">钉钉</span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-text-disabled hover:text-danger"
          onClick={onRemove}
          aria-label="删除钉钉推送"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <label className="text-sm text-text-secondary" htmlFor={hWebhook}>
            Webhook 地址
          </label>
          <HowToLink id={`${hWebhook}-help`} href="https://open.dingtalk.com/document/dingstart/obtain-the-webhook-address-of-a-custom-robot" />
        </div>
        <Input
          id={hWebhook}
          value={b.webhook}
          onChange={(e) => onUpdate({ webhook: e.target.value })}
          placeholder="请粘贴webhook地址"
          className="h-10 rounded-control border-border text-sm"
        />
      </div>
      <div className="mt-3">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <label className="text-sm text-text-secondary" htmlFor={hSec}>
            <span className="text-danger">*</span> 签名密钥
          </label>
        </div>
        <Input
          id={hSec}
          value={b.secret}
          onChange={(e) => onUpdate({ secret: e.target.value, security: "signature", keyword: "" })}
          placeholder="请粘贴签名密钥"
          className="h-10 rounded-control border-border text-sm"
          autoComplete="off"
        />
      </div>
    </div>
  );
}

function FeishuCard({
  b,
  onUpdate,
  onRemove,
}: {
  b: FeishuBlock;
  onUpdate: (p: Partial<FeishuBlock>) => void;
  onRemove: () => void;
}) {
  const wId = useId();
  const sId = useId();
  return (
    <div className="rounded-field border border-border bg-bg-surface p-4 shadow-none">
      <div className="flex items-center justify-between gap-2 border-b border-border-subtle pb-3">
        <div className="flex items-center gap-2.5">
          <ChannelLogo type="feishu" className="h-8 w-8 shrink-0" />
          <span className="text-body font-medium text-foreground">飞书</span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-text-disabled hover:text-danger"
          onClick={onRemove}
          aria-label="删除飞书推送"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <label className="text-sm text-text-secondary" htmlFor={wId}>
            Webhook 地址
          </label>
          <HowToLink id={`${wId}-help`} href="https://open.feishu.cn/document/client-docs/bot-v3/add-custom-bot" />
        </div>
        <Textarea
          id={wId}
          value={b.webhook}
          onChange={(e) => onUpdate({ webhook: e.target.value })}
          placeholder="请粘贴webhook地址"
          className="min-h-22 rounded-control border-border text-sm"
        />
      </div>
      <div className="mt-3">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <label className="text-sm text-text-secondary" htmlFor={sId}>
            签名秘钥（选填）
          </label>
        </div>
        <Input
          id={sId}
          value={b.signSecret}
          onChange={(e) => onUpdate({ signSecret: e.target.value })}
          placeholder="请粘贴签名秘钥"
          className="h-10 rounded-control border-border text-sm"
          autoComplete="off"
        />
      </div>
    </div>
  );
}
