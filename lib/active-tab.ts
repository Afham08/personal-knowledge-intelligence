import { browser } from 'wxt/browser';

export const ACTIVE_TAB_REFRESH = 'pki:active-tab-refresh';

export type ActiveTab = {
  id: number;
  title?: string;
  url?: string;
};

export async function getActiveTab(): Promise<ActiveTab | null> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab?.id === undefined ? null : { id: tab.id, title: tab.title, url: tab.url };
}

export function isWebUrl(url: string): boolean {
  return url.startsWith('https://') || url.startsWith('http://');
}
