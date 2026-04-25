/**
 * Veteran News — Story page
 * Reading progress · share actions · related articles
 */

const $ = (id) => document.getElementById(id);
const container = $('story-container');
const loading = $('loading');
const readProgress = $('read-progress');

document.addEventListener('DOMContentLoaded', () => {
  setupMobileNav();
  setupReadProgress();
  // If SSR rendered the article, wire actions and load related
  const ssr = container && container.querySelector('.story-title');
  if (ssr) {
    wireActions();
    initAudioReader();
    loadRelatedFromDOM();
    return;
  }
  loadStory();
});

// ─── Audio reader (browser TTS) ────────────────────────────────────────────
// Critical accessibility for veterans with TBI, visual impairment, or fatigue.
// Uses native Web Speech API — works offline, no third-party dependency.
function initAudioReader() {
  const actions = document.querySelector('.story-actions');
  if (!actions || !('speechSynthesis' in window)) return;

  // Inject a "Listen" action button if not already present
  if (actions.querySelector('.listen-btn')) return;
  const listenBtn = document.createElement('button');
  listenBtn.className = 'action-btn listen-btn';
  listenBtn.type = 'button';
  listenBtn.innerHTML = '🔊 Listen';
  listenBtn.setAttribute('aria-label', 'Listen to this article');
  actions.insertBefore(listenBtn, actions.firstChild);

  // Inject the reader bar into the page once
  let bar = document.getElementById('audio-reader-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'audio-reader-bar';
    bar.className = 'audio-reader-bar';
    bar.innerHTML = `
      <div class="audio-reader-controls">
        <button class="audio-reader-btn" id="ar-play" aria-label="Play / Pause">▶</button>
        <button class="audio-reader-btn" id="ar-prev" aria-label="Skip back">⏪</button>
        <button class="audio-reader-btn" id="ar-next" aria-label="Skip forward">⏩</button>
        <button class="audio-reader-btn" id="ar-stop" aria-label="Stop">■</button>
        <select id="ar-speed" class="audio-reader-btn" style="width:auto;padding:0 8px;font-size:0.75rem;border-radius:18px;cursor:pointer;">
          <option value="0.85">0.85×</option>
          <option value="1" selected>1×</option>
          <option value="1.15">1.15×</option>
          <option value="1.3">1.3×</option>
          <option value="1.5">1.5×</option>
          <option value="1.75">1.75×</option>
        </select>
      </div>
      <div class="audio-reader-progress"><div class="audio-reader-fill" id="ar-fill"></div></div>
      <div class="audio-reader-status" id="ar-status">Ready</div>
      <button class="audio-reader-btn" id="ar-close" aria-label="Close player" style="background:transparent;color:rgba(255,255,255,0.7);">✕</button>
    `;
    document.body.appendChild(bar);
  }

  const state = {
    sentences: [],
    idx: 0,
    rate: 1,
    paused: false,
    utterance: null
  };

  function extractSentences() {
    const body = document.querySelector('.story-body');
    if (!body) return [];
    const text = body.innerText || body.textContent || '';
    // Split by sentence terminators while keeping reasonable chunk size
    const matches = text.match(/[^.!?\n]+[.!?\n]+/g) || [text];
    return matches.map(s => s.trim()).filter(Boolean);
  }

  function speak() {
    if (state.idx >= state.sentences.length) {
      // Done
      document.getElementById('ar-fill').style.width = '100%';
      document.getElementById('ar-status').textContent = 'Done';
      document.getElementById('ar-play').textContent = '▶';
      return;
    }
    const text = state.sentences[state.idx];
    const u = new SpeechSynthesisUtterance(text);
    u.rate = state.rate;
    u.pitch = 1;
    u.lang = 'en-US';
    // Prefer a higher-quality voice if available
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v => /Google US English|Samantha|Alex|Daniel/.test(v.name)) || voices.find(v => v.lang === 'en-US');
    if (preferred) u.voice = preferred;
    u.onend = () => {
      if (!state.paused) { state.idx++; updateProgress(); speak(); }
    };
    u.onerror = () => { document.getElementById('ar-status').textContent = 'Speech error'; };
    state.utterance = u;
    window.speechSynthesis.speak(u);
    document.getElementById('ar-status').textContent = `Playing ${state.idx + 1}/${state.sentences.length}`;
  }

  function updateProgress() {
    const pct = state.sentences.length ? (state.idx / state.sentences.length) * 100 : 0;
    const fill = document.getElementById('ar-fill');
    if (fill) fill.style.width = pct + '%';
  }

  function start() {
    state.sentences = extractSentences();
    if (!state.sentences.length) {
      document.getElementById('ar-status').textContent = 'No content to read';
      return;
    }
    state.idx = 0;
    state.paused = false;
    bar.classList.add('open');
    document.getElementById('ar-play').textContent = '❚❚';
    window.speechSynthesis.cancel();
    speak();
  }

  function togglePause() {
    if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
      window.speechSynthesis.pause();
      state.paused = true;
      document.getElementById('ar-play').textContent = '▶';
      document.getElementById('ar-status').textContent = 'Paused';
    } else if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
      state.paused = false;
      document.getElementById('ar-play').textContent = '❚❚';
      document.getElementById('ar-status').textContent = `Playing ${state.idx + 1}/${state.sentences.length}`;
    } else {
      start();
    }
  }

  listenBtn.addEventListener('click', start);
  document.getElementById('ar-play').addEventListener('click', togglePause);
  document.getElementById('ar-stop').addEventListener('click', () => {
    window.speechSynthesis.cancel();
    bar.classList.remove('open');
    state.idx = 0;
    document.getElementById('ar-fill').style.width = '0%';
  });
  document.getElementById('ar-prev').addEventListener('click', () => {
    window.speechSynthesis.cancel();
    state.idx = Math.max(0, state.idx - 1);
    updateProgress();
    speak();
  });
  document.getElementById('ar-next').addEventListener('click', () => {
    window.speechSynthesis.cancel();
    state.idx = Math.min(state.sentences.length - 1, state.idx + 1);
    updateProgress();
    speak();
  });
  document.getElementById('ar-speed').addEventListener('change', (e) => {
    state.rate = parseFloat(e.target.value);
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      speak();
    }
  });
  document.getElementById('ar-close').addEventListener('click', () => {
    window.speechSynthesis.cancel();
    bar.classList.remove('open');
  });

  // Stop speech if user navigates away
  window.addEventListener('beforeunload', () => window.speechSynthesis.cancel());
}

