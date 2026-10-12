# YouTube Music Discovery — Vibecoding Implementation Plan

**Project type:** Chrome/Chromium extension + product-design prototype  
**Budget target:** ₹0 for the initial non-commercial prototype  
**Primary goal:** Discover music heard in a YouTube video, associate the discovery with the video timestamp, show a Now Playing card, and maintain a navigable music timeline.  
**Important product constraint:** Google’s consumer Song Search/Hum to Search capability is not available as a publicly documented API that this project can simply call. The prototype should use an accessible recognition path (AcoustID + Chromaprint/WASM), while the pitch can propose a future Google-native integration separately.

---

## 1. Product vision

### The problem
A viewer hears a song in a YouTube video, leaves the viewing experience to search for it, often fails to identify it, and then has to find the original moment again.

### The proposed experience
A YouTube-specific Music Discovery layer that:

1. Identifies a song from the current video's audio.
2. Associates the recognition result with a YouTube playback timestamp.
3. Builds a chronological, timestamped list of detected music.
4. Lets the viewer jump back to an occurrence.
5. Optionally shows a small Now Playing card when playback enters a previously recognized section.
6. Eventually supports a user-started scan pass that builds a fuller track timeline.

### Product positioning
This is a product/UX prototype, not a recreation of Google's proprietary recognition engine. Be precise about that in the portfolio and pitch. The implementation demonstrates the user experience and a feasible recognition pipeline; a YouTube-native version could use Google's internal recognition technology if Google chose to provide it.

---

## 2. Scope: decide what we are building first

### MVP (must work before adding polish)

- Chrome/Chromium extension using Manifest V3.
- YouTube desktop video pages only.
- Extension opens a Music Discovery side panel.
- User explicitly starts capture/identification.
- Capture a short sample from the current browser tab's audio.
- Compute a Chromaprint fingerprint locally using a WASM build.
- Query AcoustID and retrieve associated recording metadata from MusicBrainz when possible.
- Save the video ID and timestamp associated with each match.
- Display results in a chronological list.
- Clicking a result seeks the YouTube player to the approximate detected moment.
- Keep results for the current video in `chrome.storage.local` so closing/reopening the panel does not immediately erase them.
- Provide understandable loading, no-match, permission, and error states.

### Next milestone (after MVP is reliable)

- Live Discovery mode: capture and check repeated samples while the user watches.
- Group consecutive detections of the same track into one approximate occurrence.
- Now Playing card overlay, with dismiss and disable controls.
- Session-level cache so the same part is not recognized repeatedly after scrubbing.
- Resume an interrupted discovery session.

### Later milestone

- Improve track boundaries and repeated occurrence grouping.
- Full-video analysis UX with progress and resumability.
- Keyboard access, fullscreen handling, responsiveness, and polished animations.
- Research better recognition backends, subject to availability, cost, licensing, and privacy.

### Explicit non-goals for the first version

- Do not attempt to use Google's undocumented/private endpoints.
- Do not download or extract YouTube audio through unofficial endpoints or a YouTube downloader.
- Do not claim that a complete video can be analyzed instantly using tab capture alone.
- Do not build a user account system, cloud database, social features, playlists, or AI recommendations yet.
- Do not promise that every song, remix, cover, background score, or dialogue-covered track will be identified.
- Do not publish or distribute broadly before checking the applicable Chrome Web Store, YouTube, provider, and data-handling requirements.

---

## 3. Critical technical reality: how scanning will work

Chrome's `tabCapture` API captures the current tab's audio after a user action. An offscreen extension document is a practical place to process/record audio because Manifest V3 service workers do not have normal DOM/media-recording capabilities. Capturing tab audio may silence normal playback unless the captured stream is routed back to the audio output.

This gives us two distinct workflows:

### A. Identify this moment
1. User clicks **Identify this moment**.
2. Extension captures a short sample, targeting about 15–20 seconds for the first AcoustID experiment.
3. Record the YouTube player's `currentTime` at the start and end of the sample.
4. Stop or invalidate the sample if the user seeks, changes videos, or pauses in a way that makes timestamp mapping unreliable.
5. Fingerprint the sample locally and query AcoustID.
6. Store the best usable result with the approximate video-time window.

This is the first end-to-end proof that must work.

### B. Live Discovery
1. User enables Live Discovery explicitly.
2. While the video is playing, capture samples at conservative intervals.
3. Each sample is fingerprinted and looked up sequentially, not in a tight loop.
4. Associate results with the actual YouTube playback-time window covered by the sample.
5. Merge adjacent observations of the same recording into one approximate occurrence.
6. Update the timeline and, if enabled, show a Now Playing card on a segment transition.

