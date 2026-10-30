# Skin Analysis App

A web app that analyses a person's skin from a face scan and turns the results into a personalised skincare routine. Built for the **YouCam API Skin AI & eCommerce VTO Hackathon** (Perfect Corp, Devpost), Skin AI track.

**Live app:** https://skin-analysis-app-virid.vercel.app
**Author:** Ivy Sweeny (Yvonne Nyaboke Bosire), Computer Science, Kisii University, Kenya
**GitHub:** [Ivy459](https://github.com/Ivy459)

---

## What it does

1. **Scan:** the user takes a photo with their camera or uploads one, after ticking a consent box.
2. **Analyse:** the image goes to the YouCam skin analysis API, which returns skin scores.
3. **Advise:** a routine/advice layer converts the scores into practical skincare steps.
4. **Track:** logged-in users see their results, changes between scans, and history on a dashboard.

No camera, or don't want a scan? Answer a short **skin-type questionnaire** instead. Its answers feed the same routine advice.

## Features

| Area | Details |
|---|---|
| Face scan | Camera capture or image upload, analysed through the YouCam API |
| Scores | Skin analysis scores shown on a results page |
| Routine advice | Personalised routine built from scan scores or questionnaire answers |
| Consent | Required tick-box before the camera or upload is used |
| No-scan option | Skin-type questions that produce the same advice |
| Accounts | Email and password sign up, log in, log out, password reset link |
| Dashboard | Stats, what changed between scans, scan history, delete account |
| Sample result page | Lets judges and visitors see a result without scanning |
| Demo login | Email: `judge@example.com` / Password: `Judge@2026` |

## Tech stack

- **Backend:** Node.js, Express
- **Skin analysis:** YouCam API (Perfect Corp)
- **Database:** Turso (libSQL)
- **Hosting:** Vercel, deployed from GitHub
- **Dev tools:** VS Code, Git/GitHub

## How it was built

1. Core flow working end to end: camera capture, YouCam analysis, scores displayed.
2. Advice/routine layer added on top of the scores.
3. Consent tick-box added before camera/upload.
4. Skin-type questionnaire added for users who skip the scan.
5. Email and password accounts added (sign up, log in, log out).
6. Dashboard added: stats, changes between scans, history, account deletion.
7. Sample result page added.
8. Full local test passed, including a real scan.
9. Project pushed to GitHub (`Ivy459/skin-analysis-app`).
10. Database moved to Turso; sign up, login, questionnaire and reset link verified on it.
11. Deployed to Vercel.

## Run locally

```bash
git clone https://github.com/Ivy459/skin-analysis-app.git
cd skin-analysis-app
npm install
cp .env.example .env     # fill in your own keys
npm start
```

Then open the local address printed in the terminal.

## Environment variables

Set these in `.env` locally and in your Vercel project settings when deployed. Never commit real values.

- YouCam API credentials
- Turso database URL and auth token
- Session/auth secret

`.env.example` lists the exact names.

## Status

**Done:** scan, scores, advice, consent, questionnaire, email accounts, dashboard, sample result, Turso, Vercel deployment.

## Privacy

Scanning requires explicit consent. Users can delete their account and data from the dashboard.

## Hackathon

YouCam API Skin AI & eCommerce VTO Hackathon, deadline **2 Nov 2026**.
