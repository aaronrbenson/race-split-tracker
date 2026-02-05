# Crew tracker polish and race-day prep

*Summary of work on the Rocky 100K crew tracker in the run-up to race day: aligning the in-app guide with our plan, securing check-in, moving controls to a private page, and gating live results until race morning.*

---

I had a PDF crew guide and an app that was already doing ETAs and field check-ins, but the written copy on the page didn’t quite match the plan we’d locked in. We went through the crew guide section by section and brought everything in line: quick reference (target finish 9:30 PM, window 8:30–10:30), what to have ready (headlamp after 6 PM, chair note, etc.), and crew tips—including the “Lap 4 will be slow” note and the race-strategy line about trusting the plan. We also dropped the static Tyler’s table; the live-updating “Estimated arrival at aid stations” list does that job now, so the page is simpler and always current.

I didn’t want just anyone to be able to check in as me. We moved the whole check-in flow to a separate page at a different URL that I don’t share. Only I open that page; crew only see the main tracker. On that private page we restyled things for use in the field: the km field is first, big and centered, with a numeric keypad on iOS, and the bib field is smaller and second. We added a “Reset all check-ins” button that purges every check-in in Redis so I can test without leaving stale data. Test position (admin) moved there too, with a bit of space between it and the main check-in form, so the crew-facing page has no settings or admin UI at all.

We used to have a bib input on both the main page and the check-in page. Now there’s only one: on the check-in page. That bib is saved to our API (Redis), and the main page fetches it when it loads. So I set my bib once on the private page; crew open the tracker and it just works. No need for them to type anything. We also made the default ETAs show our plan target times when there’s no live data yet, so the list never shows a wall of dashes—it always has something useful.

The “How’s he doing?” block was written like it was talking to me, the runner. We rewrote it for the crew: third person (“He’s…”) and a bit more personality. Now it says things like “He’s flying! Someone tell him it’s a long day” when I’m ahead early, and “Break out the pizza and prayers” when I’m way behind. We removed the old fallback message about setting a test position or entering a bib, since those controls don’t live on the main page anymore.

Lastly, I didn’t want the app hitting the race results website until we actually need it. We added a gate in the EDS fetcher: no requests to the results URL until 6:00 AM Central on race day (February 7, 2026). Before that, the tracker only uses plan ETAs and any field check-ins. After that, it behaves as before. So the app is ready to share with crew now, and we’re not pinging the results site during testing or in the weeks before the race.

---

So as of this pass: the in-app guide matches the plan and the PDF, check-in and admin live on a private page, bib is set once and flows to the crew view, the “How’s he doing?” copy is for the crew and a bit fun, and live results are turned on only from race morning onward.
