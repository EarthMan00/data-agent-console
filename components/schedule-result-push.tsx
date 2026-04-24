"use client";

import { useId, useState } from "react";
import { Mail, Plus, Trash2 } from "lucide-react";

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
  /** 从「试跑-上一步」等场景还原时的初始块 */
  defaultBlocks?: ResultPushBlock[] | null;
  /** 提交/试跑时可用于随任务持久化（待后端支持 meta 等字段时接入） */
  onConfigSnapshot?: (payload: { blocks: ResultPushBlock[] }) => void;
  /** 校验、说明类提示（如联调中） */
  onNotify?: (message: string) => void;
};

export function validateResultPushBlocks(blocks: ResultPushBlock[]): string | null {
  for (const b of blocks) {
    if (b.type === "email" && !b.address.trim()) {
      return "请填写所有结果推送的邮箱地址。";
    }
    if (b.type === "dingtalk") {
      if (!b.webhook.trim()) {
        return "请填写钉钉的 WEBHOOK 地址。";
      }
      if (b.security === "signature" && !b.secret.trim()) {
        return "请填写钉钉的签名密钥。";
      }
      if (b.security === "keyword" && !b.keyword.trim()) {
        return "请填写钉钉的关键词。";
      }
    }
    if (b.type === "feishu" && !b.webhook.trim()) {
      return "请填写飞书的 WEBHOOK 地址。";
    }
  }
  return null;
}

/**
 * 结果推送：多选渠道（图一）+ 邮箱/钉钉/飞书配置 cards（图二~五）。推送数据当前仅存前端，创建任务接口无对应字段时不会发往服务端。
 */
