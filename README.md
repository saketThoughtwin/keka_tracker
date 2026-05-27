# Keka Tracker

Personal dashboard: **hours complete (inside office)** and **remaining**, refreshed every **30 seconds**, using your Keka tokens and the **`summary`** API from the Keka web app.

## Which Keka API to use?

From your Network tab (Fetch/XHR), you only need **one main endpoint**:

| Priority | Name in Network tab | Purpose |
|----------|---------------------|---------|
| **Required** | `summary` | Today's worked + remaining hours (what Keka shows on attendance) |
| Optional | `attendancesettings` / `trackingpolicy` | Only if you need to read shift length instead of `KEKA_TARGET_HOURS` |
| Not needed for v1 | `collect`, `upcoming`, `policy`, `shiftweekoffdetails`, etc. | UI metadata, not hour totals |

## Setup

1. Copy env file:

   ```bash
   cp .env.example .env.local
   ```

2. In Keka (logged in), open **DevTools → Network → Fetch/XHR**.

3. Click the **`summary`** request:
   - Copy **Request URL** → set `KEKA_BASE_URL` + `KEKA_SUMMARY_PATH`
   - Copy **Authorization** bearer token → `KEKA_ACCESS_TOKEN` (temporary until refresh works)

4. Find a **`connect/token`** (or similar) refresh request:
   - Copy `refresh_token` into `.env.local`
   - If your access token expires and auto-refresh stops working, then also copy `client_id` and `client_secret`
   - Copy token URL → `KEKA_TOKEN_URL`

5. If the summary request has extra headers (Origin, Referer, etc.), add them to `KEKA_EXTRA_HEADERS` as JSON.

6. Run:

   ```bash
   npm install
   npm run dev
   ```

Open [http://localhost:3000](http://localhost:3000).

Refreshed tokens are saved in `.keka-tokens.json` (gitignored).

## Troubleshooting

- **401 / 403**: Wrong or expired token — update `KEKA_ACCESS_TOKEN`. If tokens expire and refresh doesn’t work, add `KEKA_CLIENT_ID` / `KEKA_CLIENT_SECRET`.
- **404 on summary**: `KEKA_SUMMARY_PATH` must match DevTools exactly.
- **Wrong hours**: Open summary **Response** in DevTools; if field names differ, we auto-detect common names — set `KEKA_TARGET_HOURS` to your shift length (e.g. `9`).
