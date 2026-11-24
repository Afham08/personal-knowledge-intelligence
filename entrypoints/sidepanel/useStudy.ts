import { useEffect, useSyncExternalStore } from 'react';
import { browser } from 'wxt/browser';
import { validStudy } from '../../lib/backup';
import { STUDY_PREFIX, type StudyRecord } from '../../lib/study';

let records: Record<string, StudyRecord> = {};
let loaded = false;
let loadError = '';
let watchers = 0;
const listeners = new Set<() => void>();
function notify() { for (const listener of listeners) listener(); }
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
const changed: Parameters<typeof browser.storage.onChanged.addListener>[0] = (changes, area) => {
  if (area !== 'local') return;
  const updates = Object.entries(changes).filter(([key]) => key.startsWith(STUDY_PREFIX));
  if (!updates.length) return;
  records = { ...records };
  for (const [key, change] of updates) {
    if (validStudy(change.newValue)) records[key] = change.newValue;
    else delete records[key];
  }
  notify();
};

let epoch = 0;
function watch() {
  watchers++;
  if (watchers === 1) {
    const current = ++epoch;
    browser.storage.onChanged.addListener(changed);
    void browser.storage.local.get(null).then(data => {
      if (current !== epoch) return;
      records = { ...Object.fromEntries(Object.entries(data).filter((pair): pair is [string, StudyRecord] => pair[0].startsWith(STUDY_PREFIX) && validStudy(pair[1]))), ...records };
      loadError = '';
      loaded = true;
      notify();
    }).catch(() => {
      if (current !== epoch) return;
      loadError = 'Study records could not load. Reopen the panel to try again.';
      records = { ...records };
      notify();
    });
  }
  return () => {
    if (--watchers === 0) {
      epoch++;
      browser.storage.onChanged.removeListener(changed);
      records = {};
      loaded = false;
    }
  };
}

export function useStudy() {
  const snapshot = useSyncExternalStore(subscribe, () => records);
  useEffect(watch, []);
  return { records: snapshot, loaded, loadError };
}

export async function saveStudy(record: StudyRecord) {
  const saved = await browser.runtime.sendMessage({ type: 'pki:save-study', record });
  if (saved !== true) throw new Error('Study data could not be saved.');
}
