export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function parseJsonResponse<T>(response: Response) {
  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || `请求失败：${response.status}`);
  }
  return response.json() as Promise<T>;
}
