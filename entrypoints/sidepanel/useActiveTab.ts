import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';

import { ACTIVE_TAB_REFRESH, getActiveTab, type ActiveTab } from '../../lib/active-tab';

type TabState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; tab: ActiveTab | null };

export function useActiveTab(): TabState {
  const [state, setState] = useState<TabState>({ status: 'loading' });

  useEffect(() => {
    let request = 0;

    async function refresh() {
      const current = ++request;
      try {
        const tab = await getActiveTab();
        if (current === request) setState({ status: 'ready', tab });
      } catch {
        if (current === request) setState({ status: 'error' });
      }
    }

    const onUpdate: Parameters<typeof browser.tabs.onUpdated.addListener>[0] = (
      _tabId, change, tab,
    ) => {
      if (tab.active && (change.url || change.title || change.status)) void refresh();
    };
    function onMessage(message: unknown) {
      if (message === ACTIVE_TAB_REFRESH) void refresh();
    }

    browser.tabs.onActivated.addListener(refresh);
    browser.tabs.onUpdated.addListener(onUpdate);
    browser.runtime.onMessage.addListener(onMessage);
    void refresh();

    return () => {
      request++;
      browser.tabs.onActivated.removeListener(refresh);
      browser.tabs.onUpdated.removeListener(onUpdate);
      browser.runtime.onMessage.removeListener(onMessage);
    };
  }, []);

  return state;
}
