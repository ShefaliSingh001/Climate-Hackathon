import { useEffect, useState } from 'react';

interface AsyncState<T> {
  data: T | undefined;
  loading: boolean;
  error: Error | undefined;
}

/** Runs `fn` whenever `deps` change and tracks loading/error. Ignores stale responses. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ data: undefined, loading: true, error: undefined });

  useEffect(() => {
    let live = true;
    setState(s => ({ ...s, loading: true, error: undefined }));
    fn().then(
      data => live && setState({ data, loading: false, error: undefined }),
      error => live && setState(s => ({ ...s, loading: false, error })),
    );
    return () => { live = false; };
  }, deps);

  return state;
}
