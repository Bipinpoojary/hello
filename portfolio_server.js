#!/usr/bin/env node
/**
 * Single-file portfolio and booking website for a freelancing video editor.
 * - No external dependencies. Run with: `node portfolio_server.js`
 * - Data persisted in `data.json` in the same directory
 * - Videos: add/delete entries via URL (YouTube/Vimeo/direct mp4)
 * - Booking: date, time, event type, shoot type, duration, location, notes
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const HOST = process.env.HOST || '0.0.0.0';
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

/** Load or initialize persistent state */
function loadState() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed.videos || !Array.isArray(parsed.videos)) parsed.videos = [];
    if (!parsed.bookings || !Array.isArray(parsed.bookings)) parsed.bookings = [];
    return parsed;
  } catch (e) {
    return { videos: [], bookings: [] };
  }
}

function saveState(state) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2), 'utf8');
}

/** Utility: Read request body JSON safely */
function readJsonBody(req, maxSizeBytes = 1_000_000) {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > maxSizeBytes) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      body += chunk;
    });
    req.on('end', () => {
      try {
        const parsed = body ? JSON.parse(body) : {};
        resolve(parsed);
      } catch (err) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

/** Simple router */
function sendJson(res, status, data) {
  const payload = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload)
  });
  res.end(payload);
}

function sendText(res, status, text, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': contentType });
  res.end(text);
}

function isYouTubeUrl(u) {
  try {
    const url = new URL(u);
    return (
      url.hostname.includes('youtube.com') ||
      url.hostname.includes('youtu.be')
    );
  } catch {
    return false;
  }
}

function isVimeoUrl(u) {
  try {
    const url = new URL(u);
    return url.hostname.includes('vimeo.com');
  } catch {
    return false;
  }
}

