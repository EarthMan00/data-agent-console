import { validateResultPushBlocks } from "@/components/schedule-result-push";
import { createUserScheduledTask, patchUserScheduledTask } from "@/lib/agent-api/scheduled-tasks";
import type { UserScheduledTaskCreateBody, UserScheduledTaskPatchBody } from "@/lib/agent-api/types";
import { clearScheduleTrialStorage, loadScheduleCreateDraft } from "@/lib/schedule-create-draft";
import { buildCreatePayloads } from "@/lib/schedule-payloads";
import { computeNextRunForCreateBody } from "@/lib/schedule-next-run";

function createBodyToPatch(b: UserScheduledTaskCreateBody): UserScheduledTaskPatchBody {
  return {
    title: b.title,
    prompt_text: b.prompt_text,
    group_id: b.group_id ?? null,
    enabled: b.enabled,
    recurrence: b.recurrence,
    time_hhmm: b.time_hhmm,
    weekday: b.weekday ?? null,
    day_of_month: b.day_of_month ?? null,
    run_once_date: b.run_once_date ?? null,
  };
}

export async function saveScheduleTasksWithDraft(
  withFreshToken: (fn: (t: string) => Promise<void>) => Promise<void>,
  options: { requireEnabledNext: boolean } = { requireEnabledNext: true },
): Promise<{ count: number }> {
  const d = loadScheduleCreateDraft();
  if (!d) {
    throw new Error("无定时任务配置草稿，请从定时任务页重新填写或试跑。");
  }
  const err = validateResultPushBlocks(d.resultPushBlocks);
  if (err) {
    throw new Error(err);
  }
  const groupFromUrl: string | null = d.groupId;
  const payloads = buildCreatePayloads(
    d.title.trim(),
    d.prompt.trim(),
    groupFromUrl,
    d.taskEnabled,
    d.scheduleKind,
    d.timeHhmm,
    new Set(d.selectedWeekdayValues),
    new Set(d.selectedMonthDayValues),
    d.runOnceDate,
  );
  if (payloads.length === 0) {
    throw new Error("无有效的定时任务可保存。");
  }
  if (options.requireEnabledNext && d.taskEnabled) {
    for (const b of payloads) {
      if (computeNextRunForCreateBody(b) == null) {
        throw new Error("无法排程，请检查周期、执行日期或时间后重试。");
      }
    }
  }
  const editingId = d.editingTaskId?.trim() || null;
  if (editingId) {
    if (payloads.length !== 1) {
      throw new Error(
        "编辑单条任务时，排程只能对应一条记录。若需「每周多天」「每月多日」等拆条，请删除任务后使用新建。",
      );
    }
    await withFreshToken(async (token) => {
      await patchUserScheduledTask(token, editingId, createBodyToPatch(payloads[0]!));
    });
    clearScheduleTrialStorage();
    return { count: 1 };
  }
  await withFreshToken(async (token) => {
    for (const b of payloads) {
      await createUserScheduledTask(token, b);
    }
  });
  clearScheduleTrialStorage();
  return { count: payloads.length };
}
