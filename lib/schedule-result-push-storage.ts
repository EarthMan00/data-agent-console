import type { ResultPushBlock } from "@/components/schedule-result-push";
import type { UserScheduledTaskItemApi } from "@/lib/agent-api/types";
import { loadScheduleCreateDraft } from "@/lib/schedule-create-draft";
import { resultPushBlocksFromApiConfig } from "@/lib/schedule-result-push-api";

const STORAGE_KEY = "linkfox:scheduleResultPushByTaskV1";

type Stored = { v: 1; byTaskId: Record<string, ResultPushBlock[]> };

function readStore(): Stored {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { v: 1, byTaskId: {} };
    const p = JSON.parse(raw) as Stored;
    if (p.v !== 1 || !p.byTaskId || typeof p.byTaskId !== "object") {
      return { v: 1, byTaskId: {} };
    }
    return p;
  } catch {
    return { v: 1, byTaskId: {} };
  }
}

function writeStore(store: Stored): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

/** 按任务 id 缓存结果推送配置（离线/兼容；优先使用服务端 result_push_config） */
export function persistResultPushBlocksForTask(taskId: string, blocks: ResultPushBlock[]): void {
  const id = taskId.trim();
  if (!id) return;
  const store = readStore();
  if (blocks.length === 0) {
    delete store.byTaskId[id];
  } else {
    store.byTaskId[id] = blocks;
  }
  writeStore(store);
}

export function loadPersistedResultPushBlocksForTask(taskId: string): ResultPushBlock[] | null {
  const id = taskId.trim();
  if (!id) return null;
  const blocks = readStore().byTaskId[id];
  return Array.isArray(blocks) && blocks.length > 0 ? blocks : null;
}

/**
 * 编辑定时任务时恢复结果推送：优先匹配 editingTaskId 的创建草稿，其次按任务 id 的本地缓存。
 */
export function resultPushBlocksForEditingTask(
  editId: string,
  task?: UserScheduledTaskItemApi | null,
): ResultPushBlock[] {
  const id = editId.trim();
  if (!id) return [];
  const fromApi = resultPushBlocksFromApiConfig(task?.result_push_config ?? null);
  if (fromApi.length > 0) {
    return fromApi;
  }
  const draft = loadScheduleCreateDraft();
  if (draft?.editingTaskId === id && Array.isArray(draft.resultPushBlocks) && draft.resultPushBlocks.length > 0) {
    return draft.resultPushBlocks;
  }
  return loadPersistedResultPushBlocksForTask(id) ?? [];
}

export function clearPersistedResultPushForTask(taskId: string): void {
  persistResultPushBlocksForTask(taskId, []);
}
