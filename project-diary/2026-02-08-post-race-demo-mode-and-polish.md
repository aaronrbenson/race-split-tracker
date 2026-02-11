# Post-race: demo mode, replay, and polish

*Summary of work done after the Feb 7, 2026 Rocky Raccoon 100K — converting the app for show-and-tell demos and UI refinements.*

---

## Race results and EDS

During the race, the field check-in page worked great, but the app never successfully pulled from the EDS results site. Likely cause: CORS — the app fetches runner detail pages directly from edsresults.com in the browser, and the results site may not send CORS headers.

We initially hardcoded Aaron's official results (bib 545, 14:44:19 finish, six splits) in `edsFetcher.js` so the app could display his finish. Post-race, we removed all EDS fetching: `fetchRunnerInfo()` now always returns `null`. No more requests to the results site. The app is intended for demos only.

## Demo mode

Added always-on demo mode when there is no `?test=` in the URL:

- **Random state**: On each load or refresh, the app shows a random in-progress position (km between 8–92) and a random pace status (ahead, on plan, behind, very behind, catastrophic). "How's he doing?", next aid ETA, progress bar, and last split all update accordingly. No finisher view — km stays below ~99.
- **Status message**: The line above "Next aid station arrival estimate" (e.g. "Could not load live results") is hidden in demo mode so the layout flows cleanly.
- **Stale check**: Skipped in demo mode so the random state never shows as stale.

Implemented in `src/demoMode.js`: `isDemoModeActive()`, `getRandomDemoState(aidStations)`. Uses `planTargetAtKm` from test mode to compute clock times for a given km and pace delta.

## Replay Race Performance

Added a "Replay Race Performance" button at the bottom of the app (in the footer):

- On click, the app animates Aaron's actual 2026 race over 90 seconds — position and clock time interpolated from his six official splits (9:16 AM, 11:36 AM, 1:51 PM, 4:24 PM, 6:54 PM, 9:44 PM) and finish time 14:44:19.
- Same feel as the existing test scenarios (progress bar, ETAs, "How's he doing?") but driven by real race data.
- When the replay finishes, the app shows the finisher view and stays there until the user refreshes (which returns to demo mode with a new random state).

Implemented in `src/replayRace.js`: `AARON_2026_SPLITS`, `AARON_2026_TOTAL_TIME`, `startReplay()`, `isReplayActive()`, `isReplayFinished()`, `getReplayRunnerState()`.

## DEMO MODE label

A label below the main title "Aaron's Rocky 100k" displays **DEMO MODE** when the app is in demo or replay:

- Styled as a pill: cool blue/grey gradient (`#5b7a9e` → `#6b8299`), white text, uppercase, small font.
- Positioned on its own line under the title via flexbox.
- Hidden when in test mode (`?test=1`–`?test=finish`).

## Nutrition guide refinements

- **Warning signs**: Reordered from least to most severe (e.g. "Peeing constantly" Mild → "Confused / slurred speech" Critical). Added right-side severity labels with colored dots (Mild, Low, Moderate, High, Critical). Removed the highlight style from the "Confused / slurred speech" card so it matches the others.
- **Lap 2 stop**: Removed the KEY STOP highlight from the Lap 2 nutrition stop card; it now uses the same card style as the other stops.
- **Typography**: Standardized font-size scale in the nutrition guide: 1rem (title) → 0.875rem (h3) → 0.8125rem (body) → 0.75rem (secondary) → 0.6875rem (small). Added a comment documenting the scale.

## Data and exports

- **data.js**: Exported `RACE_START_MINUTES` (race was already using it; it was missing from the committed version, which caused a build failure).
- **testMode.js**: Exported `planTargetAtKm` for use by demo mode.

## Files changed

- `src/demoMode.js` — new
- `src/replayRace.js` — new
- `src/edsFetcher.js` — stripped to no-op
- `src/testMode.js` — export `planTargetAtKm`
- `src/ui.js` — demo and replay branches, `updateDemoStatusLabel()`, footer button handler
- `src/data.js` — export `RACE_START_MINUTES`
- `index.html` — demo label, header row layout, Replay Race Performance button
- `src/main.css` — demo label styles, replay button styles, nutrition typography and warning order
