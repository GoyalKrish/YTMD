import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  extensionApi: 'chrome',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'YouTube Music Discovery',
    description: 'Discover and navigate music tracks playing in YouTube videos.',
    version: '0.1.0',
    permissions: [
      'storage',
      'tabs',
      'activeTab',
      'offscreen',
      'tabCapture',
      'sidePanel'
    ],
    host_permissions: [
      '*://*.youtube.com/*'
    ],
    action: {
      default_title: 'Open YouTube Music Discovery'
    }
  }
});
