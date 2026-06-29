const HOME_SESSION_LAUNCH_META_KEY = "alice:homeSessionLaunchMetaV1";

export type HomeSessionLaunchSendState = "pending" | "in_flight" | "done";

export type HomeSessionLaunchMetaV1 = {
  v: 1;
  sessionId: string;
  prompt: string;
  selectedSourceIds: string[];
  sendKind: HomeSessionLaunchSendState;
};

const attachmentStash = new Map<string, File[]>();

export function saveHomeSessionLaunchMeta(meta: HomeSessionLaunchMetaV1): void {
  try {
    sessionStorage.setItem(HOME_SESSION_LAUNCH_META_KEY, JSON.stringify(meta));
  } catch {
    /* ignore */
  }
}

export function loadHomeSessionLaunchMeta(): HomeSessionLaunchMetaV1 | null {
  try {
    const raw = sessionStorage.getItem(HOME_SESSION_LAUNCH_META_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HomeSessionLaunchMetaV1;
    if (parsed.v !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearHomeSessionLaunchMeta(): void {
  try {
    sessionStorage.removeItem(HOME_SESSION_LAUNCH_META_KEY);
  } catch {
    /* ignore */
  }
}

export function tryClaimHomeSessionLaunchFirstSend(sessionId: string): HomeSessionLaunchMetaV1 | null {
  const meta = loadHomeSessionLaunchMeta();
  if (!meta || meta.sessionId !== sessionId || meta.sendKind !== "pending") return null;
  const next: HomeSessionLaunchMetaV1 = { ...meta, sendKind: "in_flight" };
  saveHomeSessionLaunchMeta(next);
  return next;
}

export function isHomeSessionLaunchAwaitingFirstMessage(
  sessionId: string,
  meta: HomeSessionLaunchMetaV1 | null = loadHomeSessionLaunchMeta(),
): boolean {
  if (!meta || meta.sessionId !== sessionId) return false;
  return meta.sendKind === "pending" || meta.sendKind === "in_flight";
}

export function stashHomeSessionLaunchFiles(sessionId: string, files: File[]): void {
  if (!sessionId || files.length === 0) return;
  attachmentStash.set(sessionId, files);
}

export function takeHomeSessionLaunchFiles(sessionId: string): File[] {
  const files = attachmentStash.get(sessionId) ?? [];
  attachmentStash.delete(sessionId);
  return files;
}

export function clearHomeSessionLaunchFiles(sessionId: string): void {
  attachmentStash.delete(sessionId);
}
