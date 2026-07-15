import type { ViewDataMeta, WorkspaceViewData } from "@/lib/store";

type CachedViewData = {
  data: WorkspaceViewData;
  meta: ViewDataMeta | null;
  cachedAt: number;
};

export const VIEW_DATA_CACHE_TTL_MS = 30_000;

const cache = new Map<string, CachedViewData>();

export function getCachedViewData(key: string) {
  const entry = cache.get(key);
  if (!entry) return null;
  return { ...entry, isFresh: Date.now() - entry.cachedAt < VIEW_DATA_CACHE_TTL_MS };
}

export function cacheViewData(key: string, data: WorkspaceViewData, meta: ViewDataMeta | null) {
  cache.set(key, { data, meta, cachedAt: Date.now() });
}

export function invalidateViewDataCache() {
  cache.clear();
}
