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

## Live results

The app fetches live split data from the EDS results site when **Use demo data** is off and a **Bib number** is set.

- **Runner detail URL**: `{baseUrl}index.php?search_type=runner_info&bib={bib}`  
  Example: `http://edsresults.com/2025rr100/index.php?search_type=runner_info&bib=551`
- The app uses **Lap 1–6 Chip Time** only (not gun time), so times reflect when the runner crossed each mat.
- Set **Results page URL** to the race base URL (e.g. `http://edsresults.com/2025rr100/` for 2025; use the 2026 URL when it’s available) and **Bib number** to Aaron’s bib. Turn off **Use demo data** and click **Save & refresh**.
- If the fetch fails (e.g. CORS or network), the app falls back to demo data and shows: *Could not load live results; showing demo data.* In that case, add a Vercel serverless proxy that fetches the runner URL and returns the HTML or parsed JSON.

## Config (stored in browser)

- **Results page URL**: Base URL for the race (e.g. `http://edsresults.com/2025rr100/` for testing).
- **Bib number**: Aaron's bib once assigned (default `TBD`).
- **Use demo data**: When on, the app shows built-in mock splits and ETAs without calling the results site.

## Tech

- Static SPA: Vite + vanilla JS.
- No database; config in `localStorage`.
- Optional: one Vercel serverless proxy only if the live results endpoint is CORS-blocked.