AcoustID has a documented limit of no more than three requests per second; design for much less than that. MusicBrainz also asks clients not to exceed one request per second and requires a meaningful `User-Agent`. Cache results and avoid looking up identical samples repeatedly.

### What “whole-video scan” means in this project
With tab capture, the extension can only hear the content that is actually being played. The MVP therefore builds a timeline as the video plays; it does not instantaneously analyze unheard portions of a video. A later “Scan video” operation must explain what it will actually do and provide progress. Do not pretend the timeline is complete until enough of the video has been observed.

Do not accelerate playback just to scan faster in the first version; altered playback speed and pitch can reduce matching reliability. Do not rely on downloading audio or scraping undocumented YouTube media endpoints. If a future implementation uses another authorized source of audio, review that source's legal, technical, and platform constraints first.

---

## 4. Recommended stack

Use the simplest stack that makes multiple extension entry points predictable for a vibecoding workflow:

- **WXT + TypeScript** for building a modern Chrome extension.
- **React** for the side-panel and overlay interfaces.
- **Chrome Extension Manifest V3**.
- **Chrome `tabCapture` + `offscreen`** for user-initiated tab-audio capture and processing.
- **Chromaprint compiled to WebAssembly** for local fingerprint generation.
- **AcoustID Web Service** for fingerprint lookup.
- **MusicBrainz API** for recording/artist/release metadata.
- **Cover Art Archive** for artwork when a relevant release ID is available; gracefully fall back to a placeholder when not.
- **`chrome.storage.local`** for preferences, sessions, cached lookups, and the current video's discovery timeline.
- **Vitest** for pure-function/unit tests if the scaffold supports it cleanly.

Why WXT: it supports TypeScript, MV3, React integration, and separate extension entry points such as a background worker, content script, and side panel. This avoids hand-managing a complicated multi-page Vite build from day one.

Do not add a backend for the MVP unless an actual need arises. The AcoustID application client ID is used for lookup and is not equivalent to a private paid-provider secret. Never embed a private token for a commercial recognition service. For this non-commercial prototype, keep requests direct and make usage limits conservative.

---

## 5. Architecture

```text
YouTube tab
  │
  ├── Content script
  │     ├── Finds the current video element
  │     ├── Reads video ID/title/currentTime/duration/paused state
  │     ├── Sends seek commands to the player
  │     └── Renders the optional Now Playing overlay in an isolated Shadow DOM
  │
  ├── Side panel (React)
  │     ├── Start/stop controls
  │     ├── Current video/session status
  │     ├── Timestamped music timeline
  │     ├── Track details and links
  │     └── Preferences/privacy explanation
  │
  └── Background service worker
        ├── Orchestrates session state and extension messaging
        ├── Requests tab-capture stream ID from a user gesture
        ├── Ensures offscreen document exists
        ├── Coordinates fingerprint/lookup work
        └── Persists normalized results

Offscreen document
  ├── Consumes tab audio stream
  ├── Routes audio back to output so playback remains audible
  ├── Records a bounded sample
  ├── Converts sample to the format expected by Chromaprint/WASM
  └── Returns fingerprint + sample timing information

Recognition layer
  ├── Chromaprint/WASM → audio fingerprint
  ├── AcoustID lookup → candidate IDs/scores
  ├── MusicBrainz → recording/artist/release metadata
  └── Cover Art Archive → optional artwork

Shared timeline engine
  ├── Deduplicates repeated samples
  ├── Groups adjacent matches into approximate occurrences
  ├── Tracks observed windows vs inferred start/end boundaries
  └── Emits updates to panel and overlay
```

### Important boundary
The content script should not perform heavy audio work and should not directly own long-running capture. The offscreen document handles media APIs. The service worker coordinates operations but should not assume in-memory state survives forever; persist necessary session state and make start/stop operations idempotent.

---

## 6. Suggested project layout

Let WXT create its preferred files; the following is a logical target, not a requirement to force every path verbatim.

