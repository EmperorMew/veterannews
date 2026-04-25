/**
 * Veteran News — News hub
 * Search · category filters · row layout · pagination
 */

const PAGE_SIZE = 25;
const state = {
  articles: [],
  total: 0,
  category: 'all',
  query: '',
  offset: 0
};

const $ = (id) => document.getElementById(id);
const el = {
  storyList: $('story-list'),
  filterTabs: $('filter-tabs'),
  loadMore: $('load-more'),
  loadMoreBtn: $('load-more-btn'),
  newsCount: $('news-count'),
  newsEyebrow: $('news-eyebrow'),
  searchInput: $('search-input'),
  toast: $('toast'),
  menuToggle: $('menu-toggle'),
  mobileNav: $('mobile-nav'),
  mobileOverlay: $('mobile-overlay')
};

document.addEventListener('DOMContentLoaded', init);

async function init() {
  setupMobileNav();
  setupFilters();
  setupSearch();
  bootstrapFromUrlHash();
  await load();
}

function bootstrapFromUrlHash() {
  const hash = window.location.hash.slice(1);
  const params = new URLSearchParams(window.location.search);
  const q = params.get('q');
  if (q && el.searchInput) {
    el.searchInput.value = q;
    state.query = q;
  }
  if (hash && el.filterTabs) {
    const target = el.filterTabs.querySelector(`[data-category="${hash}"]`);
    if (target) {
      el.filterTabs.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      target.classList.add('active');
      state.category = hash;
    }
  }
}

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

async function load(append = false) {
  try {
    const cat = state.category !== 'all' ? `&category=${encodeURIComponent(state.category)}` : '';
    const q = state.query ? `&q=${encodeURIComponent(state.query)}` : '';
    const res = await fetch(`/api/intelligence?limit=${PAGE_SIZE}&offset=${state.offset}${cat}${q}&fields=list`);
    if (!res.ok) throw new Error('fetch failed');
    const data = await res.json();
    const articles = data.articles || [];
    state.total = data.total || 0;
    state.articles = append ? state.articles.concat(articles) : articles;
    updateCount();
    render();
  } catch (err) {
    console.error('news load failed', err);
    if (el.storyList) el.storyList.innerHTML = '<li class="loading">Unable to load. Please refresh.</li>';
  }
}

function updateCount() {
  if (el.newsCount) el.newsCount.textContent = `${state.total} stories`;
  if (el.newsEyebrow) {
    const label = state.query ? `Results for "${state.query}"`
      : state.category === 'all' ? 'Showing all coverage'
      : `Showing ${formatCategory(state.category)}`;
    el.newsEyebrow.textContent = label;
  }
}

function render() {
  if (!el.storyList) return;
  if (!state.articles.length) {
    el.storyList.innerHTML = '<li class="loading">No stories match your filters yet.</li>';
    if (el.loadMore) el.loadMore.hidden = true;
    return;
  }
  el.storyList.innerHTML = state.articles.map(s => `
    <li class="row ${s.image ? '' : 'no-image'}">
      <a href="/news/${esc(s.slug || s.id)}" class="row-content" style="display:flex;flex-direction:column;gap:var(--s-2);">
        <span class="tag">${esc(formatCategory(s.category))}</span>
        <h3 class="row-title">${esc(s.title)}</h3>
        ${s.excerpt ? `<p class="row-excerpt">${esc(truncate(s.excerpt, 200))}</p>` : ''}
        <div class="byline">
          <span class="byline-source">${esc(s.source || 'Veteran News')}</span>
          <span class="byline-divider">·</span>
          <span>${formatTime(s.publishDate || s.pubDate)}</span>
        </div>
      </a>
      ${s.image ? `<a href="/news/${esc(s.slug || s.id)}"><img class="row-image" src="${esc(s.image)}" alt="" loading="lazy" onerror="this.src='/placeholder.svg';this.onerror=null"></a>` : ''}
    </li>`).join('');
  if (el.loadMore) el.loadMore.hidden = state.articles.length >= state.total;
}

function setupFilters() {
  if (el.filterTabs) {
    el.filterTabs.addEventListener('click', (e) => {
      const tab = e.target.closest('.chip');
      if (!tab) return;
      el.filterTabs.querySelectorAll('.chip').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.category = tab.dataset.category;
      state.offset = 0;
      load();
    });
  }
  if (el.loadMoreBtn) {
    el.loadMoreBtn.addEventListener('click', () => {
      state.offset += PAGE_SIZE;
      load(true);
    });
  }
}

function setupSearch() {
  if (!el.searchInput) return;
  let timer;
  el.searchInput.addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      state.query = e.target.value.trim();
      state.offset = 0;
      load();
      const url = new URL(window.location);
      if (state.query) url.searchParams.set('q', state.query);
      else url.searchParams.delete('q');
      window.history.replaceState({}, '', url);
    }, 250);
  });
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

function truncate(str, len) {
  if (!str || str.length <= len) return str || '';
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
