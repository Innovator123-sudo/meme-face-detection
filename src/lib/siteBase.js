/* Base-aware URLs so the app works under a subpath (GitHub Pages project
   site: /meme-face-detection/) as well as at the domain root (local dev,
   Render). Vite injects import.meta.env.BASE_URL from vite.config.js `base`.
   API routes (/api/*) intentionally stay root-relative — they only exist on
   the Express backend, and Pages has none (calls fail gracefully there). */

export const SITE_BASE = import.meta.env.BASE_URL || '/';

/** Join the site base with a public-asset path, e.g. assetUrl('models') or assetUrl('ort/'). */
export function assetUrl(p = '') {
  const base = SITE_BASE.endsWith('/') ? SITE_BASE : `${SITE_BASE}/`;
  const clean = String(p).replace(/^\/+/, '');
  return clean ? `${base}${clean}` : base;
}