```text
music-discovery/
├── entrypoints/
│   ├── background.ts              # MV3 orchestration
│   ├── sidepanel/
│   │   ├── index.html
│   │   ├── main.tsx
│   │   └── style.css
│   ├── youtube.content.ts         # Video/player bridge and overlay
│   └── offscreen/
│       ├── index.html
│       └── main.ts                # Capture/record/PCM preparation
├── components/
│   ├── DiscoveryHeader.tsx
│   ├── DiscoveryControls.tsx
│   ├── DiscoveryStatus.tsx
│   ├── TrackTimeline.tsx
│   ├── TrackRow.tsx
│   ├── NowPlayingCard.tsx
│   └── EmptyState.tsx
├── lib/
│   ├── messages.ts                # Typed messages between contexts
│   ├── types.ts                   # Shared domain types
│   ├── youtube-player.ts          # Safe current-player adapter
│   ├── capture-client.ts          # Background/offscreen orchestration
│   ├── audio-sample.ts            # Sample metadata/format conversion
│   ├── fingerprint.ts             # Chromaprint/WASM wrapper
│   ├── acoustid.ts                # AcoustID request/response parser
│   ├── musicbrainz.ts             # Recording/artist/release metadata
│   ├── cover-art.ts               # Optional art URL resolver
│   ├── timeline.ts                # Deduping and occurrence grouping
│   ├── storage.ts                 # Versioned storage and migrations
│   └── formatting.ts              # Timestamp and display formatting
├── public/
│   ├── icon-16.png
│   ├── icon-48.png
│   └── icon-128.png
├── tests/
│   ├── timeline.test.ts
│   ├── formatting.test.ts
│   └── acoustid-parser.test.ts
├── wxt.config.ts
├── package.json
└── README.md
```

Do not build all of these files in one AI prompt. Create the smallest possible slice, verify it, and then continue.

---

## 7. Domain model: keep observed facts separate from estimates

One of the biggest risks is presenting a sample timestamp as an exact song start/end. A 20-second sample that matches a recording proves only that the recording was detected somewhere in that sample window; it does not inherently prove the exact boundary.

Use explicit names that preserve this distinction.

```ts
export type DiscoveryStatus =
  | 'idle'
  | 'requesting-permission'
  | 'capturing'
  | 'fingerprinting'
  | 'identifying'
  | 'listening'
  | 'stopped'
  | 'error';

export interface VideoContext {
  videoId: string;
  title: string;
  durationSeconds: number | null;
  pageUrl: string;
}

export interface RecordingMetadata {
  recordingId: string | null; // MusicBrainz recording ID when available
  acoustId: string | null;
  title: string;
  artists: string[];
  releaseTitle?: string;
  releaseId?: string;
  artworkUrl?: string;
  source: 'acoustid-musicbrainz';
}

export interface ObservedWindow {
  sampleStartSeconds: number;
  sampleEndSeconds: number;
  matchedAtEpochMs: number;
  acoustIdScore?: number;
}

export interface TrackOccurrence {
  id: string;
  trackKey: string;
  metadata: RecordingMetadata;
  observedWindows: ObservedWindow[];
  approximateStartSeconds: number;
  approximateEndSeconds: number | null;
  lastSeenSeconds: number;
  boundaryQuality: 'observed-only' | 'estimated';
}

export interface DiscoverySession {
  schemaVersion: 1;
  video: VideoContext;
  startedAtEpochMs: number;
  updatedAtEpochMs: number;
  status: DiscoveryStatus;
  occurrences: TrackOccurrence[];
  lastSampleStartSeconds?: number;
  lastErrorCode?: string;
}
```

The code above is an illustrative type contract, not a complete implementation. Adjust naming during development, but preserve these concepts:

- Group tracks by stable recording ID when one exists; otherwise use a carefully constructed fallback key.
- Store every sample window that produced a match.
- Do not call an AcoustID score a probability or show it as “92% confidence” unless that interpretation is validated.
- Mark start/end boundaries as approximate until your benchmark demonstrates reliable boundary detection.
- Treat unknown and unmatched samples as normal outcomes, not exceptions.

---

## 8. UX specification

### Entry point
For the first implementation, use the extension toolbar action to open a Chrome side panel. A custom control inside YouTube's native player can be prototyped later, but it is more fragile because YouTube changes its DOM and its single-page-app navigation behavior. The panel-first approach lets you build and test the actual feature without making the whole project depend on brittle player-control injection.

The final pitch can still show a native-looking button beside captions/settings. Clearly label any video mockup as a concept; do not represent an injected extension control as an official YouTube feature.

### Panel states

1. **No supported video:** “Open a YouTube video to discover its music.”
2. **Ready:** show video title, a short explanation, and “Identify this moment” / “Start Live Discovery”.
3. **Permission/capture:** explain why tab audio is needed and that audio samples are sent for matching.
4. **Capturing:** show a short progress indicator and Stop/Cancel.
5. **Identifying:** “Matching audio…”; do not freeze the UI.
6. **Track identified:** show title, artist, artwork if available, video timestamp, and a “Jump to moment” action.
7. **No match:** “No match found for this sample.” Explain that this does not prove there was no music.
8. **Error:** human-readable message with Retry and a non-technical explanation.
9. **Live Discovery active:** show a compact active-state indicator, Stop, and a persistent timeline.
10. **No results yet:** show a useful empty state and let playback continue.

