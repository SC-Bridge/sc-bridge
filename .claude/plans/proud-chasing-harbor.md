# Standardise Date Formatting + User Timezone Preference

## Context

Dates are displayed inconsistently across the app — some use browser locale, some hardcode `en-NZ`, one is raw text. The user wants a unified format (`YYYY-MMM-DD HH:MM AM/PM TZ`, e.g. `2026-FEB-23 07:09 PM NZDT`) with timezone controlled by a user preference stored server-side.

---

## Approach: IANA Timezones (No DST Toggle)

IANA timezone identifiers (`Pacific/Auckland`, `America/New_York`) are the established standard that handles DST automatically. When a user selects `Pacific/Auckland`, they get NZDT in summer and NZST in winter — no separate toggle needed. If someone wants a fixed offset (no DST), they pick an `Etc/` zone like `Etc/GMT-12`. This is how every major app handles it.

The browser's `Intl.DateTimeFormat` with `formatToParts()` can produce all pieces needed for the target format using zero external libraries.

---

## Files to Create

### 1. `frontend/src/lib/dates.js` — Shared date formatter

Single `formatDate(isoString, timezone)` function using `Intl.DateTimeFormat.formatToParts()`:
- Produces: `2026-FEB-23 07:09 PM NZDT`
- Also export `formatDateOnly(isoString, timezone)` for date-only contexts: `2026-FEB-23`
- Falls back gracefully if `isoString` is null/undefined → returns `'—'`

### 2. `frontend/src/hooks/useTimezone.js` — Timezone preference hook

- Fetches from `GET /api/settings/preferences` on mount
- Caches in React state
- Falls back to `Intl.DateTimeFormat().resolvedOptions().timeZone` (browser default)
- Exports `{ timezone, setTimezone, loading }` where `setTimezone` calls `PUT /api/settings/preferences` and updates local state
- Uses a React context + provider so all components share one fetch

---

## Files to Modify

### 3. `src/routes/settings.ts` — Add preferences endpoints

Add two routes alongside existing LLM config:

- `GET /preferences` — reads all key-value pairs from `user_settings` where `user_id` matches, returns as JSON object (`{ timezone: "Pacific/Auckland" }`)
- `PUT /preferences` — accepts JSON object, upserts each key-value pair into `user_settings`

Already protected by `requireAuth` middleware. Already included in GDPR export and account deletion cascade.

### 4. `frontend/src/hooks/useAPI.js` — Add preferences hooks

- `usePreferences()` — wraps `useAPI('/settings/preferences')`
- `setPreferences(prefs)` — wraps `putJSON('/settings/preferences', prefs)`

### 5. `frontend/src/App.jsx` — Wrap with TimezoneProvider

Wrap the `<Routes>` in a `<TimezoneProvider>` from `useTimezone.js`. One API call on mount, shared by all pages. For unauthenticated users (no session), falls back to browser timezone without hitting the API.

### 6. `frontend/src/pages/Settings.jsx` — Add "Regional" section

New `PanelSection` titled "Regional" with a `Globe` icon, between "Display" and "LLM Provider":
- Searchable timezone input with filtered dropdown (can't use `FilterSelect` — it's a plain `<select>`, unusable with 400 items)
- Built inline: text input filters `Intl.supportedValuesOf('timeZone')`, matching items shown in a styled dropdown below
- Click to select → auto-saves via `PUT /api/settings/preferences`
- Shows live preview of formatted date in chosen timezone
- Default: browser's detected timezone (`Intl.DateTimeFormat().resolvedOptions().timeZone`)

### 7. Update all 6 date display sites

Replace inline `toLocaleString()` / `toLocaleDateString()` with `formatDate()` using the timezone from `useTimezone()`:

| File | Line | Current | Change to |
|------|------|---------|-----------|
| `pages/Account.jsx` | ~765 | `new Date(pk.createdAt).toLocaleDateString()` | `formatDate(pk.createdAt, timezone)` |
| `pages/Account.jsx` | ~867 | `new Date(s.expiresAt).toLocaleString()` | `formatDate(s.expiresAt, timezone)` |
| `pages/Admin.jsx` | ~132 | `new Date(s.started_at).toLocaleString()` | `formatDate(s.started_at, timezone)` |
| `pages/AnalysisHistory.jsx` | ~85-91 | `date.toLocaleString('en-NZ', {...})` | `formatDate(item.created_at, timezone)` |
| `pages/Analysis.jsx` | ~105 | `toLocaleDateString('en-NZ', {...})` | `formatDateOnly(aiTimestamp, timezone)` |
| `pages/UserManagement.jsx` | ~138 | `new Date(u.createdAt).toLocaleDateString()` | `formatDate(u.createdAt, timezone)` |

**Skipped:** `Insurance.jsx:165-169` — `pledge_date` is raw text from HangarXplor (e.g. "January 1, 2024"), not an ISO timestamp. Leave as-is.

---

## No New Dependencies

- Timezone list: `Intl.supportedValuesOf('timeZone')` (browser native)
- Date formatting: `Intl.DateTimeFormat.formatToParts()` (browser native)
- Timezone picker: searchable input built inline (no new component needed)

---

## Verification

1. `npm run build` passes
2. Settings page → Regional section → pick a timezone → see live preview in target format
3. Navigate to Account, Admin, Analysis pages → all dates show in `YYYY-MMM-DD HH:MM AM/PM TZ` format
4. Change timezone in Settings → all dates update
5. Refresh page → timezone persists (loaded from server)
6. New user with no preference → falls back to browser timezone
