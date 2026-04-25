/**
 * Veteran News — Homepage controller
 * Hero stats · briefing grid · events · story feed · newsletter
 */

const state = {
  articles: [],
  total: 0,
  briefingIds: new Set(),
  category: 'all',
  shown: 9,
  events: 0
};

const $ = (id) => document.getElementById(id);
const el = {
  greeting: $('greeting'),
  datelineDate: $('dateline-date'),
  datelineEdition: $('dateline-edition'),
  issNum: $('iss-num'),
  statusStories: $('status-stories'),
  statusTime: $('status-time'),
  statStories: $('stat-stories'),
  statEvents: $('stat-events'),
  briefingCount: $('briefing-count'),
  alertBanner: $('alert-banner'),
  leadStoryMount: $('lead-story-mount'),
  briefingList: $('briefing-list'),
  eventsList: $('events-list'),
  eventsSection: $('events-section'),
  filterTabs: $('filter-tabs'),
  storyList: $('story-list'),
  loadMore: $('load-more'),
  loadMoreBtn: $('load-more-btn'),
  newsletterForm: $('newsletter-form'),
  toast: $('toast'),
  menuToggle: $('menu-toggle'),
  mobileNav: $('mobile-nav'),
  mobileOverlay: $('mobile-overlay')
};

document.addEventListener('DOMContentLoaded', init);

async function init() {
  setDateline();
  setupMobileNav();
  setupFilters();
  setupNewsletter();
  await load();
  setInterval(load, 5 * 60 * 1000);
  setInterval(setDateline, 60 * 1000);
}

// ─── Header / dateline ─────────────────────────────────────────────────────
function setDateline() {
  const now = new Date();
  const hour = now.getHours();
  let greeting = 'Good evening';
  let edition = 'Evening Edition';
  if (hour < 12) { greeting = 'Good morning'; edition = 'Morning Edition'; }
  else if (hour < 17) { greeting = 'Good afternoon'; edition = 'Afternoon Edition'; }

  if (el.greeting) el.greeting.textContent = `${greeting}, Service Member`;
  if (el.datelineEdition) el.datelineEdition.textContent = edition;
  if (el.datelineDate) {
    el.datelineDate.textContent = now.toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
  }
  // Issue number = days since Jan 1 of current year
  if (el.issNum) {
    const start = new Date(now.getFullYear(), 0, 0);
    const diff = Math.floor((now - start) / (1000 * 60 * 60 * 24));
    el.issNum.textContent = String(diff).padStart(3, '0');
  }
}

// ─── Mobile drawer ────────────────────────────────────────────────────────
function setupMobileNav() {
  if (!el.menuToggle) return;
  const close = () => {
    el.mobileNav?.classList.remove('open');
    el.mobileOverlay?.classList.remove('open');
    el.menuToggle?.setAttribute('aria-expanded', 'false');
  };
  el.menuToggle.addEventListener('click', () => {
    const isOpen = el.mobileNav?.classList.toggle('open');
    el.mobileOverlay?.classList.toggle('open', isOpen);
    el.menuToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  });
  el.mobileOverlay?.addEventListener('click', close);
  el.mobileNav?.querySelectorAll('a').forEach(a => a.addEventListener('click', close));
}

// ─── Newsletter ────────────────────────────────────────────────────────────
function setupNewsletter() {
  if (!el.newsletterForm) return;
  el.newsletterForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = el.newsletterForm.querySelector('input[type="email"]');
    const email = input?.value?.trim();
    if (!email) return;
    try {
      const res = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      if (res.ok) {
        input.value = '';
        toast('Subscribed. Welcome aboard.');
      } else {
        toast('Could not subscribe. Try again.');
      }
    } catch {
      toast('Network error. Please try again.');
    }
  });
}

// ─── Data ──────────────────────────────────────────────────────────────────
async function load() {
  try {
    const cat = state.category !== 'all' ? `&category=${encodeURIComponent(state.category)}` : '';
    const res = await fetch(`/api/intelligence?limit=30${cat}&fields=list`);
    if (!res.ok) throw new Error('fetch failed');
    const data = await res.json();

    state.articles = data.articles || [];
    state.total = data.total || state.articles.length;
    state.events = (data.events || []).length;
    const briefing = data.briefing?.stories || [];
    state.briefingIds = new Set(briefing.map(s => s.id));

    renderStatus(data.lastUpdate);
    renderBriefing(briefing.length ? briefing : state.articles.slice(0, 4));
    renderEvents(data.events || []);
    renderStories();
    renderMostRead(state.articles);
    checkAlerts(state.articles);
  } catch (err) {
    console.error('load failed', err);
    if (el.briefingList) el.briefingList.innerHTML = '<li class="loading">Unable to load briefing. Please refresh.</li>';
    if (el.storyList) el.storyList.innerHTML = '<div class="loading">Unable to load stories.</div>';
  }
}

