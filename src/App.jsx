import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadModels, detectFaces, detectStill, drawOverlay, averageExpressions, summarizeExpressions, lockDominant, assessFrameQuality, holdThreshold } from './lib/faceEngine.js';
import { rankMemes, EMOTION_META, EMOTION_ORDER, describeFace } from './lib/recommend.js';
import { fetchMemes, fetchHealth, memeUrl, recordEvent, fetchSession } from './lib/memeApi.js';
import { beastFuse, describeVoters } from './lib/beast.js';
import { subscribeRmnStatus, ensureRmn } from './lib/rmnBeast.js';
import { subscribeKuldeepStatus, ensureKuldeep } from './lib/kuldeepBeast.js';
import { fetchOnlineDirect } from './lib/onlineClient.js';
import { assetUrl } from './lib/siteBase.js';

/* ---------- small inline SVG icons (no emoji anywhere in the UI) ---------- */
const Icon = {
  camera: (s = 16) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.2" /></svg>
  ),
  upload: (s = 16) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 16V4m0 0L7 9m5-5l5 5" /><path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2" /></svg>
  ),
  play: (s = 16) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" /></svg>
  ),
  download: (s = 16) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v11m0 0l-4-4m4 4l4-4" /><path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2" /></svg>
  ),
  shuffle: (s = 16) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h4l10 12h4m0 0l-3-3m3 3l-3 3M3 18h4l2.5-3M13.5 9L17 6h4m0 0l-3-3m3 3l-3 3" /></svg>
  ),
  search: (s = 16) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>
  ),
  face: (s = 16) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3" /><circle cx="9.5" cy="10.5" r="1" fill="currentColor" /><circle cx="14.5" cy="10.5" r="1" fill="currentColor" /><path d="M9 15c1 1 2 1.4 3 1.4s2-.4 3-1.4" /></svg>
  ),
  film: (s = 16) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 5v14M17 5v14M3 9.5h4M3 14.5h4M17 9.5h4M17 14.5h4" /></svg>
  ),
  close: (s = 16) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
  ),
  next: (s = 16) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 5l8 7-8 7V5z" /><path d="M15 5v14" /></svg>
  ),
};

function clearOverlay(canvas) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
}

/* What each detected expression pulls from the library (also rendered as a chart). */
const GUIDE = [
  { emotion: 'happy', photo: assetUrl('guide/happy.jpg'), alt: 'Smiling woman', sign: 'Smile, raised cheeks, laughing eyes', mood: 'Happy clips — laughter, dance, celebration' },
  { emotion: 'sad', photo: assetUrl('guide/sad.jpg'), alt: 'Crying child', sign: 'Downturned mouth corners, drooping eyelids, inner brows lifted — a natural frown now reads, no need to overdo it', mood: 'Sad clips — crying, heartbreak, emotional scenes' },
  { emotion: 'angry', photo: assetUrl('guide/angry.jpg'), alt: 'Shouting woman', sign: 'Lowered brows, hard stare, open shout', mood: 'Angry clips — outbursts, scolding, attitude' },
  { emotion: 'surprised', photo: assetUrl('guide/surprised.jpg'), alt: 'Wide-eyed surprised woman', sign: 'Wide eyes, raised brows, open mouth', mood: 'Shock clips — double-takes, disbelief, reactions' },
  { emotion: 'fearful', photo: assetUrl('guide/fearful.jpg'), alt: 'Startled face with wide eyes', sign: 'Tense eyes, frozen stare, stiff face', mood: 'Nervous clips — tension, hesitation, waiting' },
  { emotion: 'disgusted', photo: assetUrl('guide/disgusted.jpg'), alt: 'Bearded man with a disgusted frown', sign: 'Wrinkled nose, lowered brows, curled lip', mood: 'Fed-up clips — dismissal, annoyance, disgust' },
  { emotion: 'neutral', photo: assetUrl('guide/neutral.jpg'), alt: 'Calm man with glasses', sign: 'Relaxed face, no strong cues', mood: 'Dialogue clips — deadpan delivery, scenes, speeches' },
];

function EmotionBars({ faces }) {
  if (!faces?.length) return null;
  const primary = faces[0];
  return (
    <div className="bars" role="list" aria-label="Expression scores">
      {EMOTION_ORDER.map((key) => {
        const v = primary.expressions?.[key] ?? 0;
        const pct = Math.round(v * 100);
        const active = primary.dominant === key;
        return (
          <div className={`bar-row${active ? ' active' : ''}`} role="listitem" key={key}>
            <span className="bar-label">{EMOTION_META[key].label}</span>
            <span className="bar-track"><span className="bar-fill" style={{ width: `${pct}%` }} /></span>
            <span className="bar-pct">{pct}%</span>
          </div>
        );
      })}
    </div>
  );
}