function detectVideoKind(u) {
  if (isYouTubeUrl(u)) return 'youtube';
  if (isVimeoUrl(u)) return 'vimeo';
  // naive check for direct video file
  if (/\.(mp4|webm|ogg|m3u8)(\?|#|$)/i.test(u)) return 'file';
  return 'embed';
}

function serveIndexHtml(res) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Video Editor Portfolio & Booking</title>
  <link rel="icon" href="data:," />
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/styles.css" />
  <meta name="description" content="Portfolio and booking website for a freelancing video editor." />
  <meta name="color-scheme" content="light dark" />
  <script>window.__APP_CONFIG__ = { }</script>
  <script defer src="/app.js"></script>
  <style>
    /* Inline critical styles for faster first paint */
    body { font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; margin: 0; }
  </style>
  <meta property="og:title" content="Video Editor Portfolio & Booking" />
  <meta property="og:description" content="Browse my work and book your shoot." />
  <meta property="og:type" content="website" />
  <meta name="theme-color" content="#111827" />
  <script type="application/ld+json">{
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "name": "Freelance Video Editor",
    "url": "http://localhost:${PORT}/",
    "description": "Professional video editing and production services.",
    "areaServed": "Worldwide",
    "serviceType": "Video editing, event coverage, corporate, social media"
  }</script>
  <style id="deferred-css"></style>
  <script>
    // Defer non-critical CSS
    const css = `:root{--bg:linear-gradient(135deg,#0f172a,#111827);--accent:#6ee7b7;--muted:#9ca3af;--panel:#0b1220;--ring:rgba(110,231,183,0.35)}html,body{height:100%}body{background:var(--bg);color:#e5e7eb;}
    .container{max-width:1100px;margin:0 auto;padding:24px}
    header{display:flex;gap:16px;align-items:center;justify-content:space-between;padding:16px 0}
    .brand{display:flex;align-items:center;gap:12px}
    .brand .logo{width:40px;height:40px;border-radius:8px;background:radial-gradient(80% 80% at 25% 20%, #34d399, transparent),radial-gradient(90% 90% at 80% 70%, #2563eb, transparent);box-shadow:0 0 24px rgba(52,211,153,0.3)}
    .brand h1{font-size:20px;margin:0;font-weight:700;letter-spacing:0.3px}
    nav{display:flex;gap:12px;flex-wrap:wrap}
    nav a{color:#cbd5e1;text-decoration:none;padding:8px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.02)}
    nav a:hover{border-color:rgba(255,255,255,0.18)}
    .hero{display:grid;grid-template-columns:1.2fr 1fr;gap:24px;align-items:center;padding:16px 0}
    .hero h2{font-size:36px;margin:0 0 8px}
    .hero p{color:var(--muted);margin:0 0 16px}
    .cta{display:flex;gap:12px}
    .btn{background:#10b981;color:#0b1220;border:none;padding:10px 14px;border-radius:10px;font-weight:700;cursor:pointer;box-shadow:0 6px 20px rgba(16,185,129,0.25)}
    .btn.secondary{background:transparent;color:#e5e7eb;border:1px solid rgba(255,255,255,0.15)}
    .panel{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:16px}
    .section-title{font-size:18px;margin:0 0 12px}
    .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
    .card{background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);border-radius:14px;overflow:hidden}
    .thumb{aspect-ratio:16/9;background:#111827;display:grid;place-items:center}
    .thumb iframe,.thumb video{width:100%;height:100%}
    .card .info{padding:12px}
    .muted{color:var(--muted)}
    .toolbar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}
    input,select,textarea{background:#0b1220;border:1px solid rgba(255,255,255,0.12);color:#e5e7eb;border-radius:10px;padding:10px}
    input:focus,select:focus,textarea:focus{outline:none;box-shadow:0 0 0 4px var(--ring)}
    form .row{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
    form .row-3{grid-template-columns:repeat(3,1fr)}
    form .row-4{grid-template-columns:repeat(4,1fr)}
    form .row-1{grid-template-columns:1fr}
    .danger{background:#ef4444;color:white}
    .footer{color:#9ca3af;font-size:13px;text-align:center;padding:28px 0}
    .pill{display:inline-block;padding:2px 8px;border-radius:999px;border:1px solid rgba(255,255,255,0.12);color:#cbd5e1;font-size:12px}
    .rowgap{display:grid;gap:12px}
    @media (max-width: 960px){.hero{grid-template-columns:1fr}.grid{grid-template-columns:1fr 1fr}}
    @media (max-width: 640px){.grid{grid-template-columns:1fr}nav{display:none}}
    `;
    document.getElementById('deferred-css').textContent = css;
  </script>
</head>
<body>
  <div class="container">
    <header>
      <div class="brand">
        <div class="logo"></div>
        <h1>Freelance Video Editor</h1>
      </div>
      <nav>
        <a href="#portfolio">Portfolio</a>
        <a href="#booking">Book a Shoot</a>
        <a href="#manage">Manage</a>
      </nav>
    </header>

    <section class="hero panel">
      <div>
        <h2>Capture your story. I make it cinematic.</h2>
        <p>Event highlights, weddings, brand films, social media content, documentaries, and more. Browse my work and book your date.</p>
        <div class="cta">
          <a class="btn" href="#booking">Book now</a>
          <a class="btn secondary" href="#portfolio">See portfolio</a>
        </div>
      </div>
      <div class="panel">
        <div class="toolbar">
          <input id="search" placeholder="Search by title or tag" />
          <select id="filterType">
            <option value="">All types</option>
            <option value="youtube">YouTube</option>
            <option value="vimeo">Vimeo</option>
            <option value="file">Direct file</option>
            <option value="embed">Other embed</option>
          </select>
          <button class="btn" id="refreshBtn">Refresh</button>
        </div>
        <div id="stats" class="muted"></div>
      </div>
    </section>

    <section id="portfolio" class="panel">
      <h3 class="section-title">Portfolio</h3>
      <div id="videoGrid" class="grid"></div>
    </section>

    <section id="booking" class="panel rowgap">
      <div>
        <h3 class="section-title">Book a Shoot</h3>
        <div class="muted">Pick date, time, type of event, and share details. I will confirm availability via email.</div>
      </div>
      <form id="bookingForm" class="rowgap">
        <div class="row row-3">
          <input required name="name" placeholder="Your full name" />
          <input required type="email" name="email" placeholder="Email" />
          <input name="phone" placeholder="Phone (optional)" />
        </div>
        <div class="row row-4">
          <input required type="date" name="date" />
          <input required type="time" name="time" />
          <select required name="event_type">
            <option value="Wedding">Wedding</option>
            <option value="Corporate">Corporate</option>
            <option value="Social">Social/Influencer</option>
            <option value="Music">Music Video</option>
            <option value="Documentary">Documentary</option>
            <option value="Other">Other</option>
          </select>
          <select required name="shoot_type">
            <option value="Filming + Editing">Filming + Editing</option>
            <option value="Editing Only">Editing Only</option>
            <option value="Color/Audio">Color/Audio</option>
            <option value="Consultation">Consultation</option>
          </select>
        </div>
        <div class="row row-3">
          <input type="number" name="duration_hours" min="1" max="48" placeholder="Estimated duration (hours)" />
          <input name="location" placeholder="Location / City" />
          <input name="budget" type="number" min="0" step="50" placeholder="Budget (optional)" />
        </div>
        <div class="row row-1">
          <textarea name="notes" rows="4" placeholder="Project details, references, deliverables"></textarea>
        </div>
        <div>
          <button class="btn" type="submit">Submit booking request</button>
          <span id="bookingStatus" class="muted" style="margin-left:10px"></span>
        </div>
      </form>
    </section>

    <section id="manage" class="panel rowgap">
      <div>
        <h3 class="section-title">Manage Portfolio</h3>
        <div class="muted">Add new videos by URL (YouTube, Vimeo, or direct mp4). Delete entries as needed.</div>
      </div>
      <form id="addVideoForm" class="rowgap">
        <div class="row row-3">
          <input required name="title" placeholder="Title" />
          <input name="tags" placeholder="Tags (comma-separated)" />
          <input required name="url" placeholder="Video URL (YouTube/Vimeo/mp4)" />
        </div>
        <div class="row row-1">
          <textarea name="description" rows="3" placeholder="Short description (optional)"></textarea>
        </div>
        <div>
          <button class="btn" type="submit">Add video</button>
          <span id="addVideoStatus" class="muted" style="margin-left:10px"></span>
        </div>
      </form>
      <div id="manageList" class="grid"></div>
    </section>

    <div class="footer">© <span id="year"></span> Freelance Video Editor — Built as a single-file app, data stored locally.</div>
  </div>
</body>
</html>`;
  sendText(res, 200, html, 'text/html; charset=utf-8');
}

function serveStyles(res) {
  const css = `/* Additional styles if needed; most are injected inline */`;
  sendText(res, 200, css, 'text/css; charset=utf-8');
}

function serveAppJs(res) {
  const js = `(() => {
  const $ = (sel, el=document) => el.querySelector(sel);
  const $$ = (sel, el=document) => Array.from(el.querySelectorAll(sel));

  const videoGrid = document.getElementById('videoGrid');
  const manageList = document.getElementById('manageList');
  const search = document.getElementById('search');
  const filterType = document.getElementById('filterType');
  const stats = document.getElementById('stats');
  const refreshBtn = document.getElementById('refreshBtn');
  const yearEl = document.getElementById('year');
  yearEl.textContent = new Date().getFullYear();

  function escapeHtml(str='') {
    return str.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
  }

  function formatTags(tags) {
    if (!tags) return '';
    return tags.split(',').map(t => t.trim()).filter(Boolean).map(t => `<span class="pill">${escapeHtml(t)}</span>`).join(' ');
  }

  function youtubeEmbed(url) {
    try {
      const u = new URL(url);
      let id = '';
      if (u.hostname.includes('youtu.be')) {
        id = u.pathname.slice(1);
      } else {
        id = u.searchParams.get('v') || '';
      }
      if (!id) return null;
      return `https://www.youtube.com/embed/${id}`;
    } catch { return null; }
  }

  function vimeoEmbed(url) {
    try {
      const u = new URL(url);
      const parts = u.pathname.split('/').filter(Boolean);
      const id = parts[0];
      if (!id) return null;
      return `https://player.vimeo.com/video/${id}`;
    } catch { return null; }
  }

  function renderThumb(video) {
    const kind = video.kind;
    if (kind === 'youtube') {
      const embed = youtubeEmbed(video.url);
      if (embed) return `<iframe src="${embed}" frameborder="0" allowfullscreen></iframe>`;
    }
    if (kind === 'vimeo') {
      const embed = vimeoEmbed(video.url);
      if (embed) return `<iframe src="${embed}" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>`;
    }
    if (kind === 'file') {
      return `<video controls preload="metadata"><source src="${escapeHtml(video.url)}"></video>`;
    }
    // generic embed fallback
    return `<iframe src="${escapeHtml(video.url)}" frameborder="0" allowfullscreen></iframe>`;
  }

  function renderPortfolio(videos) {
    videoGrid.innerHTML = videos.map(v => `
      <div class="card">
        <div class="thumb">${renderThumb(v)}</div>
        <div class="info">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
            <strong>${escapeHtml(v.title || 'Untitled')}</strong>
            <span class="pill">${escapeHtml(v.kind)}</span>
          </div>
          <div class="muted" style="margin:6px 0 8px">${escapeHtml(v.description || '')}</div>
          <div>${formatTags(v.tags || '')}</div>
        </div>
      </div>
    `).join('');
  }

  function renderManage(videos) {
    manageList.innerHTML = videos.map(v => `
      <div class="card">
        <div class="thumb">${renderThumb(v)}</div>
        <div class="info">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
            <div>
              <strong>${escapeHtml(v.title || 'Untitled')}</strong>
              <span class="muted" style="margin-left:6px">#${v.id}</span>
            </div>
            <button class="btn danger" data-delete-id="${v.id}">Delete</button>
          </div>
          <div class="muted" style="margin:6px 0 8px">${escapeHtml(v.description || '')}</div>
          <div style="display:flex;gap:8px;align-items:center"><span class="pill">${escapeHtml(v.kind)}</span>${formatTags(v.tags || '')}</div>
        </div>
      </div>
    `).join('');

    $$("[data-delete-id]").forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.getAttribute('data-delete-id');
        if (!confirm('Delete this video?')) return;
        await fetch('/api/videos/' + id, { method: 'DELETE' });
        await refresh();
      });
    });
  }

  async function fetchVideos() {
    const q = new URLSearchParams({
      q: search.value || '',
      kind: filterType.value || ''
    });
    const res = await fetch('/api/videos?' + q.toString());
    const data = await res.json();
    return data;
  }

  async function refresh() {
    const { videos, total } = await fetchVideos();
    renderPortfolio(videos);
    renderManage(videos);
    stats.textContent = total + ' video' + (total === 1 ? '' : 's');
  }

  search.addEventListener('input', refresh);
  filterType.addEventListener('change', refresh);
  refreshBtn.addEventListener('click', refresh);

  // Add video form
  const addVideoForm = document.getElementById('addVideoForm');
  const addVideoStatus = document.getElementById('addVideoStatus');
  addVideoForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(addVideoForm);
    const payload = Object.fromEntries(fd.entries());
    addVideoStatus.textContent = 'Adding…';
    const res = await fetch('/api/videos', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      addVideoStatus.textContent = 'Added';
      addVideoForm.reset();
      await refresh();
      setTimeout(() => addVideoStatus.textContent = '', 1200);
    } else {
      const err = await res.json().catch(() => ({}));
      addVideoStatus.textContent = err.error || 'Failed';
    }
  });

  // Booking form
  const bookingForm = document.getElementById('bookingForm');
  const bookingStatus = document.getElementById('bookingStatus');
  bookingForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(bookingForm);
    const payload = Object.fromEntries(fd.entries());
    // Simple validation
    if (!payload.name || !payload.email || !payload.date || !payload.time) {
      bookingStatus.textContent = 'Please fill required fields';
      return;
    }
    bookingStatus.textContent = 'Submitting…';
    const res = await fetch('/api/bookings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (res.ok) {
      bookingStatus.textContent = 'Request submitted. I will reach out soon!';
      bookingForm.reset();
      setTimeout(() => bookingStatus.textContent = '', 2500);
    } else {
      const err = await res.json().catch(() => ({}));
      bookingStatus.textContent = err.error || 'Failed';
    }
  });

  // Initial load
  refresh();
})();`;
  sendText(res, 200, js, 'application/javascript; charset=utf-8');
}

/** API Handlers */
function handleGetVideos(req, res, urlObj, state) {
  const q = (urlObj.searchParams.get('q') || '').toLowerCase();
  const kind = (urlObj.searchParams.get('kind') || '').toLowerCase();
  let videos = state.videos.slice().sort((a, b) => b.created_at - a.created_at);
  const total = videos.length;
  if (q) {
    videos = videos.filter(v =>
      (v.title || '').toLowerCase().includes(q) ||
      (v.description || '').toLowerCase().includes(q) ||
      (v.tags || '').toLowerCase().includes(q)
    );
  }
  if (kind) {
    videos = videos.filter(v => (v.kind || '').toLowerCase() === kind);
  }
  sendJson(res, 200, { videos, total });
}

async function handlePostVideo(req, res, state) {
  try {
    const body = await readJsonBody(req);
    const title = (body.title || '').trim();
    const url = (body.url || '').trim();
    const description = (body.description || '').trim();
    const tags = (body.tags || '').trim();
    if (!title || !url) return sendJson(res, 400, { error: 'Title and URL are required' });
    // Basic URL validation
    let parsed;
    try { parsed = new URL(url); } catch { return sendJson(res, 400, { error: 'Invalid URL' }); }

    const id = state.videos.length ? Math.max(...state.videos.map(v => v.id)) + 1 : 1;
    const kind = detectVideoKind(url);
    const video = { id, title, url: parsed.toString(), description, tags, kind, created_at: Date.now() };
    state.videos.push(video);
    saveState(state);
    sendJson(res, 201, { ok: true, video });
  } catch (err) {
    sendJson(res, 400, { error: err.message || 'Invalid request' });
  }
}

function handleDeleteVideo(req, res, urlObj, state) {
  const idStr = urlObj.pathname.split('/').pop();
  const id = Number(idStr);
  if (!Number.isFinite(id)) return sendJson(res, 400, { error: 'Invalid id' });
  const idx = state.videos.findIndex(v => v.id === id);
  if (idx === -1) return sendJson(res, 404, { error: 'Not found' });
  state.videos.splice(idx, 1);
  saveState(state);
  sendJson(res, 200, { ok: true });
}

async function handlePostBooking(req, res, state) {
  try {
    const body = await readJsonBody(req);
    const required = ['name','email','date','time','event_type','shoot_type'];
    for (const key of required) {
      if (!body[key] || String(body[key]).trim() === '') {
        return sendJson(res, 400, { error: `Missing field: ${key}` });
      }
    }
    const id = state.bookings.length ? Math.max(...state.bookings.map(b => b.id)) + 1 : 1;
    const booking = {
      id,
      name: String(body.name).trim(),
      email: String(body.email).trim(),
      phone: String(body.phone || '').trim(),
      date: String(body.date).trim(),
      time: String(body.time).trim(),
      event_type: String(body.event_type).trim(),
      shoot_type: String(body.shoot_type).trim(),
      duration_hours: Number(body.duration_hours || 0) || 0,
      location: String(body.location || '').trim(),
      budget: Number(body.budget || 0) || 0,
      notes: String(body.notes || '').trim(),
      status: 'pending',
      created_at: Date.now()
    };
    state.bookings.push(booking);
    saveState(state);
    sendJson(res, 201, { ok: true, booking });
  } catch (err) {
    sendJson(res, 400, { error: err.message || 'Invalid request' });
  }
}

function handleGetBookings(_req, res, _urlObj, state) {
  const bookings = state.bookings.slice().sort((a, b) => b.created_at - a.created_at);
  sendJson(res, 200, { bookings, total: bookings.length });
}

/** Main server */
const server = http.createServer(async (req, res) => {
  // Basic security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');

  const state = loadState();
  const urlObj = new URL(req.url, `http://${req.headers.host}`);
  const { pathname } = urlObj;

  try {
    // Static assets
    if (req.method === 'GET' && pathname === '/') return serveIndexHtml(res);
    if (req.method === 'GET' && pathname === '/styles.css') return serveStyles(res);
    if (req.method === 'GET' && pathname === '/app.js') return serveAppJs(res);

    // Health
    if (req.method === 'GET' && pathname === '/api/health') return sendJson(res, 200, { ok: true });

    // Videos
    if (req.method === 'GET' && pathname === '/api/videos') return handleGetVideos(req, res, urlObj, state);
    if (req.method === 'POST' && pathname === '/api/videos') return handlePostVideo(req, res, state);
    if (req.method === 'DELETE' && pathname.startsWith('/api/videos/')) return handleDeleteVideo(req, res, urlObj, state);

    // Bookings
    if (req.method === 'GET' && pathname === '/api/bookings') return handleGetBookings(req, res, urlObj, state);
    if (req.method === 'POST' && pathname === '/api/bookings') return handlePostBooking(req, res, state);

    // 404
    sendJson(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: 'Server error' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`\nPortfolio server running on http://${HOST}:${PORT}\n`);
  if (!fs.existsSync(DATA_FILE)) saveState({ videos: [], bookings: [] });
});