### Timeline row
Each row should contain:

- Thumbnail/artwork or neutral music-note placeholder.
- Track title and artist when known.
- Timestamp or approximate range, such as `03:14 · detected in this section` until a reliable range is inferred.
- Play/seek action.
- Optional “open track” links only if a real destination ID/URL is available.
- No fake data in production. Demo fixtures must be clearly isolated from real results.

### Now Playing card
Show the card only after a meaningful track transition or when the user enters a known segment. Do not show a card on every sample response.

- Compact card anchored inside the YouTube player bounds, lower-right where possible.
- Artwork, track title, artist, timestamp, and a close button.
- Close dismisses it for the current video/session.
- Settings let the user disable the card while keeping the timeline active.
- Must not cover captions, core controls, or the seek bar.
- Ensure the card does not steal keyboard focus and is reachable for keyboard users if it contains controls.
- Use an isolated Shadow DOM for the overlay CSS to reduce style collisions.
- Reposition or hide it when entering/exiting fullscreen and when the player size changes.

### Visual direction
- Use dark and light themes based on the extension UI's own color scheme; never hardcode a single background for every environment.
- Compact spacing, restrained surfaces, accessible contrast, readable track metadata.
- Use familiar player-adjacent visual language, but do not copy YouTube logos/branding in a way that implies official affiliation.
- Make the central action and current state obvious; never show a permanently active microphone/listening indicator when capture is off.

---

## 9. Recognition pipeline details

### Step 1: capture safely
- Capture only after an explicit user action.
- Request only the permissions required for the current phase.
- Use Chrome's documented tab-capture flow; verify current Chrome requirements for `tabCapture`, `offscreen`, and the offscreen-document reason.
- Use a single offscreen document, created lazily and reused where appropriate.
- Route captured audio back to `AudioContext.destination` if required so the viewer continues hearing the video.
- Always stop tracks, stop MediaRecorder, disconnect audio nodes, and release object URLs after the operation.
- If the current tab changes video IDs during capture, discard that sample rather than attaching it to the wrong video.
- Avoid storing raw audio. Keep it in memory and release it after fingerprinting unless a deliberate local debug feature is added with a clear user opt-in.

### Step 2: build a fingerprint
- Evaluate an actively maintained Chromaprint/WASM package or build.
- Confirm its license, API, expected audio format, duration requirements, and browser/WASM compatibility before integrating it.
- Convert captured audio to the exact PCM/sample rate/channel format expected by the chosen wrapper; do not assume a WebM/Opus recording blob can be fingerprinted directly.
- Keep conversion isolated behind `fingerprint.ts` so the implementation can be changed without refactoring the UI.
- Add a deterministic test using a known, legally available audio fixture and confirm the fingerprint function produces a non-empty result.

### Step 3: query AcoustID
- Register the app at https://acoustid.org/new-application to obtain a client key.
- Use the official fingerprint lookup endpoint documented at https://acoustid.org/webservice.
- Include fingerprint, sample duration, client ID, and metadata options needed to retrieve recording identifiers.
- Parse all responses defensively; handle `status != ok`, empty results, missing fields, rate limits, and network failure.
- Obey the documented maximum of three requests per second; use a much lower rate for Live Discovery and apply backoff on errors.
- AcoustID is provided free for non-commercial use; do not assume this free allowance applies to commercial deployment.
- The API result is candidate evidence, not a guarantee the best candidate is correct. Tune matching thresholds only after the test set exists.

### Step 4: enrich metadata
- Where AcoustID returns a MusicBrainz recording ID, request recording metadata with artist credits and any relevant release identifiers.
- Set a meaningful MusicBrainz `User-Agent` identifying the prototype/version/contact. Respect its one-request-per-second limit.
- Cache metadata by recording/release ID so repeated samples don't cause repeated API calls.
- Retrieve artwork only when a usable release identifier exists; image absence should not break track recognition.
- Treat missing/ambiguous artist credits and multiple releases gracefully.

### Step 5: build timeline observations
- At the start and end of each audio sample, record the associated video playback positions.
- If playback paused, sought, or changed source during capture, cancel or mark the window invalid.
- For one recording detected across nearby windows, merge the observations when the gap is below a configurable threshold.
- If a different track is recognized, do not instantly assert an exact boundary. Keep the last observed window and mark a boundary estimate.
- Use an explicit `boundaryQuality` field so the UI can distinguish “observed” from “estimated”.
- Do not fabricate an end time if a sample never confirms one.
- Preserve separate occurrences when the same song returns later in the video.

---

## 10. Extension permissions and privacy

