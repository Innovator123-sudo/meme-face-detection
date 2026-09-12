import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildMemeIndex, queryMemes, resolveMemeDir, fetchOnlineCached } from './memeIndex.js'
import {
  apiLogger, securityHeaders, uptimeSec, recordServerEvent,
  sessionSummary, readJsonBody, API_MAP,
} from './apiExtras.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
// Same folder the Express server uses: C:\Users\Samrat\Desktop\ollama\video meme
const MEME_DIR = resolveMemeDir(__dirname)
const CACHE_DIR = process.env.CACHE_DIR || path.join(__dirname, '.cache')

/**
 * Dev-only plugin so `npm run dev` works WITHOUT starting the backend.
 * - Serves /api/health and /api/memes straight from the local video folder.
 * - Streams /memes/*.mp4 with HTTP Range support for scrubbing.
 * - /models/* is already served by Vite from public/models, no proxy needed.
 */
function memeDevPlugin() {
  let cache = null
  const getIndex = () => (cache ??= buildMemeIndex(MEME_DIR))
  let lastOnlineMeta = { count: 0, at: 0, cached: false }

  const json = (res, status, obj) => {
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(obj))
  }

  const serveVideo = (req, res, filePath) => {
    let stat
    try {
      stat = fs.statSync(filePath)
      if (!stat.isFile()) throw new Error('not a file')
    } catch {
      res.statusCode = 404
      res.end('Not found')
      return
    }
    const total = stat.size
    res.setHeader('Accept-Ranges', 'bytes')
    res.setHeader('Content-Type', 'video/mp4')
    res.setHeader('Cache-Control', 'public, max-age=86400')
    res.setHeader('Access-Control-Allow-Origin', '*')

    if (req.method === 'HEAD') {
      res.setHeader('Content-Length', total)
      res.statusCode = 200
      res.end()
      return
    }

    const range = req.headers.range
    if (!range) {
      res.setHeader('Content-Length', total)
      res.statusCode = 200
      fs.createReadStream(filePath).pipe(res)
      return
    }
    const m = /bytes=(\d*)-(\d*)/.exec(range)
    let start = m && m[1] ? parseInt(m[1], 10) : 0
    let end = m && m[2] ? parseInt(m[2], 10) : total - 1
    if (Number.isNaN(start) || start >= total) start = 0
    if (Number.isNaN(end) || end >= total) end = total - 1
    if (start > end) [start, end] = [0, total - 1]
    res.statusCode = 206
    res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`)
    res.setHeader('Content-Length', end - start + 1)
    fs.createReadStream(filePath, { start, end }).pipe(res)
  }

  return {
    name: 'local-meme-library',
    configureServer(server) {
      const idx = getIndex()
      console.log(`[face-meme] dev library: ${MEME_DIR} (${idx.memes?.length ?? 0} clips)`)
      if (idx.missing) console.warn(`[face-meme] WARNING: meme folder not found: ${MEME_DIR}`)

      // Auto-rebuild the index when clips are added/removed while running
      try {
        fs.watch(MEME_DIR, (event, name) => {
          if (name && /\.mp4$/i.test(String(name))) {
            cache = null
            console.log(`[face-meme] library changed — index rebuilds on next request`)
          }
        })
      } catch { /* folder missing — /api/health reports it */ }

      // Background prewarm so first loads skip the upstream wait
      setImmediate(async () => {
        try {
          const payload = await fetchOnlineCached({ cacheDir: CACHE_DIR })
          lastOnlineMeta = { count: payload.count, at: payload.at || Date.now(), cached: !!payload.cached }
          console.log(`[face-meme] online cache warm: ${payload.count} bonus memes`)
        } catch (e) {
          console.log(`[face-meme] online prewarm skipped (${e?.message || e})`)
        }
      })

      server.middlewares.use(apiLogger)
      server.middlewares.use(securityHeaders)
      server.middlewares.use(async (req, res, next) => {
        const url = req.url || '/'
        if (url === '/api' || url.startsWith('/api?')) {
          return json(res, 200, API_MAP)
        }
        if (url === '/api/health' || url.startsWith('/api/health?')) {
          const i = getIndex()
          return json(res, 200, { ok: true, memeDir: MEME_DIR, exists: fs.existsSync(MEME_DIR), count: i.memes.length, uptimeSec: uptimeSec(), mode: 'vite-dev' })
        }
        if (url.startsWith('/api/memes')) {
          const i = getIndex()
          if (i.missing) return json(res, 500, { error: `Meme folder not found: ${MEME_DIR}` })
          const u = new URL(url, 'http://localhost')
          return json(res, 200, queryMemes(i.memes, Object.fromEntries(u.searchParams)))
        }
        if (url === '/api/refresh' || url.startsWith('/api/refresh?')) {
          cache = buildMemeIndex(MEME_DIR)
          return json(res, 200, { ok: true, count: cache.memes.length })
        }
        if (url.startsWith('/api/online')) {
          const u = new URL(url, 'http://localhost')
          const packs = String(u.searchParams.get('packs') || 'classics,trending,desi,nepali').split(',').map((s) => s.trim()).filter(Boolean)
          const count = Math.min(Number(u.searchParams.get('count')) || 100, 100)
          const nocache = u.searchParams.get('nocache') === '1'
          try {
            const payload = await fetchOnlineCached({ packs, count, nocache, cacheDir: CACHE_DIR })
            lastOnlineMeta = { count: payload.count, at: payload.at || Date.now(), cached: !!payload.cached }
            return json(res, 200, payload)
          } catch (e) {
            return json(res, 502, { error: `Online packs unreachable: ${e?.message || e}`, memes: [], total: 0, count: 0 })
          }
        }
        if ((url === '/api/events' || url.startsWith('/api/events?')) && req.method === 'POST') {
          try {
            const body = await readJsonBody(req)
            if (!recordServerEvent(body?.type, body?.mood)) return json(res, 400, { error: 'unknown event type' })
            return json(res, 200, { ok: true })
          } catch {
            return json(res, 400, { error: 'invalid JSON body' })
          }
        }
        if (url === '/api/stats' || url.startsWith('/api/stats?')) {
          const i = getIndex()
          const emotions = {}
          for (const m of i.memes) emotions[m.emotion] = (emotions[m.emotion] || 0) + 1
          return json(res, 200, {
            uptimeSec: uptimeSec(),
            local: { count: i.memes.length, emotions },
            online: lastOnlineMeta,
            session: sessionSummary(),
          })
        }
        if (url.startsWith('/memes/')) {
          if (req.method !== 'GET' && req.method !== 'HEAD') {
            res.statusCode = 405
            return res.end('Method not allowed')
          }
          const raw = url.slice('/memes/'.length).split('?')[0]
          let name = ''
          try {
            name = decodeURIComponent(raw)
          } catch {
            res.statusCode = 400
            return res.end('Bad filename')
          }
          const filePath = path.normalize(path.join(MEME_DIR, name))
          if (!filePath.startsWith(path.normalize(MEME_DIR)) || !/\.mp4$/i.test(filePath)) {
            res.statusCode = 403
            return res.end('Forbidden')
          }
          return serveVideo(req, res, filePath)
        }
        return next()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  // Project Pages serves under /meme-face-detection/; local dev + Render stay at /.
  base: process.env.GITHUB_PAGES === '1' ? '/meme-face-detection/' : '/',
  plugins: [react(), memeDevPlugin()],
  server: {
    port: 5173,
    strictPort: true,
  },
})
