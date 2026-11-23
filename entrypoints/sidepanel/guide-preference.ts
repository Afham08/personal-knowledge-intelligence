import type { browser } from 'wxt/browser';

const preference = 'pki.quickStart.dismissed';
type Storage = Pick<typeof browser.storage, 'local' | 'onChanged'>;

export function dismissGuide(storage: Storage) {
  return storage.local.set({ [preference]: true });
}

export function watchGuide(storage: Storage, show: (visible: boolean) => void) {
  let initialReadCurrent = true;
  const changed: Parameters<typeof storage.onChanged.addListener>[0] = (changes, area) => {
    if (area === 'local' && preference in changes) {
      initialReadCurrent = false;
      show(changes[preference].newValue !== true);
    }
  };
  storage.onChanged.addListener(changed);
  void storage.local.get(preference).then((data) => {
    if (initialReadCurrent) show(data[preference] !== true);
  }).catch(() => { if (initialReadCurrent) show(true); });

  return () => {
    initialReadCurrent = false;
    storage.onChanged.removeListener(changed);
  };
}
