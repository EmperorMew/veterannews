/**
 * Veteran News — Shared functionality
 * Ticker · search overlay · mobile nav · dark mode · saved articles
 */

const SAVED_KEY = 'vn:saved:v1';
const THEME_KEY = 'vn:theme:v1';

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initMobileNav();
  initTicker();
  initSearchOverlay();
  initSavedBadge();
  initKeyboardShortcuts();
  injectActionButtons();
  injectCrisisFAB();
  registerServiceWorker();
});

// Crisis FAB — always-visible 988 button. The most important UI element.
function injectCrisisFAB() {
  if (document.getElementById('crisis-fab')) return;
  // Hide on /crisis page itself (no point doubling)
  if (window.location.pathname === '/crisis' || window.location.pathname === '/crisis/') return;
  const fab = document.createElement('a');
  fab.id = 'crisis-fab';
  fab.href = 'tel:988';
  fab.className = 'crisis-fab';
  fab.setAttribute('aria-label', 'Call Veterans Crisis Line: 988, press 1');
  fab.innerHTML = '<span class="crisis-fab-full-text">988 · Press 1</span><span class="crisis-fab-mobile-text">988</span>';
  // Long-press / right-click → take to /crisis page for fuller resources
  let pressTimer;
  fab.addEventListener('contextmenu', (e) => { e.preventDefault(); window.location.href = '/crisis'; });
  fab.addEventListener('touchstart', () => { pressTimer = setTimeout(() => { window.location.href = '/crisis'; }, 800); }, { passive: true });
  fab.addEventListener('touchend', () => clearTimeout(pressTimer));
  document.body.appendChild(fab);
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // Register on idle so it doesn't block page load
  const reg = () => navigator.serviceWorker.register('/sw.js').catch(() => {});
  if ('requestIdleCallback' in window) requestIdleCallback(reg);
  else setTimeout(reg, 1000);
}

// ─── Theme (light / dark / system) ────────────────────────────────────────
function initTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === 'light' || stored === 'dark') {
    document.documentElement.dataset.theme = stored;
  }
}

function setTheme(mode) {
  if (mode === 'system') {
    delete document.documentElement.dataset.theme;
    localStorage.removeItem(THEME_KEY);
  } else {
    document.documentElement.dataset.theme = mode;
    localStorage.setItem(THEME_KEY, mode);
  }
}

// ─── Inject action buttons (search, theme, saved) ─────────────────────────
function injectActionButtons() {
  const actions = document.querySelector('.masthead-actions');
  if (!actions) return;
  // Avoid double-inject
  if (actions.querySelector('.icon-btn')) return;

  const buttons = document.createElement('div');
  buttons.className = 'icon-btn-group';
  buttons.innerHTML = `
    <button class="icon-btn" id="search-btn" aria-label="Search (⌘K)" title="Search (⌘K)">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
    </button>
    <button class="icon-btn" id="saved-btn" aria-label="Saved articles" title="Saved articles">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
      <span class="icon-btn-badge" id="saved-badge" hidden>0</span>
    </button>
    <button class="icon-btn" id="theme-btn" aria-label="Toggle theme" title="Toggle theme">
      <svg class="theme-sun" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
      <svg class="theme-moon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
    </button>
  `;
  // Insert before the donate button if present, else at start
  const donate = actions.querySelector('.btn-donate');
  if (donate) actions.insertBefore(buttons, donate);
  else actions.prepend(buttons);

  document.getElementById('search-btn')?.addEventListener('click', openSearch);
  document.getElementById('saved-btn')?.addEventListener('click', () => { window.location.href = '/saved'; });
  document.getElementById('theme-btn')?.addEventListener('click', toggleTheme);
}

function toggleTheme() {
  const cur = document.documentElement.dataset.theme;
  if (cur === 'dark') setTheme('light');
  else if (cur === 'light') setTheme('system');
  else setTheme('dark');
}