Keep the permission set minimal. The precise configuration depends on the entry points WXT generates, but investigate only these capabilities initially:

- `tabCapture`: capture audio from the current tab after user interaction.
- `offscreen`: use an offscreen document for audio processing/recording.
- `storage`: store preferences and discovery history locally.
- `sidePanel`: host the discovery panel.
- YouTube page access for the content script, scoped to YouTube rather than broad access to all sites.

Do not request microphone access; the product captures the browser tab rather than the physical environment. A future “identify sound in the room” feature is out of scope.

User-facing privacy copy should state:

- Capture starts only when the user explicitly starts discovery.
- Short audio samples are processed into fingerprints and looked up with AcoustID.
- No long-term raw-audio retention is intended.
- Discovery history is stored locally in the browser unless that design changes.
- The external recognition/metadata services have their own terms and privacy practices.

Before shipping beyond a personal prototype, review Chrome Web Store user-data policies, YouTube terms/developer policies that apply to the specific implementation, the AcoustID non-commercial terms, and MusicBrainz rate limits. A technically possible DOM modification is not automatically permission to distribute an official-looking YouTube UI integration.

---

## 11. Milestones for vibecoding

Do not ask the AI to implement every milestone at once. Commit after each working stage. If a stage fails, ask the AI to diagnose the current stage instead of layering more code on top.

### Milestone 0 — create project and understand the baseline

**Tasks**
- Create a new repository and initialize WXT with TypeScript and React.
- Build an empty MV3 extension and side panel.
- Confirm the generated build directory and how to load it unpacked in Chrome.
- Add a README with local development and build commands.

**Definition of done**
- `npm run dev` (or the script generated by the current scaffold) starts successfully.
- `npm run build` succeeds.
- The extension loads without manifest errors.
- Clicking the extension action opens the side panel.
- No audio or YouTube DOM manipulation is implemented yet.

### Milestone 1 — YouTube player context and seeking

**Tasks**
- Detect that the current tab is a supported YouTube watch page.
- Find the main `<video>` element robustly and tolerate it being replaced during YouTube navigation.
- Read video ID, title, duration, current time, pause/play state, and playback rate.
- Define typed messages from content script to extension UI.
- Implement a `seekTo(seconds)` command and verify it with a test video.
- Support YouTube's single-page navigation by detecting video ID changes.

**Definition of done**
- The panel shows the current video title and duration when available.
- The current playback timestamp updates while playing.
- Clicking a test timestamp seeks accurately.
- Switching to another YouTube video updates the panel without requiring a browser refresh.
- Unsupported pages show a clear empty state.

### Milestone 2 — audio capture only (no fingerprinting yet)

**Tasks**
- Add explicit **Capture test sample** / **Stop** controls.
- Request tab capture only from a user gesture.
- Create/reuse an offscreen document.
- Record a bounded sample in memory.
- Keep tab playback audible while the stream is captured.
- Expose sample duration and start/end video timestamps in a debug status view.
- Clean up every media resource on stop, error, tab change, and extension shutdown where possible.

**Definition of done**
- Starting capture is explicit and visible.
- Video remains audible during capture.
- Capture automatically ends at the configured maximum duration.
- No samples are captured if the user has not started the operation.
- Seeking or changing videos does not create a wrong timestamp mapping.
- Repeated start/stop cycles do not leave audio running or produce duplicate streams.

### Milestone 3 — Chromaprint/WASM fingerprint

**Tasks**
- Select and install a suitable Chromaprint WASM wrapper after checking documentation and licensing.
- Convert the captured audio into the expected PCM format.
- Generate a fingerprint and duration.
- Show a developer-only fingerprint status (not the raw audio) for debugging.
- Add a small known-audio fixture test where legally permitted.

**Definition of done**
- A captured sample produces a valid fingerprint without uploading the audio file.
- Conversion errors are surfaced clearly.
- Audio capture and fingerprint generation are separate modules.
- Releasing a sample frees the audio buffer and media resources.

### Milestone 4 — AcoustID + metadata

**Tasks**
- Register an AcoustID application and configure the client key locally for development.
- Implement a typed AcoustID lookup client.
- Parse candidate matches and choose a candidate according to documented fields and measured tests.
- Resolve MusicBrainz recording/artist/release metadata with a meaningful User-Agent.
- Cache metadata to reduce requests and respect service limits.
- Add states for match, ambiguous result, no match, service unavailable, rate limited, and malformed response.

**Definition of done**
- A clean, supported audio sample can return a track result when the database has a match.
- No-match responses do not crash the UI.
- Missing artwork or metadata still renders a valid track row.
- API calls are rate limited and cached.
- No paid-service token is bundled in the extension.

