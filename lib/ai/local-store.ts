import { browser } from 'wxt/browser';

import type { AnalysisCache } from './analysis';
import { isObject } from './provider';
import type { Analysis } from './schema';

const SETTINGS_KEY = 'pki.ai.settings';
const CACHE_KEY = 'pki.ai.cache.v1';
const MAX_RESULTS = 30;

export type AiSettings = { enabled: boolean; modelName: string };

export async function readAiSettings(): Promise<AiSettings> {
  const settings = (await browser.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY];
  return {
    enabled: isObject(settings) && settings.enabled === true,
    modelName: isObject(settings) && typeof settings.modelName === 'string' ? settings.modelName : '',
  };
}

export async function updateAiSettings(change: Partial<AiSettings>): Promise<void> {
  await navigator.locks.request(SETTINGS_KEY, async () => {
    const current = await readAiSettings();
    await browser.storage.local.set({ [SETTINGS_KEY]: { ...current, ...change } });
  });
}

async function readCache(): Promise<Record<string, unknown>> {
  const cache = (await browser.storage.local.get(CACHE_KEY))[CACHE_KEY];
  return isObject(cache) ? cache : {};
}

export const localAnalysisCache: AnalysisCache = {
  async get(key) {
    return (await readCache())[key];
  },
  async set(key, analysis: Analysis) {
    await navigator.locks.request(CACHE_KEY, async () => {
      const entries = Object.entries(await readCache()).filter(([existing]) => existing !== key);
      const next = Object.fromEntries([...entries.slice(-(MAX_RESULTS - 1)), [key, analysis]]);
      await browser.storage.local.set({ [CACHE_KEY]: next });
    });
  },
};

export function watchAiSettings(refresh: () => void): () => void {
  const listener: Parameters<typeof browser.storage.onChanged.addListener>[0] = (changes, area) => {
    if (area === 'local' && SETTINGS_KEY in changes) refresh();
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}
