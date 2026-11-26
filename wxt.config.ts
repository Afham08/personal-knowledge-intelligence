import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: ({ mode }) => ({
    name: 'Personal Knowledge Intelligence',
    version: '0.3.0.2',
    version_name: '0.3.0-beta.2',
    description: 'Save articles around learning goals, study source-linked summaries, and practice recall privately with optional local AI.',
    icons: { 16: 'icon/16.png', 32: 'icon/32.png', 48: 'icon/48.png', 128: 'icon/128.png' },
    ...(mode === 'production' && { content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'none'; connect-src 'self' http://127.0.0.1:11434; base-uri 'none'",
    } }),
    minimum_chrome_version: '116',
    action: { default_title: 'Open Personal Knowledge Intelligence' },
    permissions: ['activeTab', 'sidePanel', 'scripting', 'storage'],
    optional_host_permissions: ['http://127.0.0.1:11434/*'],
  }),
});
