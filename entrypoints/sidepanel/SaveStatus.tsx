import type { useAction } from './useAction';

export function SaveStatus({ state }: { state: ReturnType<typeof useAction>['state'] }) {
  if (state.status === 'pending') return <p role="status">Saving…</p>;
  if (state.status === 'success') return <p role="status">{state.message}</p>;
  if (state.status === 'error') return <p role="alert">{state.message}</p>;
  return null;
}
