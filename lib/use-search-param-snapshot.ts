"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";

/**
 * 与 SSR 首帧一致地读取 URL 查询参数：静态/预渲染时服务端 searchParams 为空，
 * 若直接在首帧用客户端 URL 会导致 hydration mismatch。
 */
export function useSearchParamSnapshot(name: string): string {
  const searchParams = useSearchParams();
  const read = useCallback(() => searchParams.get(name) ?? "", [searchParams, name]);
  return useSyncExternalStore(() => () => {}, read, () => "");
}

export function useSearchParamFlagSnapshot(name: string, value = "1"): boolean {
  return useSearchParamSnapshot(name) === value;
}
