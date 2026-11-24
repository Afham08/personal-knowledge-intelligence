import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';

import { validStudy } from '../lib/backup';
import { studyKey } from '../lib/study';
import { ACTIVE_TAB_REFRESH } from '../lib/active-tab';

export default defineBackground(() => {
  void browser.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }).catch((error: unknown) => {
    console.error('Could not restrict PKI storage to extension pages.', error);
  });

  // Keep a dispatched write alive when the originating panel closes.
  browser.runtime.onMessage.addListener((message, sender, reply) => {
    if (sender.url !== browser.runtime.getURL('/sidepanel.html') || message?.type !== 'pki:save-study') return;
    const record = message.record;
    if (!validStudy(record)) { reply(false); return; }
    void navigator.locks.request('pki.study', () => browser.storage.local.set({ [studyKey(record)]: record }))
      .then(() => reply(true), () => reply(false));
    return true;
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