export default function App() {
  const [modelState, setModelState] = useState({ ready: false, msg: 'Starting…', error: '' });
  const [beast, setBeast] = useState({ state: 'idle', progress: 0, error: '' });
  const [kuldeep, setKuldeep] = useState({ state: 'idle', progress: 0, error: '' });
  const [health, setHealth] = useState({ ok: false, count: 0, checked: false });
  const [memes, setMemes] = useState([]);
  const [memesError, setMemesError] = useState('');
  const [memesLoading, setMemesLoading] = useState(true);
  // Online bonus packs (Imgflip classics + Reddit trending + Nepali), merged with local clips
  const [onlineMemes, setOnlineMemes] = useState([]);
  const [onlineLoading, setOnlineLoading] = useState(false);
  const [onlineError, setOnlineError] = useState('');
  const [onlineRound, setOnlineRound] = useState(0);
  const [session, setSession] = useState({ picks: 0, topMood: null });
  // Static hosting (GitHub Pages) has no Express backend: /api/* 404s and the
  // app serves online packs fetched directly in the browser instead.
  const [backendDown, setBackendDown] = useState(false);
  const [directOnline, setDirectOnline] = useState(false);

  const refreshSession = useCallback(() => {
    fetchSession().then(setSession).catch(() => {});
  }, []);

  const [tab, setTab] = useState('webcam');
  const [cameraOn, setCameraOn] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [nextBusy, setNextBusy] = useState(false);
  const [scanCount, setScanCount] = useState(0); // 3-2-1 countdown shown on the Next button
  const [faceError, setFaceError] = useState('');

  // Live scanning state + frozen picture state
  const [liveFaces, setLiveFaces] = useState([]);
  const [quality, setQuality] = useState({ level: 'unknown', hint: '' });
  const [frozen, setFrozen] = useState(null); // { imgUrl, faces, source, at }
  const [currentIdx, setCurrentIdx] = useState(0);
  const [nextMsg, setNextMsg] = useState('');
  const [shareMsg, setShareMsg] = useState('');

  // Hands-free flow: hold one expression steady and the frame freezes itself
  const REQUIRED_STABLE = 3; // live ticks (~0.7s each + detection time ≈ 3s of holding still)
  const [autoCap, setAutoCap] = useState(true);
  const [stability, setStability] = useState({ emotion: null, count: 0 });

  const [uploadUrl, setUploadUrl] = useState('');
  const [uploadName, setUploadName] = useState('');

  const [seed, setSeed] = useState(1);
  const [selected, setSelected] = useState(null);

  const videoRef = useRef(null);
  const liveCanvasRef = useRef(null);
  const frozenImgRef = useRef(null);
  const frozenCanvasRef = useRef(null);
  const uploadImgRef = useRef(null);
  const uploadCanvasRef = useRef(null);
  const streamRef = useRef(null);
  const fileRef = useRef(null);
  const liveBusyRef = useRef(false);
  const exprHistoryRef = useRef([]); // recent live expression readings for smoothing
  const stableRef = useRef({ emotion: null, count: 0 });
  const stageRef = useRef(null);
  const seenRef = useRef(new Set()); // meme ids already played — Next never repeats one
  const pendingIdxRef = useRef(null); // pick computed before frozen updates land
  const prevDominantRef = useRef(null); // anti-flicker lock for the live readout

  /* ---- boot: AI models + meme index ---- */
  useEffect(() => {
    let cancelled = false;
    loadModels((m) => { if (!cancelled) setModelState((s) => ({ ...s, msg: m })); })
      .then(() => { if (!cancelled) setModelState({ ready: true, msg: 'AI ready', error: '' }); })
      .catch((e) => { if (!cancelled) setModelState({ ready: false, msg: '', error: e?.message || 'Could not load face AI models.' }); });
    fetchHealth().then((h) => { if (!cancelled) setHealth({ ok: true, count: h.count, checked: true }); })
      .catch(() => { if (!cancelled) { setHealth({ ok: false, count: 0, checked: true }); setBackendDown(true); } });
    fetchMemes({}).then((d) => {
      if (cancelled) return;
      setMemes(d.memes || []);
      setMemesLoading(false);
    }).catch(() => {
      if (cancelled) return;
      // No backend (static hosting): not an error — serve the cloud video
      // catalog (full library mirrored to the CDN) + online packs below.
      setBackendDown(true);
      fetch(assetUrl('video-catalog.json'))
        .then((r) => (r.ok ? r.json() : []))
        .then((d) => {
          if (cancelled || !Array.isArray(d)) return;
          setMemes(d);
          setMemesLoading(false);
        })
        .catch(() => {
          if (cancelled) return;
          setMemes([]);
          setMemesError('');
          setMemesLoading(false);
        });
    });
    // Warm both neural voters in the background (cached after first visit):
    // RMN 139 MB (strongest) + Kuldeep 5 MB committed ONNX (fast/offline).
    const unsubBeast = subscribeRmnStatus((s) => { if (!cancelled) setBeast(s); });
    ensureRmn().catch(() => { /* offline fallback: Kuldeep + FER + GEO carry the reads */ });
    const unsubKuldeep = subscribeKuldeepStatus((s) => { if (!cancelled) setKuldeep(s); });
    ensureKuldeep().catch(() => { /* offline fallback: RMN + FER + GEO carry the reads */ });
    refreshSession();
    return () => { cancelled = true; unsubBeast(); unsubKuldeep(); };
  }, [refreshSession]);

  /* ---- online bonus packs: backend /api/online first, direct browser fetch
     ---- as the static-hosting fallback (GitHub Pages has no Express server). */
  const loadOnline = useCallback(async (fresh) => {
    setOnlineLoading(true);
    setOnlineError('');
    const mergeMemes = (list) => {
      setOnlineRound((r) => r + 1);
      setOnlineMemes((prev) => {
        const seen = new Set(prev.map((m) => m.url));
        return [...prev, ...(list || []).filter((m) => m.url && !seen.has(m.url))];
      });
    };
    try {
      const res = await fetch(`/api/online?packs=classics,trending,desi,nepali&count=100${fresh ? '&nocache=1' : ''}`);
      if (!res.ok) throw new Error(`Online library failed (${res.status})`);
      const d = await res.json();
      mergeMemes(d.memes);
      if (d.errors?.length) setOnlineError(`Some packs lagged: ${d.errors.join('; ')}`);
      setOnlineLoading(false);
      return;
    } catch {
      // Backend unreachable — fetch packs directly in the browser.
    }
    try {
      const d = await fetchOnlineDirect();
      if (!d.memes.length) throw new Error('no online memes received');
      mergeMemes(d.memes);
      setDirectOnline(true);
      setBackendDown(true);
      if (d.errors?.length) setOnlineError(`Some packs lagged: ${d.errors.join('; ')}`);
    } catch (e) {
      setOnlineError(e?.message || 'Could not load online memes. Check your internet and retry.');
    } finally {
      setOnlineLoading(false);
    }
  }, []);

  // Pull the first online batch automatically once the boot settles — even with
  // zero local clips (static hosting), so the page never sits at "0 memes".
  useEffect(() => {
    if (!memesLoading && onlineRound === 0 && !onlineLoading && !onlineMemes.length) {
      loadOnline(false);
    }
  }, [memesLoading, onlineRound, onlineLoading, onlineMemes.length, loadOnline]);

  const allMemes = useMemo(() => [...memes, ...onlineMemes], [memes, onlineMemes]);
  const nepaliCount = useMemo(() => allMemes.filter((m) => m.tags.includes('nepali')).length, [allMemes]);

  // Deep link: ?meme=<file-or-url> opens that clip straight in the preview player.
  const deepLinkedRef = useRef(false);
  useEffect(() => {
    if (deepLinkedRef.current || !allMemes.length) return;
    deepLinkedRef.current = true;
    try {
      const want = new URLSearchParams(window.location.search).get('meme');
      if (want) {
        const hit = allMemes.find((m) => m.file === want);
        if (hit) setSelected(hit);
      }
    } catch { /* ignore malformed URLs */ }
  }, [allMemes]);

  /* ---- camera lifecycle ---- */
  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks()?.forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
    setLiveFaces([]);
    setQuality({ level: 'unknown', hint: '' });
    prevDominantRef.current = null;
    stableRef.current = { emotion: null, count: 0 };
    setStability({ emotion: null, count: 0 });
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const startCamera = useCallback(async () => {
    setFaceError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, facingMode: 'user' }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setCameraOn(true);
    } catch {
      setFaceError('Camera access was blocked. Allow camera permission in the browser, or use photo upload instead.');
    }
  }, []);

  /* ---- continuous live scan: reads the face several times per second ---- */
  useEffect(() => {
    if (!cameraOn || !modelState.ready || tab !== 'webcam') return;
    let stopped = false;
    const tick = async () => {
      const video = videoRef.current;
      if (stopped || !video || video.videoWidth < 10 || liveBusyRef.current || analyzing || nextBusy) return;
      liveBusyRef.current = true;
      try {
        const raw = await detectFaces(video);
        if (stopped) return;
        const faces = lockDominant(raw, prevDominantRef.current);
        prevDominantRef.current = faces[0]?.dominant ?? null;
        setLiveFaces(faces);
        if (faces.length) {
          const p = faces[0];
          setQuality(assessFrameQuality(video, p.box));
          exprHistoryRef.current = [...exprHistoryRef.current.slice(-5), p.expressions];
          const s = stableRef.current;
          const need = holdThreshold(p.dominant);
          if (p.dominant === s.emotion && p.confidence >= need) {
            s.count += 1;
          } else {
            stableRef.current = { emotion: p.dominant, count: p.confidence >= holdThreshold(p.dominant) ? 1 : 0 };
          }
          setStability({ ...stableRef.current });
          drawOverlay(liveCanvasRef.current, faces, video.videoWidth, video.videoHeight);
        } else {
          stableRef.current = { emotion: null, count: 0 };
          setStability({ emotion: null, count: 0 });
          setQuality({ level: 'unknown', hint: '' });
          clearOverlay(liveCanvasRef.current);
        }
      } catch {
        // transient frame errors are ignored; the loop keeps scanning
      } finally {
        liveBusyRef.current = false;
      }
    };
    tick();
    const id = setInterval(tick, 700);
    return () => { stopped = true; clearInterval(id); };
  }, [cameraOn, modelState.ready, tab, analyzing, nextBusy]);

  /* ---- freeze the live frame into a still picture and match memes ----
     Uses the accurate detector plus recent live readings blended in, so one
     bad frame cannot flip the result. */
  const clickPicture = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !cameraOn) { setFaceError('Start the live scan first.'); return; }
    if (!modelState.ready) { setFaceError('Face AI is still loading. Wait a moment and retry.'); return; }
    if (video.videoWidth < 10) { setFaceError('Camera frame is not ready yet. Wait a second and retry.'); return; }
    setAnalyzing(true);
    setFaceError('');
    setNextMsg('');
    setShareMsg('');
    try {
      const c = document.createElement('canvas');
      c.width = video.videoWidth;
      c.height = video.videoHeight;
      c.getContext('2d').drawImage(video, 0, 0);
      const url = c.toDataURL('image/jpeg', 0.92);
      const img = new Image();
      await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = url; });
      const faces = await detectStill(img, exprHistoryRef.current);
      if (!faces.length) {
        setFaceError('No face in this frame. Face the light, look at the camera and hold still.');
        return;
      }
      // Beast ensemble second opinion (times out fast if the big model isn't warm yet)
      let face = faces[0];
      try {
        const pending = beastFuse({ frameCanvas: c, box: face.box, ferProbs: face.expressions, landmarks: face.landmarks });
        pending.catch(() => {});
        const fused = await Promise.race([
          pending,
          new Promise((resolve) => setTimeout(() => resolve(null), 9000)),
        ]);
        if (fused) face = { ...face, ...fused };
      } catch { /* FER-only reading stands */ }
      setFrozen({ imgUrl: url, faces: [face], source: 'webcam', at: new Date().toLocaleTimeString() });
      seenRef.current = new Set(); // fresh photo starts a fresh no-repeat round
      setCurrentIdx(0);
      recordEvent('freeze', face.dominant);
      refreshSession();
    } catch (e) {
      setFaceError(e?.message || 'Could not analyze this frame.');
    } finally {
      setAnalyzing(false);
    }
  }, [cameraOn, modelState.ready]);

  /* ---- hands-free: a steady expression freezes the frame by itself ---- */
  useEffect(() => {
    if (!autoCap || frozen || analyzing || nextBusy) return;
    if (!cameraOn || !modelState.ready || tab !== 'webcam') return;
    if (stability.emotion && stability.count >= REQUIRED_STABLE) {
      clickPicture();
    }
  });

  /* ---- glide down to the side-by-side stage once the picture is ready ---- */
  useEffect(() => {
    if (!frozen) return;
    const t = setTimeout(() => stageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);
    return () => clearTimeout(t);
  }, [frozen]);

  const retake = useCallback(() => {
    setFrozen(null);
    setCurrentIdx(0);
    setNextMsg('');
    setShareMsg('');
    setFaceError('');
    seenRef.current = new Set();
    pendingIdxRef.current = null;
    prevDominantRef.current = null;
    recordEvent('retake');
    refreshSession();
  }, [refreshSession]);

  const onFilePicked = useCallback((file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setFaceError('Please choose an image file (JPG or PNG).'); return; }
    setFaceError('');
    setUploadName(file.name);
    const url = URL.createObjectURL(file);
    if (uploadUrl) URL.revokeObjectURL(uploadUrl);
    setUploadUrl(url);
    retake();
  }, [uploadUrl, retake]);

  const analyzeUpload = useCallback(async () => {
    const img = uploadImgRef.current;
    if (!img || !uploadUrl) { setFaceError('Choose a photo first.'); return; }
    if (!modelState.ready) { setFaceError('Face AI is still loading. Wait a moment and retry.'); return; }
    setAnalyzing(true);
    setFaceError('');
    setNextMsg('');
    try {
      // Uploads get the full still pipeline (SSD + beast ensemble), same as
      // webcam freezes — the old Tiny/FER-only path under-read sad badly.
      const still = await detectStill(img, []);
      if (!still.length) {
        setFaceError('No face found in this photo. Try a clearer, front-facing picture.');
      } else {
        let face = still[0];
        try {
          const c = document.createElement('canvas');
          c.width = img.naturalWidth;
          c.height = img.naturalHeight;
          c.getContext('2d').drawImage(img, 0, 0);
          const pending = beastFuse({ frameCanvas: c, box: face.box, ferProbs: face.expressions, landmarks: face.landmarks });
          pending.catch(() => {});
          const fused = await Promise.race([
            pending,
            new Promise((resolve) => setTimeout(() => resolve(null), 9000)),
          ]);
          if (fused) face = { ...face, ...fused };
        } catch { /* FER-only reading stands */ }
        const faces = [face, ...still.slice(1)];
        setFrozen({ imgUrl: uploadUrl, faces, source: 'upload', at: new Date().toLocaleTimeString() });
        setCurrentIdx(0);
        recordEvent('freeze', face.dominant);
        refreshSession();
        requestAnimationFrame(() => drawOverlay(uploadCanvasRef.current, faces, img.naturalWidth, img.naturalHeight));
      }
    } catch (e) {
      setFaceError(e?.message || 'Detection failed.');
    } finally {
      setAnalyzing(false);
    }
  }, [uploadUrl, modelState.ready]);

  /* ---- ranking basis: frozen picture first, else the live scan ---- */
  const livePrimary = liveFaces[0] ?? null;
  const frozenPrimary = frozen?.faces?.[0] ?? null;
  const basis = frozenPrimary ?? livePrimary;

  const ranked = useMemo(() => rankMemes(allMemes, basis ? {
    expressions: basis.expressions,
    dominant: basis.dominant,
    secondary: basis.secondary,
    age: basis.age,
    gender: basis.gender,
  } : null, seed), [allMemes, basis, seed]);

  // Restart from the top pick whenever the match basis changes —
  // unless Next already computed the exact pick (applied here, after frozen lands).
  useEffect(() => {
    if (pendingIdxRef.current != null) {
      setCurrentIdx(pendingIdxRef.current);
      pendingIdxRef.current = null;
    } else {
      setCurrentIdx(0);
    }
  }, [seed, frozen, allMemes]);

  const currentMeme = ranked.length ? ranked[currentIdx % ranked.length] : null;

  /* ---- Next: 3-second live re-scan, fresh photo, then a never-repeated meme
     matching the fresh reading. ---- */
  const handleNext = useCallback(async () => {
    if (!frozen) { setFaceError('Click a picture first, then use Next.'); return; }
    if (!ranked.length) return;
    setFaceError('');
    const jumpUp = () => stageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const video = videoRef.current;
    if (!(tab !== 'upload' && cameraOn && video && video.videoWidth >= 10 && modelState.ready)) {
      setNextMsg('Camera is off — photo and meme unchanged. Start the live scan to re-scan your face.');
      jumpUp();
      return;
    }
    setNextBusy(true);
    try {
      const samples = [];
      for (let s = 3; s >= 1; s--) {
        setScanCount(s);
        setNextMsg(`Scanning your face… ${s}`);
        try {
          const faces = await detectFaces(video);
          if (faces.length) {
            samples.push(faces[0].expressions);
            setLiveFaces(faces);
            drawOverlay(liveCanvasRef.current, faces, video.videoWidth, video.videoHeight);
          }
        } catch {
          // one bad frame must not kill the 3-second scan
        }
        if (s > 1) await new Promise((r) => setTimeout(r, 1000));
      }
      if (!samples.length) {
        setNextMsg('No face seen during the scan — photo and meme unchanged. Face the camera and try again.');
        return;
      }
      const summary = summarizeExpressions(averageExpressions(samples));
      // Fresh photo frame from the live feed
      const c = document.createElement('canvas');
      c.width = video.videoWidth;
      c.height = video.videoHeight;
      c.getContext('2d').drawImage(video, 0, 0);
      const url = c.toDataURL('image/jpeg', 0.92);
      const img = new Image();
      await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = url; });
      const still = await detectStill(img, samples);
      if (!still.length) {
        setNextMsg(`Re-scanned ${summary.dominant}, but the fresh frame lost your face — photo and meme unchanged.`);
        return;
      }
      // Frozen reading carries the averaged scan result, so ranking stays consistent
      let freshFace = { ...still[0], ...summary };
      try {
        const pending = beastFuse({ frameCanvas: c, box: still[0].box, ferProbs: summary.expressions, landmarks: still[0].landmarks });
        pending.catch(() => {});
        const fused = await Promise.race([
          pending,
          new Promise((resolve) => setTimeout(() => resolve(null), 12000)),
        ]);
        if (fused) {
          freshFace = { ...still[0], ...fused };
          summary.dominant = fused.dominant;
          summary.confidence = fused.confidence;
        }
      } catch { /* FER-based fresh face stands */ }
      const newBasis = {
        expressions: summary.expressions,
        dominant: summary.dominant,
        secondary: summary.secondary,
        age: still[0].age,
        gender: still[0].gender,
      };
      const freshRanked = rankMemes(allMemes, newBasis, seed);
      const seen = seenRef.current;
      seen.add(ranked[currentIdx % ranked.length]?.id);
      let pool = freshRanked.filter((m) => m.emotion === summary.dominant && !seen.has(m.id));
      if (!pool.length) {
        // Whole mood played through — start a new round of it
        seen.clear();
        pool = freshRanked.filter((m) => m.emotion === summary.dominant);
      }
      const pick = pool[0] ?? freshRanked[0];
      seen.add(pick.id);
      pendingIdxRef.current = Math.max(0, freshRanked.findIndex((m) => m.id === pick.id));
      setFrozen({ imgUrl: url, faces: [freshFace], source: 'webcam', at: new Date().toLocaleTimeString() });
      const pct = Math.round(summary.confidence * 100);
      setNextMsg(`Re-scanned: ${summary.dominant} (${pct}%) — new photo, fresh ${EMOTION_META[summary.dominant]?.label} meme (${seen.size} played).`);
      recordEvent('next', summary.dominant);
      refreshSession();
    } finally {
      setNextBusy(false);
      setScanCount(0);
    }
    jumpUp();
  }, [frozen, ranked, currentIdx, allMemes, seed, tab, cameraOn, modelState.ready]);

  /* ---- Separate control for swapping the clip instantly (also never repeats). ---- */
  const skipMeme = useCallback(() => {
    if (!ranked.length) return;
    setFaceError('');
    const seen = seenRef.current;
    const cur = currentIdx % ranked.length;
    seen.add(ranked[cur]?.id);
    let target = ranked.findIndex((m, i) => i !== cur && !seen.has(m.id));
    if (target < 0) {
      seen.clear(); // everything played — new round
      target = (cur + 1) % ranked.length;
      seen.add(ranked[cur]?.id);
    }
    seen.add(ranked[target]?.id);
    setCurrentIdx(target);
    setNextMsg('Skipped to a different clip — no repeat.');
    recordEvent('skip');
    refreshSession();
    stageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [ranked, currentIdx, refreshSession]);

  const readingFaces = frozen?.faces ?? (liveFaces.length ? liveFaces : null);

  /* ---- share the staged meme: native share sheet, else a replay link ---- */
  const memeLink = (m) => `${window.location.origin}${window.location.pathname}?meme=${encodeURIComponent(m.file)}`;

  const copyMemeLink = useCallback(async (m) => {
    try {
      await navigator.clipboard.writeText(memeLink(m));
      setShareMsg('Replay link copied — opening it on this machine replays this exact clip.');
    } catch {
      setShareMsg('Could not copy. Use Save clip instead.');
    }
    recordEvent('share');
    refreshSession();
    setTimeout(() => setShareMsg(''), 5000);
  }, [refreshSession]);

  const shareMeme = useCallback(async (m) => {
    setShareMsg('');
    const safeName = m.source === 'online'
      ? `facememe-${String(m.id).replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}${/\.mp4$/i.test(m.url) ? '.mp4' : '.jpg'}`
      : m.file;
    try {
      const res = await fetch(memeUrl(m));
      const blob = await res.blob();
      const file = new File([blob], safeName, { type: blob.type || (m.media === 'image' ? 'image/jpeg' : 'video/mp4') });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: m.title, text: `My FaceMeme match: ${m.title}` });
        recordEvent('share');
        refreshSession();
        return;
      }
      if (navigator.share) {
        await navigator.share({ title: m.title, text: `My FaceMeme match: ${m.title}`, url: memeLink(m) });
        recordEvent('share');
        refreshSession();
        return;
      }
    } catch (e) {
      if (e?.name === 'AbortError') return; // user dismissed the sheet
    }
    copyMemeLink(m);
  }, [copyMemeLink, refreshSession]);

  return (
    <div className="page">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">{Icon.face(20)}</span>
            <span>
              <strong>FaceMeme Finder</strong>
              <small>Expression-matched clips from your local library</small>
            </span>
          </div>
          <div className="topbar-meta">
            <span className={`status-dot${health.ok ? ' ok' : ''}`} aria-hidden="true" />
            <span className="status-text">
              {health.checked
                ? (health.ok
                  ? `${memes.length} local${onlineMemes.length ? ` + ${onlineMemes.length} online` : ''} clips`
                  : (allMemes.length
                    ? `${memes.length ? `${memes.length} cloud + ` : ''}${onlineMemes.length} online clips (static demo)`
                    : 'Library offline — retry'))
                : 'Connecting to library…'}
            </span>
            <span className={`ai-pill${modelState.ready ? ' ready' : ''}`}>
              {modelState.error ? 'AI failed'
                : !modelState.ready ? 'Loading AI…'
                : beast.state === 'ready' && kuldeep.state === 'ready' ? 'Beast 4-voter ready'
                : beast.state === 'loading' ? `Beast RMN ${Math.round((beast.progress || 0) * 100)}%`
                : kuldeep.state === 'loading' ? `Kuldeep CNN ${Math.round((kuldeep.progress || 0) * 100)}%`
                : kuldeep.state === 'ready' ? 'Kuldeep CNN ready'
                : 'On-device AI ready'}
            </span>
          </div>
        </div>
      </header>

      <main className="layout">
        <section className="intro">
          <h1>Show your face, get your meme.</h1>
          <p>
            Start the live scan and hold an expression for a few seconds — the app freezes
            the frame by itself, glides down, and plays your photo side by side with the
            matching meme. Press <strong>Next</strong> any time to re-scan your face
            for 3 seconds — your photo refreshes too — and get a freshly matched meme,
            or <strong>Different meme</strong> to swap instantly.
            Share any pick with the system share sheet or a replay
            link. Nothing is uploaded anywhere.
          </p>
        </section>

        {!modelState.ready && !modelState.error && (
          <div className="notice" role="status">
            <span className="spinner" aria-hidden="true" />
            <span>{modelState.msg || 'Loading face AI models…'} (first load takes a few seconds)</span>
          </div>
        )}
        {modelState.error && (
          <div className="notice error" role="alert">
            <strong>Face AI could not start.</strong>
            <span>{modelState.error} Check that <code>public/models</code> exists and reload.</span>
          </div>
        )}

        <section className="grid-2">
          {/* ------- live scan panel ------- */}
          <div className="card">
            <div className="card-head">
              <h2>1. Live scan</h2>
              <div className="tabs" role="tablist" aria-label="Input source">
                <button role="tab" aria-selected={tab === 'webcam'} className={tab === 'webcam' ? 'active' : ''} onClick={() => setTab('webcam')}>Webcam</button>
                <button role="tab" aria-selected={tab === 'upload'} className={tab === 'upload' ? 'active' : ''} onClick={() => setTab('upload')}>Photo upload</button>
              </div>
            </div>

            {tab === 'webcam' ? (
              <div>
                <div className="media-frame">
                  <video ref={videoRef} playsInline muted className="media" aria-label="Live webcam scan" />
                  <canvas ref={liveCanvasRef} className="overlay" aria-hidden="true" />
                  {!cameraOn && <div className="media-empty">Live scan is off. Start it and your face is read continuously.</div>}
                  {cameraOn && (
                    <span className="live-badge" aria-label="Live scanning">
                      <span className="live-dot" aria-hidden="true" />
                      LIVE{livePrimary ? ` · ${EMOTION_META[livePrimary.dominant]?.label} ${Math.round(livePrimary.confidence * 100)}%` : ' · looking for a face…'}
                    </span>
                  )}
                  {cameraOn && quality.hint && (
                    <span className={`signal-badge ${quality.level}`} role="status">{quality.hint}</span>
                  )}
                </div>
                <div className="btn-row">
                  {!cameraOn
                    ? <button className="btn primary" onClick={startCamera}>{Icon.camera()} Start live scan</button>
                    : <button className="btn" onClick={stopCamera}>Stop scan</button>}
                  <button className="btn primary" onClick={() => clickPicture()} disabled={!cameraOn || analyzing || !modelState.ready}>
                    {Icon.camera()} {analyzing ? 'Reading frame…' : 'Click picture'}
                  </button>
                  <label className="toggle" title="Freeze the frame automatically when one expression holds steady">
                    <input type="checkbox" checked={autoCap} onChange={(e) => setAutoCap(e.target.checked)} />
                    Auto-freeze
                  </label>
                </div>
                {cameraOn && !frozen && autoCap && (
                  <div className="stability" role="status" aria-label="Auto-freeze progress">
                    <span className="stability-label">
                      {stability.count > 0 && stability.emotion
                        ? `Holding ${stability.emotion}… ${Math.min(stability.count, REQUIRED_STABLE)}/${REQUIRED_STABLE}`
                        : 'Show an expression and hold it still…'}
                    </span>
                    <span className="stability-track">
                      <span className="stability-fill" style={{ width: `${Math.min(100, (stability.count / REQUIRED_STABLE) * 100)}%` }} />
                    </span>
                  </div>
                )}
                <p className="hint">Hands-free: hold one expression steady for a few seconds and the picture clicks itself. Prefer manual? Untick Auto-freeze and use Click picture.</p>
              </div>
            ) : (
              <div>
                <div
                  className="dropzone"
                  onClick={() => fileRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); onFilePicked(e.dataTransfer.files?.[0]); }}
                  role="button" tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') fileRef.current?.click(); }}
                  aria-label="Choose a photo"
                >
                  <span className="drop-icon">{Icon.upload(22)}</span>
                  <strong>{uploadName || 'Choose a photo or drop it here'}</strong>
                  <small>JPG or PNG, front-facing works best</small>
                  <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => onFilePicked(e.target.files?.[0])} />
                </div>
                {uploadUrl && (
                  <div className="media-frame" style={{ marginTop: 12 }}>
                    <img ref={uploadImgRef} src={uploadUrl} alt="Uploaded face" className="media" crossOrigin="anonymous" />
                    <canvas ref={uploadCanvasRef} className="overlay" aria-hidden="true" />
                  </div>
                )}
                <div className="btn-row">
                  <button className="btn primary" onClick={analyzeUpload} disabled={!uploadUrl || analyzing || !modelState.ready}>
                    {Icon.face()} {analyzing ? 'Analyzing…' : 'Use this photo'}
                  </button>
                </div>
              </div>
            )}
            {faceError && <div className="field-error" role="alert">{faceError}</div>}
          </div>

          {/* ------- reading panel ------- */}
          <div className="card">
            <div className="card-head">
              <h2>2. Face reading</h2>
              {frozen && <span className="muted small">Frozen at {frozen.at} · {frozen.source}</span>}
              {!frozen && cameraOn && <span className="muted small">Live</span>}
            </div>
            {!readingFaces ? (
              <div className="empty-analysis">
                <span className="empty-icon">{Icon.face(28)}</span>
                <strong>{tab === 'webcam' ? 'Start the live scan' : 'No reading yet'}</strong>
                <p>{tab === 'webcam'
                  ? 'Your expression is read continuously with per-emotion confidence. Click a picture to freeze the frame and get your side-by-side meme.'
                  : 'Pick a photo and choose “Use this photo”. The model reports the dominant expression with confidence, plus an age and gender estimate used only to phrase the match.'}</p>
                <ol className="steps">
                  <li>Load the on-device AI (automatic).</li>
                  <li>Start the live scan and hold one expression — the frame freezes itself.</li>
                  <li>Scroll-free: the page glides to your photo and meme. Next runs a 3-second face scan, refreshes your photo, and shows a fresh never-repeated meme; Different meme swaps instantly; Share sends it on.</li>
                </ol>
              </div>
            ) : (
              <div>
                <div className="mood-card">
                  <div>
                    <span className="eyebrow">{frozen ? 'Frozen expression' : 'Live expression'}</span>
                    <strong className="mood">{EMOTION_META[readingFaces[0].dominant]?.label} · {Math.round(readingFaces[0].confidence * 100)}%</strong>
                    <p className="muted">{describeFace(readingFaces[0])}</p>
                    {readingFaces[0].uncertain && (
                      <p className="muted small">Low-confidence read — hold still, face the light, and move a little closer.</p>
                    )}
                    <p className="muted small">{EMOTION_META[readingFaces[0].dominant]?.hint} Runner-up: {EMOTION_META[readingFaces[0].secondary]?.label} ({Math.round(readingFaces[0].secondaryScore * 100)}%).</p>
                    {frozen?.faces?.[0]?.voters && (
                      <p className="muted small">Ensemble: {describeVoters(frozen.faces[0].voters)}{!frozen.faces[0].rmnUsed || !frozen.faces[0].kuldeepUsed ? ` (${[!frozen.faces[0].rmnUsed ? 'RMN warming up' : null, !frozen.faces[0].kuldeepUsed ? 'KUL warming up' : null].filter(Boolean).join(', ')})` : ''}</p>
                    )}
                    {readingFaces.length > 1 && (
                      <p className="muted small">{readingFaces.length} faces detected — ranking uses the largest face.</p>
                    )}
                  </div>
                  <dl className="attr">
                    <div><dt>Age estimate</dt><dd>{readingFaces[0].age}</dd></div>
                    <div><dt>Gender est.</dt><dd>{readingFaces[0].genderProbability > 0.6 ? readingFaces[0].gender : 'uncertain'}</dd></div>
                    <div><dt>Faces</dt><dd>{readingFaces.length}</dd></div>
                  </dl>
                </div>
                <EmotionBars faces={readingFaces} />
                <div className="btn-row">
                  <button className="btn" onClick={() => setSeed((s) => s + 1)}>{Icon.shuffle()} Shuffle suggestions</button>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ------- online bonus library: classics + trending + Nepali ------- */}
        <section className="online-bar" aria-label="Online meme library">
          <span className="online-info">
            <strong>{allMemes.length} memes total</strong>
            <span className="muted small">{memes.length} {backendDown ? 'cloud' : 'local'} · {onlineMemes.length} online{directOnline ? ' (direct)' : ''} · {nepaliCount} Nepali{backendDown && !allMemes.length ? ' · static demo' : ''}</span>
            {session.picks > 0 && (
              <span className="muted small">Session: {session.picks} pic{session.picks === 1 ? 'k' : 'ks'}{session.topMood ? ` · top ${session.topMood}` : ''}</span>
            )}
          </span>
          {onlineLoading
            ? <span className="muted small" role="status">Fetching fresh online memes…</span>
            : <button className="btn small" onClick={() => loadOnline(true)}>Load more online memes</button>}
        </section>
        {onlineError && onlineMemes.length === 0 && <div className="notice error slim" role="alert">{onlineError}</div>}

        {/* ------- side-by-side stage ------- */}
        {frozen && currentMeme && (
          <section className="card stage" ref={stageRef} aria-label="Your picture and the matching meme">
            <div className="card-head wrap">
              <h2>3. You and your meme — side by side</h2>
              <span className="muted small">Pick {currentIdx + 1} of {ranked.length}{frozenPrimary ? ` · ${EMOTION_META[frozenPrimary.dominant]?.label}` : ''} match{currentMeme?.source === 'online' ? ' · online' : ''}</span>
            </div>
            <div className="stage-grid">
              <figure className="stage-item">
                <div className="media-frame light">
                  <img
                    ref={frozenImgRef}
                    src={frozen.imgUrl}
                    alt="Your frozen expression"
                    className="media"
                    onLoad={(e) => {
                      const el = e.currentTarget;
                      if (frozen?.faces?.length && el.naturalWidth) {
                        drawOverlay(frozenCanvasRef.current, frozen.faces, el.naturalWidth, el.naturalHeight);
                      }
                    }}
                  />
                  <canvas ref={frozenCanvasRef} className="overlay" aria-hidden="true" />
                </div>
                <figcaption>
                  <strong>Your picture</strong>
                  <span className="muted small">{frozenPrimary ? describeFace(frozenPrimary) : ''}</span>
                </figcaption>
              </figure>
              <figure className="stage-item">
                <div className="media-frame">
                  {currentMeme.media === 'image' ? (
                    <img src={memeUrl(currentMeme)} alt={currentMeme.title} className="media contain" loading="lazy" />
                  ) : (
                    <video key={currentMeme.file} src={memeUrl(currentMeme)} className="media" controls autoPlay loop playsInline />
                  )}
                </div>
                <figcaption>
                  <strong>{currentMeme.title}</strong>
                  <span className="meme-reason">{basis ? currentMeme.reason : `${EMOTION_META[currentMeme.emotion]?.label} clip`}</span>
                  <span className="meme-tags">
                    <span className="tag">{EMOTION_META[currentMeme.emotion]?.label}</span>
                    {currentMeme.secondary && <span className="tag dim">also {currentMeme.secondary}</span>}
                    {currentMeme.actor && <span className="tag dim">{currentMeme.actor}</span>}
                    {currentMeme.source === 'online' && <span className="tag dim">online</span>}
                    {currentMeme.tags.includes('nepali') && <span className="tag dim">nepali</span>}
                  </span>
                </figcaption>
              </figure>
            </div>
            <div className="btn-row">
              <button className="btn primary" onClick={handleNext} disabled={nextBusy || !ranked.length}>
                {Icon.next()} {nextBusy ? `Scanning… ${scanCount}` : 'Next'}
              </button>
              <button className="btn" onClick={skipMeme} disabled={!ranked.length || nextBusy}>Different meme</button>
              <button className="btn" onClick={retake} disabled={nextBusy}>Retake picture</button>
              <button className="btn" onClick={() => setSelected(currentMeme)}>{Icon.play()} Fullscreen preview</button>
              <button className="btn" onClick={() => shareMeme(currentMeme)}>{Icon.upload()} Share</button>
              <button className="btn" onClick={() => copyMemeLink(currentMeme)}>Copy replay link</button>
              {currentMeme.source === 'online'
                ? <a className="btn" href={memeUrl(currentMeme)} target="_blank" rel="noreferrer">{Icon.download()} Open original</a>
                : <a className="btn" href={memeUrl(currentMeme)} download={currentMeme.file}>{Icon.download()} Save clip</a>}
            </div>
            {nextMsg && <p className="next-msg" role="status">{nextMsg}</p>}
            {shareMsg && <p className="share-msg" role="status">{shareMsg}</p>}
            <p className="hint">How it works: <strong>Next</strong> re-scans your face for 3 seconds, refreshes your photo, then shows a fresh meme of that mood — never a repeat until the whole mood has played. <strong>Different meme</strong> swaps instantly without scanning.</p>
          </section>
        )}

        {/* ------- results ------- */}
        {(memesLoading || memesError) && (
          <section className="card results">
            {memesLoading && <p className="muted">Loading local meme index…</p>}
            {memesError && <div className="notice error">Meme library error: {memesError}. Reload the page.</div>}
          </section>
        )}

        {/* ------- expression guide: what your face triggers ------- */}
        <section className="card guide" aria-label="Expression guide">
          <div className="card-head">
            <h2>4. Expression guide — what your face triggers</h2>
          </div>
          <p className="muted small guide-sub">Match your face to a photo, hold it through the 3-second scan, and that mood's memes play. The live badge names what the AI sees in real time.</p>
          <div className="guide-rows">
            {GUIDE.map((g) => (
              <div className="guide-row" key={g.emotion}>
                <img src={g.photo} alt={g.alt} className="guide-photo" loading="lazy"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                <span className="guide-text">
                  <span className="tag">{EMOTION_META[g.emotion]?.label}</span>
                  <span className="guide-sign">{g.sign}</span>
                  <span className="guide-mood"><span className="guide-arrow" aria-hidden="true">→</span> {g.mood}</span>
                </span>
              </div>
            ))}
          </div>
          <p className="muted small guide-credit">Guide photos: Flickr contributors (CC) · surprise photo: Wikimedia Commons. Detector: ResMaskingNet + Kuldeep FER CNN + FER + landmark-geometry ensemble.</p>
        </section>

        <section className="how">
          <div><strong>Private by design</strong><p>Face detection runs in this browser with locally served model weights. Photos never leave the machine.</p></div>
          <div><strong>How matching works</strong><p>Every frozen face gets four votes — ResMaskingNet (ICPR 2020, ONNX), the Kuldeep FER CNN 48x48 (ONNX, committed in git), the calibrated FER classifier, and a landmark-geometry voter — fused into one reading, then matched against Hindi/Hinglish-aware meme tags. Next runs a 3-second live scan and shows a freshly matched meme; Different meme swaps instantly.</p></div>
          <div><strong>Your files stay yours, online packs on top</strong><p>Local clips stream from the <code>video meme</code> folder; the counter above merges in keyless online packs — Imgflip classics, Reddit trending and Nepali memes. Add or remove local MP4s and refresh the index.</p></div>
        </section>
      </main>

      <footer className="footer">
        <span>FaceMeme Finder · React + on-device face AI · Local library only</span>
        <span className="muted">{Icon.film(14)} MP4 clips served over HTTP range requests for instant scrubbing</span>
      </footer>

      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)} role="presentation">
          <div className="modal" role="dialog" aria-modal="true" aria-label={selected.title} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <strong>{selected.title}</strong>
              <button className="icon-btn" onClick={() => setSelected(null)} aria-label="Close preview">{Icon.close()}</button>
            </div>
            {selected.media === 'image' ? (
              <img src={memeUrl(selected)} alt={selected.title} className="modal-video" />
            ) : (
              <video src={memeUrl(selected)} controls autoPlay playsInline className="modal-video" />
            )}
            <div className="modal-meta">
              <span className="tag">{EMOTION_META[selected.emotion]?.label}</span>
              {selected.secondary && <span className="tag dim">also {selected.secondary}</span>}
              {selected.actor && <span className="tag dim">{selected.actor}</span>}
              {selected.source === 'online' && <span className="tag dim">online</span>}
              {selected.tags.map((t) => <span key={t} className="tag dim">{t}</span>)}
            </div>
            {basis && selected.matchPercent != null && <p className="muted small">Why this clip: {selected.reason}.</p>}
            <div className="btn-row">
              <button className="btn primary" onClick={() => shareMeme(selected)}>{Icon.upload()} Share</button>
              <a className="btn primary" href={memeUrl(selected)} download={selected.file}>{Icon.download()} Download clip</a>
              <button className="btn" onClick={() => setSelected(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