function setupMobileNav() {
  const menu = $('menu-toggle');
  const nav = $('mobile-nav');
  const overlay = $('mobile-overlay');
  if (!menu) return;
  const close = () => {
    nav?.classList.remove('open');
    overlay?.classList.remove('open');
    menu.setAttribute('aria-expanded', 'false');
  };
  menu.addEventListener('click', () => {
    const isOpen = nav?.classList.toggle('open');
    overlay?.classList.toggle('open', isOpen);
    menu.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  });
  overlay?.addEventListener('click', close);
  nav?.querySelectorAll('a').forEach(a => a.addEventListener('click', close));
}

function setupReadProgress() {
  if (!readProgress) return;
  const update = () => {
    const article = container;
    if (!article) return;
    const rect = article.getBoundingClientRect();
    const total = article.scrollHeight - window.innerHeight;
    const scrolled = Math.max(0, -rect.top);
    const pct = total > 0 ? Math.min(100, (scrolled / total) * 100) : 0;
    readProgress.style.width = pct + '%';
  };
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  update();
}

async function loadStory() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  const pathMatch = window.location.pathname.match(/^\/news\/(.+)/);
  const slug = pathMatch ? pathMatch[1].replace(/\/$/, '') : null;

  if (!id && !slug) { showError('No story specified.'); return; }

  try {
    const res = await fetch('/api/intelligence');
    if (!res.ok) throw new Error('fetch');
    const data = await res.json();

    let article = null;
    if (id) article = data.articles?.find(a => a.id === id);
    if (!article && slug) {
      article = data.articles?.find(a => a.slug === slug);
      if (!article) {
        article = data.articles?.find(a => generateSlug(a.title || '') === slug);
      }
    }

    if (!article) { showError('Story not found.'); return; }
    renderStory(article);
    updateMeta(article);
    initAudioReader();
    loadRelated(article);
  } catch (err) {
    console.error(err);
    showError('Unable to load story.');
  }
}

