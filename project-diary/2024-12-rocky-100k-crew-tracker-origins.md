# How this project got started

*Origin of the Rocky 100K crew tracker: what it is, why I wanted it, and how we began building it.*

---

I’m running the Tejas Trails HOKA Rocky Raccoon 100K in February 2026. It’s three loops plus a prologue at Huntsville State Park—100-ish km, 7:00 AM start, and I wanted my crew to have one place to see where I am and when I’ll hit each aid station without having to juggle PDFs and mental math.

So the idea was simple: a **crew tracker** that shows my last known split, estimated arrival times at every aid station, and the key info from our crew guide (what to have ready, quick reference, tips) in one mobile-friendly page. No accounts, no app store—just a URL I could share and they could open on race day.

I’d already seen EDS results pages for other races: they publish runner detail pages with lap/split times. I knew I could point the app at that URL and my bib and scrape or fetch the latest splits. From there it’s interpolation and pace: given my last split (e.g. 35 km at 11:28 AM), we can estimate when I’ll reach the next aid stations. We’d need a pacing plan (target times per station) so the app could show both “ETA” and “vs plan” (ahead/on/behind). That plan had to live somewhere editable—we later moved it into a CSV so I can tweak it without touching code.

I also wanted a way to **check in from the trail**. Sometimes the results site is delayed or I’m between mats. If I could tap my current km and time on my phone and have that show up on the crew’s screen, they’d always have a fallback. So we added a simple check-in flow: I submit km + time; the app stores one check-in per bib (we used Upstash Redis behind a small serverless API) and the main tracker treats it like a micro-split for progress and ETAs.

I started building this with an AI pair-programming setup. We went from “I want a crew page with ETAs” to a working Vite app: index page with race progress, “How’s he doing?” block, and an aid-station ETA table driven by the pacing plan. We wired up the EDS results fetcher, the field check-in API, and config (bib, results URL) in the browser. Early on we kept the crew guide copy and pacing data in code; over time we pulled the pacing plan into a CSV and refined the copy to match our actual race plan.

The **course map** came later: we had a GPX for the course and wanted to show my position on the loop. We added a map (Leaflet, OpenStreetMap/Carto tiles), a bottom-sheet layout so the tracker UI sits on top, and logic to place the runner at the right point on the track from their distance—including three-loop scaling so 0–100 km maps correctly around the loop. Start/finish and aid station markers went on the map, and we added a separate “map admin” page to tweak GPX and “track starts at race km” without cluttering the crew view.

So that’s the project: **Aaron’s Rocky 100K Crew Tracker**. One URL for the crew with live (or check-in) position, ETAs at every aid station, and the full crew guide; a private check-in page for me; and an optional map so they can see where I am on the course. This diary is where I (and we) record what we changed and why—starting from here, at the beginning.
