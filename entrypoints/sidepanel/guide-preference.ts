import type { browser } from 'wxt/browser';

export const guidePreference = 'pki.quickStart.dismissed';
type Storage = Pick<typeof browser.storage, 'local' | 'onChanged'>;

export function dismissGuide(storage: Storage) {
  return storage.local.set({ [guidePreference]: true });
}

export function watchGuide(storage: Storage, show: (visible: boolean) => void) {
  let initialReadCurrent = true;
  const changed: Parameters<typeof storage.onChanged.addListener>[0] = (changes, area) => {
    if (area === 'local' && guidePreference in changes) {
      initialReadCurrent = false;
      show(changes[guidePreference].newValue !== true);
    }
  };
  storage.onChanged.addListener(changed);
  void storage.local.get(guidePreference).then((data) => {
    if (initialReadCurrent) show(data[guidePreference] !== true);
  }).catch(() => { if (initialReadCurrent) show(true); });

  return () => {
    initialReadCurrent = false;
    storage.onChanged.removeListener(changed);
  };
}