export function ScheduleResultPushSection({ defaultBlocks, onConfigSnapshot, onNotify }: ScheduleResultPushProps) {
  const [blocks, setBlocks] = useState<PushBlock[]>(defaultBlocks != null ? defaultBlocks : []);
  const [pickerOpen, setPickerOpen] = useState(false);

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

  return (
    <div className="space-y-4">
      {blocks.length === 0 ? (
        <div>
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full justify-center gap-1.5 rounded-[12px] border-[#e5e7eb] text-[#52525b] shadow-sm"
              >
                <Plus className="h-4 w-4" />
                添加提醒
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[min(18rem,100vw-2rem)] p-0" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
              <ChannelPickerBody
                hasEmail={hasEmail}
                hasDing={hasDing}
                hasFei={hasFei}
                onToggle={toggleChannel}
              />
            </PopoverContent>
          </Popover>
        </div>
      ) : null}

      {blocks.map((b) => {
        if (b.type === "email")
          return (
            <div key={b.id} className="space-y-1">
              <div className="flex items-stretch gap-2">
                <div className="relative min-w-0 flex-1">
                  <Mail
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#2563eb]"
                    aria-hidden
                  />
                  <Input
                    value={b.address}
                    onChange={(e) => {
                      const address = e.target.value;
                      updateBlock(b.id, { address, touched: true } as Partial<EmailBlock>);
                    }}
                    onBlur={() => {
                      setBlocksWithNotify((prev) =>
                        prev.map((x) => (x.id === b.id && x.type === "email" ? { ...x, touched: true } : x)),
                      );
                    }}
                    placeholder="请输入邮箱地址"
                    className="h-12 rounded-[12px] border-[#e5e7eb] pl-10 pr-2"
                    autoComplete="email"
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-12 w-12 shrink-0 text-[#94a3b8] hover:text-red-600"
                  onClick={() => removeBlock(b.id)}
                  aria-label="删除此邮箱"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              {b.touched && !b.address.trim() ? <p className="text-sm text-red-500">地址不能为空</p> : null}
            </div>
          );
        if (b.type === "dingtalk")
          return (
            <DingTalkCard
              key={b.id}
              b={b}
              onUpdate={(p) => updateBlock(b.id, p)}
              onRemove={() => removeBlock(b.id)}
              onVerify={() => onNotify?.("校验联调中，已记录当前钉钉配置。")}
            />
          );
        return (
          <FeishuCard
            key={b.id}
            b={b}
            onUpdate={(p) => updateBlock(b.id, p)}
            onRemove={() => removeBlock(b.id)}
            onVerify={() => onNotify?.("校验联调中，已记录当前飞书配置。")}
          />
        );
      })}

      {blocks.length > 0 ? (
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full justify-center gap-1.5 rounded-[12px] border-[#e5e7eb] text-[#52525b]"
            >
              <Plus className="h-4 w-4" />
              添加提醒
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[min(18rem,100vw-2rem)] p-0" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
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
          <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm hover:bg-[#f4f4f5]">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-[#cbd5e1] accent-[#18181b]"
              checked={row.checked}
              onChange={(e) => {
                onToggle(row.key, e.target.checked);
              }}
            />
            <span className="text-[#18181b]">{row.label}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}

function HowToLink({ id }: { id: string }) {
  return (
    <a
      href="#"
      id={id}
      className="text-xs text-[#2563eb] hover:underline"
      onClick={(e) => {
        e.preventDefault();
      }}
    >
      如何获取？
    </a>
  );
}

function DingTalkCard({
  b,
  onUpdate,
  onRemove,
  onVerify,
}: {
  b: DingTalkBlock;
  onUpdate: (p: Partial<DingTalkBlock>) => void;
  onRemove: () => void;
  onVerify: () => void;
}) {
  const hWebhook = useId();
  const hSec = useId();
  const hKey = useId();
  return (
    <div className="rounded-[12px] border border-[#e5e7eb] bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-[#f0f0f0] pb-3">
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#1890ff] text-xs font-bold text-white"
            aria-hidden
          >
            钉
          </div>
          <span className="text-[15px] font-medium text-[#18181b]">钉钉</span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-[#94a3b8] hover:text-red-600"
          onClick={onRemove}
          aria-label="删除钉钉推送"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <p className="mt-4 text-sm text-[#52525b]">安全校验方式</p>
      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onUpdate({ security: "signature" })}
          className={cn(
            "rounded-[10px] border-2 p-3 text-left transition",
            b.security === "signature"
              ? "border-[#18181b] bg-[#fafafa]"
              : "border-[#e5e7eb] bg-white hover:border-[#d4d4d4]",
          )}
        >
          <div className="text-sm font-medium text-[#18181b]">签名校验(推荐)</div>
          <p className="mt-1.5 text-xs leading-relaxed text-[#64748b]">只有密钥正确的可信来源信息才会被接收</p>
        </button>
        <button
          type="button"
          onClick={() => onUpdate({ security: "keyword" })}
          className={cn(
            "rounded-[10px] border-2 p-3 text-left transition",
            b.security === "keyword"
              ? "border-[#18181b] bg-[#fafafa]"
              : "border-[#e5e7eb] bg-white hover:border-[#d4d4d4]",
          )}
        >
          <div className="text-sm font-medium text-[#18181b]">关键词校验</div>
          <p className="mt-1.5 text-xs leading-relaxed text-[#64748b]">以关键词为暗号，暗号匹配方可接收信息。</p>
        </button>
      </div>
      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <label className="text-sm text-[#52525b]" htmlFor={hWebhook}>
            <span className="text-red-500">*</span> WEBHOOK 地址
          </label>
          <HowToLink id={`${hWebhook}-help`} />
        </div>
        <Input
          id={hWebhook}
          value={b.webhook}
          onChange={(e) => onUpdate({ webhook: e.target.value })}
          placeholder="请粘贴webhook地址"
          className="h-10 rounded-[10px] border-[#e5e7eb] text-sm"
        />
      </div>
      {b.security === "signature" ? (
        <div className="mt-3">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <label className="text-sm text-[#52525b]" htmlFor={hSec}>
              <span className="text-red-500">*</span> 签名密钥
            </label>
            <HowToLink id={`${hSec}-help`} />
          </div>
          <Input
            id={hSec}
            value={b.secret}
            onChange={(e) => onUpdate({ secret: e.target.value })}
            placeholder="请粘贴签名密钥"
            className="h-10 rounded-[10px] border-[#e5e7eb] text-sm"
            autoComplete="off"
          />
        </div>
      ) : (
        <div className="mt-3">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <label className="text-sm text-[#52525b]" htmlFor={hKey}>
              <span className="text-red-500">*</span> 关键词
            </label>
            <HowToLink id={`${hKey}-help`} />
          </div>
          <Input
            id={hKey}
            value={b.keyword}
            onChange={(e) => onUpdate({ keyword: e.target.value })}
            placeholder="请输入关键词"
            className="h-10 rounded-[10px] border-[#e5e7eb] text-sm"
          />
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-[#f0f0f0] pt-3">
        <span className="text-xs text-[#94a3b8]">配置完成后请点击右侧验证</span>
        <Button type="button" size="sm" variant="outline" className="rounded-[8px]" onClick={onVerify}>
          校验
        </Button>
      </div>
    </div>
  );
}

function FeishuCard({
  b,
  onUpdate,
  onRemove,
  onVerify,
}: {
  b: FeishuBlock;
  onUpdate: (p: Partial<FeishuBlock>) => void;
  onRemove: () => void;
  onVerify: () => void;
}) {
  const wId = useId();
  const sId = useId();
  return (
    <div className="rounded-[12px] border border-[#e5e7eb] bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-[#f0f0f0] pb-3">
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#3c8cff] text-xs font-bold text-white"
            aria-hidden
          >
            飞
          </div>
          <span className="text-[15px] font-medium text-[#18181b]">飞书</span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-[#94a3b8] hover:text-red-600"
          onClick={onRemove}
          aria-label="删除飞书推送"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <label className="text-sm text-[#52525b]" htmlFor={wId}>
            <span className="text-red-500">*</span> WEBHOOK 地址
          </label>
          <HowToLink id={`${wId}-help`} />
        </div>
        <Textarea
          id={wId}
          value={b.webhook}
          onChange={(e) => onUpdate({ webhook: e.target.value })}
          placeholder="请粘贴webhook地址"
          className="min-h-[88px] rounded-[10px] border-[#e5e7eb] text-sm"
        />
      </div>
      <div className="mt-3">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <label className="text-sm text-[#52525b]" htmlFor={sId}>
            签名秘钥（选填）
          </label>
          <HowToLink id={`${sId}-help`} />
        </div>
        <Input
          id={sId}
          value={b.signSecret}
          onChange={(e) => onUpdate({ signSecret: e.target.value })}
          placeholder="请粘贴签名秘钥"
          className="h-10 rounded-[10px] border-[#e5e7eb] text-sm"
          autoComplete="off"
        />
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-[#f0f0f0] pt-3">
        <span className="text-xs text-[#94a3b8]">配置完成后请点击右侧验证</span>
        <Button type="button" size="sm" variant="outline" className="rounded-[8px]" onClick={onVerify}>
          校验
        </Button>
      </div>
    </div>
  );
}
