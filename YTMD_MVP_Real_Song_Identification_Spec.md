# YTMD — MVP Specification: Identify the Song Playing in YouTube

**Document purpose:** Give a coding agent one unambiguous, testable implementation target.  
**Repository:** https://github.com/goyalkrish/ytmd  
**Current stack:** WXT + Chrome Manifest V3 + React + TypeScript  
**Budget:** ₹0 for the prototype  
**Priority:** Real song identification, not UI polish.

> This spec supersedes the broad product roadmap in `Music_Discovery_Extension_Implementation_Plan.md` for the next development task. Do not implement the full product yet.

---

## 1. The only goal for this milestone

When a YouTube desktop video is currently playing, I should be able to click one basic **Identify current song** button in the extension and get the real song title and artist for music audible around that moment, if the recognition provider can match it.

The happy path is:

1. A YouTube video is playing in the active tab.
2. I click **Identify current song**.
3. The extension records a short sample of the current tab's audio (start with 15 seconds; make the duration a named constant).
4. The video audio remains audible to me throughout capture.
5. The extension generates a genuine Chromaprint-compatible fingerprint from the captured audio.
6. It sends that fingerprint to AcoustID using a registered application client key.
7. It parses a real result, including recording title and artist when available.
8. The extension shows the actual result, or honestly reports that no match was found.

**This is a one-shot, user-initiated identification flow.** It is not automatic/continuous listening. The result represents the sampled audio window, not a guarantee that one song plays for the entire video.

A minimal status area is allowed so I can operate and debug the feature. Do not spend time styling it.

## 2. Explicitly out of scope

Do **not** build any of the following yet:

- A polished YouTube-native interface or any injected player UI.
- A custom Now Playing overlay.
- A music timeline, timestamp history, occurrence grouping or saved discovery sessions.
- Live/continuous listening, background scanning, full-video scanning or scan progress.
- Search, playlists, recommendations, accounts, cloud storage or backend services.
- Artwork, fancy animations, elaborate component architecture or design-system work.
- Any Google-private/undocumented Song Search endpoint.
- YouTube audio downloads, unofficial media URL extraction or scraping.
- Fake/demo recognition results, placeholder tracks, or timers that pretend recognition succeeded.

Do not add future features “for convenience”. Build only what is required for one real identification request.

## 3. Current repository audit — important findings

The repository already has a WXT/React/TypeScript scaffold and player-context work. Keep it; do not regenerate or replace the project.

### Existing files to understand and reuse

- `wxt.config.ts` — WXT/Manifest V3 configuration and permissions.
- `entrypoints/youtube.content.ts` — finds the YouTube `<video>`, reads playback state, handles YouTube SPA navigation, and accepts seek commands.
- `entrypoints/background.ts` — currently has a basic `GET_TAB_STREAM_ID` handler.
- `entrypoints/offscreen/index.html` and `entrypoints/offscreen/main.ts` — currently set up tab audio capture using `MediaRecorder` and route captured audio back to the output.
- `entrypoints/sidepanel/App.tsx` — current control/result UI and current mock implementation.
- `lib/messages.ts` — messages between extension contexts.
- `lib/types.ts` — playback and discovery types.
- `package.json` — current scripts include `dev`, `build`, `compile`, and `test`.

### The current song identification is fake

In `entrypoints/sidepanel/App.tsx`, `handleIdentify()` currently waits using nested `setTimeout()` calls and creates a fake track named similar to `Sample Track at 42s`. This is not recognition and must be removed.

In `entrypoints/offscreen/main.ts`, audio is captured into a WebM `Blob` and sent in a `CAPTURE_COMPLETE` runtime message. There is no complete real path that turns this captured audio into a fingerprint, queries AcoustID, and returns parsed song metadata to the UI. Do not assume the existing `CAPTURE_COMPLETE` message is a working end-to-end transport.

`package.json` does not currently contain a verified browser-side Chromaprint/WASM implementation or an AcoustID integration.

Before coding, inspect the current versions of these files. The code may have changed since this spec was written. Preserve working functionality but do not trust README milestone checkmarks as proof that recognition works.

## 4. Required architecture for this MVP

Keep responsibilities simple:

### A. YouTube content script

Use the existing content script to report:

- active video ID;
- current playback time;
- video title if available;
- paused/playing state;
- whether the player/video changed during capture.

Do not process audio in the content script. It must not scrape the media stream or try to extract a media URL.

### B. Side panel — only a debug/control surface

Keep the UI deliberately plain. It needs only:

- current YouTube video / playback status;
- one **Identify current song** button;
- one status line, e.g. `Waiting`, `Capturing audio (6/15s)`, `Generating fingerprint`, `Checking AcoustID`, `Match found`, `No match found`, or a clear error;
- a real result title and artist, when available;
- an optional expandable/debug line showing sample start time, sample duration, match score and error code.

