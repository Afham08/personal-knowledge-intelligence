// Each panel has its own JS context. Closing it releases every unsaved draft.
const values = new Map<string, string>();
const listeners = new Set<() => void>();

export function subscribeDrafts(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function readDraft(key: string) {
  return values.get(key);
}

export function writeDraft(key: string, value?: string) {
  if (value === undefined) values.delete(key);
  else values.set(key, value);
  for (const listener of listeners) listener();
}

export function finishDraft(key: string, submitted: string) {
  if (readDraft(key) === submitted) writeDraft(key, undefined);
}
