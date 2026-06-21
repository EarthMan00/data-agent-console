/** 定时任务试跑首条消息附件暂存（仅内存，刷新即失）。key = platform sessionId */
const stash = new Map<string, File[]>();

export function stashScheduleTrialAttachmentFiles(sessionId: string, files: File[]) {
  if (!sessionId || files.length === 0) return;
  stash.set(sessionId, files);
}

export function takeScheduleTrialAttachmentFiles(sessionId: string): File[] {
  const files = stash.get(sessionId) ?? [];
  stash.delete(sessionId);
  return files;
}

export function clearScheduleTrialAttachmentFiles(sessionId: string) {
  stash.delete(sessionId);
}