// Most Read — top 5 by quality score, prioritizing the past 24 hours
function renderMostRead(articles) {
  const mount = document.getElementById('most-read-list');
  if (!mount || !articles.length) return;
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const recent = articles.filter(a => {
    const t = a.publishDate ? new Date(a.publishDate).getTime() : 0;
    return t >= dayAgo;
  });
  // Skip briefing IDs (already featured) and prioritize quality
  const pool = (recent.length >= 5 ? recent : articles)
    .filter(a => !state.briefingIds.has(a.id))
    .slice()
    .sort((a, b) => (b.qualityScore || 0) - (a.qualityScore || 0))
    .slice(0, 5);
  if (!pool.length) return;
  mount.innerHTML = pool.map(s => `
    <li>
      <a href="/news/${esc(s.slug || s.id)}">${esc(s.title)}</a>
      <span class="most-read-source">${esc(s.source || 'Veteran News')} · ${formatTime(s.publishDate || s.pubDate)}</span>
    </li>`).join('');
}

// Wire the rail newsletter form once
document.addEventListener('DOMContentLoaded', () => {
  const railForm = document.getElementById('rail-newsletter');
  if (!railForm) return;
  railForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = railForm.querySelector('input[type=email]');
    const email = input?.value?.trim();
    if (!email) return;
    try {
      const res = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, list: 'daily' })
      });
      if (res.ok) {
        input.value = '';
        window.VN?.showToast?.('Subscribed. Welcome aboard.');
      } else {
        window.VN?.showToast?.('Could not subscribe. Try again.');
      }
    } catch {
      window.VN?.showToast?.('Network error.');
    }
  });
});

async function loadMore() {
  try {
    const cat = state.category !== 'all' ? `&category=${encodeURIComponent(state.category)}` : '';
    const res = await fetch(`/api/intelligence?limit=20&offset=${state.articles.length}${cat}&fields=list`);
    if (!res.ok) return;
    const data = await res.json();
    const more = data.articles || [];
    state.articles = state.articles.concat(more);
    state.total = data.total || state.articles.length;
    renderStories();
  } catch (err) { console.error(err); }
}

function renderStatus(lastUpdate) {
  if (el.statusStories) el.statusStories.textContent = state.total;
  if (el.statStories) el.statStories.textContent = state.total;
  if (el.statEvents) el.statEvents.textContent = state.events;
  if (el.briefingCount) el.briefingCount.textContent = `· ${state.total} stories tracked`;
  if (el.statusTime && lastUpdate) {
    const diff = (Date.now() - new Date(lastUpdate)) / 60000;
    el.statusTime.textContent = diff < 1 ? 'updated just now'
      : diff < 60 ? `updated ${Math.floor(diff)}m ago`
      : `updated ${Math.floor(diff / 60)}h ago`;
  }
}

// ─── Alerts ────────────────────────────────────────────────────────────────
function checkAlerts(articles) {
  if (!el.alertBanner) return;
  const urgentRe = /\b(breaking|urgent|emergency|crisis alert)\b/i;
  const urgent = articles.find(a => urgentRe.test(`${a.title} ${a.excerpt || ''}`));
  if (!urgent) { el.alertBanner.hidden = true; return; }
  el.alertBanner.hidden = false;
  el.alertBanner.className = 'crisis-cta';
  el.alertBanner.style.background = 'linear-gradient(135deg, #8B1A23 0%, #C8313D 100%)';
  el.alertBanner.style.margin = 'var(--s-6) 0';
  el.alertBanner.innerHTML = `
    <div class="crisis-cta-eyebrow">Breaking</div>
    <h3>${esc(urgent.title)}</h3>
    <div class="crisis-cta-actions">
      <a href="/news/${urgent.slug || urgent.id}" class="btn btn-primary">Read full story</a>
    </div>`;
}

// ─── Briefing ──────────────────────────────────────────────────────────────
function renderBriefing(stories) {
  if (!stories.length) {
    if (el.leadStoryMount) el.leadStoryMount.innerHTML = '<div class="loading">No stories available.</div>';
    if (el.briefingList) el.briefingList.innerHTML = '';
    return;
  }
  const [lead, ...rest] = stories;

  if (el.leadStoryMount && lead) {
    el.leadStoryMount.innerHTML = `
      <a href="/news/${esc(lead.slug || lead.id)}" class="lead-story">
        ${lead.image
          ? `<img class="lead-story-image" src="${esc(lead.image)}" alt="" loading="eager" onerror="this.src='/placeholder.svg';this.onerror=null">`
          : `<div class="lead-story-image"></div>`}
        <div class="lead-story-body">
          <span class="tag">${esc(formatCategory(lead.category))}</span>
          <h2>${esc(lead.title)}</h2>
          ${lead.excerpt ? `<p>${esc(truncate(lead.excerpt, 220))}</p>` : ''}
          <div class="byline">
            <span class="byline-source">${esc(lead.source || 'Veteran News')}</span>
            <span class="byline-divider">·</span>
            <span>${formatTime(lead.publishDate || lead.pubDate)}</span>
          </div>
        </div>
      </a>`;
  }

  if (el.briefingList) {
    el.briefingList.innerHTML = rest.slice(0, 4).map(s => `
      <li class="briefing-item">
        <a href="/news/${esc(s.slug || s.id)}" style="display:block;">
          <span class="tag">${esc(formatCategory(s.category))}</span>
          <h3>${esc(s.title)}</h3>
          <div class="byline">
            <span class="byline-source">${esc(s.source || 'Veteran News')}</span>
            <span class="byline-divider">·</span>
            <span>${formatTime(s.publishDate || s.pubDate)}</span>
          </div>
        </a>
      </li>`).join('');
  }
}

