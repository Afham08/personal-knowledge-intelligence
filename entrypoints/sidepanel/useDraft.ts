import { useSyncExternalStore } from 'react';
import { finishDraft, readDraft, subscribeDrafts, writeDraft } from './drafts';

export function useDraft(...parts: string[]) {
  const key = JSON.stringify(parts);
  const value = useSyncExternalStore(subscribeDrafts, () => readDraft(key));
  return {
    value,
    edit: (next: string) => writeDraft(key, next),
    saved: (submitted: string) => finishDraft(key, submitted),
  };
}
