/**
 * Veteran News — Events page
 * Filter modes: upcoming, this-month, virtual, in-person, all
 */

const state = {
  events: [],
  filter: 'upcoming',
  shown: 20
};

const $ = (id) => document.getElementById(id);
const el = {
  list: $('events-list'),
  filterTabs: $('filter-tabs'),
  loadMore: $('load-more'),
  loadMoreBtn: $('load-more-btn'),
  menuToggle: $('menu-toggle'),
  mobileNav: $('mobile-nav'),
  mobileOverlay: $('mobile-overlay')
};

document.addEventListener('DOMContentLoaded', init);

function init() {
  setupMobileNav();
  setupFilters();
  load();
}

function setupMobileNav() {
  if (!el.menuToggle) return;
  const close = () => {
    el.mobileNav?.classList.remove('open');
    el.mobileOverlay?.classList.remove('open');
    el.menuToggle.setAttribute('aria-expanded', 'false');
  };
  el.menuToggle.addEventListener('click', () => {
    const isOpen = el.mobileNav?.classList.toggle('open');
    el.mobileOverlay?.classList.toggle('open', isOpen);
    el.menuToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  });
  el.mobileOverlay?.addEventListener('click', close);
  el.mobileNav?.querySelectorAll('a').forEach(a => a.addEventListener('click', close));
}

async function load() {
  try {
    const res = await fetch('/api/events');
    if (!res.ok) throw new Error('fetch failed');
    const data = await res.json();
    state.events = data.events || [];
    render();
  } catch (err) {
    console.error('events load failed', err);
    if (el.list) el.list.innerHTML = '<div class="loading">Unable to load events. Please refresh.</div>';
  }
}

function render() {
  if (!el.list) return;
  const now = new Date();
  let filtered = state.events;

  if (state.filter === 'upcoming') {
    filtered = filtered.filter(e => new Date(e.startDate) > now);
  } else if (state.filter === 'this-month') {
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    filtered = filtered.filter(e => {
      const d = new Date(e.startDate);
      return d >= now && d <= monthEnd;
    });
  } else if (state.filter === 'virtual') {
    filtered = filtered.filter(e => e.isVirtual);
  } else if (state.filter === 'in-person') {
    filtered = filtered.filter(e => !e.isVirtual);
  }

  filtered.sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
  const visible = filtered.slice(0, state.shown);

  if (!visible.length) {
    el.list.innerHTML = '<div class="loading">No events match this filter.</div>';
    if (el.loadMore) el.loadMore.hidden = true;
    return;
  }

  el.list.innerHTML = visible.map(ev => {
    const d = new Date(ev.startDate);
    const month = d.toLocaleDateString('en-US', { month: 'short' });
    const day = d.getDate();
    const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const loc = locationString(ev);
    const isLive = isLiveNow(ev);
    return `
      <a href="${esc(ev.url || '#')}" target="_blank" rel="noopener" class="event">
        <div class="event-cal">
          <div class="event-cal-month">${month}</div>
          <div class="event-cal-day">${day}</div>
        </div>
        <div class="event-info">
          <div class="event-title">${esc(ev.title)}</div>
          <div class="event-meta">
            <span>${dateStr} · ${time}</span>
            ${isLive ? '<span class="badge live">● Live now</span>' : ''}
            ${ev.isVirtual ? '<span class="badge virtual">Virtual</span>' : ''}
            ${loc && !ev.isVirtual ? `<span>📍 ${esc(truncate(loc, 50))}</span>` : ''}
            ${ev.organization ? `<span>${esc(ev.organization)}</span>` : ''}
          </div>
        </div>
      </a>`;
  }).join('');

  if (el.loadMore) el.loadMore.hidden = visible.length >= filtered.length;
}

function isLiveNow(ev) {
  const start = new Date(ev.startDate);
  const end = ev.endDate ? new Date(ev.endDate) : new Date(start.getTime() + 2 * 60 * 60 * 1000);
  const now = new Date();
  return now >= start && now <= end;
}

function setupFilters() {
  if (el.filterTabs) {
    el.filterTabs.addEventListener('click', (e) => {
      const tab = e.target.closest('.chip');
      if (!tab) return;
      el.filterTabs.querySelectorAll('.chip').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.filter = tab.dataset.filter;
      state.shown = 20;
      render();
    });
  }
  if (el.loadMoreBtn) {
    el.loadMoreBtn.addEventListener('click', () => { state.shown += 20; render(); });
  }
}

function locationString(ev) {
  if (!ev.location) return '';
  if (typeof ev.location === 'string') return ev.location;
  const parts = [];
  if (ev.location.city) parts.push(ev.location.city);
  if (ev.location.state) parts.push(ev.location.state);
  return parts.join(', ');
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
  if (!str || typeof str !== 'string') return '';
  if (str.length <= len) return str;
  return str.substring(0, len).trim() + '…';
}
