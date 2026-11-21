import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Personal Knowledge Intelligence',
    minimum_chrome_version: '116',
    action: { default_title: 'Open Personal Knowledge Intelligence' },
    permissions: ['activeTab', 'sidePanel', 'scripting', 'storage'],
  },
});
