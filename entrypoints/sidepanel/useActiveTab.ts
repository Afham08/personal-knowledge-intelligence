import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';

import { ACTIVE_TAB_REFRESH, getActiveTab } from '../../lib/active-tab';
import { markTabLoading, tabSnapshot, type TabState } from './panel-state';

export function useActiveTab(): TabState {
  const [state, setState] = useState<TabState>({ status: 'loading' });

  useEffect(() => {
    let request = 0;

    async function refresh() {
      const current = ++request;
      try {
        const tab = await getActiveTab();
        if (current === request) setState((state) => tabSnapshot(state, tab));
      } catch {
        if (current === request) setState({ status: 'error' });
      }
    }

    const onUpdate: Parameters<typeof browser.tabs.onUpdated.addListener>[0] = (
      tabId, change, tab,
    ) => {
      if (change.status === 'loading') setState((state) => markTabLoading(state, tabId));
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