// ─── Mobile nav ────────────────────────────────────────────────────────────
function initMobileNav() {
  const menu = document.getElementById('menu-toggle');
  const nav = document.getElementById('mobile-nav');
  const overlay = document.getElementById('mobile-overlay');
  if (!menu) return;
  const close = () => {
    nav?.classList.remove('open');
    overlay?.classList.remove('open');
    menu.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('no-scroll');
  };
  menu.addEventListener('click', () => {
    const isOpen = nav?.classList.toggle('open');
    overlay?.classList.toggle('open', isOpen);
    menu.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    document.body.classList.toggle('no-scroll', isOpen);
  });
  overlay?.addEventListener('click', close);
  nav?.querySelectorAll('a').forEach(a => a.addEventListener('click', close));
}

// ─── News ticker ──────────────────────────────────────────────────────────
async function initTicker() {
  const ticker = document.getElementById('news-ticker');
  if (!ticker) return;
  try {
    const res = await fetch('/api/intelligence?limit=10&fields=list');
    if (!res.ok) return;
    const data = await res.json();
    const items = (data.articles || []).slice(0, 10);
    if (!items.length) {
      ticker.style.display = 'none';
      return;
    }
    const track = ticker.querySelector('.ticker-track');
    if (!track) return;
    const rendered = items.map(s => `
      <a href="/news/${escAttr(s.slug || s.id)}" class="ticker-item">
        <span class="ticker-cat">${escText((s.category || 'news').toUpperCase())}</span>
        <span>${escText(s.title)}</span>
        <span class="ticker-source">— ${escText(s.source || '')}</span>
      </a>`).join('');
    // Duplicate for seamless loop
    track.innerHTML = rendered + rendered;
  } catch {}
}

// ─── Search overlay ───────────────────────────────────────────────────────
function initSearchOverlay() {
  if (document.getElementById('search-overlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'search-overlay';
  overlay.className = 'search-overlay';
  overlay.innerHTML = `
    <div class="search-modal" role="dialog" aria-label="Search Veteran News" aria-modal="true">
      <div class="search-modal-header">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="search" id="search-modal-input" placeholder="Search for stories — try 'PACT Act', 'GI Bill', or 'home loan'" autocomplete="off">
        <kbd class="kbd">ESC</kbd>
      </div>
      <div class="search-modal-body" id="search-modal-body">
        <div class="search-modal-empty">
          <p class="search-modal-tip">Tip · Try a category, source, or topic.</p>
          <div class="search-modal-suggestions">
            <a href="/news?q=PACT+Act" class="chip">PACT Act</a>
            <a href="/news?q=GI+Bill" class="chip">GI Bill</a>
            <a href="/news?q=disability+claim" class="chip">Disability Claim</a>
            <a href="/news?q=home+loan" class="chip">Home Loan</a>
            <a href="/news?q=PTSD" class="chip">PTSD</a>
            <a href="/news?q=mental+health" class="chip">Mental Health</a>
            <a href="/news?q=transition" class="chip">Transition</a>
            <a href="/news?q=caregiver" class="chip">Caregiver</a>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeSearch();
  });

  const input = overlay.querySelector('#search-modal-input');
  let timer;
  input.addEventListener('input', (e) => {
    clearTimeout(timer);
    const q = e.target.value.trim();
    timer = setTimeout(() => runSearch(q), 200);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && input.value.trim()) {
      window.location.href = `/news?q=${encodeURIComponent(input.value.trim())}`;
    }
  });
}

function openSearch() {
  const overlay = document.getElementById('search-overlay');
  if (!overlay) return;
  overlay.classList.add('open');
  document.body.classList.add('no-scroll');
  setTimeout(() => document.getElementById('search-modal-input')?.focus(), 50);
}

function closeSearch() {
  document.getElementById('search-overlay')?.classList.remove('open');
  document.body.classList.remove('no-scroll');
}

async function runSearch(q) {
  const body = document.getElementById('search-modal-body');
  if (!body) return;
  if (!q) {
    body.innerHTML = `
      <div class="search-modal-empty">
        <p class="search-modal-tip">Tip · Try a category, source, or topic.</p>
        <div class="search-modal-suggestions">
          <a href="/news?q=PACT+Act" class="chip">PACT Act</a>
          <a href="/news?q=GI+Bill" class="chip">GI Bill</a>
          <a href="/news?q=disability+claim" class="chip">Disability Claim</a>
          <a href="/news?q=home+loan" class="chip">Home Loan</a>
          <a href="/news?q=PTSD" class="chip">PTSD</a>
        </div>
      </div>`;
    return;
  }
  body.innerHTML = '<div class="loading">Searching…</div>';
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=8`);
    if (!res.ok) throw new Error('search');
    const data = await res.json();
    const items = data.articles || [];
    if (!items.length) {
      body.innerHTML = `<div class="search-modal-empty"><p>No matches for "<strong>${escText(q)}</strong>". Try a broader keyword.</p></div>`;
      return;
    }
    body.innerHTML = `
      <div class="search-modal-results">
        <div class="search-modal-meta">${data.total} matches · showing top ${items.length}</div>
        ${items.map(s => `
          <a href="/news/${escAttr(s.slug || s.id)}" class="search-result">
            <span class="tag">${escText((s.category || 'news').toUpperCase())}</span>
            <strong class="search-result-title">${escText(s.title)}</strong>
            <span class="search-result-meta">${escText(s.source || '')}</span>
          </a>`).join('')}
        <a href="/news?q=${encodeURIComponent(q)}" class="search-modal-all">See all ${data.total} matches →</a>
      </div>`;
  } catch {
    body.innerHTML = '<div class="search-modal-empty"><p>Search is offline. Try again in a moment.</p></div>';
  }
}

