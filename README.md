# meme-face-detection — FaceMeme Finder

[![ci](https://github.com/Innovator123-sudo/meme-face-detection/actions/workflows/ci.yml/badge.svg)](https://github.com/Innovator123-sudo/meme-face-detection/actions/workflows/ci.yml)

React + Vite website that reads your facial expression on-device and recommends
funny memes — local video clips from a `video meme` folder (set `MEME_DIR`)
plus keyless online packs (Imgflip classics, Reddit trending, Nepali memes).
No emojis, no gradient-heavy styling — plain, professional UI with a dedicated
mobile layout.

## Deploy (Render, one click)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Innovator123-sudo/meme-face-detection)

1. Push this repo to GitHub (already configured) and click **Deploy to Render**
   (or use `render.yaml` as a Blueprint). Build: `npm ci && npm run build`,
   start: `npm start`, health check: `/api/health`.
2. Or with Docker: `docker build -t facememe .` then
   `docker run -p 3001:3001 -e MEME_DIR=/memes -v /path/to/clips:/memes facememe`.

Notes:

- The 139 MB ResMaskingNet weights (`public/rmn/resmasking_int8.onnx`, MIT,
  via [phamquiluan/ResidualMaskingNetwork](https://huggingface.co/phamquiluan/ResidualMaskingNetwork))
  are **not in git** (GitHub 100 MB limit) — `postinstall`
  (`scripts/setup-models.mjs`) downloads them once; the app runs without them
  (Kuldeep + FER + geometry fallback) if the download fails. ORT wasm files are copied
  from the installed `onnxruntime-web` npm package the same way.
- The Kuldeep FER CNN (`public/kuldeep/kuldeep_fer48.onnx`, ~5 MB, converted
  from [kuldeepstechwork/Face-Expression-Recognition-using-Deep-Learning](https://github.com/kuldeepstechwork/Face-Expression-Recognition-using-Deep-Learning)
  `model.h5`) **is in git** — it loads fast/offline as the Beast's second neural voter.
  Verify with `npm run verify:kuldeep`.
- With no `MEME_DIR` videos present (typical on a host), the app serves the
  online packs only and reports it on `/api/health` — face detection still
  works fully.
- GitHub Pages (static, no backend) serves the full 356-clip library mirrored
  to the CDN (`public/videos/`, ~192 MB) plus 30 classic images, listed by the
  cloud catalog `public/video-catalog.json`, plus online packs fetched directly
  in the browser (`src/lib/onlineClient.js`) — face matching works end to end,
  and ranking prefers video clips (+0.15 video bonus in `src/lib/recommend.js`).
  Nothing is read from local files at runtime.
- Local dev: `npm install` (fetches models) then `npm run dev`
  (http://localhost:5173), or `npm run build` + `npm start`
  (http://localhost:3001, single-server production mode).

## How it works

1. **Library (`memeIndex.js` + `/api/*`)** — local MP4s are tagged
   (happy / sad / angry / surprised / fearful / disgusted / neutral, secondary
   mood, actor, energy, Nepali flags) from filenames with Hindi/Hinglish-aware
   keywords. `/api/online` adds ~700 keyless online memes per load (Imgflip
   classics, Reddit trending/funny/dank, desi subs, Nepali subs), classified
   with the same tagger. Served by Express in prod, by a Vite dev plugin in dev.
   Static hosting (no backend) instead loads the committed `public/desi-800.json`
   catalog — 800+ Hindi + Nepali memes harvested from desi subs (`node
   scripts/build-desi-800.mjs` refreshes it) — plus packs fetched directly in
   the browser.
2. **Face AI (in-browser)** — `@vladmandic/face-api` + TensorFlow.js runs five
   model sets served locally from `public/models`: fast + accurate face detectors,
   68-point landmarks, FER-trained 7-channel expression classifier, age + gender.
   Stills blend the accurate SSD read with recent live frames; auto-freeze needs
   ~3 consistent readings. Nothing is uploaded; photos and webcam frames stay local.
3. **Recommendation (`src/lib/recommend.js`)** — expression probabilities are
   compared against each meme's tags with an energy bonus. Each pick shows a match
   percent and a plain-text reason.

## How it works

1. **Backend (`server.js`)** — Express serves the `video meme` folder at `/memes`
   with HTTP range support, plus `/api/memes` with titles, emotion tags
   (happy / sad / angry / surprised / fearful / disgusted / neutral), actor,
   energy level and file size derived from filenames.
2. **Face AI (in-browser)** — `@vladmandic/face-api` + TensorFlow.js runs four
   models served locally from `public/models`: tiny face detector, 68-point
   landmarks, 7-channel expression classifier, age + gender estimator.
   Nothing is uploaded; photos and webcam frames stay on this machine.
3. **Recommendation (`src/lib/recommend.js`)** — expression probabilities are
   compared against each clip's emotion tag, with an energy bonus and a
   deterministic shuffle seed for variety. Each tile shows a match percent
   and a plain-text reason.

## Run it (one command)

```powershell
cd C:\Users\Samrat\Desktop\ollama\face-meme-app
npm run dev
```

Open http://localhost:5173. The Vite dev server serves the meme API,
video files and AI weights directly from this machine, so no second
terminal is needed. The top bar should show `local clips connected`
and `On-device AI ready`.

Production single-server mode (`npm run build` then `npm start`,
http://localhost:3001) still works and is the fastest option.

## Use — fully hands-free if you want it

- **Live scan tab** — Start the live scan. Your face is read continuously
  (overlay boxes + live emotion badge). Hold one expression steady for about
  **3 seconds** and the frame **freezes itself** — watch the hold-steady meter
  fill. Prefer manual? Untick Auto-freeze and use Click picture.
- **Online bar** — Shows the merged total (`357 local + N online`, Nepali count
  included) with a **Load more online memes** button that keeps topping the
  library up toward 700+.
- **Side-by-side stage** — The page glides down to your frozen picture playing
  next to the top meme (local video or online image). Press **Next** to re-scan
  your live face for 3 seconds (3-2-1 countdown, several frames averaged):
  your photo refreshes too, and a fresh never-repeated meme of that mood shows
  up (each mood plays through fully before repeating). Press **Different meme**
  to swap instantly without scanning. **Retake picture** starts over.
- **Mood wall** — every top match for the detected mood (up to 12 video-first
  picks) in a tap-to-play grid under the stage, so one 85% happy read plays a
  whole wall of clips, not a single meme.
- **Download / Share side-by-side** — both capture one PNG with your frozen
  expression on the left and the staged meme on the right (current video frame
  for clips). Sharing attaches that PNG plus a replay link (`?meme=...`) that
  pops the exact meme open in the preview player when tapped.
- **Expression guide** — A photo chart under the stage shows real people making
  each of the 7 readable expressions, the facial signs to copy, and the meme
  mood each triggers (`public/guide/`, bundled with the app).

## Backend: scaled workflow (no second server needed)

`npm run dev` and `npm start` serve the identical API (shared `memeIndex.js` +
`apiExtras.js`; `GET /api` prints the route map):

- **Instant boots** — the local index builds once and auto-rebuilds when MP4s
  are added/removed (folder watcher); online packs persist in `.cache/` for
  6 hours, so restarts and repeat loads answer in milliseconds.
- **Background prewarm** — each boot refreshes the online cache without
  blocking the first request.
- **Resilient fetching** — upstream calls retry once, dead subreddits are
  buried for 12h instead of retried every load, failures degrade to partial
  packs (never a 500 without memes).
- **Paging** — `/api/memes` supports `limit` + `offset` for 1000+ item
  libraries; JSON responses are gzip-compressed.
- **Observability** — `/api/health` (count + uptime), `/api/stats` (emotion
  breakdown, cache age, session summary), per-request `/api` logging, and
  `POST /api/events` session telemetry (freeze/next/skip/share/retake + mood,
  capped in memory). The UI shows a session chip in the online bar.
- **Hardening** — security headers, JSON body limits, filename traversal
  guards, immutable caching on model weights, friendly error when the port is
  busy (`EADDRINUSE` tells you exactly what to do).

## Face AI accuracy notes (the Beast ensemble)

Every frozen face gets four independent votes, fused late (RMN 0.38 / Kuldeep 0.24 / FER 0.22 / geometry 0.16):

- **ResMaskingNet** (phamquiluan, ICPR 2020, MIT) — the strongest of your four
  repos on FER2013 (74–77%). Runs locally as the official `resmasking_int8.onnx`
  via onnxruntime-web; the 139 MB file is downloaded once by `postinstall`
  (not stored in git) and caches in the browser after the first visit.
  Warm-up progress shows in the top bar.
  Verified headlessly (`npm run verify:beast`, YuNet crops + RMN on the 7 guide
  photos): angry 94%, happy 92%, sad 99%, surprised 88% correct. Known limit:
  disgust is FER2013's hardest class (~500 training samples vs ~7000 happy),
  so the ensemble leans on the FER + geometry voters there.
- **Kuldeep FER CNN** ([kuldeepstechwork](https://github.com/kuldeepstechwork/Face-Expression-Recognition-using-Deep-Learning),
  FER2013 7-emotion CNN, 48x48 grayscale, 1.3M params) — converted from `model.h5`
  to `public/kuldeep/kuldeep_fer48.onnx` (~5 MB, ONNX opset 13, committed to git)
  so it loads fast and works offline on first visit. Same tight-box + `/255`
  preprocessing as its `main.py`. Verified (`npm run verify:kuldeep`, TF vs ONNX
  parity 4.5e-08, guide-photo smoke test).
- **FER classifier** (`@vladmandic/face-api`) — calibrated against its neutral
  bias (sad 1.32x, fearful/disgusted/angry ~1.12x, neutral 0.62x), with
  runner-up promotion (weak neutral < 0.60 loses to any felt emotion > 0.18),
  a dedicated **sad-rescue** (sad within 0.22 of a neutral/fearful/disgusted
  top read is promoted), sad-aware anti-flicker lock (felt emotions break a
  neutral lock freely), per-emotion auto-freeze thresholds (sad needs 0.22,
  not 0.30), and a live signal meter (low light / too far).
- **Landmark-geometry voter** — the amineHorseman idea (facial geometry as
  signal): mouth corners, mouth openness, inner-brow raise (AU1 grief-brow),
  brow lowering, and eyelid droop from the 68-point mesh voting happy, sad,
  angry, surprised, fearful, disgusted, neutral.
- **Sad corroboration** — measured headlessly that Kuldeep reads an obvious
  crying face only sad 25% vs neutral 39%, so the nets can't carry sad alone:
  when geometry is strongly sad (≥0.40) AND any neural net also senses sad
  (≥0.18), sad gets +0.10 pre-fusion and the UI reports "sad corroborated".
  Never fires on geometry alone, so grins can't flip. Locked by
  `node scripts/test-beast-fusion.mjs` (7 checks).
- Live scanning fuses FER + geometry every tick (no extra cost — landmarks
  are already computed), so sad shows in the LIVE badge, not just after
  freezing. Stills use the accurate SSD detector (0.35) with the frozen read
  weighted 60% over recent live frames; auto-freeze needs ~3 consistent
  readings; uncertain reads say so. Photo uploads go through the same
  SSD + beast pipeline as webcam freezes.
- Regression-locked: `npm run test:accuracy` (15 checks — classic/subtle
  sad misses, sad-vs-fearful confusion, happy/neutral non-regression,
  lock/hold/still-blend behaviour, synthetic-frown geometry vote).

Honest status on the other three repos: WuJie1010's weights live only on Google
Drive as PyTorch-0.2-era checkpoints (won't convert reliably), EmoPy needs a
TF1-era training run (no shippable weights), and amineHorseman ships no weights
at all — so the beast fuses RMN's real network with FER ideas from all of them
(EmoPy-style temporal context = our multi-frame averaging).
- **Share** — Share opens the system share sheet with the actual file
  (mobile) or falls back to a replay link (`?meme=...`) you can copy; Save
  downloads local clips, online items open the original.
- **Photo upload tab** — Alternative without a camera: drop a JPG/PNG, choose
  **Use this photo**. Next reports that the camera is off and keeps the meme.

Mobile gets a dedicated layout: stacked cards, full-width touch buttons,
full-screen preview sheet, compact emotion bars.

## Face AI accuracy notes

- Stills are read with the accurate SSD detector; live scanning uses the fast
  Tiny detector. The frozen reading blends the still with your last live
  frames, and auto-freeze only fires after ~5 consistent readings — single
  jittery frames cannot flip the result.
- Expression weights are the open-source FER-trained classifier shipped with
  `@vladmandic/face-api` (GitHub), loaded from local `public/models` with a
  CDN mirror as fallback.

## Change the meme folder

Default is `../video meme` relative to the app. Override:

```powershell
$env:MEME_DIR="D:\other\memes"; npm run server
```

Then refresh the index: `POST /api/refresh`.

## Files

- `server.js` — meme classification + static video/API server
- `src/App.jsx` — full UI (capture, analysis, results, player modal)
- `src/lib/faceEngine.js` — model loading, detection, canvas overlay
- `src/lib/beast.js` — 4-voter late fusion (RMN + Kuldeep + FER + geometry)
- `src/lib/kuldeepBeast.js` — Kuldeep FER CNN ONNX loader (48x48 grayscale)
- `src/lib/rmnBeast.js` — ResMaskingNet ONNX loader (224x224)
- `src/lib/recommend.js` — expression-to-meme ranking
- `src/lib/onlineClient.js` — backend-free online packs (Imgflip + meme-api.com) for static hosting
- `src/lib/memeApi.js` — API client
- `scripts/build-video-catalog.mjs` — regenerates `public/video-catalog.json` (`npm run video-catalog`)
- `public/models/` — local face-AI weights (offline capable)
- `public/videos/` + `public/sample-images/` + `public/video-catalog.json` — full library mirrored to the CDN for GitHub Pages (356 video + 30 image)
- `public/models/` — local face-AI weights (offline capable)
- `public/kuldeep/kuldeep_fer48.onnx` — committed Kuldeep voter (~5 MB)