// ─── Events ────────────────────────────────────────────────────────────────
function renderEvents(events) {
  if (!el.eventsList) return;
  const now = new Date();
  const upcoming = events
    .filter(e => new Date(e.startDate) > now)
    .sort((a, b) => new Date(a.startDate) - new Date(b.startDate))
    .slice(0, 4);

  if (upcoming.length < 2) {
    if (el.eventsSection) el.eventsSection.hidden = true;
    return;
  }
  if (el.eventsSection) el.eventsSection.hidden = false;

  el.eventsList.innerHTML = upcoming.map(ev => {
    const d = new Date(ev.startDate);
    const month = d.toLocaleDateString('en-US', { month: 'short' });
    const day = d.getDate();
    const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    return `
      <a href="${esc(ev.url || '#')}" target="_blank" rel="noopener" class="event">
        <div class="event-cal">
          <div class="event-cal-month">${month}</div>
          <div class="event-cal-day">${day}</div>
        </div>
        <div class="event-info">
          <div class="event-title">${esc(truncate(ev.title, 80))}</div>
          <div class="event-meta">
            <span>${dateStr} · ${time}</span>
            ${ev.isVirtual ? `<span class="badge virtual">Virtual</span>` : ''}
            ${ev.organization ? `<span>${esc(ev.organization)}</span>` : ''}
          </div>
        </div>
      </a>`;
  }).join('');
}

// ─── Stories feed ──────────────────────────────────────────────────────────
function setupFilters() {
  if (el.filterTabs) {
    el.filterTabs.addEventListener('click', (e) => {
      const tab = e.target.closest('.chip');
      if (!tab) return;
      el.filterTabs.querySelectorAll('.chip').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.category = tab.dataset.category;
      state.shown = 9;
      load();
    });
  }
  if (el.loadMoreBtn) {
    el.loadMoreBtn.addEventListener('click', () => {
      state.shown += 9;
      const filtered = state.articles.filter(a => !state.briefingIds.has(a.id));
      if (state.shown > filtered.length && state.articles.length < state.total) {
        loadMore();
      } else {
        renderStories();
      }
    });
  }
}

function renderStories() {
  if (!el.storyList) return;
  const stories = state.articles.filter(a => !state.briefingIds.has(a.id));
  const visible = stories.slice(0, state.shown);

  if (!visible.length) {
    el.storyList.innerHTML = '<div class="loading">No stories in this category yet.</div>';
    if (el.loadMore) el.loadMore.hidden = true;
    return;
  }

  el.storyList.innerHTML = visible.map(s => `
    <article class="card">
      <a href="/news/${esc(s.slug || s.id)}" style="display:flex;flex-direction:column;flex:1;">
        ${s.image
          ? `<img class="card-image" src="${esc(s.image)}" alt="" loading="lazy" onerror="this.src='/placeholder.svg';this.onerror=null">`
          : `<div class="card-image" style="background:var(--surface-2);display:flex;align-items:center;justify-content:center;font-family:var(--font-headline);font-size:2rem;color:var(--ink-soft);">${esc(formatCategory(s.category)).charAt(0)}</div>`}
        <div class="card-body">
          <span class="tag">${esc(formatCategory(s.category))}</span>
          <h3 class="card-title">${esc(s.title)}</h3>
          ${s.excerpt ? `<p class="card-excerpt">${esc(truncate(s.excerpt, 140))}</p>` : ''}
          <div class="byline">
            <span class="byline-source">${esc(s.source || 'Veteran News')}</span>
            <span class="byline-divider">·</span>
            <span>${formatTime(s.publishDate || s.pubDate)}</span>
          </div>
        </div>
      </a>
    </article>`).join('');

  if (el.loadMore) el.loadMore.hidden = visible.length >= stories.length && state.articles.length >= state.total;
}

// ─── Toast ─────────────────────────────────────────────────────────────────
function toast(msg) {
  if (!el.toast) return;
  el.toast.textContent = msg;
  el.toast.classList.add('show');
  setTimeout(() => el.toast.classList.remove('show'), 3000);
}

// ─── Utilities ─────────────────────────────────────────────────────────────
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

function truncate(str, len) {
  if (!str || typeof str !== 'string') return '';
  if (str.length <= len) return str;
  return str.substring(0, len).trim() + '…';
}

function formatCategory(cat) {
  if (!cat) return 'News';
  return cat.charAt(0).toUpperCase() + cat.slice(1);
}

function formatTime(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffH = Math.floor((now - date) / (1000 * 60 * 60));
  if (diffH < 1) {
    const diffM = Math.floor((now - date) / 60000);
    return diffM < 1 ? 'Just now' : `${diffM}m ago`;
  }
  if (diffH < 24) return `${diffH}h ago`;
  if (diffH < 48) return 'Yesterday';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
