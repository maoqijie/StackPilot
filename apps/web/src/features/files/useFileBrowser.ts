import { useCallback } from "react";
import { fetchFiles } from "../../api/filesApi";
import { usePollingResource } from "./usePollingResource";

export function useFileBrowser(path: string) {
  const fetcher = useCallback((signal: AbortSignal) => fetchFiles(path, signal), [path]);
  const { data, loading, error, reload } = usePollingResource(path, fetcher);
  return { entries: data?.entries ?? [], loading, error, collectedAt: data?.collectedAt ?? "", reload };
}
