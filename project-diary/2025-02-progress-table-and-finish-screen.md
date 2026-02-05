# Aligning the progress table with the map, and finish screen tweak

*Follow-up: making "Last Aid Station" / "Next Aid Station" match when the runner crosses the map markers, and showing official time on the finish screen.*

---

After we fixed the aid station positions on the map (Tylers, Gate, Nature Center, Dam Nation at their correct track km), the **progress table** (the "Last Aid Station" / "Next Aid Station" line and the ETA list) was still using race km from the pacing plan CSV and the built-in `AID_STATIONS_KM`. Those numbers had been based on chart miles and didn’t match the track geometry we’d locked in. So the table could say "Last: Gate" while the runner dot on the map hadn’t quite reached the Gate marker, or the other way around.

## Track-derived race km

We needed the **race km** in the plan to be the ones at which the runner actually passes each physical location on the track. So I added the inverse of the race→track mapping.

In **`src/gpx.js`**:

- **`trackKmToRaceKmForLap(trackKm, lapIndex, trackLengthKm, ...)`** — Given a distance along the track and a lap index (0, 1, 2), returns the race km at which the runner reaches that track km. Same prologue/lap math as `raceKmToTrackKmThreeLoops`, just inverted.
- **`getAidStationRaceKmFromTrack(trackLengthKm, ...)`** — Uses the same four track positions we use for the map (Tylers 0.51, Gate 6.3, Nature Center 14.87, Dam Nation 24.89) and returns the 14 race km values in the same order as the aid station list. So the progress table and ETAs use distances that match the map.

In **`src/main.js`**, we now load the track and the pacing plan in parallel. When both are ready and we have 14 aid stations, we overwrite each station’s `km` with the value from `getAidStationRaceKmFromTrack(track.trackLengthKm)`. So whenever the GPX is available, the table is driven by the actual track length and the same positions as the markers.

The **`data.js`** fallback (used when the CSV or results aren’t available) was updated with the same formula using a fixed loop length (~35.7 km), so even offline the "Last" / "Next" flip at sensible places. I also updated the lap boundaries in the ETA section labels and the constant for the last Nature Center (Zach pickup note) so they match the new km.

## Finish screen: "Official time"

The final result time has always come from the race results webpage (EDS runner detail page, "Total Race Time" row). On the finish screen we were labeling it "Result:" and sometimes formatting it as "14h 30m". I changed it to **"Official time: HH:MM:SS"** — same value we get from the results page, no reformatting — so it’s clearly the official chip time and matches the usual race format.

---

So now: when the runner crosses an aid station on the map, the progress table should check it off at roughly the same time; and when they’re done, the finish screen shows **Official time: 14:30:45** (or whatever’s on the results page).
