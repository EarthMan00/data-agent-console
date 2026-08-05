export type AuthenticatedReadResponse = {
  ok(): boolean;
  status(): number;
  dispose(): Promise<void>;
};

type AuthenticatedJsonGetOptions<Response extends AuthenticatedReadResponse, Value> = {
  request: () => Promise<Response>;
  refresh: () => Promise<void>;
  parse: (response: Response) => Promise<Value>;
  failure: (status: number) => Error;
  delay: (milliseconds: number) => Promise<void>;
};

const MAX_AUTHENTICATED_GET_REQUESTS = 3;
const TRANSIENT_GATEWAY_STATUSES = new Set([502, 503, 504]);
const TRANSIENT_RETRY_DELAYS_MS = [500, 1_000] as const;

export function transientReadRetryDelayMs(
  method: string,
  status: number,
  completedRequests: number,
  transientFailures: number,
): number | null {
  if (
    method.toUpperCase() !== "GET" ||
    !TRANSIENT_GATEWAY_STATUSES.has(status) ||
    completedRequests >= MAX_AUTHENTICATED_GET_REQUESTS
  ) {
    return null;
  }
  return TRANSIENT_RETRY_DELAYS_MS[transientFailures] ?? null;
}

export async function executeAuthenticatedJsonGet<
  Response extends AuthenticatedReadResponse,
  Value,
>(
  options: AuthenticatedJsonGetOptions<Response, Value>,
): Promise<Value> {
  let completedRequests = 0;
  let transientFailures = 0;
  let refreshed = false;

  while (completedRequests < MAX_AUTHENTICATED_GET_REQUESTS) {
    const response = await options.request();
    completedRequests += 1;
    const status = response.status();

    if (
      status === 401 &&
      !refreshed &&
      completedRequests < MAX_AUTHENTICATED_GET_REQUESTS
    ) {
      await response.dispose();
      refreshed = true;
      await options.refresh();
      continue;
    }

    const retryDelayMs = transientReadRetryDelayMs(
      "GET",
      status,
      completedRequests,
      transientFailures,
    );
    if (retryDelayMs !== null) {
      await response.dispose();
      transientFailures += 1;
      await options.delay(retryDelayMs);
      continue;
    }

    try {
      if (!response.ok()) throw options.failure(status);
      return await options.parse(response);
    } finally {
      await response.dispose();
    }
  }

  throw new Error("authenticated GET retry state exhausted");
}