Disable the button while a capture/lookup request is already running. Never show a successful song result until a real provider response has been parsed.

### C. Background service worker

Orchestrate the request:

1. Receive the user-initiated identify request and active tab ID.
2. Validate that the tab is a supported YouTube watch page.
3. Request player state from the content script.
4. Refuse gracefully if there is no video, the video is paused, or the tab is unsupported. For this MVP, live streams can be unsupported.
5. Ensure the offscreen document exists.
6. Request a tab-capture stream ID using `chrome.tabCapture.getMediaStreamId()` for the target tab.
7. Start one bounded capture and associate it with a unique `captureId` and the initial YouTube `videoId`/`currentTime`.
8. Receive only a compact, JSON-serializable fingerprint result from the offscreen document.
9. Call AcoustID, parse the response, and send the normalized result back to the side panel.
10. Enforce one active capture at a time. All success, failure, cancellation and timeout paths must clean up correctly.

If the API's user-gesture requirement fails when the call originates from the side panel button, verify this with a minimal test and fix the capture initiation flow based on Chrome's documented rules. Do not silently fall back to a fake result.

### D. Offscreen document — capture and fingerprint

The existing offscreen document can own browser media APIs and audio processing.

Required behavior:

- Consume the stream ID created for the active YouTube tab.
- Keep the captured tab audio routed to `AudioContext.destination` so the user can still hear YouTube while capture is active.
- Capture only a bounded sample, initially 15 seconds.
- Decode the captured WebM audio into PCM/audio samples using browser-supported APIs.
- Generate a real Chromaprint fingerprint using a browser-compatible WASM implementation.
- Return only `{ captureId, fingerprint, durationSeconds, sampleStartSeconds, sampleEndSeconds }` or a typed error. Do not send a `Blob` or large raw audio payload through extension runtime messages.
- Stop the recorder, stop media tracks, close/release audio resources, and clear timers after every exit path.

If the user pauses the video, seeks substantially, or navigates to a different video during capture, cancel the request or mark it invalid. Never associate a fingerprint with the wrong video/time window.

### E. Recognition provider — AcoustID

Use AcoustID as the no-cost, non-commercial prototype provider. It is not Google's recognizer and may not recognize every short/noisy/dialogue-covered clip.

1. Register an application at https://acoustid.org/new-application and use the application's own `client` key. Do not use the example key from AcoustID's documentation in a shipped build.
2. Use the lookup endpoint: `https://api.acoustid.org/v2/lookup`.
3. Send `client`, `format=json`, `duration`, `fingerprint`, and `meta=recordings`.
4. Parse the returned JSON defensively. Use the highest-scoring valid candidate that actually contains recording title/artist metadata.
5. Preserve the AcoustID match score for debugging. Make any score cutoff a named, documented constant and test it; do not bury a magic threshold in UI code.
6. If a fingerprint matches an AcoustID ID but no recording metadata exists, report that honestly. Do not invent the title/artist.
7. If no result is available, show `No match found for this sample`. That is a valid outcome.
8. Handle network failures, HTTP errors, API-level errors, malformed JSON and rate limiting as separate error cases.
9. This feature should issue one lookup for a user click, never a loop. AcoustID's published guidance says no more than 3 requests/second; this MVP should be far below that.

MusicBrainz metadata enrichment is optional and **not required** for the first end-to-end version if AcoustID returns usable recording metadata. Do not let artwork or enrichment block recognition.

## 5. The first technical risk to resolve: browser-compatible Chromaprint

Do not guess a package name or invent a fake fingerprint implementation.

Before integrating a library:

1. Identify a browser-compatible Chromaprint implementation that can run inside the extension, preferably WASM and compatible with the existing WXT build.
2. Inspect its maintenance status, license, packaging format, browser support, initialization requirements and whether it accepts PCM samples or encoded audio.
3. Confirm the extension build can bundle its WASM/binary assets correctly.
4. Add the smallest possible proof that takes a known local audio test sample and produces a non-empty fingerprint string with a duration.
5. Keep the selected library behind one adapter function, e.g. `createFingerprint(audioBuffer)`, so it can be replaced if needed.

Do not use a native `fpcalc` executable or shell command from a browser extension; the extension cannot rely on launching native binaries.

If no suitable browser implementation can be integrated reliably, stop and report the blocker with the candidates investigated. Do not proceed by fabricating fingerprint strings or marking the milestone complete.

## 6. Audio and timing rules

