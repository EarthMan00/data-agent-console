export type LiveSessionPrimaryTaskPollStrategy = "none" | "primary-task";

/**
 * 常规历史/会话重进场景下：
 * - 多步编排已由 orchestration 轮询维护步骤状态，不再按子任务逐个 getTask。
 * - 单任务没有 orchestration 快照，需要继续轮询主 task 状态。
 */
export function getLiveSessionPrimaryTaskPollStrategy(options: {
  scheduleTrial: boolean;
  scheduledRunRecord: boolean;
  composerShowsStop: boolean;
  sending: boolean;
  orchestrationId?: string | null;
}): LiveSessionPrimaryTaskPollStrategy {
  if (options.scheduleTrial || options.scheduledRunRecord) return "none";
  if (!options.composerShowsStop || options.sending) return "none";
  return (options.orchestrationId ?? "").trim() ? "none" : "primary-task";
}