function generateSlug(title) {
  return title.toLowerCase()
    .replace(/[\u2018\u2019'']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

function renderStory(article) {
  if (!container) return;
  const pubDate = article.publishDate || article.pubDate;
  const dateStr = pubDate ? new Date(pubDate).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  }) : '';
  const readTime = estimateReadTime(article.content || article.excerpt || '');
  const cat = formatCategory(article.category);
  const url = window.location.href;
  const shareTitle = encodeURIComponent(article.title || 'Veteran News');
  const shareUrl = encodeURIComponent(url);

  if (loading) loading.remove();

  container.innerHTML = `
    <a href="/" class="back-link">← Back to briefing</a>
    <span class="tag story-tag">${esc(cat)}</span>
    <h1 class="story-title">${esc(article.title)}</h1>
    <div class="story-byline">
      <strong>${esc(article.source || 'Veteran News')}</strong>
      ${dateStr ? `<span>·</span><span>${dateStr}</span>` : ''}
      <span>·</span><span>${readTime} min read</span>
    </div>
    <div class="story-actions">
      <button class="action-btn" id="copy-btn">📋 Copy link</button>
      <a class="action-btn" target="_blank" rel="noopener" href="https://twitter.com/intent/tweet?text=${shareTitle}&url=${shareUrl}">𝕏 Share</a>
      <a class="action-btn" target="_blank" rel="noopener" href="https://www.linkedin.com/sharing/share-offsite/?url=${shareUrl}">in Share</a>
      <a class="action-btn" target="_blank" rel="noopener" href="https://www.facebook.com/sharer/sharer.php?u=${shareUrl}">f Share</a>
      <a class="action-btn" href="mailto:?subject=${shareTitle}&body=${shareUrl}">✉ Email</a>
    </div>
    ${article.image ? `<figure class="story-hero"><img src="${esc(article.image)}" alt="" onerror="this.src='/placeholder.svg';this.onerror=null"></figure>` : ''}
    <div class="story-body">
      ${formatContent(article.content || article.excerpt || 'No content available.')}
    </div>
    ${(article.sourceUrl || article.link) ? `
      <div class="story-source">
        Originally reported by <strong>${esc(article.source || 'Source')}</strong>.
        <a href="${esc(article.sourceUrl || article.link)}" target="_blank" rel="noopener">Read the original article →</a>
      </div>` : ''}
    <div class="related-articles" id="related-articles"></div>`;

  wireActions();
}

function wireActions() {
  const copy = document.getElementById('copy-btn');
  if (copy) {
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(window.location.href);
        const orig = copy.textContent;
        copy.textContent = '✓ Copied';
        setTimeout(() => { copy.textContent = orig; }, 1500);
      } catch {}
    });
  }
}

function updateMeta(article) {
  document.title = `${article.title} | Veteran News`;
  const desc = document.querySelector('meta[name="description"]');
  if (desc) desc.content = article.excerpt || article.title;
}

function showError(msg) { if (loading) loading.textContent = msg; }

