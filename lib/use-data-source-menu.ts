"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  buildDataSourceGroups,
  fetchDataSourceGroups,
  fetchDataSourceTools,
} from "@/lib/agent-api/data-sources";
import {
  getDataSourceGroups,
  setDataSourceMenu,
  type HomeCapabilityGroup,
  type HomeCapabilityItem,
} from "@/lib/home-capability-items";

async function fetchDataSourceMenuFromApi(): Promise<HomeCapabilityGroup[]> {
  const [groups, tools] = await Promise.all([fetchDataSourceGroups(), fetchDataSourceTools()]);
  const menu = buildDataSourceGroups(groups, tools);
  setDataSourceMenu(menu);
  return menu;
}

type UseDataSourceMenuOptions = {
  /** 页面挂载时预拉取；默认 false，打开 @数据源 菜单时再请求。 */
  loadOnMount?: boolean;
};

export function useDataSourceMenu(options?: UseDataSourceMenuOptions) {
  const loadOnMount = options?.loadOnMount ?? false;
  const [groups, setGroups] = useState<HomeCapabilityGroup[]>(() => getDataSourceGroups());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSeqRef = useRef(0);

  const refreshMenu = useCallback(async () => {
    const seq = ++requestSeqRef.current;
    setLoading(true);
    setError(null);
    try {
      const next = await fetchDataSourceMenuFromApi();
      if (seq !== requestSeqRef.current) {
        return getDataSourceGroups();
      }
      setGroups(next);
      return next;
    } catch (err: unknown) {
      if (seq !== requestSeqRef.current) {
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      console.warn("[data-source-menu]", message);
      throw err;
    } finally {
      if (seq === requestSeqRef.current) {
        setLoading(false);
      }
    }
  }, []);

  /** 每次打开 @数据源 菜单时调用，始终重新拉取最新数据。 */
  const ensureMenuLoaded = useCallback(async () => {
    await refreshMenu();
  }, [refreshMenu]);

  const loadCategoryTools = useCallback(
    async (_categoryId: string) => {
      await refreshMenu();
    },
    [refreshMenu],
  );

  useEffect(() => {
    if (!loadOnMount) return;
    let cancelled = false;
    void refreshMenu().catch(() => {
      if (!cancelled) {
        // refreshMenu 已写入 error 状态
      }
    });
    return () => {
      cancelled = true;
    };
  }, [loadOnMount, refreshMenu]);

  const items = useMemo<HomeCapabilityItem[]>(() => groups.flatMap((group) => group.items), [groups]);

  return {
    groups,
    items,
    loading,
    error,
    ensureMenuLoaded,
    refreshMenu,
    loadCategoryTools,
  };
}