- Use a named constant such as `CAPTURE_DURATION_SECONDS = 15`.
- Capture real current-tab audio, not the physical microphone. This is more direct and avoids room/speaker/microphone noise.
- Keep normal YouTube audio audible during capture. Test this explicitly; a stream that makes playback silent is a bug.
- Record the YouTube `videoId` and `currentTime` immediately before capture, and the player time when capture ends.
- The sample's timestamp is an approximate association with the start/end of the captured window. Do not claim exact song boundaries from one sample.
- Require the player to be actively playing before starting. For this version, if the player changes video or the capture window is interrupted, cancel rather than returning a potentially incorrect association.
- The first goal is to identify the audio in that window. Do not yet use the sample timestamp to build a timeline or occurrence model.
- Do not change playback speed to try to scan faster.

## 7. Minimal types and message contract

Use typed messages and avoid passing binary media between extension contexts.

A normalized recognition result should be conceptually equivalent to:

```ts
export type IdentificationResult = {
  captureId: string;
  videoId: string;
  videoTitle: string | null;
  sampleStartSeconds: number;
  sampleEndSeconds: number;
  status: 'matched' | 'no-match' | 'error' | 'cancelled';
  track?: {
    title: string;
    artists: string[];
    recordingId?: string;
    acoustId?: string;
    score?: number;
  };
  errorCode?:
    | 'NO_ACTIVE_YOUTUBE_VIDEO'
    | 'VIDEO_PAUSED'
    | 'CAPTURE_PERMISSION_DENIED'
    | 'CAPTURE_FAILED'
    | 'CAPTURE_INTERRUPTED'
    | 'FINGERPRINT_FAILED'
    | 'ACOUSTID_REQUEST_FAILED'
    | 'ACOUSTID_BAD_RESPONSE'
    | 'NO_MATCH'
    | 'METADATA_UNAVAILABLE'
    | 'TIMEOUT';
  message?: string;
};
```

Adapt the names to the existing `lib/messages.ts` style instead of duplicating types. Keep all messages serializable. Every request/response should carry `captureId` so stale responses cannot update a newer request.

## 8. Suggested implementation sequence

Do not ask the coding agent to implement every phase in one shot. Work in this order and verify each phase before moving on.

### Phase 0 — Audit and plan (no code changes)

- Read the current relevant files and identify the mock result path.
- List the exact code paths that currently run when `Identify current song` is clicked.
- Confirm which pieces are real and which are placeholders.
- Propose the smallest file-level change list.
- Do not edit any files in this phase.

**Done when:** the agent can explain, using file/function names, why the current result is fake and precisely where the real capture/fingerprint/API flow belongs.

### Phase 1 — Real capture only

- Replace the mock `setTimeout()` behavior with actual request orchestration.
- Make one user click request a bounded capture for the active YouTube tab.
- Decode/inspect the resulting audio enough to prove it contains non-silent audio (e.g. duration and RMS/peak diagnostics).
- Keep playback audible and guarantee resource cleanup.
- No fingerprint or API call yet.

**Done when:** logs prove a real sample was captured from the intended tab, its duration/audio level are plausible, YouTube remains audible, and repeated captures do not leave streams/recorders running.

### Phase 2 — Genuine fingerprint generation

- Select and document the browser-compatible Chromaprint/WASM implementation.
- Generate a real fingerprint from the captured sample.
- Show fingerprint length/duration in debug output only (do not render the entire fingerprint in the UI).
- Test with at least two known audio samples.

**Done when:** the code produces valid non-empty fingerprints from real audio, and has a useful error for unsupported/empty audio. No mocked fingerprint values.

### Phase 3 — AcoustID lookup and metadata parsing

- Add the registered AcoustID client key to a single clearly documented configuration location appropriate for a public client ID.
- Call the lookup endpoint once per capture.
- Parse valid title and artist metadata and normalize it to `IdentificationResult`.
- Implement no-match, metadata-missing, rate-limit and network error states.
- Keep one request active at a time.

**Done when:** a fingerprint is sent to AcoustID and the UI shows an actual provider result or an honest no-match/error state.

### Phase 4 — Wire the end-to-end flow and remove mock data

- Connect the one button to the full capture → fingerprint → AcoustID flow.
- Remove fake sample-track creation and all timer-based success simulations.
- Display only real result metadata in the existing plain panel.
- Confirm a stale response cannot overwrite a later request or a result for another video.

**Done when:** one click has a real end-to-end outcome; no code path can display a success without a parsed provider result.

### Phase 5 — Verify reliability and stop

- Run `npm run compile`, `npm run build`, and `npm run test` if the scripts are available.
- Fix any failures caused by the changes.
- Complete the manual test checklist below.
- Update README to describe only functionality that truly works.
- Do not add the timeline, Now Playing overlay, or live mode in this phase.

**Done when:** all required acceptance checks pass and the agent reports precisely what was tested, what worked, and known limitations.

## 9. Manual acceptance checklist

