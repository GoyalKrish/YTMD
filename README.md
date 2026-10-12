# YouTube Music Discovery Chrome Extension

A Chrome Manifest V3 extension prototype that connects to active YouTube video playback, enables timestamp navigation, and provides music discovery in a side panel.

## Architecture

- **Extension Manifest**: Manifest V3 (Chrome 116+ compatible)
- **Framework**: [WXT](https://wxt.dev/) + React 18 + TypeScript
- **Side Panel**: Interactive companion UI rendered with glassmorphic dark theme
- **Content Script**: Attached to YouTube watch pages (`*://*.youtube.com/*`), observing `<video>` state, handling playback events, single-page app (SPA) navigation, and seeking
- **Service Worker / Background**: Orchestration, side panel auto-opening, tab media stream broker
- **Offscreen Document**: Bounded tab-audio capture via `chrome.tabCapture` with audio routing back to `AudioContext.destination` so playback remains audible

---

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Development Mode
```bash
npm run dev
```
WXT will bundle the extension into `.output/chrome-mv3` with Hot Module Replacement (HMR).

### 3. Build for Production
```bash
npm run build
```
The production bundle is generated in `.output/chrome-mv3`.

---

## How to Load in Google Chrome / Chromium

1. Open Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** using the toggle switch in the top right.
3. Click the **Load unpacked** button in the top left.
4. Select the `.output/chrome-mv3` directory inside this project folder.
5. Open any YouTube video (e.g. `https://www.youtube.com/watch?v=...`).
6. Click the extension icon in the toolbar; the **YouTube Music Discovery** side panel will open and connect to the active player!

---

## Milestones Progress

- [x] **Milestone 0: Project Bootstrap & MV3 Architecture**
  - Minimal, robust Manifest V3 configuration with WXT and TypeScript
  - Side Panel entrypoint with responsive dark theme
  - Verified build and TypeScript compilation
- [x] **Milestone 1: YouTube Player Context & Seeking**
  - Content script detects active `<video>` element and title
  - Tracks playback time, duration, paused state, and SPA navigation
  - Interactive seek controls (`-10s`, `+10s`, and direct timestamp jumps)
  - Persistent session timeline in `chrome.storage.local`
- [x] **Milestone 2: User-Initiated Tab Audio Capture**
  - Explicit user-initiated tab capture with `chrome.tabCapture` & `chrome.offscreen`
  - Audio routed to `AudioContext.destination` to prevent tab audio muting
  - 15-second bounded window with live progress bar and Finish/Cancel controls
  - Real-time invalidation if playback is paused or sought during recording
  - Sample metadata card with video window, byte size, duration, and instant seek
- [x] **Milestone 3: Chromaprint / WASM Fingerprinting**
  - High-performance WebAssembly Chromaprint integration via `rusty-chromaprint-wasm`
  - Manifest V3 `'wasm-unsafe-eval'` CSP configured
  - Audio decoding & 16-bit PCM conversion (`Float32Array` -> `Int16Array`)
  - Compressed AcoustID fingerprint generation directly in browser memory without server uploads
  - Unit tests verifying PCM math and synthetic sine-wave fingerprint generation (8/8 passing)
- [ ] **Milestone 4: AcoustID & MusicBrainz Recognition**
- [ ] **Milestone 5: Deduped Timeline & Track Occurrences**
- [ ] **Milestone 6: Live Discovery Mode**
- [ ] **Milestone 7: Now Playing Card Overlay**
