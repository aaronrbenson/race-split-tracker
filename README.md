# Aaron's Rocky 100K Crew Tracker

Mobile-friendly crew page for the Tejas Trails HOKA Rocky 100K. Shows **Aaron's last split** and **estimated arrival at each aid station** (in km), plus the full crew guide with all distances in kilometers.

## Quick start

- **Demo mode (default)**: Open the app and use "Use demo data" to see mock mid-race splits and ETAs.
- **Settings**: Save a results page URL and bib number for when live results are available.

```bash
npm install
npm run dev
```

Open http://localhost:5173 (or the URL Vite prints).

## Build & deploy (Vercel)

```bash
npm run build
```

Deploy the `dist` folder:

1. Push this repo to GitHub and connect it to [Vercel](https://vercel.com).
2. Set build command: `npm run build`, output directory: `dist`.
3. Deploy. No serverless functions or database required for demo mode.

## Live results (2026 race)

The app is prepared for live results but needs the **exact URL** that returns runner/split data (EDS does not publish a public API).

**How to find the results data URL**

1. When the 2026 results page is live, open it in a browser.
2. Select the **100K** event and, if possible, open a runner's split detail (e.g. click a bib).
3. Open **DevTools → Network** and refresh or trigger the load.
4. Find the request that returns the runner table or split times (e.g. `results.php?event=100K`, `runner.php?bib=123`, or an XHR to a JSON endpoint).
5. Copy that URL and query pattern. You can then add it to the app's config or code so the app fetches by bib and parses split times. If the request is blocked by CORS, add a single Vercel serverless function that proxies the request and returns JSON.

Until then, use **demo mode** so your crew can see the layout and ETAs with mock data.

## Config (stored in browser)

- **Results page URL**: Base URL for the race (e.g. `http://edsresults.com/2025rr100/` for testing).
- **Bib number**: Aaron's bib once assigned (default `TBD`).
- **Use demo data**: When on, the app shows built-in mock splits and ETAs without calling the results site.

## Tech

- Static SPA: Vite + vanilla JS.
- No database; config in `localStorage`.
- Optional: one Vercel serverless proxy only if the live results endpoint is CORS-blocked.
