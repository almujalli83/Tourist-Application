"use client";

import { useCallback, useEffect, useState } from "react";

/** Runs a search once when results are missing; exposes loading/error/retry. */
export function useFetchStep<T>(needed: boolean, url: string, payload: unknown, onData: (d: T) => void) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "generic");
      onData(data as T);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, JSON.stringify(payload)]);

  useEffect(() => {
    if (needed && payload) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needed]);

  return { loading, error, retry: run };
}