### Milestone 5 — first Music Discovery timeline

**Tasks**
- Store the result against the current video ID and sample playback-time window.
- Implement sorting by playback time.
- Group repeated matches into tracks/occurrences without destroying individual observed windows.
- Make rows clickable and seek to their approximate starts.
- Store sessions with a schema version in `chrome.storage.local`.
- Handle changing videos and restoring the panel.

**Definition of done**
- The panel can show multiple timestamped matches from a session.
- Clicking a row seeks to the recorded approximate moment.
- Reopening the panel restores the session.
- Re-identifying the same region does not create an unbounded list of duplicates.
- A repeated occurrence of the same song later in the video is preserved as a distinct occurrence.

### Milestone 6 — Live Discovery

**Tasks**
- Add a clear Start/Stop control.
- Sample at conservative, configurable intervals while the video is playing.
- Enforce one capture/lookup job at a time.
- Skip or cancel samples during seeks, pause transitions, video changes, or when the page no longer has a supported video.
- Use cached observations to avoid redundant lookups.
- Maintain UI states such as Listening, Identifying, Match found, and No match.

**Definition of done**
- The timeline updates as the video plays.
- The user can stop discovery immediately.
- No overlapping jobs or runaway request loops occur.
- The feature obeys external rate limits.
- If the extension worker restarts, the UI can recover or clearly reset to a safe state.

### Milestone 7 — Now Playing card

**Tasks**
- Build the card inside a Shadow DOM to isolate CSS.
- Render only on meaningful track transitions or when entering a known occurrence.
- Add dismiss behavior and a per-session suppression rule.
- Add a preference to disable cards without disabling timeline discovery.
- Handle player resize, theater mode, fullscreen, captions, and mobile-ish viewport widths where applicable.

**Definition of done**
- A card appears only when enabled and a result is available.
- It does not appear for every audio sample.
- Dismissal works and does not immediately trigger another card for the same occurrence.
- It does not obscure core controls or captions in the tested layouts.
- The card never claims a song is identified before the recognition response arrives.

### Milestone 8 — full-video analysis UX and hardening

**Tasks**
- Decide precisely what the **Scan video** action means under available audio access.
- Make progress honest: “Building timeline as playback progresses” is valid; “Scanning all 12 minutes” is only valid if the code actually covers the full interval.
- Add pause/resume, cancel, and resume-after-reload semantics where feasible.
- Track coverage separately from the list of recognized tracks.
- Add a diagnostic test set and record matching rate, wrong matches, uncovered time, and API calls.
- Review permissions, privacy copy, storage limits, provider rules, and YouTube compatibility.

**Definition of done**
- The UI never claims the video has been fully analyzed when it has not.
- The user can see that recognition may miss music or return no match.
- Long sessions do not cause runaway storage or network requests.
- The README distinguishes current prototype capability from future product vision.

---

## 12. Test plan

Create a small test playlist or test set that you can legally access and manually review. Include at least:

1. Clear, uninterrupted commercial music.
2. Instrumental background music.
3. Dialogue mixed over music.
4. Music at low volume.
5. Multiple songs in one video.
6. A song that stops and returns later.
7. A video with little/no identifiable music.
8. A music transition with speech and sound effects.
9. A video that is paused during capture.
10. A video that is seeked during capture.
11. Switching to another YouTube video while discovery is active.
12. Network failure or API rate-limit error.

For every sample, record:

- Whether the expected song was identified.
- Whether the candidate was correct.
- The video-time window sampled.
- Recognition response latency.
- Whether the returned metadata was complete.
- How many requests were made.
- Whether UI timestamps were useful.

Use this to judge AcoustID fairly. It is designed around near-identical recording matching and may be less robust than Google's consumer song recognizer on noisy mixed audio. A failed match is useful benchmark evidence, not necessarily a bug in your UI.

### Practical MVP acceptance bar

- No audio capture without a clear user action.
- No loss of normal tab audio during capture.
- Correct video ID attached to each session.
- A recognized song can be clicked to return to its approximate moment.
- Same-track observations do not create a duplicate row for every sample.
- Error and no-match states remain understandable.
- Memory/network activity stops when the user stops discovery.
- No unsupported claim of instant, complete full-video analysis.

Do not invent a recognition accuracy target before measuring the first test set. Establish a baseline first, then define a realistic target.

---

## 13. Ready-to-use prompts for your coding assistant

Use these in sequence. Give the assistant the existing repository state each time and ask it to modify only the milestone in scope. Don't ask it to build the whole product in one pass.

### Prompt 0 — bootstrap

