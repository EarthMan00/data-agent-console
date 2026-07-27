export type PendingInitialRoundAttempt = {
  message: string;
  files: readonly File[];
  clientMessageId: string;
};

/**
 * A retry belongs to the same in-memory request only while its ordered File
 * object references are unchanged. File/Blob payloads are immutable, so
 * reference identity distinguishes a newly selected payload without hashing
 * or reading the whole file.
 */
export function matchesInitialRoundAttempt(
  attempt: PendingInitialRoundAttempt | null,
  message: string,
  files: readonly File[],
): attempt is PendingInitialRoundAttempt {
  return Boolean(
    attempt &&
      attempt.message === message &&
      attempt.files.length === files.length &&
      attempt.files.every((file, index) => file === files[index]),
  );
}

export function rememberInitialRoundAttempt(
  message: string,
  files: readonly File[],
  clientMessageId: string,
): PendingInitialRoundAttempt {
  return {
    message,
    files: [...files],
    clientMessageId,
  };
}