// ─── Saved articles ───────────────────────────────────────────────────────
function getSaved() {
  try { return JSON.parse(localStorage.getItem(SAVED_KEY) || '[]'); } catch { return []; }
}
function setSaved(arr) {
  localStorage.setItem(SAVED_KEY, JSON.stringify(arr));
  updateSavedBadge();
}
function isSaved(slug) {
  return getSaved().some(s => s.slug === slug);
}
function toggleSaved(article) {
  const cur = getSaved();
  const idx = cur.findIndex(s => s.slug === article.slug);
  if (idx >= 0) {
    cur.splice(idx, 1);
    setSaved(cur);
    return false;
  }
  cur.unshift({
    slug: article.slug,
    title: article.title,
    source: article.source,
    category: article.category,
    image: article.image || null,
    savedAt: new Date().toISOString()
  });
  setSaved(cur.slice(0, 50));
  return true;
}
function updateSavedBadge() {
  const badge = document.getElementById('saved-badge');
  if (!badge) return;
  const count = getSaved().length;
  badge.textContent = count;
  badge.hidden = count === 0;
}
function initSavedBadge() {
  // Defer until injectActionButtons runs
  setTimeout(updateSavedBadge, 100);

  // Wire up save buttons on story page if present
  document.querySelectorAll('[data-save-slug]').forEach(btn => {
    const slug = btn.getAttribute('data-save-slug');
    if (isSaved(slug)) btn.classList.add('is-saved');
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const data = {
        slug,
        title: btn.getAttribute('data-save-title') || document.title,
        source: btn.getAttribute('data-save-source') || '',
        category: btn.getAttribute('data-save-category') || '',
        image: btn.getAttribute('data-save-image') || null
      };
      const saved = toggleSaved(data);
      btn.classList.toggle('is-saved', saved);
      btn.querySelector('.save-label').textContent = saved ? '✓ Saved' : '☆ Save';
      showToast(saved ? 'Saved for later' : 'Removed from saved');
    });
  });
}

// ─── Keyboard shortcuts ───────────────────────────────────────────────────
function initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Cmd+K / Ctrl+K opens search
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openSearch();
      return;
    }
    // / opens search (when not typing)
    if (e.key === '/' && !isTyping(e.target)) {
      e.preventDefault();
      openSearch();
      return;
    }
    // ESC closes search
    if (e.key === 'Escape') {
      closeSearch();
      return;
    }
  });
}

function isTyping(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

// ─── Toast (shared across pages) ──────────────────────────────────────────
function showToast(msg) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.className = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

// ─── Helpers ──────────────────────────────────────────────────────────────
function escText(s) {
  if (s === null || s === undefined) return '';
  const d = document.createElement('div');
  d.textContent = String(s);
  return d.innerHTML;
}
function escAttr(s) {
  return escText(s).replace(/"/g, '&quot;');
}

// Expose helpers for page scripts
window.VN = {
  toggleSaved, isSaved, getSaved, setSaved,
  openSearch, closeSearch, showToast
};
