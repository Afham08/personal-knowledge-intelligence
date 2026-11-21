import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';

import { ACTIVE_TAB_REFRESH } from '../lib/active-tab';

export default defineBackground(() => {
  void browser.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }).catch((error: unknown) => {
    console.error('Could not restrict PKI storage to extension pages.', error);
  });

  browser.action.onClicked.addListener((tab) => {
    // Open synchronously from the toolbar gesture so Chromium allows the panel.
    void browser.sidePanel.open({ windowId: tab.windowId }).catch((error: unknown) => {
      console.error('Could not open the PKI side panel.', error);
    });

    // The panel may already be open when access is granted for a different tab.
    void browser.runtime.sendMessage(ACTIVE_TAB_REFRESH).catch(() => {
      // A newly opened panel may not be listening yet. It queries on mount.
    });
  });
});
