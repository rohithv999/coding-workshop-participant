import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Load data from the API with loading/error tracking.
 *   const { data, loading, error, reload } = useApiData(() => projectsApi.list(filters), [filters]);
 * Previous data stays visible while reloading, so the page doesn't flash empty.
 */
export default function useApiData(loader, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const latestRequest = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++latestRequest.current;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const data = await loader();
      // Ignore responses from older requests (e.g. fast typing in a search box)
      if (requestId === latestRequest.current) setState({ data, loading: false, error: null });
    } catch (error) {
      if (requestId === latestRequest.current) setState((prev) => ({ ...prev, loading: false, error }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    load();
  }, [load]);

  return { ...state, reload: load };
}
