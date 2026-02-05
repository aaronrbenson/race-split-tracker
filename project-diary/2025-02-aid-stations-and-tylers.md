# Fixing aid station labels and the start/finish on the map

*Summary of work on the Rocky Race Tracker map: getting aid station and Tylers (start/finish) positions right, and making labels behave.*

---

The aid station labels on the course map were in the wrong places. They were being placed from chart miles and a fixed loop length, and the math didn’t match the actual track. I needed a way to see where they really were and lock in correct positions.

## Draggable markers and “track km” readout

I followed a small plan: add a way to get **distance along the track** from a lat/lon, then make the aid markers draggable so we could move them to the right spots and read off the values.

In **`src/gpx.js`** I added `getDistanceAlongTrack(track, lat, lon)`. It finds the closest point on the track (by projecting onto each segment and using haversine distance), then returns the cumulative km to that point. That’s the number we show when you drop a marker.

In **`src/map.js`**, when the URL has `?aidDebug=1`, the aid station markers (Gate, Nature Center, Dam Nation) became draggable. On **dragend**, we call `getDistanceAlongTrack`, then set the popup to something copy‑friendly: *"Name — track km: X.XX | lat: ..., lon: ..."*. The start/finish (Tylers) stayed a separate marker and wasn’t draggable at first.

## Locking in corrected positions

I dragged the three aid stations to where they actually are on the course and wrote down the readouts:

- **Dam Nation** — track km: 24.89  
- **Gate** — track km: 6.30  
- **Nature Center** — track km: 14.87  

Those went into a constant `AID_TRACK_KM` in `map.js`. Placement now uses these track km values instead of the old mile‑based math, so the labels sit in the right place.

## Making Tylers draggable (and fixing the popup)

I wanted to edit Tylers too, but when I made the start/finish marker draggable, the coordinates popup never showed after a drag. I tried rebinding the popup on dragend and deferring `openPopup()` — no luck.

The fix was to stop treating Tylers as a special case. I removed the separate “start/finish marker” and built a single list of POIs: Tylers first (at track km 0), then the three aid stations. Every marker is created in the same loop, with the same `dragend` handler that does `setPopupContent(text).openPopup()`. Tylers is just another entry in that list, with a 🏁 icon instead of ⛺. Once it went through the same code path as the others, the popup worked.

## Official start position: Tylers

After dragging Tylers to the real start, the readout was:

**Tylers — track km: 0.51 | lat: 30.61494, lon: -95.53185**

I added `Tylers: 0.51` to `AID_TRACK_KM` and made the POI list use that for Tylers. Then I did a small tweak to the exact pixel: the final position we wanted was **lat: 30.61503, lon: -95.53251** (still at 0.51 km). So I introduced `TYLERS_LATLON` and, for Tylers only, place the marker at that lat/lon instead of interpolating from the track. That way the start/finish is pinned to the exact spot we chose.

## Label anchor and centering

Someone asked where the “center” of the label is. For the aid markers we use Leaflet’s `iconAnchor: [80, 44]` with `iconSize: [160, 44]`, so the point on the map is the **bottom‑center** of the 160×44 px icon box.

When zoomed out, Tylers (shorter text) looked like it was sitting to the left of its origin. I wanted it to stay centered (or a bit right) regardless of font size or text length. So in **`course.css`** I made the aid marker icon a flex container: `display: flex`, `justify-content: center`, `align-items: flex-end`. That centers the pill inside the icon box so the anchor stays at the visual center‑bottom for any label length.

It still looked left‑aligned for Tylers on my setup, so I added a Tylers‑only override in **`map.js`**: for Tylers, `iconAnchor` is **`[40, 44]`** instead of `[80, 44]`. That puts the map point 40 px from the left of the icon box, so the label appears shifted to the right of the origin and reads as more centered.

---

So now: aid stations and Tylers use corrected positions (track km and, for Tylers, an exact lat/lon). With `?aidDebug=1` you can still drag any of the four markers and get the “track km | lat, lon” readout. The Tylers label is nudged so it doesn’t look left of the start point when zoomed out.
