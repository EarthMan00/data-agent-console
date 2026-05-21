import type { ResultPushBlock } from "@/components/schedule-result-push";

export type ResultPushConfigApi = {
  blocks: Array<
    | { type: "email"; address: string }
    | {
        type: "dingtalk";
        security: "signature" | "keyword";
        webhook: string;
        secret?: string;
        keyword?: string;
      }
    | { type: "feishu"; webhook: string; signSecret?: string }
  >;
};

function newBlockId() {
  return `rp-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

/** 提交到后端的推送配置（去掉仅 UI 用的 id / touched） */
export function resultPushBlocksToApiConfig(blocks: ResultPushBlock[]): ResultPushConfigApi | null {
  if (!blocks.length) return null;
  return {
    blocks: blocks.map((b) => {
      if (b.type === "email") {
        return { type: "email" as const, address: b.address.trim() };
      }
      if (b.type === "dingtalk") {
        return {
          type: "dingtalk" as const,
          security: b.security,
          webhook: b.webhook.trim(),
          secret: b.secret.trim(),
          keyword: b.keyword.trim(),
        };
      }
      return {
        type: "feishu" as const,
        webhook: b.webhook.trim(),
        signSecret: b.signSecret.trim(),
      };
    }),
  };
}

/** 从任务详情 API 还原表单块 */
export function resultPushBlocksFromApiConfig(cfg: ResultPushConfigApi | null | undefined): ResultPushBlock[] {
  if (!cfg?.blocks?.length) return [];
  return cfg.blocks.map((b) => {
    if (b.type === "email") {
      return { id: newBlockId(), type: "email" as const, address: b.address, touched: false };
    }
    if (b.type === "dingtalk") {
      return {
        id: newBlockId(),
        type: "dingtalk" as const,
        security: b.security,
        webhook: b.webhook,
        secret: b.secret ?? "",
        keyword: b.keyword ?? "",
      };
    }
    return {
      id: newBlockId(),
      type: "feishu" as const,
      webhook: b.webhook,
      signSecret: b.signSecret ?? "",
    };
  });
}
