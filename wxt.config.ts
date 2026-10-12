import { defineConfig } from 'wxt';
import wasm from 'vite-plugin-wasm';

// See https://wxt.dev/api/config.html
export default defineConfig({
  extensionApi: 'chrome',
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [wasm()],
    build: {
      target: 'esnext'
    },
    optimizeDeps: {
      exclude: ['rusty-chromaprint-wasm']
    }
  }),
  manifest: {
    name: 'YouTube Music Discovery',
    description: 'Discover and navigate music tracks playing in YouTube videos.',
    version: '0.1.0',
    permissions: [
      'storage',
      'tabs',
      'activeTab',
      'scripting',
      'offscreen',
      'tabCapture',
      'sidePanel'
    ],
    host_permissions: [
      '*://*.youtube.com/*',
      '*://youtube.com/*',
      '<all_urls>'
    ],
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'"
    },
    action: {
      default_title: 'Open YouTube Music Discovery'
    },
    commands: {
      capture_sample: {
        suggested_key: {
          default: 'Alt+Shift+S',
          mac: 'Alt+Shift+S'
        },
        description: 'Capture 15s YouTube audio sample'
      }
    }
  }
});