> You are helping me build a Chrome extension called YouTube Music Discovery. Use WXT, TypeScript, React, and Manifest V3. First scaffold the project with a side-panel entry point and a background service worker. Do not implement audio capture, API calls, a YouTube overlay, or recognition yet. Explain the generated folder structure, give the exact install/dev/build commands, and make sure the build succeeds. Keep permissions minimal. Stop after this milestone and list the manual verification steps.

### Prompt 1 — player context

> Implement only YouTube player context detection. The extension should detect a YouTube watch page, read the active video ID/title/duration/currentTime/paused state, and update the side panel. Implement a typed message contract between the content script and side panel. Add a seek-to-timestamp action. YouTube is a single-page app, so handle video changes without a full page reload. Do not add audio capture or recognition. Run the build and fix errors before finishing; report exact files changed and manual tests.

### Prompt 2 — capture pipeline

> Implement user-initiated tab-audio capture using the currently documented Chrome Manifest V3 tabCapture/offscreen approach. Capture a bounded sample only after a user clicks a control. Keep captured audio routed to normal output so the YouTube video remains audible. Return sample metadata including start/end video playback times; cancel/invalidates samples if the user seeks or changes videos during capture. Clean up every stream, recorder, AudioContext, and timer on success, cancel, error, and navigation. Do not implement fingerprinting or external APIs yet. Check the current Chrome documentation for exact permission and offscreen requirements, then build and give a manual verification checklist.

### Prompt 3 — fingerprinting

> Add a Chromaprint/WASM fingerprint module behind a small interface. Before choosing a package, verify its current API, expected PCM format, supported browser environment, and license. Convert the captured sample to its required input format. Do not send audio to a remote server. Add unit tests for audio-format validation and a known fixture where permitted. Do not integrate AcoustID yet. Keep the capture code unchanged except for the smallest necessary interface connection.

### Prompt 4 — AcoustID and metadata

> Integrate the AcoustID fingerprint lookup API using a locally configurable application client ID. Follow the current official API documentation and obey its request limit. Resolve MusicBrainz metadata with a meaningful User-Agent and no more than one request per second; cache recording metadata. Handle empty results, missing fields, HTTP errors, rate limits, and offline mode. Never hardcode a demonstration API key from documentation, bundle a paid-provider secret, or invent song metadata. Add unit tests for response parsing. Do not implement live sampling yet.

### Prompt 5 — timeline

> Build the timestamped Music Discovery timeline. Save the video ID and every sample's playback-time window with the normalized track result. Use a versioned type-safe schema in chrome.storage.local. Sort by playback time, merge adjacent observations for the same recording into approximate occurrences, preserve repeat appearances later in the video, and distinguish observed sample windows from estimated track boundaries. Each row must seek the YouTube player to its approximate start. Add tests for deduplication, repeated occurrences, ordering, and malformed/missing metadata.

### Prompt 6 — Live Discovery

> Add a user-controlled Live Discovery mode that captures bounded samples only while enabled and the supported YouTube video is playing. Never run multiple capture jobs or recognition requests concurrently. Use conservative intervals, respect AcoustID/MusicBrainz limits, skip samples during seeks/video transitions, and use cached results. The timeline should update progressively and the user must be able to stop immediately. Do not implement the Now Playing overlay yet. Add state-machine tests or a simple manually verifiable checklist for start/stop/pause/navigation/error cases.

### Prompt 7 — Now Playing card

> Implement the Now Playing card as an optional content-script overlay isolated in a Shadow DOM. It should appear only when Live Discovery is enabled and a meaningful newly detected track/segment is available, not on every sample. Include track title, artist, approximate video timestamp, and dismiss. Dismissal should suppress repeat cards for the same occurrence for the current video session. Add a preference to turn off cards independently from the timeline. Handle player resize/fullscreen/theater mode and avoid covering captions/core controls as much as practical. Do not modify YouTube's native controls in this milestone.

### Prompt 8 — audit and polish

> Audit the current implementation against the project's acceptance criteria. Find and fix memory leaks, audio left playing after Stop, stale sessions after video navigation, duplicate observations, unbounded storage, request bursts, missing loading/error/empty states, inaccessible controls, incorrect timestamp assumptions, and excessive permissions. Do not add new features. Run the build and tests, list any remaining known limitations, and update the README so it clearly distinguishes implemented functionality from planned functionality.

### How to use these prompts

After each prompt, ask the AI to summarize:

- What it changed.
- Which files own each responsibility.
- Which build/test commands it ran and their actual results.
- What you should test manually next.
- Which limitations remain.

If the build fails, stop adding features. Paste the exact error and fix that milestone first. Never accept “build should work” as proof; run it locally.

