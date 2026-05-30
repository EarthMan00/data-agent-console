/** 首轮任务创建时暂存 File（仅内存，刷新即失）。key = roundId */
const stash = new Map<string, File[]>();

export function stashRoundAttachmentFiles(roundId: string, files: File[]) {
  if (!roundId || files.length === 0) return;
  stash.set(roundId, files);
}

export function takeRoundAttachmentFiles(roundId: string): File[] {
  const files = stash.get(roundId) ?? [];
  stash.delete(roundId);
  return files;
}