async function loadRelated(article) {
  const mount = document.getElementById('related-articles');
  if (!mount) return;
  try {
    const res = await fetch(`/api/intelligence?limit=8&category=${encodeURIComponent(article.category || 'all')}&fields=list`);
    if (!res.ok) return;
    const data = await res.json();
    const related = (data.articles || [])
      .filter(a => a.id !== article.id && a.slug !== article.slug)
      .slice(0, 3);
    if (!related.length) return;
    mount.innerHTML = `
      <div class="section-head">
        <div>
          <div class="eyebrow">More like this</div>
          <h2 class="section-title">Related stories</h2>
        </div>
        <a href="/news" class="section-link">All news</a>
      </div>
      <div class="feed-grid">
        ${related.map(r => `
          <article class="card">
            <a href="/news/${esc(r.slug || r.id)}" style="display:flex;flex-direction:column;flex:1;">
              ${r.image ? `<img class="card-image" src="${esc(r.image)}" alt="" loading="lazy" onerror="this.src='/placeholder.svg';this.onerror=null">` : `<div class="card-image" style="background:var(--surface-2);"></div>`}
              <div class="card-body">
                <span class="tag">${esc(formatCategory(r.category))}</span>
                <h3 class="card-title">${esc(r.title)}</h3>
                <div class="byline">
                  <span class="byline-source">${esc(r.source || '')}</span>
                </div>
              </div>
            </a>
          </article>`).join('')}
      </div>`;
  } catch (e) {}
}

async function loadRelatedFromDOM() {
  // The SSR-rendered story has no JS state; fall back to category from JSON-LD if present, else load any
  try {
    const ld = document.getElementById('json-ld');
    let cat = 'all';
    let id = null;
    if (ld?.textContent) {
      try {
        const parsed = JSON.parse(ld.textContent);
        cat = (parsed.about || parsed.articleSection || 'all') || 'all';
        id = parsed.identifier || null;
      } catch {}
    }
    const res = await fetch(`/api/intelligence?limit=8&category=${encodeURIComponent(cat)}&fields=list`);
    if (!res.ok) return;
    const data = await res.json();
    const path = window.location.pathname;
    const slug = path.startsWith('/news/') ? path.replace('/news/', '').replace(/\/$/, '') : null;
    const related = (data.articles || [])
      .filter(a => a.slug !== slug && a.id !== id)
      .slice(0, 3);
    if (!related.length) return;
    const mount = document.getElementById('related-articles');
    if (!mount) return;
    mount.innerHTML = `
      <div class="section-head">
        <div><div class="eyebrow">More like this</div><h2 class="section-title">Related stories</h2></div>
        <a href="/news" class="section-link">All news</a>
      </div>
      <div class="feed-grid">
        ${related.map(r => `
          <article class="card">
            <a href="/news/${esc(r.slug || r.id)}" style="display:flex;flex-direction:column;flex:1;">
              ${r.image ? `<img class="card-image" src="${esc(r.image)}" alt="" loading="lazy" onerror="this.src='/placeholder.svg';this.onerror=null">` : `<div class="card-image" style="background:var(--surface-2);"></div>`}
              <div class="card-body">
                <span class="tag">${esc(formatCategory(r.category))}</span>
                <h3 class="card-title">${esc(r.title)}</h3>
                <div class="byline"><span class="byline-source">${esc(r.source || '')}</span></div>
              </div>
            </a>
          </article>`).join('')}
      </div>`;
  } catch {}
}

function estimateReadTime(text) {
  const words = (text || '').split(/\s+/).length;
  return Math.max(1, Math.ceil(words / 230));
}

function formatContent(text) {
  if (!text) return '<p>No content available.</p>';
  if (text.includes('<p>') || text.includes('<p ')) return text;
  const paragraphs = text.split(/\n\n+/).map(p => p.trim()).filter(p => p.length > 0);
  if (paragraphs.length <= 1) {
    const content = paragraphs[0] || text;
    const sentences = content.match(/[^.!?]+[.!?]+/g) || [content];
    const groups = [];
    for (let i = 0; i < sentences.length; i += 3) {
      groups.push(sentences.slice(i, i + 3).join(' ').trim());
    }
    return groups.map(g => `<p>${g}</p>`).join('\n');
  }
  return paragraphs.map(p => `<p>${p}</p>`).join('\n');
}

function esc(str) {
  if (str === null || str === undefined) return '';
  const s = String(str);
  const decoder = document.createElement('div');
  decoder.innerHTML = s;
  const decoded = decoder.textContent;
  const encoder = document.createElement('div');
  encoder.textContent = decoded;
  return encoder.innerHTML;
}

function formatCategory(cat) {
  if (!cat) return 'News';
  return cat.charAt(0).toUpperCase() + cat.slice(1);
}