Test in Chrome/Chromium using the unpacked extension.

### Happy path

- [ ] Open a normal YouTube video with recognizable music and start playback.
- [ ] Open the extension and click **Identify current song**.
- [ ] The status reflects the actual steps: capture → fingerprint → lookup.
- [ ] The video remains audible throughout capture.
- [ ] The extension returns a real title and artist when AcoustID has a corresponding recording.
- [ ] The displayed match score, if shown, came from the API response.

### Honest failure behavior

- [ ] A video with speech/no recognized song ends in `No match found` or a useful error, not a fake track.
- [ ] An empty or silent sample is rejected or reported clearly.
- [ ] AcoustID/network/API failures produce a visible, specific error state.
- [ ] Missing artist/title metadata is reported rather than fabricated.

### State and cleanup

- [ ] The Identify button cannot start two simultaneous captures.
- [ ] Pausing/seeking/changing video during capture cancels or invalidates that request.
- [ ] The result is not attributed to a different video after YouTube SPA navigation.
- [ ] After success, no-match, cancellation or failure, streams, recorder, timers and audio contexts are cleaned up.
- [ ] A second identification attempt works after the first has ended.
- [ ] YouTube still plays audio normally after the extension has finished.

### Build checks

- [ ] `npm run compile` passes.
- [ ] `npm run build` passes.
- [ ] `npm run test` passes if tests are configured.
- [ ] No test or UI success state uses fake recognition metadata.

## 10. Logging requirements

Use concise, consistent console prefixes. Do not log captured audio, audio buffers, or unnecessary personal data.

Examples:

- `[YTMD] Identify requested`
- `[YTMD] Active video: <videoId>, start: <seconds>`
- `[YTMD] Capture started`
- `[YTMD] Capture complete: duration=<seconds>, rms=<value>`
- `[YTMD] Fingerprint generated: length=<n>`
- `[YTMD] AcoustID response: status=<status>, candidates=<count>`
- `[YTMD] Match: title=<title>, score=<score>`
- `[YTMD] No match`
- `[YTMD] Capture cleaned up`

Never print a fake `Match found` log before the response is parsed.

## 11. Coding-agent behavior requirements

The coding agent must:

- Read the relevant existing files before editing.
- Keep WXT + React + TypeScript; do not switch frameworks.
- Make the smallest changes that complete the current phase.
- Avoid generating a large new architecture or dozens of components.
- Avoid rewriting working YouTube player detection unless a specific tested defect requires it.
- Never fake results, fingerprint strings, API responses or successful states.
- Never claim tests passed unless it ran them and saw a passing result.
- Run build/type-check/tests after meaningful changes and include the actual output summary.
- Explain new dependencies and why each is necessary.
- Stop after the requested phase and report changed files, test results and known issues; do not continue into later features automatically.

## 12. Copy/paste prompt for the coding agent — Phase 0

```text
Read `YTMD_MVP_Real_Song_Identification_Spec.md` in full.

We are deliberately reducing scope to one feature: click one button to identify the song in the audio playing in the current YouTube video. No timeline, no overlay, no live mode, no UI polish.

For this turn, perform PHASE 0 ONLY. Do not edit files and do not install packages. Inspect the current repository, especially:
- entrypoints/sidepanel/App.tsx
- entrypoints/offscreen/main.ts
- entrypoints/offscreen/index.html
- entrypoints/background.ts
- entrypoints/youtube.content.ts
- lib/messages.ts
- lib/types.ts
- wxt.config.ts
- package.json

Report:
1. The exact mock/fake-success code path.
2. Which parts of capture are implemented and which parts are incomplete.
3. Whether captured Blob data is being transferred in a reliable way.
4. The exact minimal files that should change for Phase 1.
5. The technical risks around browser-compatible Chromaprint/WASM and AcoustID.
6. A short step-by-step plan for Phase 1 only.

Do not start implementation. Do not add UI designs or features. Do not claim that song identification currently works.
```

After Phase 0 is correct, ask the agent to implement **Phase 1 only**, then test it before proceeding.

## 13. References

- Chrome tab audio capture guide: https://developer.chrome.com/docs/extensions/how-to/web-platform/screen-capture
- Chrome `tabCapture` API: https://developer.chrome.com/docs/extensions/reference/api/tabCapture
- AcoustID Web Service (lookup parameters and usage limits): https://acoustid.org/webservice
- AcoustID application registration: https://acoustid.org/new-application
- Chromaprint project: https://github.com/acoustid/chromaprint

## Final definition of MVP complete

**MVP is complete only when the extension captures real audio from the currently playing YouTube tab, generates a genuine Chromaprint fingerprint, submits it to AcoustID, and displays the actual parsed match or an honest no-match/error result.** Anything short of that is scaffolding, not song identification.