---

## 14. Common traps to avoid

1. **Building the entire extension in one prompt.** This makes it extremely difficult to diagnose audio, extension lifecycle, UI, and API issues independently.
2. **Assuming any audio blob is a valid Chromaprint input.** Capture formats and fingerprint input formats are different layers.
3. **Treating AcoustID as Google/Shazam quality.** The free approach is a useful prototype backend, not a guarantee for dialogue-heavy audio.
4. **Using sample start as the exact song start.** It only indicates where the sample was taken. Boundaries need multiple observations or another reliable source.
5. **Triggering capture on page load.** Make it user initiated and visible.
6. **Not routing captured audio back to output.** The user may think YouTube broke or went silent.
7. **Using concurrent API calls for every sample.** This can breach limits and produce out-of-order results.
8. **Over-requesting permissions.** Keep site access limited to YouTube and request only needed capabilities.
9. **Keeping all state only in the service worker's memory.** MV3 workers can be suspended; persist resumable state.
10. **Injecting directly into YouTube's native controls too early.** First build the feature in the side panel; the in-player button is a later integration detail.
11. **Calling estimated ranges exact.** Label approximate results honestly.
12. **Shipping as if Google endorsed it.** This is an independent prototype and pitch, not an official YouTube feature.
13. **Using code from another repository without reviewing its license.** HummingBud is a useful architecture reference, but verify its code license and dependencies before copying or redistributing any code.
14. **Ignoring rate limits from metadata providers.** AcoustID and MusicBrainz have distinct limits; caching is essential.
15. **Promising “analyze entire video” without a coverage model.** The UI needs to distinguish recognized segments from portions not yet sampled.

---

## 15. Definition of done for the first public portfolio demo

The prototype is ready for a portfolio demo when all of the following are true:

- It loads as an unpacked Chrome extension without errors.
- It is scoped to YouTube desktop video pages.
- The user explicitly starts capture/discovery.
- YouTube audio continues playing normally.
- At least some supported clean-audio clips can be identified via AcoustID/MusicBrainz.
- Every result is associated with the correct video ID and an approximate timestamp window.
- Clicking a row seeks to the corresponding part of the video.
- Same-track sample observations are grouped sensibly; later repeats remain separate occurrences.
- The current video’s timeline survives closing and reopening the panel.
- The UI includes no-match, loading, offline/API error, and stop states.
- Stop really stops capture and further API requests.
- The README explains limitations and identifies AcoustID/Chromaprint as the prototype recognition path.
- The pitch/mockup makes it clear that a Google-native recognition backend is a proposed future integration, not an existing public API used by the prototype.

### Portfolio deliverables

1. A working short demo video/GIF showing identify → track result → timestamp seek.
2. A second demo showing the timeline growing as the video plays.
3. A concise architecture diagram.
4. A case study showing problem, research, interaction design, technical constraints, and what you'd validate next.
5. A Twitter post asking YouTube/Google to consider the concept without implying official affiliation.

---

## 16. Reference links

Use these as the source of truth when implementing. Check them again when starting because extension APIs and provider policies can change.

- [Chrome tab capture and screen capture documentation](https://developer.chrome.com/docs/extensions/mv3/screen_capture/)
- [Chrome Offscreen API](https://developer.chrome.com/docs/extensions/reference/api/offscreen)
- [Chrome Side Panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)
- [Chrome extension permission guidance](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions)
- [WXT documentation](https://wxt.dev/)
- [WXT entry points](https://wxt.dev/guide/essentials/entrypoints)
- [AcoustID Web Service](https://acoustid.org/webservice)
- [AcoustID application registration](https://acoustid.org/new-application)
- [Chromaprint source repository and intended use](https://github.com/acoustid/chromaprint)
- [Chromaprint compiled to WASM reference implementation](https://github.com/unimusic-app/unimusic-chromaprint)
- [MusicBrainz API and rate limits](https://musicbrainz.org/doc/MusicBrainz_API)
- [HummingBud architecture reference](https://github.com/srivatsavavuppala/HummingBud/blob/main/ARCHITECTURE.md)

HummingBud is an architecture reference for a similar browser-audio recognition flow. Review its current code and license before reusing code; this plan does not depend on copying it.

---

## Final implementation advice

Build the smallest vertical slice first:

**YouTube timestamp → capture a sample → fingerprint → AcoustID result → show track → click to seek.**

Only after that entire path works should you invest time in continuous sampling, timeline grouping, the Now Playing overlay, and the polished product-pitch visuals. If AcoustID proves weak on dialogue-heavy samples, keep the recognition layer replaceable and continue testing alternative approaches without rebuilding the UI.
