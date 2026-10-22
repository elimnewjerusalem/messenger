# ENJC Messenger (WhatsApp click-to-chat sender)

Static PWA. No server, no build step.

## Put it online (GitHub Pages)
1. Copy this whole folder into a new repo (e.g. `enjc-messenger`) with GitHub Desktop.
2. Push. In the repo: Settings > Pages > Deploy from branch > `main` / root.
3. Open the Pages URL on the phone, then Chrome menu > Install app.

## Contacts file
Excel (.xlsx) or CSV, first row = headers:
`Number, Name` (required) and optional `Group, Area, Language, Birthday`.
- Many groups in one cell: `Youth, Choir`
- Birthday as day-month: `15-03`
- 10-digit numbers get 91 added; spaces are fine.

## Privacy
Contacts are saved only in that phone's browser storage. Do NOT commit your contacts file to the repo.

## Updating
After changing any file, bump `VERSION` in `sw.js` so phones refresh.
