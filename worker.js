/**
 * Veteran News — Main Worker
 *
 * Philosophy: Explicit routing. No magic.
 * Every route visible and auditable.
 */

// ═══════════════════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════════════════

const CONFIG = {
  name: 'Veteran News',
  siteId: 'veterannews',
  domain: 'veteransnews.org',
  publication: {
    id: 'veterannews',
    name: 'Veteran News',
    domain: 'veteransnews.org',
    region: 'United States'
  },
  cache: {
    api: 180,       // 3 minutes
    assets: 86400   // 1 day
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════════

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;

    // Health check (API path only — /health alone goes to the Health section page)
    if (pathname === '/api/health' || pathname === '/api/healthz') {
      return handleHealth(env);
    }

    // Public admin dashboard (read-only) — source health, image fill rate, etc.
    if (pathname === '/admin/health' || pathname === '/admin') {
      return serveAdminHealth(env, url, request);
    }

    // Analytics endpoint (for querying)
    if (pathname === '/api/analytics') {
      return handleAnalytics(env, url);
    }

    // API routes
    if (pathname.startsWith('/api/')) {
      return handleAPI(env, url, request);
    }

    // RSS feed
    if (pathname === '/rss.xml' || pathname === '/feed' || pathname === '/feed.xml') {
      return handleRSS(env, url);
    }

    // Track pageviews for content pages (non-blocking)
    const isContentPage = pathname === '/' || pathname === '/events' || pathname === '/resources' || pathname === '/story' || pathname === '/about' || pathname === '/donate' || pathname === '/news' || pathname.startsWith('/news/');
    if (isContentPage && env.ANALYTICS) {
      const articleId = url.searchParams.get('id') || null;
      ctx.waitUntil(trackPageview(env, request, pathname, articleId));
    }

    // Article by slug — /news/[slug] (SEO-friendly URLs)
    if (pathname.startsWith('/news/') && !pathname.startsWith('/news-')) {
      if (!pathname.startsWith('/news/category/')) {
        return serveArticleBySlug(env, url, request);
      }
    }

    // News hub page — /news (SSR with first page of articles)
    if (pathname === '/news' || pathname === '/news/') {
      return serveNewsPage(env, url, request);
    }

    // Category pages — /news/category/[name] (redirect to /news with filter)
    if (pathname.startsWith('/news/category/')) {
      const category = pathname.replace('/news/category/', '').replace(/\/$/, '');
      return Response.redirect(`https://${CONFIG.domain}/news#${category}`, 301);
    }

    // Sitemap for SEO
    if (pathname === '/sitemap.xml') {
      return handleSitemapIndex(env);
    }
    if (pathname === '/sitemap-pages.xml') {
      return handleSitemapPages(env);
    }
    if (pathname === '/sitemap-articles.xml') {
      return handleSitemapArticles(env);
    }
    if (pathname === '/sitemap-news.xml') {
      return handleNewsSitemap(env);
    }
    if (pathname === '/sitemap-images.xml') {
      return handleImageSitemap(env);
    }

    // AI discoverability
    if (pathname === '/llms.txt') {
      return env.ASSETS.fetch(new Request(new URL('/llms.txt', url.origin), request));
    }

    // Legacy story page — redirect to slug URL
    if (pathname === '/story' || pathname.startsWith('/story?')) {
      return redirectStoryToSlug(env, url);
    }

    // Events page
    if (pathname === '/events') {
      const eventsRequest = new Request(new URL('/events.html', url.origin), request);
      return env.ASSETS.fetch(eventsRequest);
    }

    // Resources page
    if (pathname === '/resources') {
      const resourcesRequest = new Request(new URL('/resources.html', url.origin), request);
      return env.ASSETS.fetch(resourcesRequest);
    }

    // About page
    if (pathname === '/about' || pathname === '/about/') {
      const aboutRequest = new Request(new URL('/about.html', url.origin), request);
      return env.ASSETS.fetch(aboutRequest);
    }

    // Donate page
    if (pathname === '/donate' || pathname === '/donate/' || pathname === '/support' || pathname === '/give') {
      if (pathname !== '/donate' && pathname !== '/donate/') {
        return Response.redirect(`https://${CONFIG.domain}/donate`, 301);
      }
      const donateRequest = new Request(new URL('/donate.html', url.origin), request);
      return env.ASSETS.fetch(donateRequest);
    }

    // Section landing pages (SEO-friendly URLs for each category)
    const SECTIONS = ['benefits', 'health', 'service', 'transition', 'advocacy', 'legacy', 'community', 'family'];
    const sectionMatch = pathname.match(/^\/(benefits|health|service|transition|advocacy|legacy|community|family)\/?$/);
    if (sectionMatch) {
      return serveSectionPage(env, url, request, sectionMatch[1]);
    }

    // Branch hub + branch pages
    if (pathname === '/branches' || pathname === '/branches/') {
      return serveBranchHub(env, url, request);
    }
    const branchMatch = pathname.match(/^\/branch\/(army|navy|air-force|marines|marine-corps|coast-guard|space-force)\/?$/);
    if (branchMatch) {
      const branch = branchMatch[1] === 'marine-corps' ? 'marines' : branchMatch[1];
      return serveBranchPage(env, url, request, branch);
    }

    // Topics index
    if (pathname === '/topics' || pathname === '/topics/') {
      return serveTopicsIndex(env, url, request);
    }

    // Archive — date-based browsing (Google "publication issue" signal)
    if (pathname === '/archive' || pathname === '/archive/') {
      return serveArchiveIndex(env, url, request);
    }
    const archiveYearMatch = pathname.match(/^\/archive\/(\d{4})\/?$/);
    if (archiveYearMatch) return serveArchiveYear(env, url, request, archiveYearMatch[1]);
    const archiveMonthMatch = pathname.match(/^\/archive\/(\d{4})\/(\d{2})\/?$/);
    if (archiveMonthMatch) return serveArchiveMonth(env, url, request, archiveMonthMatch[1], archiveMonthMatch[2]);
    const archiveDayMatch = pathname.match(/^\/archive\/(\d{4})\/(\d{2})\/(\d{2})\/?$/);
    if (archiveDayMatch) return serveArchiveDay(env, url, request, archiveDayMatch[1], archiveDayMatch[2], archiveDayMatch[3]);

    // Source pages /source/[slug]
    if (pathname === '/sources' || pathname === '/sources/') {
      return serveSourcesIndex(env, url, request);
    }
    const sourceMatch = pathname.match(/^\/source\/([a-z0-9-]+)\/?$/);
    if (sourceMatch) return serveSourcePage(env, url, request, sourceMatch[1]);

    // Author pages
    const authorMatch = pathname.match(/^\/author\/([a-z0-9-]+)\/?$/);
    if (authorMatch) return serveAuthorPage(env, url, request, authorMatch[1]);

    // Tools / calculators
    if (pathname === '/tools' || pathname === '/tools/' || pathname === '/calculators') {
      return serveToolsPage(env, url, request);
    }

    // Newsletter dedicated page
    if (pathname === '/newsletter' || pathname === '/newsletter/') {
      return serveNewsletterPage(env, url, request);
    }

    // Saved articles page
    if (pathname === '/saved' || pathname === '/saved/' || pathname === '/bookmarks') {
      return serveSavedPage(env, url, request);
    }

    // Crisis & life-saving pages — highest priority
    if (pathname === '/crisis' || pathname === '/crisis/' || pathname === '/help' || pathname === '/988') {
      return serveCrisisPage(env, url, request);
    }
    if (pathname === '/scam-alerts' || pathname === '/scams' || pathname === '/fraud') {
      return serveScamAlertsPage(env, url, request);
    }
    if (pathname === '/claim-help' || pathname === '/eligibility' || pathname === '/file-claim') {
      return serveClaimHelpPage(env, url, request);
    }
    if (pathname === '/survivor-benefits' || pathname === '/survivors') {
      return serveSurvivorBenefitsPage(env, url, request);
    }
    if (pathname === '/buddy-check') {
      return serveBuddyCheckPage(env, url, request);
    }

    // States hub + state-specific pages
    if (pathname === '/states' || pathname === '/states/') {
      return serveStatesIndex(env, url, request);
    }
    const stateMatch = pathname.match(/^\/state\/([a-z]{2})\/?$/);
    if (stateMatch) return serveStatePage(env, url, request, stateMatch[1].toUpperCase());

    // Editorial / legal pages
    if (pathname === '/editorial-standards' || pathname === '/standards' || pathname === '/ethics') {
      return serveEditorialPage(env, url, request);
    }
    if (pathname === '/privacy' || pathname === '/privacy-policy') {
      return servePrivacyPage(env, url, request);
    }
    if (pathname === '/terms' || pathname === '/terms-of-service') {
      return serveTermsPage(env, url, request);
    }
    if (pathname === '/corrections' || pathname === '/corrections-policy') {
      return serveCorrectionsPage(env, url, request);
    }
    if (pathname === '/press' || pathname === '/media' || pathname === '/press-kit') {
      return servePressPage(env, url, request);
    }
    if (pathname === '/contact') {
      return serveContactPage(env, url, request);
    }

    // SSR-enhanced homepage (briefing data injected before paint)
    if (pathname === '/' || pathname === '/index.html') {
      return serveHomepage(env, url, request);
    }

    // Static assets (homepage, CSS, JS, etc.)
    const assetResponse = await env.ASSETS.fetch(request);
    // Intercept 404s and redirects-to-404 from asset handler
    if (assetResponse.status === 404 || (assetResponse.status >= 300 && assetResponse.status < 400 && (assetResponse.headers.get('Location') || '').includes('404'))) {
      return serve404(env, url, request);
    }
    return assetResponse;
  }
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
  'X-Robots-Tag': 'index, follow, max-image-preview:large, max-snippet:-1',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' https: data:; connect-src 'self'"
};

function addSecurityHeaders(response) {
  const newResponse = new Response(response.body, response);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    newResponse.headers.set(key, value);
  }
  return newResponse;
}

async function serve404(env, url, request) {
  try {
    let page = await env.ASSETS.fetch(new Request(new URL('/404.html', url.origin), { method: 'GET', redirect: 'follow' }));
    // Follow redirects from asset handler
    if ([301, 302, 307].includes(page.status)) {
      const loc = page.headers.get('Location');
      if (loc) page = await env.ASSETS.fetch(new Request(new URL(loc, url.origin), { method: 'GET' }));
    }
    const html = await page.text();
    return new Response(html, {
      status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8', ...SECURITY_HEADERS }
    });
  } catch {
    return new Response('<h1>Page Not Found</h1><p><a href="/">Back to Veteran News</a></p>', {
      status: 404, headers: { 'Content-Type': 'text/html', ...SECURITY_HEADERS }
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════════════

async function handleHealth(env) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  try {
    const data = await env.ARTICLES_KV.get('articles', { type: 'json' });
    const articleCount = data?.articles?.length || 0;
    const eventCount = data?.events?.length || 0;

    return json({
      status: 'healthy',
      service: CONFIG.name,
      articles: articleCount,
      events: eventCount,
      lastUpdate: data?.lastScrape?.timestamp,
      checkedAt: new Date().toISOString()
    }, 200, cors);
  } catch (error) {
    return json({ status: 'error', message: error.message }, 500, cors);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// API HANDLER
// ═══════════════════════════════════════════════════════════════════════════

async function handleAPI(env, url, request) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  if (request && request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  if (url.pathname === '/api/intelligence' || url.pathname === '/api/articles') {
    return serveIntelligence(env, cors, url);
  }

  if (url.pathname === '/api/search') {
    return serveSearch(env, cors, url);
  }

  if (url.pathname === '/api/events') {
    return serveEvents(env, cors);
  }

  if (url.pathname === '/api/events/upcoming') {
    return serveUpcomingEvents(env, cors);
  }

  if (url.pathname === '/api/newsletter') {
    return handleNewsletter(env, request, cors);
  }

  if (url.pathname === '/api/sources') {
    return serveSources(env, cors);
  }

  return json({ error: 'Not found' }, 404, cors);
}

// ═══════════════════════════════════════════════════════════════════════════
// API ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

async function serveIntelligence(env, cors, url) {
  try {
    const data = await env.ARTICLES_KV.get('articles', { type: 'json' });

    if (!data) {
      return json({ articles: [], events: [], briefing: null, total: 0 }, 200, cors);
    }

    // Deduplicate articles by normalized title (keeps first/newest occurrence)
    // Filter broken-link articles + clean excerpts.
    // Low-quality articles are hidden from the main feed but accessible by direct URL.
    const allArticles = deduplicateArticles(data.articles || [])
      .filter(a => a.linkStatus !== 'broken')
      .filter(a => !a.lowQuality || url.searchParams.get('all') === '1')
      .map(a => ({
        ...a,
        excerpt: a.excerpt ? cleanExcerpt(a.excerpt) : a.excerpt
      }));

    // Pagination params
    const limit = Math.min(parseInt(url.searchParams.get('limit')) || 30, 200);
    const offset = parseInt(url.searchParams.get('offset')) || 0;
    const category = url.searchParams.get('category') || null;
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();

    // Filter by category if specified
    let filtered = allArticles;
    if (category && category !== 'all') {
      filtered = allArticles.filter(a => a.category === category);
    }
    // Search filter
    if (q) {
      filtered = filtered.filter(a => {
        const haystack = `${a.title || ''} ${a.excerpt || ''} ${a.source || ''} ${a.content || ''}`.toLowerCase();
        return haystack.includes(q);
      });
    }

    const total = filtered.length;
    let articles = filtered.slice(offset, offset + limit);

    // ?fields=list strips heavy content field for list views (~90% payload reduction)
    const fields = url.searchParams.get('fields');
    if (fields === 'list') {
      articles = articles.map(({ content, ...rest }) => rest);
    }

    // Compute briefing (top 3 with category diversity) — only on first page
    const briefing = offset === 0 ? computeBriefing(allArticles) : [];

    // Events — only include on first page load
    const events = offset === 0 ? (data.events || []) : [];

    return json({
      articles,
      events,
      briefing: { stories: briefing },
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
      lastUpdate: data.lastScrape?.timestamp
    }, 200, cors, { 'Cache-Control': `public, max-age=${CONFIG.cache.api}` });

  } catch (error) {
    return json({ error: 'Failed to fetch data' }, 500, cors);
  }
}

async function serveEvents(env, cors) {
  try {
    const data = await env.ARTICLES_KV.get('articles', { type: 'json' });
    return json({
      events: data?.events || [],
      total: data?.events?.length || 0
    }, 200, cors, { 'Cache-Control': `public, max-age=${CONFIG.cache.api}` });
  } catch (error) {
    return json({ error: 'Failed to fetch events' }, 500, cors);
  }
}

async function serveUpcomingEvents(env, cors) {
  try {
    const data = await env.ARTICLES_KV.get('articles', { type: 'json' });
    const events = data?.events || [];
    const now = new Date();

    const upcoming = events
      .filter(e => new Date(e.startDate) > now)
      .sort((a, b) => new Date(a.startDate) - new Date(b.startDate))
      .slice(0, 10);

    return json({ events: upcoming }, 200, cors);
  } catch (error) {
    return json({ error: 'Failed to fetch events' }, 500, cors);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// BRIEFING COMPUTATION
// ═══════════════════════════════════════════════════════════════════════════

function formatArticleContent(text) {
  if (!text) return '<p>No content available.</p>';
  if (text.includes('<p>') || text.includes('<p ')) return text;
  const paragraphs = text.split(/\n\n+/).map(p => p.trim()).filter(p => {
    if (!p || p.length === 0) return false;
    const lower = p.toLowerCase();
    // Filter RSS cruft that may still exist in old KV data
    if (/^the post .+ appeared first on /i.test(p)) return false;
    if (/^(?:continue reading|read more|click here)/i.test(p)) return false;
    if (/^(?:also read|related|read next|see also)[:\s]/i.test(p)) return false;
    // Filter standalone category labels / bylines (under 5 words, no period)
    if (p.split(/\s+/).length <= 3 && /^[A-Z][a-z]+(?: [A-Z&][a-z]*)*$/.test(p) && !p.includes('.')) return false;
    if (/^By [A-Z][a-z]+ [A-Z][a-z]+$/.test(p)) return false;
    return true;
  });
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

function cleanExcerpt(text) {
  if (!text) return '';
  return text
    // Remove leaked HTML attributes like data-medium-file="..." (complete or truncated)
    .replace(/\s*"?\s*data-[a-z-]+="[^"]*"?/gi, '')
    // Remove src="..." attributes that may have leaked
    .replace(/\s*"?\s*src="[^"]*"?/gi, '')
    // Remove width/height/alt/class/style attrs
    .replace(/\s*"?\s*(?:width|height|alt|class|style|loading|decoding)="[^"]*"?/gi, '')
    // Remove img tag leftovers including self-closing
    .replace(/<img[^>]*\/?>/gi, '')
    // Remove any remaining HTML tags
    .replace(/<[^>]+>/g, ' ')
    // Remove orphaned URL fragments (https://... at end of excerpt from truncated attrs)
    .replace(/\s*"?\s*https?:\/\/\S*$/i, '')
    // Remove orphaned closing quotes, slashes, and tag fragments
    .replace(/\s*"?\s*\/\s*>/g, '')
    .replace(/\s*"\s*$/g, '')
    .replace(/\s*\/>/g, '')
    // Clean up whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

function deduplicateArticles(articles) {
  const seen = new Set();
  return articles.filter(a => {
    const norm = (a.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (seen.has(norm)) return false;
    seen.add(norm);
    return true;
  });
}

function computeBriefing(articles) {
  if (!articles.length) return [];

  // Sort by date (newest first)
  const sorted = [...articles].sort((a, b) => {
    const dateA = new Date(a.pubDate || 0);
    const dateB = new Date(b.pubDate || 0);
    return dateB - dateA;
  });

  // Select top 3 with category diversity
  const stories = [];
  const usedCategories = new Set();

  for (const article of sorted) {
    if (stories.length >= 3) break;

    // First story is always the newest
    if (stories.length === 0) {
      stories.push(article);
      usedCategories.add(article.category);
      continue;
    }

    // Prefer diverse categories
    if (!usedCategories.has(article.category)) {
      stories.push(article);
      usedCategories.add(article.category);
    } else if (stories.length < 3) {
      // Fill remaining slots even if same category
      stories.push(article);
    }
  }

  return stories;
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

function json(data, status = 200, headers = {}, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
      ...extraHeaders
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// ANALYTICS ENGINE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Track a pageview to Analytics Engine + KV
 * Data structure:
 *   blobs[0] = siteId (for filtering by site)
 *   blobs[1] = pathname (for page-level analytics)
 *   blobs[2] = country (from CF geolocation)
 *   blobs[3] = referrer domain (for traffic sources)
 *   blobs[4] = articleId (if on story page)
 *   doubles[0] = 1 (count for aggregation)
 *   indexes[0] = siteId (for sampling)
 */
async function trackPageview(env, request, pathname, articleId = null) {
  try {
    const cf = request.cf || {};
    const referrer = request.headers.get('referer') || '';
    const referrerDomain = referrer ? new URL(referrer).hostname : 'direct';
    const country = cf.country || 'unknown';

    // Write to Analytics Engine (long-term storage)
    env.ANALYTICS.writeDataPoint({
      blobs: [
        CONFIG.siteId,
        pathname,
        country,
        referrerDomain,
        articleId || 'none'
      ],
      doubles: [1],
      indexes: [CONFIG.siteId]
    });

    // Write daily stats to KV for quick querying
    const today = new Date().toISOString().split('T')[0];
    const statsKey = `stats:${today}`;

    const stats = await env.ARTICLES_KV.get(statsKey, { type: 'json' }) || {
      views: 0,
      countries: {},
      pages: {},
      articles: {},
      referrers: {}
    };

    stats.views++;
    stats.countries[country] = (stats.countries[country] || 0) + 1;
    stats.pages[pathname] = (stats.pages[pathname] || 0) + 1;
    stats.referrers[referrerDomain] = (stats.referrers[referrerDomain] || 0) + 1;

    // Track individual article views
    if (articleId) {
      stats.articles[articleId] = (stats.articles[articleId] || 0) + 1;
    }

    stats.lastUpdate = new Date().toISOString();

    await env.ARTICLES_KV.put(statsKey, JSON.stringify(stats), {
      expirationTtl: 86400 * 90 // Keep for 90 days
    });

    // Send pageview to Nexcom for network-wide aggregation (fire and forget)
    fetch('https://nexcom.media/api/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        siteId: CONFIG.siteId,
        sessionId: `${CONFIG.siteId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        page: pathname,
        articleId,
        country
      })
    }).catch(() => {});

  } catch (e) {
    // Silent fail - analytics shouldn't break the site
  }
}

/**
 * Handle analytics API endpoint
 * Returns daily/weekly/monthly stats from KV
 */
async function handleAnalytics(env, url) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  try {
    const period = url.searchParams.get('period') || 'today';
    const now = new Date();

    // Calculate days to query
    let daysToQuery = 1;
    if (period === 'week') daysToQuery = 7;
    if (period === 'month') daysToQuery = 30;

    // Aggregate stats
    let totalViews = 0;
    const countries = {};
    const pages = {};
    const articles = {};
    const referrers = {};

    for (let i = 0; i < daysToQuery; i++) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateKey = date.toISOString().split('T')[0];
      const statsKey = `stats:${dateKey}`;

      const dayStats = await env.ARTICLES_KV.get(statsKey, { type: 'json' });
      if (dayStats) {
        totalViews += dayStats.views || 0;

        // Merge data
        for (const [k, v] of Object.entries(dayStats.countries || {})) {
          countries[k] = (countries[k] || 0) + v;
        }
        for (const [k, v] of Object.entries(dayStats.pages || {})) {
          pages[k] = (pages[k] || 0) + v;
        }
        for (const [k, v] of Object.entries(dayStats.articles || {})) {
          articles[k] = (articles[k] || 0) + v;
        }
        for (const [k, v] of Object.entries(dayStats.referrers || {})) {
          referrers[k] = (referrers[k] || 0) + v;
        }
      }
    }

    // Get top articles
    const topArticles = Object.entries(articles)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id, views]) => ({ id, views }));

    // Get top countries
    const topCountries = Object.entries(countries)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([country, views]) => ({ country, views }));

    return json({
      siteId: CONFIG.siteId,
      period,
      views: totalViews,
      topArticles,
      topCountries,
      pages,
      referrers,
      generated: now.toISOString()
    }, 200, cors);
  } catch (error) {
    return json({ error: 'Analytics error', details: error.message }, 500, cors);
  }
}

// ============================================================================
// SEO FUNCTIONS — Slug routing, SSR meta injection, sitemap
// ============================================================================

function escapeHtml(str) {
  if (!str) return '';
  // First decode any existing HTML entities to get clean text
  const decoded = decodeEntities(str);
  return decoded.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function decodeEntities(str) {
  if (!str) return '';
  return str
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&rsquo;/g, '\u2019')
    .replace(/&lsquo;/g, '\u2018')
    .replace(/&rdquo;/g, '\u201D')
    .replace(/&ldquo;/g, '\u201C')
    .replace(/&mdash;/g, '\u2014')
    .replace(/&ndash;/g, '\u2013')
    .replace(/&hellip;/g, '\u2026')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ');
}

function generateSlug(title) {
  if (!title) return 'article-' + Math.random().toString(36).slice(2, 10);
  return title.toLowerCase().replace(/[\u2018\u2019'']/g, '').replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 100);
}

async function serveNewsPage(env, url, request) {
  try {
    const data = await env.ARTICLES_KV.get('articles', { type: 'json' });
    const articles = deduplicateArticles(data?.articles || []).slice(0, 20);

    let templateResponse = await env.ASSETS.fetch(new Request(new URL('/news.html', url.origin), { method: 'GET', redirect: 'follow' }));
    if ([307, 301, 302].includes(templateResponse.status)) {
      const loc = templateResponse.headers.get('Location');
      if (loc) templateResponse = await env.ASSETS.fetch(new Request(new URL(loc, url.origin), { method: 'GET' }));
    }
    let html = await templateResponse.text();

    // SSR: Inject article list for SEO
    if (articles.length) {
      const listHtml = articles.map(a => {
        const slug = a.slug || generateSlug(a.title);
        const cat = a.category ? a.category.charAt(0).toUpperCase() + a.category.slice(1) : 'News';
        const excerpt = cleanExcerpt(a.excerpt || '').slice(0, 200);
        const rel = formatRelTime(a.publishDate);
        return `<li class="row"><a href="/news/${escapeHtml(slug)}" class="row-content" style="display:flex;flex-direction:column;gap:var(--s-2);"><span class="tag">${escapeHtml(cat)}</span><h3 class="row-title">${escapeHtml(a.title)}</h3>${excerpt ? `<p class="row-excerpt">${escapeHtml(excerpt)}</p>` : ''}<div class="byline"><span class="byline-source">${escapeHtml(a.source || '')}</span><span class="byline-divider">·</span><span>${rel}</span></div></a><a href="/news/${escapeHtml(slug)}">${img(a, 'row')}</a></li>`;
      }).join('');
      html = html.replace(/<li class="loading">Loading news…<\/li>/, listHtml);
      html = html.replace(/<li class="loading">Loading news\.\.\.<\/li>/, listHtml);
    }

    return addSecurityHeaders(new Response(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300', 'X-SSR': 'true' }
    }));
  } catch (error) {
    // Fallback to client-side rendering
    const newsRequest = new Request(new URL('/news.html', url.origin), request);
    return env.ASSETS.fetch(newsRequest);
  }
}

async function serveArticleBySlug(env, url, request) {
  const slug = url.pathname.replace('/news/', '').replace(/\/$/, '');
  try {
    const data = await env.ARTICLES_KV.get('articles', { type: 'json' });
    const articles = data?.articles || [];
    let article = articles.find(a => a.slug === slug);
    if (!article) article = articles.find(a => generateSlug(a.title) === slug);
    if (!article) return new Response('Article not found', { status: 404 });

    let templateResponse = await env.ASSETS.fetch(new Request(new URL('/story.html', url.origin), { method: 'GET', redirect: 'follow' }));
    if ([307, 301, 302].includes(templateResponse.status)) {
      const loc = templateResponse.headers.get('Location');
      if (loc) templateResponse = await env.ASSETS.fetch(new Request(new URL(loc, url.origin), { method: 'GET' }));
    }
    const template = await templateResponse.text();
    const html = injectArticleData(template, article);
    const lastModDate = article.updatedAt || article.modifiedAt || article.publishDate;
    const headers = {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'X-SSR': 'true'
    };
    if (lastModDate) {
      try {
        const lm = new Date(lastModDate).toUTCString();
        headers['Last-Modified'] = lm;
        // Weak ETag using id + lastmod
        headers['ETag'] = `W/"${article.id || article.slug || 'a'}-${new Date(lastModDate).getTime()}"`;
      } catch {}
    }
    // Honor If-Modified-Since
    const ims = request.headers.get('If-Modified-Since');
    if (ims && lastModDate) {
      try {
        if (new Date(ims).getTime() >= new Date(lastModDate).getTime()) {
          return new Response(null, { status: 304, headers });
        }
      } catch {}
    }
    return new Response(html, { status: 200, headers });
  } catch (error) {
    console.error('Article slug error:', error);
    return new Response('Error loading article', { status: 500 });
  }
}

function injectArticleData(template, article) {
  let html = template;
  const domain = CONFIG.publication.domain;
  const siteName = CONFIG.publication.name;
  const articleUrl = `https://${domain}/news/${article.slug || generateSlug(article.title)}`;
  const ogImage = article.image || `https://${domain}/og-image.png`;
  const articleBody = stripTags(article.content || article.excerpt || '');
  const wordCount = articleBody.split(/\s+/).filter(Boolean).length;
  const articleSection = article.category ? article.category.charAt(0).toUpperCase() + article.category.slice(1) : 'News';
  const datePublished = article.publishDate ? new Date(article.publishDate).toISOString() : new Date().toISOString();
  const dateModified = article.updatedAt || article.modifiedAt || datePublished;

  html = html.replace(/\{\{title\}\}/g, escapeHtml(article.title || ''));
  html = html.replace(/\{\{siteName\}\}/g, escapeHtml(siteName));
  html = html.replace(/\{\{description\}\}/g, escapeHtml(article.excerpt || `News from ${siteName}.`));
  html = html.replace(/\{\{og:title\}\}/g, escapeHtml(article.title || ''));
  html = html.replace(/\{\{og:description\}\}/g, escapeHtml(article.excerpt || ''));
  html = html.replace(/\{\{og:image\}\}/g, ogImage);
  html = html.replace(/\{\{og:url\}\}/g, articleUrl);

  // Inject extra meta tags right before </head>
  const metaTags = `
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="${escapeHtml(article.title || siteName)}" />
  <meta property="article:published_time" content="${datePublished}" />
  <meta property="article:modified_time" content="${dateModified}" />
  <meta property="article:section" content="${escapeHtml(articleSection)}" />
  <meta property="article:publisher" content="https://${domain}" />
  <meta name="news_keywords" content="${escapeHtml(articleSection.toLowerCase())}, veterans, ${escapeHtml((article.source || '').toLowerCase())}" />
  <meta name="author" content="${escapeHtml(article.author || article.source || siteName)}" />
  <link rel="alternate" hreflang="en-us" href="${articleUrl}" />`;
  html = html.replace('</head>', metaTags + '\n</head>');

  // NewsArticle schema with full SEO signals + isBasedOn for source attribution
  const newsArticleLd = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    '@id': articleUrl + '#article',
    headline: (article.title || '').slice(0, 110),
    alternativeHeadline: article.title || '',
    description: article.excerpt || '',
    image: {
      '@type': 'ImageObject',
      url: ogImage,
      width: 1200,
      height: 630
    },
    datePublished,
    dateModified,
    inLanguage: 'en-US',
    isAccessibleForFree: true,
    articleSection,
    articleBody: articleBody.slice(0, 5000),
    wordCount,
    author: article.author
      ? { '@type': 'Person', name: article.author }
      : { '@type': 'Organization', name: article.source || siteName, url: article.sourceUrl ? new URL(article.sourceUrl).origin : `https://${domain}` },
    publisher: {
      '@type': 'NewsMediaOrganization',
      '@id': `https://${domain}/#organization`,
      name: siteName,
      url: `https://${domain}`,
      logo: {
        '@type': 'ImageObject',
        url: `https://${domain}/og-image.png`,
        width: 600,
        height: 60
      }
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': articleUrl },
    url: articleUrl
  };
  if (article.sourceUrl) {
    newsArticleLd.isBasedOn = article.sourceUrl;
    newsArticleLd.sourceOrganization = { '@type': 'Organization', name: article.source || 'Source' };
  }

  // BreadcrumbList for navigation context
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `https://${domain}/` },
      { '@type': 'ListItem', position: 2, name: 'News', item: `https://${domain}/news` },
      { '@type': 'ListItem', position: 3, name: articleSection, item: `https://${domain}/${article.category || 'news'}` },
      { '@type': 'ListItem', position: 4, name: article.title || '', item: articleUrl }
    ]
  };

  const combinedLd = [newsArticleLd, breadcrumbLd];
  html = html.replace(/\{\{jsonLd\}\}/g, JSON.stringify(combinedLd));

  // SSR: Inject full article content so the page renders without JS
  const pubDate = article.publishDate ? new Date(article.publishDate).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  }) : '';
  const categoryLabel = article.category ? article.category.charAt(0).toUpperCase() + article.category.slice(1) : 'News';
  const readTime = Math.max(1, Math.ceil(wordCount / 230));
  const shareTitle = encodeURIComponent(article.title || 'Veteran News');
  const shareUrl = encodeURIComponent(articleUrl);
  const articleHtml = `
      <a href="/" class="back-link">← Back to briefing</a>
      <span class="tag story-tag">${escapeHtml(categoryLabel)}</span>
      <h1 class="story-title">${escapeHtml(article.title)}</h1>
      <div class="story-byline">
        <strong>${escapeHtml(article.source || siteName)}</strong>
        ${pubDate ? `<span>·</span><span>${pubDate}</span>` : ''}
        <span>·</span><span>${readTime} min read</span>
      </div>
      <div class="story-actions">
        <button class="action-btn" id="copy-btn" onclick="navigator.clipboard.writeText(window.location.href).then(()=>{this.textContent='✓ Copied'});setTimeout(()=>{this.textContent='📋 Copy link'},1500)">📋 Copy link</button>
        <a class="action-btn" target="_blank" rel="noopener" href="https://twitter.com/intent/tweet?text=${shareTitle}&url=${shareUrl}">𝕏 Share</a>
        <a class="action-btn" target="_blank" rel="noopener" href="https://www.linkedin.com/sharing/share-offsite/?url=${shareUrl}">in Share</a>
        <a class="action-btn" target="_blank" rel="noopener" href="https://www.facebook.com/sharer/sharer.php?u=${shareUrl}">f Share</a>
        <a class="action-btn" href="mailto:?subject=${shareTitle}&body=${shareUrl}">✉ Email</a>
      </div>
      ${article.image ? `<figure class="story-hero"><img src="${escapeHtml(article.image)}" alt="${escapeHtml(article.title || '')}" onerror="this.parentElement.outerHTML='<figure class=\\'story-hero\\'>${placeholderHtml(article, 'hero').replace(/'/g, '\\\'')}</figure>';this.onerror=null"></figure>` : `<figure class="story-hero">${placeholderHtml(article, 'hero')}</figure>`}
      <div class="story-body">
        ${formatArticleContent(article.content || article.excerpt || 'No content available.')}
      </div>
      ${article.sourceUrl ? `<div class="story-source">Originally reported by <strong>${escapeHtml(article.source || 'Source')}</strong>. <a href="${escapeHtml(article.sourceUrl)}" target="_blank" rel="noopener">Read the original article →</a></div>` : ''}
      <div class="related-articles" id="related-articles"></div>`;

  html = html.replace(
    /<a href="\/" class="back-link">[^<]*Back to briefing<\/a>\s*<div class="loading" id="loading">Loading story…<\/div>/,
    articleHtml
  );
  html = html.replace(
    /<a href="\/" class="back-link">[^<]*Back to briefing<\/a>\s*<div class="loading" id="loading">Loading story\.\.\.<\/div>/,
    articleHtml
  );

  return html;
}

async function redirectStoryToSlug(env, url) {
  const id = url.searchParams.get('id');
  if (!id) return Response.redirect(`https://${CONFIG.publication.domain}/`, 301);
  try {
    const data = await env.ARTICLES_KV.get('articles', { type: 'json' });
    const articles = data?.articles || [];
    let article = articles.find(a => String(a.id) === String(id)) || articles.find(a => a.archiveId === id);
    if (article) return Response.redirect(`https://${CONFIG.publication.domain}/news/${article.slug || generateSlug(article.title)}`, 301);
  } catch (e) {}
  return new Response(null, { status: 302, headers: { Location: `https://${CONFIG.publication.domain}/` } });
}

function getNewsPageStyles() {
  return `<style>:root{--color-bg:#fff;--color-text:#000;--color-secondary:#555;--color-muted:#888;--color-border:rgba(0,0,0,0.1);--color-accent:#1e3a5f;--font-sans:'Inter',system-ui,sans-serif;--font-serif:'Source Serif Pro',Georgia,serif}*{box-sizing:border-box;margin:0;padding:0}body{font-family:var(--font-sans);color:var(--color-text);background:var(--color-bg);line-height:1.6}a{color:inherit;text-decoration:none}#app{max-width:680px;margin:0 auto;padding:0 1rem}.masthead{display:flex;align-items:center;justify-content:space-between;padding:1rem 0;border-bottom:1px solid var(--color-border)}.brand{font-family:var(--font-serif);font-size:1.25rem;font-weight:700}.nav-link{font-size:.875rem;color:var(--color-secondary)}.nav-active{color:var(--color-accent);font-weight:600}.main{padding:1rem 0}.page-title{font-family:var(--font-serif);font-size:1.5rem;font-weight:600;margin:1rem 0 .75rem}.category-nav{display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:1rem;padding-bottom:.75rem;border-bottom:1px solid var(--color-border)}.category-link{font-size:.875rem;padding:6px 12px;border-radius:20px;background:rgba(0,0,0,.05);color:var(--color-secondary)}.category-active{background:var(--color-accent);color:#fff}.news-feed{display:flex;flex-direction:column;gap:.75rem}.news-item{border-bottom:1px solid var(--color-border);padding-bottom:.75rem}.news-item-link{display:flex;gap:.75rem}.news-item-image{flex-shrink:0;width:100px;height:75px;border-radius:6px;object-fit:cover}.news-item-content{flex:1}.news-item-category{font-size:11px;font-weight:600;text-transform:uppercase;color:var(--color-accent)}.news-item-title{font-family:var(--font-serif);font-size:1rem;font-weight:500;margin:2px 0 4px;line-height:1.3}.news-item-excerpt{font-size:.875rem;color:var(--color-secondary);margin:0}.news-item-meta{font-size:12px;color:var(--color-muted);margin-top:4px;display:block}.empty{text-align:center;padding:2rem;color:var(--color-muted)}.footer{margin-top:3rem;padding:1.5rem 0;border-top:1px solid var(--color-border);text-align:center}.footer-tagline{font-size:1rem;color:var(--color-muted);margin-bottom:1rem}.footer-nav{display:flex;flex-wrap:wrap;justify-content:center;gap:.5rem 1.25rem;margin-bottom:1rem}.footer-nav a{font-size:.875rem;color:var(--color-muted)}.footer-copyright{font-size:.75rem;color:var(--color-muted)}.back-link{font-size:.875rem;color:var(--color-muted);display:inline-block;margin-bottom:.75rem}@media(prefers-color-scheme:dark){:root{--color-bg:#1a1a1a;--color-text:#e5e5e5;--color-secondary:#aaa;--color-muted:#777;--color-border:rgba(255,255,255,.1)}}</style>`;
}

async function serveNewsHub(env, request, url) {
  try {
    const data = await env.ARTICLES_KV.get('articles', { type: 'json' });
    const articles = deduplicateArticles(data?.articles || []);
    const domain = CONFIG.publication.domain;
    const siteName = CONFIG.publication.name;
    const region = CONFIG.publication.region || siteName;
    const articleListHtml = articles.map(a => { const slug = a.slug || generateSlug(a.title); const date = a.publishDate ? new Date(a.publishDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''; const category = a.category || 'general'; return `<article class="news-item"><a href="/news/${escapeHtml(slug)}" class="news-item-link">${a.image ? `<img src="${escapeHtml(a.image)}" alt="${escapeHtml(a.title)}" class="news-item-image" loading="lazy" />` : ''}<div class="news-item-content"><span class="news-item-category">${escapeHtml(category)}</span><h3 class="news-item-title">${escapeHtml(a.title)}</h3><p class="news-item-excerpt">${escapeHtml(cleanExcerpt(a.excerpt || '').slice(0, 150))}</p><span class="news-item-meta">${escapeHtml(a.source || '')} &middot; ${date}</span></div></a></article>`; }).join('');
    const categories = [...new Set(articles.map(a => a.category || 'general'))];
    const catLinks = categories.map(c => `<a href="/news/category/${escapeHtml(c)}" class="category-link">${escapeHtml(c.charAt(0).toUpperCase() + c.slice(1))}</a>`).join('');
    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>News | ${siteName}</title><meta name="description" content="All the latest news from ${siteName}." /><meta property="og:title" content="All News | ${siteName}" /><meta property="og:url" content="https://${domain}/news" /><link rel="canonical" href="https://${domain}/news" /><link rel="icon" type="image/svg+xml" href="/favicon.svg" /><link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin /><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Source+Serif+Pro:wght@600;700&display=swap" rel="stylesheet" />${getNewsPageStyles()}</head><body><div id="app"><header class="masthead"><div><a href="/" class="brand">${siteName}</a></div><div style="display:flex;gap:1rem"><a href="/news" class="nav-link nav-active">News</a><a href="/events" class="nav-link">Events</a><a href="/resources" class="nav-link">Find Help</a></div></header><main class="main"><h1 class="page-title">All News</h1><nav class="category-nav"><a href="/news" class="category-link category-active">All</a>${catLinks}</nav><div class="news-feed">${articleListHtml || '<p class="empty">No articles yet.</p>'}</div></main><footer class="footer"><p class="footer-tagline">${siteName}</p><nav class="footer-nav"><a href="/news">All News</a><a href="/events">Events</a><a href="/resources">Find Help</a></nav><p style="margin-bottom:0.5rem"><a href="https://warriorsfund.org" target="_blank" rel="noopener" style="color:var(--color-accent);font-size:0.875rem;font-weight:500">Veteran Resources | Warriors Fund</a></p><p class="footer-copyright">&copy; 2026 ${siteName} &middot; <a href="https://nexcom.media">Nexcom Media</a></p></footer></div></body></html>`;
    return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300', 'X-SSR': 'true' } });
  } catch (error) { return new Response('Error', { status: 500 }); }
}

async function serveCategoryPage(env, request, url) {
  const category = url.pathname.replace('/news/category/', '').replace(/\/$/, '').toLowerCase();
  try {
    const data = await env.ARTICLES_KV.get('articles', { type: 'json' });
    const allArticles = data?.articles || [];
    const articles = allArticles.filter(a => (a.category || 'general').toLowerCase() === category);
    const domain = CONFIG.publication.domain;
    const siteName = CONFIG.publication.name;
    const catTitle = category.charAt(0).toUpperCase() + category.slice(1);
    const articleListHtml = articles.map(a => { const slug = a.slug || generateSlug(a.title); const date = a.publishDate ? new Date(a.publishDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''; return `<article class="news-item"><a href="/news/${escapeHtml(slug)}" class="news-item-link"><div class="news-item-content"><h3 class="news-item-title">${escapeHtml(a.title)}</h3><p class="news-item-excerpt">${escapeHtml((a.excerpt || '').slice(0, 150))}</p><span class="news-item-meta">${escapeHtml(a.source || '')} &middot; ${date}</span></div></a></article>`; }).join('');
    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${catTitle} News | ${siteName}</title><meta name="description" content="${catTitle} news from ${siteName}." /><link rel="canonical" href="https://${domain}/news/category/${category}" /><link rel="icon" type="image/svg+xml" href="/favicon.svg" /><link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin /><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Source+Serif+Pro:wght@600;700&display=swap" rel="stylesheet" />${getNewsPageStyles()}</head><body><div id="app"><header class="masthead"><div><a href="/" class="brand">${siteName}</a></div><div style="display:flex;gap:1rem"><a href="/news" class="nav-link nav-active">News</a><a href="/events" class="nav-link">Events</a></div></header><main class="main"><a href="/news" class="back-link">&larr; All News</a><h1 class="page-title">${catTitle} News</h1><div class="news-feed">${articleListHtml || '<p class="empty">No articles found.</p>'}</div></main><footer class="footer"><p style="margin-bottom:0.5rem"><a href="https://warriorsfund.org" target="_blank" rel="noopener" style="color:var(--color-accent);font-size:0.875rem;font-weight:500">Veteran Resources | Warriors Fund</a></p><p class="footer-copyright">&copy; 2026 ${siteName} &middot; <a href="https://nexcom.media">Nexcom Media</a></p></footer></div></body></html>`;
    return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300', 'X-SSR': 'true' } });
  } catch (error) { return new Response('Error', { status: 500 }); }
}

// ─── Homepage SSR ─────────────────────────────────────────────────────────
async function serveHomepage(env, url, request) {
  try {
    const data = await env.ARTICLES_KV.get('articles', { type: 'json' });
    const allArticles = deduplicateArticles(data?.articles || []).map(a => ({
      ...a,
      excerpt: a.excerpt ? cleanExcerpt(a.excerpt) : a.excerpt
    }));
    const events = (data?.events || []);
    const briefing = computeBriefing(allArticles).slice(0, 5);
    const briefingIds = new Set(briefing.map(s => s.id));
    const otherStories = allArticles.filter(a => !briefingIds.has(a.id)).slice(0, 9);

    let templateResponse = await env.ASSETS.fetch(new Request(new URL('/index.html', url.origin), { method: 'GET', redirect: 'follow' }));
    if ([301, 302, 307].includes(templateResponse.status)) {
      const loc = templateResponse.headers.get('Location');
      if (loc) templateResponse = await env.ASSETS.fetch(new Request(new URL(loc, url.origin), { method: 'GET' }));
    }
    let html = await templateResponse.text();

    // Inject lead story
    const lead = briefing[0];
    if (lead) {
      const leadHtml = `
        <a href="/news/${escapeHtml(lead.slug || generateSlug(lead.title))}" class="lead-story">
          ${img(lead, 'lead', 'eager')}
          <div class="lead-story-body">
            <span class="tag">${escapeHtml(formatCat(lead.category))}</span>
            <h2>${escapeHtml(lead.title)}</h2>
            ${lead.excerpt ? `<p>${escapeHtml(truncateText(lead.excerpt, 220))}</p>` : ''}
            <div class="byline">
              <span class="byline-source">${escapeHtml(lead.source || 'Veteran News')}</span>
              <span class="byline-divider">·</span>
              <span>${formatRelTime(lead.publishDate || lead.pubDate)}</span>
            </div>
          </div>
        </a>`;
      html = html.replace(/<div id="lead-story-mount">[\s\S]*?<\/div>\s*<\/div>/, `<div id="lead-story-mount">${leadHtml}</div>\n          <ol class="briefing-list" id="briefing-list">__BRF_LIST__</ol>`);
    }

    // Inject briefing list (rest of briefing)
    const restBrf = briefing.slice(1, 5);
    if (restBrf.length) {
      const brfHtml = restBrf.map(s => `
        <li class="briefing-item">
          <a href="/news/${escapeHtml(s.slug || generateSlug(s.title))}" style="display:block;">
            <span class="tag">${escapeHtml(formatCat(s.category))}</span>
            <h3>${escapeHtml(s.title)}</h3>
            <div class="byline"><span class="byline-source">${escapeHtml(s.source || 'Veteran News')}</span><span class="byline-divider">·</span><span>${formatRelTime(s.publishDate || s.pubDate)}</span></div>
          </a>
        </li>`).join('');
      html = html.replace('__BRF_LIST__', brfHtml);
    } else {
      html = html.replace('__BRF_LIST__', '');
    }

    // Inject story feed
    if (otherStories.length) {
      const storyHtml = otherStories.map(s => `
        <article class="card">
          <a href="/news/${escapeHtml(s.slug || generateSlug(s.title))}" style="display:flex;flex-direction:column;flex:1;">
            ${img(s, 'card')}
            <div class="card-body">
              <span class="tag">${escapeHtml(formatCat(s.category))}</span>
              <h3 class="card-title">${escapeHtml(s.title)}</h3>
              ${s.excerpt ? `<p class="card-excerpt">${escapeHtml(truncateText(s.excerpt, 140))}</p>` : ''}
              <div class="byline"><span class="byline-source">${escapeHtml(s.source || 'Veteran News')}</span><span class="byline-divider">·</span><span>${formatRelTime(s.publishDate || s.pubDate)}</span></div>
            </div>
          </a>
        </article>`).join('');
      html = html.replace(/<div class="feed-grid" id="story-list">[\s\S]*?<\/div>\s*<div class="load-more"/,
        `<div class="feed-grid" id="story-list">${storyHtml}</div>\n        <div class="load-more"`);
    }

    // Inject upcoming events server-side
    const now = new Date();
    const upcoming = events
      .filter(e => new Date(e.startDate) > now)
      .sort((a, b) => new Date(a.startDate) - new Date(b.startDate))
      .slice(0, 4);
    if (upcoming.length >= 2) {
      const evHtml = upcoming.map(ev => {
        const d = new Date(ev.startDate);
        const month = d.toLocaleDateString('en-US', { month: 'short' });
        const day = d.getDate();
        const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        return `
          <a href="${escapeHtml(ev.url || '#')}" target="_blank" rel="noopener" class="event">
            <div class="event-cal"><div class="event-cal-month">${month}</div><div class="event-cal-day">${day}</div></div>
            <div class="event-info">
              <div class="event-title">${escapeHtml(truncateText(ev.title, 80))}</div>
              <div class="event-meta"><span>${dateStr} · ${time}</span>${ev.isVirtual ? '<span class="badge virtual">Virtual</span>' : ''}${ev.organization ? `<span>${escapeHtml(ev.organization)}</span>` : ''}</div>
            </div>
          </a>`;
      }).join('');
      html = html.replace(/<div id="events-list" class="event-list">[\s\S]*?<\/div>/,
        `<div id="events-list" class="event-list">${evHtml}</div>`);
    }

    // Inject Most Read column (top 5 by qualityScore in last 24h)
    const dayAgo = Date.now() - 24 * 3600 * 1000;
    const mostReadPool = allArticles
      .filter(a => !briefingIds.has(a.id))
      .filter(a => {
        const t = a.publishDate ? new Date(a.publishDate).getTime() : 0;
        return t >= dayAgo;
      });
    const mostReadList = (mostReadPool.length >= 5 ? mostReadPool : allArticles.filter(a => !briefingIds.has(a.id)))
      .slice()
      .sort((a, b) => (b.qualityScore || 0) - (a.qualityScore || 0))
      .slice(0, 5);
    if (mostReadList.length) {
      const mrHtml = mostReadList.map(s => `
        <li>
          <a href="/news/${escapeHtml(s.slug || generateSlug(s.title))}">${escapeHtml(s.title)}</a>
          <span class="most-read-source">${escapeHtml(s.source || 'Veteran News')} · ${formatRelTime(s.publishDate || s.pubDate)}</span>
        </li>`).join('');
      html = html.replace(/<ol class="most-read-list" id="most-read-list">[\s\S]*?<\/ol>/,
        `<ol class="most-read-list" id="most-read-list">${mrHtml}</ol>`);
    }

    // Inject stats
    html = html.replace(
      'id="stat-stories">—</div>',
      `id="stat-stories">${allArticles.length}</div>`
    );
    html = html.replace(
      'id="stat-events">—</div>',
      `id="stat-events">${upcoming.length}</div>`
    );
    html = html.replace(
      '<strong id="status-stories">—</strong>',
      `<strong id="status-stories">${allArticles.length}</strong>`
    );

    return addSecurityHeaders(new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=180',
        'X-SSR': 'homepage'
      }
    }));
  } catch (error) {
    console.error('Homepage SSR error:', error);
    return env.ASSETS.fetch(request);
  }
}

function formatCat(c) { return c ? c.charAt(0).toUpperCase() + c.slice(1) : 'News'; }
function truncateText(s, n) { if (!s || typeof s !== 'string') return ''; if (s.length <= n) return s; return s.substring(0, n).trim() + '…'; }
function formatRelTime(d) {
  if (!d) return '';
  const date = new Date(d);
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

// ─── Search API ───────────────────────────────────────────────────────────
async function serveSearch(env, cors, url) {
  try {
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();
    const limit = Math.min(parseInt(url.searchParams.get('limit')) || 30, 100);
    if (!q) return json({ articles: [], total: 0, query: q }, 200, cors);

    const data = await env.ARTICLES_KV.get('articles', { type: 'json' });
    const all = deduplicateArticles(data?.articles || []);
    const matches = all.filter(a => {
      const hay = `${a.title || ''} ${a.excerpt || ''} ${a.source || ''}`.toLowerCase();
      return hay.includes(q);
    }).map(({ content, ...rest }) => rest);

    return json({
      query: q,
      articles: matches.slice(0, limit),
      total: matches.length
    }, 200, cors, { 'Cache-Control': 'public, max-age=60' });
  } catch (error) {
    return json({ error: 'Search failed' }, 500, cors);
  }
}

// ─── Newsletter API ───────────────────────────────────────────────────────
async function handleNewsletter(env, request, cors) {
  if (!request || request.method !== 'POST') {
    return json({ error: 'POST only' }, 405, cors);
  }
  try {
    const { email } = await request.json();
    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: 'Invalid email' }, 400, cors);
    }
    const key = `newsletter:${email.toLowerCase()}`;
    const existing = await env.ARTICLES_KV.get(key);
    if (existing) {
      return json({ ok: true, message: 'Already subscribed' }, 200, cors);
    }
    await env.ARTICLES_KV.put(key, JSON.stringify({
      email: email.toLowerCase(),
      subscribedAt: new Date().toISOString(),
      source: 'web'
    }));
    return json({ ok: true, message: 'Subscribed' }, 200, cors);
  } catch (error) {
    return json({ error: 'Subscription failed' }, 500, cors);
  }
}

// ─── Sources API ──────────────────────────────────────────────────────────
async function serveSources(env, cors) {
  try {
    const data = await env.ARTICLES_KV.get('articles', { type: 'json' });
    const articles = data?.articles || [];
    const sourceMap = {};
    for (const a of articles) {
      const src = a.source || 'Unknown';
      if (!sourceMap[src]) sourceMap[src] = { name: src, count: 0, latest: null };
      sourceMap[src].count++;
      if (!sourceMap[src].latest || new Date(a.publishDate) > new Date(sourceMap[src].latest)) {
        sourceMap[src].latest = a.publishDate;
      }
    }
    const sources = Object.values(sourceMap).sort((a, b) => b.count - a.count);
    return json({ sources, total: sources.length }, 200, cors,
      { 'Cache-Control': 'public, max-age=600' });
  } catch (error) {
    return json({ error: 'Failed to fetch sources' }, 500, cors);
  }
}

// ─── RSS Feed ─────────────────────────────────────────────────────────────
async function handleRSS(env, url) {
  const baseUrl = `https://${CONFIG.publication.domain}`;
  try {
    const data = await env.ARTICLES_KV.get('articles', { type: 'json' });
    const articles = deduplicateArticles(data?.articles || []).slice(0, 50);
    const now = new Date().toUTCString();

    const items = articles.map(a => {
      const slug = a.slug || generateSlug(a.title);
      const pubDate = a.publishDate ? new Date(a.publishDate).toUTCString() : now;
      const link = `${baseUrl}/news/${slug}`;
      const title = (a.title || '').replace(/]]>/g, ']]&gt;');
      const desc = cleanExcerpt(a.excerpt || '').slice(0, 500).replace(/]]>/g, ']]&gt;');
      const cat = a.category || 'news';
      return `
    <item>
      <title><![CDATA[${title}]]></title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <pubDate>${pubDate}</pubDate>
      <category>${cat}</category>
      <source url="${baseUrl}">${escapeHtml(a.source || 'Veteran News')}</source>
      <description><![CDATA[${desc}]]></description>
    </item>`;
    }).join('');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Veteran News</title>
    <link>${baseUrl}</link>
    <atom:link href="${baseUrl}/rss.xml" rel="self" type="application/rss+xml" />
    <description>Ground truth for those who served. The trusted daily intelligence briefing for U.S. veterans. A Warriors Fund initiative.</description>
    <language>en-US</language>
    <copyright>© 2026 Veteran News · Warriors Fund</copyright>
    <managingEditor>news@veteransnews.org (Veteran News)</managingEditor>
    <lastBuildDate>${now}</lastBuildDate>
    <pubDate>${now}</pubDate>
    <ttl>180</ttl>
    <image>
      <url>${baseUrl}/og-image.png</url>
      <title>Veteran News</title>
      <link>${baseUrl}</link>
    </image>${items}
  </channel>
</rss>`;
    return new Response(xml, {
      status: 200,
      headers: {
        'Content-Type': 'application/rss+xml; charset=utf-8',
        'Cache-Control': 'public, max-age=900'
      }
    });
  } catch (error) {
    return new Response('<?xml version="1.0"?><rss version="2.0"><channel><title>Veteran News</title></channel></rss>',
      { status: 200, headers: { 'Content-Type': 'application/rss+xml' } });
  }
}

function stripTags(s) {
  if (!s) return '';
  return String(s).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

// ─── Sitemap index + split sitemaps ───────────────────────────────────────
async function handleSitemapIndex(env) {
  const baseUrl = `https://${CONFIG.publication.domain}`;
  const now = new Date().toISOString();
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>${baseUrl}/sitemap-pages.xml</loc><lastmod>${now}</lastmod></sitemap>
  <sitemap><loc>${baseUrl}/sitemap-articles.xml</loc><lastmod>${now}</lastmod></sitemap>
  <sitemap><loc>${baseUrl}/sitemap-news.xml</loc><lastmod>${now}</lastmod></sitemap>
  <sitemap><loc>${baseUrl}/sitemap-images.xml</loc><lastmod>${now}</lastmod></sitemap>
</sitemapindex>`;
  return new Response(xml, { status: 200, headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=900' } });
}

async function handleSitemapPages(env) {
  const baseUrl = `https://${CONFIG.publication.domain}`;
  const now = new Date().toISOString();
  const SECTIONS = ['benefits', 'health', 'service', 'transition', 'advocacy', 'legacy', 'community', 'family'];
  const BRANCHES = ['army', 'navy', 'air-force', 'marines', 'coast-guard', 'space-force'];
  const PAGES = [
    { path: '/', priority: 1.0, freq: 'hourly' },
    { path: '/news', priority: 0.9, freq: 'hourly' },
    { path: '/events', priority: 0.9, freq: 'daily' },
    { path: '/resources', priority: 0.9, freq: 'monthly' },
    { path: '/about', priority: 0.7, freq: 'monthly' },
    { path: '/donate', priority: 0.8, freq: 'monthly' },
    { path: '/topics', priority: 0.7, freq: 'weekly' },
    { path: '/branches', priority: 0.7, freq: 'weekly' },
    { path: '/archive', priority: 0.7, freq: 'daily' },
    { path: '/sources', priority: 0.7, freq: 'weekly' },
    { path: '/tools', priority: 0.7, freq: 'monthly' },
    { path: '/newsletter', priority: 0.6, freq: 'monthly' },
    { path: '/editorial-standards', priority: 0.5, freq: 'yearly' },
    { path: '/corrections', priority: 0.5, freq: 'monthly' },
    { path: '/privacy', priority: 0.4, freq: 'yearly' },
    { path: '/terms', priority: 0.4, freq: 'yearly' },
    { path: '/press', priority: 0.5, freq: 'monthly' },
    { path: '/contact', priority: 0.5, freq: 'yearly' }
  ];
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;
  for (const p of PAGES) {
    xml += `\n  <url><loc>${baseUrl}${p.path}</loc><lastmod>${now}</lastmod><changefreq>${p.freq}</changefreq><priority>${p.priority}</priority></url>`;
  }
  for (const s of SECTIONS) {
    xml += `\n  <url><loc>${baseUrl}/${s}</loc><lastmod>${now}</lastmod><changefreq>hourly</changefreq><priority>0.85</priority></url>`;
  }
  for (const b of BRANCHES) {
    xml += `\n  <url><loc>${baseUrl}/branch/${b}</loc><lastmod>${now}</lastmod><changefreq>daily</changefreq><priority>0.7</priority></url>`;
  }
  xml += '\n</urlset>';
  return new Response(xml, { status: 200, headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}

async function handleSitemapArticles(env) {
  const baseUrl = `https://${CONFIG.publication.domain}`;
  let articles = [];

  // Prefer D1 for the full archive (no 2000-cap, supports modified_date for accurate lastmod)
  if (env.DB) {
    try {
      const rs = await env.DB.prepare(`
        SELECT slug, title, image, publish_date, modified_date
        FROM articles WHERE link_status != 'broken' AND low_quality = 0
        ORDER BY publish_date DESC LIMIT 50000
      `).all();
      articles = (rs.results || []).map(r => ({
        slug: r.slug, title: r.title, image: r.image,
        publishDate: r.publish_date, modifiedDate: r.modified_date
      }));
    } catch (e) { console.error('sitemap d1 fail', e?.message); }
  }
  // Fallback to KV
  if (!articles.length) {
    try {
      const data = await env.ARTICLES_KV.get('articles', { type: 'json' });
      articles = deduplicateArticles(data?.articles || []);
    } catch {}
  }

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">`;
  for (const a of articles.slice(0, 50000)) {
    const slug = a.slug || generateSlug(a.title);
    const lastmod = (a.modifiedDate || a.publishDate) ? new Date(a.modifiedDate || a.publishDate).toISOString() : '';
    xml += `\n  <url><loc>${baseUrl}/news/${slug}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}<changefreq>weekly</changefreq><priority>0.8</priority>${a.image ? `<image:image><image:loc>${escapeHtml(a.image)}</image:loc><image:title>${escapeHtml(a.title || '')}</image:title></image:image>` : ''}</url>`;
  }
  xml += '\n</urlset>';
  return new Response(xml, { status: 200, headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=900' } });
}

// Google News sitemap — last 48 hours only, with news: namespace
async function handleNewsSitemap(env) {
  const baseUrl = `https://${CONFIG.publication.domain}`;
  try {
    const data = await env.ARTICLES_KV.get('articles', { type: 'json' });
    const articles = deduplicateArticles(data?.articles || []);
    const cutoff = Date.now() - 48 * 60 * 60 * 1000;
    const recent = articles.filter(a => {
      const t = a.publishDate ? new Date(a.publishDate).getTime() : 0;
      return t >= cutoff;
    }).slice(0, 1000);
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">`;
    for (const a of recent) {
      const slug = a.slug || generateSlug(a.title);
      const pubDate = a.publishDate ? new Date(a.publishDate).toISOString() : new Date().toISOString();
      xml += `\n  <url>
    <loc>${baseUrl}/news/${slug}</loc>
    <news:news>
      <news:publication>
        <news:name>Veteran News</news:name>
        <news:language>en</news:language>
      </news:publication>
      <news:publication_date>${pubDate}</news:publication_date>
      <news:title>${escapeHtml(a.title || '')}</news:title>
    </news:news>
  </url>`;
    }
    xml += '\n</urlset>';
    return new Response(xml, { status: 200, headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });
  } catch (e) {
    return new Response(`<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`, { status: 200, headers: { 'Content-Type': 'application/xml' } });
  }
}

// Legacy single sitemap — kept as alias
async function handleSitemap(env) {
  const baseUrl = `https://${CONFIG.publication.domain}`;
  try {
    const data = await env.ARTICLES_KV.get('articles', { type: 'json' });
    const articles = data?.articles || [];
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${baseUrl}/</loc><changefreq>hourly</changefreq><priority>1.0</priority></url>\n  <url><loc>${baseUrl}/news</loc><changefreq>hourly</changefreq><priority>0.9</priority></url>\n  <url><loc>${baseUrl}/events</loc><changefreq>daily</changefreq><priority>0.9</priority></url>\n  <url><loc>${baseUrl}/resources</loc><changefreq>monthly</changefreq><priority>0.8</priority></url>\n  <url><loc>${baseUrl}/about</loc><changefreq>monthly</changefreq><priority>0.7</priority></url>\n  <url><loc>${baseUrl}/donate</loc><changefreq>monthly</changefreq><priority>0.7</priority></url>`;
    for (const article of articles) {
      const slug = article.slug || generateSlug(article.title);
      const lastmod = article.publishDate ? new Date(article.publishDate).toISOString().split('T')[0] : '';
      xml += `\n  <url><loc>${baseUrl}/news/${slug}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}<changefreq>weekly</changefreq><priority>0.8</priority></url>`;
    }
    xml += '\n</urlset>';
    return new Response(xml, { status: 200, headers: { 'Content-Type': 'application/xml', 'Cache-Control': 'public, max-age=3600' } });
  } catch (error) {
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${baseUrl}/</loc></url></urlset>`, { status: 200, headers: { 'Content-Type': 'application/xml' } });
  }
}

// ════════════════════════════════════════════════════════════════════════════
// SECTION / BRANCH / TOPIC PAGES — SSR with shared layout
// ════════════════════════════════════════════════════════════════════════════

const SECTION_META = {
  benefits: {
    title: 'Benefits & Compensation',
    eyebrow: 'Section',
    lede: "Disability claims, GI Bill, VA pension, home loans, healthcare enrollment — the full picture on benefits earned through service.",
    quickLinks: [
      ['File a disability claim', 'https://www.va.gov/disability/how-to-file-claim/'],
      ['GI Bill benefits', 'https://www.va.gov/education/about-gi-bill-benefits/'],
      ['VA home loans', 'https://www.va.gov/housing-assistance/home-loans/'],
      ['Disability rates by %', 'https://warriorsfund.org/benefits/disability-rates'],
      ['PACT Act conditions', 'https://warriorsfund.org/benefits/pact-act'],
      ['Claim help walkthrough', '/claim-help']
    ],
    wfConditions: [
      { name: 'PTSD', url: 'https://warriorsfund.org/veterans/ptsd' },
      { name: 'TBI', url: 'https://warriorsfund.org/veterans/tbi' },
      { name: 'Burn Pit Exposure', url: 'https://warriorsfund.org/veterans/burn-pit' },
      { name: 'Agent Orange', url: 'https://warriorsfund.org/veterans/agent-orange' },
      { name: 'Camp Lejeune', url: 'https://warriorsfund.org/veterans/camp-lejeune' },
      { name: 'Hearing Loss', url: 'https://warriorsfund.org/veterans/hearing-loss' },
      { name: 'Tinnitus', url: 'https://warriorsfund.org/veterans/tinnitus' },
      { name: 'Sleep Apnea', url: 'https://warriorsfund.org/veterans/sleep-apnea' }
    ]
  },
  health: {
    title: 'Health & Wellness',
    eyebrow: 'Section',
    lede: "Mental health, PTSD, MST, addiction recovery, women's health, toxic exposure — coverage across the full health spectrum that affects veterans.",
    quickLinks: [
      ['VA Mental Health', 'https://www.mentalhealth.va.gov/'],
      ['National Center for PTSD', 'https://www.ptsd.va.gov/'],
      ['Find a Vet Center', 'https://www.va.gov/vet-center/'],
      ['Mental health resources', 'https://warriorsfund.org/resources/type/mental-health'],
      ['Crisis support hub', '/crisis']
    ],
    wfConditions: [
      { name: 'PTSD', url: 'https://warriorsfund.org/veterans/ptsd' },
      { name: 'TBI / Traumatic Brain Injury', url: 'https://warriorsfund.org/veterans/tbi' },
      { name: 'MST', url: 'https://warriorsfund.org/veterans/mst' },
      { name: 'Depression', url: 'https://warriorsfund.org/veterans/depression' },
      { name: 'Anxiety', url: 'https://warriorsfund.org/veterans/anxiety' },
      { name: 'Burn Pit / PACT Act', url: 'https://warriorsfund.org/veterans/burn-pit' },
      { name: 'Agent Orange', url: 'https://warriorsfund.org/veterans/agent-orange' },
      { name: 'Gulf War Illness', url: 'https://warriorsfund.org/veterans/gulf-war-illness' },
      { name: 'Camp Lejeune', url: 'https://warriorsfund.org/veterans/camp-lejeune' },
      { name: 'Sleep Apnea', url: 'https://warriorsfund.org/veterans/sleep-apnea' },
      { name: 'Tinnitus', url: 'https://warriorsfund.org/veterans/tinnitus' },
      { name: 'Hearing Loss', url: 'https://warriorsfund.org/veterans/hearing-loss' }
    ]
  },
  service: {
    title: 'In Service',
    eyebrow: 'Section',
    lede: "Active duty news that veterans care about — policy, deployments, service-branch decisions, and the threads that connect to those still serving.",
    quickLinks: []
  },
  transition: {
    title: 'Transition & Careers',
    eyebrow: 'Section',
    lede: "Out-processing, civilian careers, employer hiring programs, MOS-to-civilian skill translation, education, and post-service identity.",
    quickLinks: [
      ['Hiring Our Heroes', 'https://www.hiringourheroes.org/'],
      ['VR&E (Chapter 31)', 'https://www.va.gov/careers-employment/vocational-rehabilitation/'],
      ['O*NET Military Crosswalk', 'https://www.onetonline.org/crosswalk/MOC/'],
      ['SBA Veteran Business', 'https://www.sba.gov/business-guide/grow-your-business/veteran-owned-businesses']
    ]
  },
  advocacy: {
    title: 'Advocacy & Policy',
    eyebrow: 'Section',
    lede: "Capitol Hill, VSO advocacy, policy fights, Congressional hearings, and the slow grind of getting promises kept.",
    quickLinks: [
      ['DAV', 'https://www.dav.org/'],
      ['VFW', 'https://www.vfw.org/'],
      ['American Legion', 'https://www.legion.org/'],
      ['IAVA', 'https://iava.org/']
    ]
  },
  legacy: {
    title: 'Legacy & History',
    eyebrow: 'Section',
    lede: "Military culture, history, memorialization, and the stories that anchor what came before — from WWII to GWOT.",
    quickLinks: []
  },
  community: {
    title: 'Community',
    eyebrow: 'Section',
    lede: "Veterans helping veterans — peer programs, volunteer organizations, recovery communities, and the connections that make life after service work.",
    quickLinks: [
      ['Team Rubicon', 'https://www.teamrubicon.org/'],
      ['Wounded Warrior Project', 'https://www.woundedwarriorproject.org/']
    ]
  },
  family: {
    title: 'Family & Caregivers',
    eyebrow: 'Section',
    lede: "Spouses, kids, caregivers, survivors — the home front that holds everything together. Programs, benefits, and stories for veteran families.",
    quickLinks: [
      ['VA Caregiver Support', 'https://www.caregiver.va.gov/'],
      ['Caregiver resources', 'https://warriorsfund.org/resources/specialty/caregivers'],
      ['Survivor Benefits', '/survivor-benefits'],
      ['Buddy Check guide', '/buddy-check'],
      ['Blue Star Families', 'https://www.bluestarfam.org/'],
      ['TAPS (1-800-959-8277)', 'tel:18009598277']
    ]
  }
};

const BRANCH_META = {
  army: { name: 'Army', code: 'AR', tagline: 'This We\'ll Defend', emblemClass: 'army' },
  navy: { name: 'Navy', code: 'USN', tagline: 'Forged by the Sea', emblemClass: 'navy' },
  'air-force': { name: 'Air Force', code: 'USAF', tagline: 'Aim High · Fly · Fight · Win', emblemClass: 'air-force' },
  marines: { name: 'Marine Corps', code: 'USMC', tagline: 'Semper Fidelis', emblemClass: 'marines' },
  'coast-guard': { name: 'Coast Guard', code: 'USCG', tagline: 'Semper Paratus', emblemClass: 'coast-guard' },
  'space-force': { name: 'Space Force', code: 'USSF', tagline: 'Semper Supra', emblemClass: 'space-force' }
};

function shellPage({ title, description, canonicalPath, navActive, contentHtml, extraHead = '' }) {
  const domain = CONFIG.publication.domain;
  const url = `https://${domain}${canonicalPath}`;
  const ogImage = `https://${domain}/og-image.png`;
  const isActive = (key) => navActive === key ? ' class="active"' : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${url}">
  <link rel="alternate" hreflang="en-us" href="${url}">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <meta name="theme-color" content="#0D2340">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="${ogImage}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:site_name" content="Veteran News">
  <meta property="og:type" content="website">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${ogImage}">
  <link rel="alternate" type="application/rss+xml" title="Veteran News" href="/rss.xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Source+Serif+Pro:wght@600;700&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/style.css">
  ${extraHead}
</head>
<body>
  <a href="#main" class="skip-link">Skip to main content</a>
  <div class="statusbar">
    <div class="container">
      <div class="statusbar-inner">
        <div class="statusbar-left">
          <span class="status-pulse"><span class="status-dot"></span><span>Live</span></span>
          <span class="status-meta">Veteran News · A Warriors Fund Initiative</span>
        </div>
        <a href="tel:988" class="crisis-pill">988 · Press 1</a>
      </div>
    </div>
  </div>
  <div class="news-ticker" id="news-ticker">
    <div class="container">
      <div class="news-ticker-inner">
        <span class="news-ticker-label">Live Wire</span>
        <div class="ticker-viewport"><div class="ticker-track"></div></div>
      </div>
    </div>
  </div>
  <header class="masthead">
    <div class="container">
      <div class="masthead-inner">
        <a href="/" class="brand">
          <span class="brand-mark">VN</span>
          <span class="brand-text"><span>Veteran News</span><small>A Warriors Fund Initiative</small></span>
        </a>
        <nav class="primary-nav" aria-label="Primary">
          <a href="/"${isActive('home')}>Briefing</a>
          <a href="/news"${isActive('news')}>News</a>
          <a href="/events"${isActive('events')}>Events</a>
          <a href="/resources"${isActive('resources')}>Find Help</a>
          <a href="/about"${isActive('about')}>About</a>
        </nav>
        <div class="masthead-actions">
          <a href="/donate" class="btn-donate">Support Veterans</a>
          <button class="menu-toggle" id="menu-toggle" aria-label="Open menu" aria-expanded="false">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
        </div>
      </div>
    </div>
  </header>
  <div class="mobile-nav-overlay" id="mobile-overlay"></div>
  <aside class="mobile-nav" id="mobile-nav">
    <a href="/">Briefing</a>
    <a href="/news">News</a>
    <a href="/events">Events</a>
    <a href="/resources">Find Help</a>
    <a href="/topics">Topics</a>
    <a href="/branches">Branches</a>
    <a href="/tools">Tools</a>
    <a href="/about">About</a>
    <a href="/donate">Support Veterans</a>
    <a href="tel:988">Crisis Line: 988</a>
  </aside>
  <main id="main">${contentHtml}</main>
  <footer class="site-footer">
    <div class="container">
      <div class="footer-top">
        <div class="footer-brand-block">
          <a href="/" class="brand">
            <span class="brand-mark">VN</span>
            <span class="brand-text"><span style="color:white">Veteran News</span></span>
          </a>
          <p>The trusted daily intelligence briefing for U.S. veterans. A Warriors Fund initiative.</p>
          <a href="/donate" class="btn btn-gold">Support Our Mission</a>
        </div>
        <div class="footer-col">
          <h4>Read</h4>
          <ul>
            <li><a href="/">Today's Briefing</a></li>
            <li><a href="/news">All News</a></li>
            <li><a href="/topics">Topics</a></li>
            <li><a href="/branches">Branches</a></li>
            <li><a href="/rss.xml">RSS Feed</a></li>
          </ul>
        </div>
        <div class="footer-col">
          <h4>Connect</h4>
          <ul>
            <li><a href="/events">Events</a></li>
            <li><a href="/resources">Find Help</a></li>
            <li><a href="/tools">Tools</a></li>
            <li><a href="/newsletter">Newsletter</a></li>
            <li><a href="/about">About</a></li>
            <li><a href="/contact">Contact</a></li>
          </ul>
        </div>
        <div class="footer-col">
          <h4>Standards</h4>
          <ul>
            <li><a href="/editorial-standards">Editorial Standards</a></li>
            <li><a href="/corrections">Corrections</a></li>
            <li><a href="/press">Press &amp; Media</a></li>
            <li><a href="/privacy">Privacy</a></li>
            <li><a href="/terms">Terms</a></li>
          </ul>
        </div>
      </div>
      <div class="footer-bottom">
        <span class="footer-credit"><span class="footer-credit-shield">WF</span>&copy; 2026 Veteran News · A <a href="https://www.warriorsfund.org" target="_blank" rel="noopener">Warriors Fund</a> Initiative</span>
        <span>Ground truth for those who served.</span>
      </div>
    </div>
  </footer>
  <div class="toast" id="toast" role="status" aria-live="polite"></div>
  <script type="module" src="/shared.js"></script>
</body>
</html>`;
}

// ─── Section page (/benefits, /health, etc.) ──────────────────────────────
async function serveSectionPage(env, url, request, section) {
  const meta = SECTION_META[section];
  if (!meta) return new Response('Not found', { status: 404 });
  try {
    const data = await env.ARTICLES_KV.get('articles', { type: 'json' });
    const all = deduplicateArticles(data?.articles || []).map(a => ({ ...a, excerpt: a.excerpt ? cleanExcerpt(a.excerpt) : a.excerpt }));
    const articles = all.filter(a => a.category === section);
    const lead = articles[0];
    const rest = articles.slice(1, 25);
    const otherSections = Object.entries(SECTION_META).filter(([k]) => k !== section).slice(0, 7);
    const baseUrl = `https://${CONFIG.publication.domain}`;

    const breadcrumbLd = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${baseUrl}/` },
        { '@type': 'ListItem', position: 2, name: 'News', item: `${baseUrl}/news` },
        { '@type': 'ListItem', position: 3, name: meta.title, item: `${baseUrl}/${section}` }
      ]
    };
    const collectionLd = {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      url: `${baseUrl}/${section}`,
      name: `${meta.title} — Veteran News`,
      description: meta.lede,
      isPartOf: { '@id': `${baseUrl}/#website` },
      hasPart: rest.slice(0, 10).map(a => ({
        '@type': 'NewsArticle',
        headline: a.title,
        url: `${baseUrl}/news/${a.slug || generateSlug(a.title)}`,
        datePublished: a.publishDate,
        author: { '@type': 'Organization', name: a.source || 'Veteran News' }
      }))
    };

    const leadHtml = lead ? `
      <a href="/news/${escapeHtml(lead.slug || generateSlug(lead.title))}" class="lead-story">
        ${lead.image ? `<img class="lead-story-image" src="${escapeHtml(lead.image)}" alt="${escapeHtml(lead.title || '')}" loading="eager" onerror="this.src='/placeholder.svg';this.onerror=null">` : `<div class="lead-story-image"></div>`}
        <div class="lead-story-body">
          <span class="tag">${escapeHtml(meta.title)}</span>
          <h2>${escapeHtml(lead.title)}</h2>
          ${lead.excerpt ? `<p>${escapeHtml(truncateText(lead.excerpt, 220))}</p>` : ''}
          <div class="byline">
            <span class="byline-source">${escapeHtml(lead.source || 'Veteran News')}</span>
            <span class="byline-divider">·</span>
            <span>${formatRelTime(lead.publishDate || lead.pubDate)}</span>
          </div>
        </div>
      </a>` : '<div class="loading">No stories yet in this section.</div>';

    const restHtml = rest.map(s => {
      const slug = s.slug || generateSlug(s.title);
      const excerpt = (s.excerpt || '').slice(0, 200);
      return `<li class="row"><a href="/news/${escapeHtml(slug)}" class="row-content" style="display:flex;flex-direction:column;gap:var(--s-2);"><span class="tag">${escapeHtml(meta.title)}</span><h3 class="row-title">${escapeHtml(s.title)}</h3>${excerpt ? `<p class="row-excerpt">${escapeHtml(excerpt)}</p>` : ''}<div class="byline"><span class="byline-source">${escapeHtml(s.source || '')}</span><span class="byline-divider">·</span><span>${formatRelTime(s.publishDate)}</span></div></a><a href="/news/${escapeHtml(slug)}">${img(s, 'row')}</a></li>`;
    }).join('');

    const quickLinksHtml = meta.quickLinks?.length ? `
      <div class="quick-actions">
        <h2>Quick links · ${escapeHtml(meta.title)}</h2>
        <div class="quick-grid">
          ${meta.quickLinks.map(([label, href]) => `
            <a href="${escapeHtml(href)}"${href.startsWith('/') || href.startsWith('tel:') ? '' : ' target="_blank" rel="noopener"'} class="quick-card">
              <div class="quick-icon">→</div>
              <span class="quick-card-title">${escapeHtml(label)}</span>
            </a>`).join('')}
        </div>
      </div>` : '';

    const wfConditionsHtml = meta.wfConditions?.length ? `
      <section class="section">
        <div class="section-head">
          <div>
            <div class="eyebrow">Conditions &amp; Eligibility</div>
            <h2 class="section-title">Per-condition guides</h2>
          </div>
          <a href="https://warriorsfund.org/resources" target="_blank" rel="noopener" class="section-link">Full directory</a>
        </div>
        <p style="color:var(--ink-muted);margin-bottom:var(--s-5);">Each condition has presumptive-eligibility guidance, treatment paths, and claim help — maintained by Warriors Fund.</p>
        <div class="topics-grid">
          ${meta.wfConditions.map(c => `
            <a href="${escapeHtml(c.url)}" target="_blank" rel="noopener" class="topic-tile">
              <span class="topic-tile-name">${escapeHtml(c.name)}</span>
              <span class="topic-tile-count">warriorsfund.org →</span>
            </a>`).join('')}
        </div>
      </section>` : '';

    const otherSectionsHtml = `
      <section class="section">
        <div class="section-head"><div><div class="eyebrow">More sections</div><h2 class="section-title">Across veteran news</h2></div></div>
        <div class="topics-grid">
          ${otherSections.map(([key, m]) => `<a href="/${key}" class="topic-tile"><span class="topic-tile-name">${escapeHtml(m.title)}</span><span class="topic-tile-count">${all.filter(a => a.category === key).length}</span></a>`).join('')}
        </div>
      </section>`;

    const content = `
      <section class="section-hero">
        <div class="container">
          <div class="eyebrow">${escapeHtml(meta.eyebrow)}</div>
          <h1>${escapeHtml(meta.title)}</h1>
          <p>${escapeHtml(meta.lede)}</p>
          <div class="section-hero-meta">
            <span><strong>${articles.length}</strong> stories</span>
            <span><strong>${new Set(articles.map(a => a.source)).size}</strong> sources</span>
            <span>Updated ${formatRelTime(articles[0]?.publishDate || new Date().toISOString())}</span>
          </div>
        </div>
      </section>
      <div class="container">
        ${quickLinksHtml}
        <section class="section">
          <div class="section-head">
            <div><div class="eyebrow">Lead</div><h2 class="section-title">Top of section</h2></div>
            <a href="/news#${escapeHtml(section)}" class="section-link">All in news</a>
          </div>
          ${leadHtml}
        </section>
        ${restHtml ? `
          <section class="section">
            <div class="section-head"><div><div class="eyebrow">More in ${escapeHtml(meta.title)}</div><h2 class="section-title">Latest coverage</h2></div></div>
            <ul class="row-list">${restHtml}</ul>
          </section>` : ''}
        ${wfConditionsHtml}
        ${otherSectionsHtml}
        <div class="crisis-cta">
          <div class="crisis-cta-eyebrow">Veterans Crisis Line</div>
          <h3>Free, confidential support — 24/7</h3>
          <div class="crisis-cta-actions">
            <a href="tel:988" class="btn btn-primary">Call 988 — Press 1</a>
            <a href="sms:838255" class="btn btn-secondary">Text 838255</a>
          </div>
        </div>
      </div>`;

    const ldScript = `<script type="application/ld+json">${JSON.stringify([breadcrumbLd, collectionLd])}</script>`;

    const html = shellPage({
      title: `${meta.title} — Veteran News`,
      description: meta.lede,
      canonicalPath: `/${section}`,
      navActive: 'news',
      contentHtml: content,
      extraHead: ldScript
    });
    return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300', 'X-SSR': 'section' } });
  } catch (e) {
    console.error('section error', e);
    return new Response('Error', { status: 500 });
  }
}

// ─── Branches hub ─────────────────────────────────────────────────────────
async function serveBranchHub(env, url, request) {
  const branchKeys = Object.keys(BRANCH_META);
  const tiles = branchKeys.map(key => {
    const b = BRANCH_META[key];
    return `<a href="/branch/${key}" class="branch-tile">
      <div class="branch-emblem ${b.emblemClass}">${escapeHtml(b.code)}</div>
      <h3>${escapeHtml(b.name)}</h3>
      <small>${escapeHtml(b.tagline)}</small>
    </a>`;
  }).join('');

  const content = `
    <section class="section-hero">
      <div class="container">
        <div class="eyebrow">By Branch</div>
        <h1>Service branches</h1>
        <p>Coverage tailored to each branch — Army, Navy, Air Force, Marines, Coast Guard, and Space Force. Service-specific news, benefits, and community.</p>
      </div>
    </section>
    <div class="container">
      <div class="branch-grid">${tiles}</div>
      <div class="crisis-cta">
        <div class="crisis-cta-eyebrow">Veterans Crisis Line</div>
        <h3>Free, confidential support — 24/7</h3>
        <div class="crisis-cta-actions">
          <a href="tel:988" class="btn btn-primary">Call 988 — Press 1</a>
          <a href="sms:838255" class="btn btn-secondary">Text 838255</a>
        </div>
      </div>
    </div>`;

  return new Response(shellPage({
    title: 'Service Branches — Veteran News',
    description: 'Coverage by service branch — Army, Navy, Air Force, Marines, Coast Guard, Space Force.',
    canonicalPath: '/branches',
    navActive: 'news',
    contentHtml: content
  }), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600', 'X-SSR': 'branch-hub' } });
}

async function serveBranchPage(env, url, request, branch) {
  const meta = BRANCH_META[branch];
  if (!meta) return new Response('Not found', { status: 404 });
  try {
    const data = await env.ARTICLES_KV.get('articles', { type: 'json' });
    const all = deduplicateArticles(data?.articles || []);
    const branchTerms = {
      army: ['army', 'soldier', 'fort '],
      navy: ['navy', 'sailor', 'naval'],
      'air-force': ['air force', 'airman', 'usaf'],
      marines: ['marine', 'usmc', 'leatherneck'],
      'coast-guard': ['coast guard', 'uscg', 'coastie'],
      'space-force': ['space force', 'guardian', 'ussf']
    };
    const terms = branchTerms[branch] || [branch];
    const articles = all.filter(a => {
      const hay = `${a.title || ''} ${a.excerpt || ''} ${a.serviceBranch || ''}`.toLowerCase();
      return terms.some(t => hay.includes(t));
    }).slice(0, 30);

    const articleListHtml = articles.length ? articles.map(s => {
      const slug = s.slug || generateSlug(s.title);
      return `<li class="row"><a href="/news/${escapeHtml(slug)}" class="row-content" style="display:flex;flex-direction:column;gap:var(--s-2);"><span class="tag">${escapeHtml(s.category || meta.name)}</span><h3 class="row-title">${escapeHtml(s.title)}</h3>${s.excerpt ? `<p class="row-excerpt">${escapeHtml(s.excerpt.slice(0, 200))}</p>` : ''}<div class="byline"><span class="byline-source">${escapeHtml(s.source || '')}</span><span class="byline-divider">·</span><span>${formatRelTime(s.publishDate)}</span></div></a><a href="/news/${escapeHtml(slug)}">${img(s, 'row')}</a></li>`;
    }).join('') : '';

    const content = `
      <section class="section-hero">
        <div class="container" style="display:flex;align-items:center;gap:var(--s-6);flex-wrap:wrap;">
          <div class="branch-emblem ${meta.emblemClass}" style="width:96px;height:96px;font-size:2rem;flex-shrink:0;">${escapeHtml(meta.code)}</div>
          <div>
            <div class="eyebrow">Branch</div>
            <h1>${escapeHtml(meta.name)}</h1>
            <p style="font-style:italic;">${escapeHtml(meta.tagline)}</p>
          </div>
        </div>
      </section>
      <div class="container">
        <section class="section">
          <div class="section-head"><div><div class="eyebrow">Latest</div><h2 class="section-title">${escapeHtml(meta.name)} coverage</h2></div><a href="/branches" class="section-link">All branches</a></div>
          ${articles.length ? `<ul class="row-list">${articleListHtml}</ul>` : '<div class="loading">No recent stories matching this branch — check back soon.</div>'}
        </section>
      </div>`;

    return new Response(shellPage({
      title: `${meta.name} — Veteran News`,
      description: `${meta.name} news and coverage for veterans. ${meta.tagline}.`,
      canonicalPath: `/branch/${branch}`,
      navActive: 'news',
      contentHtml: content
    }), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300', 'X-SSR': 'branch' } });
  } catch (e) {
    return new Response('Error', { status: 500 });
  }
}

// ─── Topics index ─────────────────────────────────────────────────────────
async function serveTopicsIndex(env, url, request) {
  try {
    const data = await env.ARTICLES_KV.get('articles', { type: 'json' });
    const all = data?.articles || [];
    const counts = {};
    for (const a of all) {
      const c = a.category || 'news';
      counts[c] = (counts[c] || 0) + 1;
    }
    const sections = Object.keys(SECTION_META);
    const tiles = sections.map(s => {
      const meta = SECTION_META[s];
      return `<a href="/${s}" class="topic-tile"><span class="topic-tile-name">${escapeHtml(meta.title)}</span><span class="topic-tile-count">${counts[s] || 0} stories</span></a>`;
    }).join('');

    const content = `
      <section class="section-hero">
        <div class="container">
          <div class="eyebrow">All Topics</div>
          <h1>Browse by topic</h1>
          <p>Every story we curate is classified into one of these sections. Click into any topic for the deep dive.</p>
        </div>
      </section>
      <div class="container">
        <section class="section">
          <div class="topics-grid">${tiles}</div>
        </section>
        <section class="section">
          <div class="section-head"><div><div class="eyebrow">By Branch</div><h2 class="section-title">Service branches</h2></div><a href="/branches" class="section-link">Branch hub</a></div>
          <div class="branch-grid">
            ${Object.entries(BRANCH_META).map(([k, b]) => `
              <a href="/branch/${k}" class="branch-tile">
                <div class="branch-emblem ${b.emblemClass}">${escapeHtml(b.code)}</div>
                <h3>${escapeHtml(b.name)}</h3>
                <small>${escapeHtml(b.tagline)}</small>
              </a>`).join('')}
          </div>
        </section>
      </div>`;

    return new Response(shellPage({
      title: 'Topics — Veteran News',
      description: 'Browse all veteran news topics — benefits, health, transition, advocacy, legacy, community, family, and service.',
      canonicalPath: '/topics',
      navActive: 'news',
      contentHtml: content
    }), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=600' } });
  } catch (e) {
    return new Response('Error', { status: 500 });
  }
}

// ─── Tools / calculators ──────────────────────────────────────────────────
async function serveToolsPage(env, url, request) {
  const content = `
    <section class="section-hero">
      <div class="container">
        <div class="eyebrow">Tools</div>
        <h1>Veteran calculators</h1>
        <p>Quick estimates for benefits and pay. Real numbers vary — these are starting points.</p>
      </div>
    </section>
    <div class="container-narrow">
      <section class="calculator">
        <h3>VA Disability Compensation Estimator</h3>
        <p>Estimated monthly compensation by VA disability rating (2026 rates, single veteran with no dependents).</p>
        <div class="calc-form">
          <div class="calc-field">
            <label for="rating">Disability Rating</label>
            <select id="rating">
              <option value="0">0% — $0</option>
              <option value="10">10%</option>
              <option value="20">20%</option>
              <option value="30">30%</option>
              <option value="40">40%</option>
              <option value="50">50%</option>
              <option value="60">60%</option>
              <option value="70">70%</option>
              <option value="80">80%</option>
              <option value="90">90%</option>
              <option value="100" selected>100%</option>
            </select>
          </div>
          <div class="calc-field">
            <label for="dependents">Dependents</label>
            <select id="dependents">
              <option value="alone" selected>None</option>
              <option value="spouse">Spouse only</option>
              <option value="spouse-1">Spouse + 1 child</option>
              <option value="spouse-2">Spouse + 2 children</option>
            </select>
          </div>
          <div class="calc-result">
            <div class="calc-result-label">Estimated monthly</div>
            <div class="calc-result-value" id="disability-result">$3,737.85</div>
            <div class="calc-result-detail" id="disability-detail">100% rating · single veteran</div>
          </div>
        </div>
        <p class="calc-disclaimer">Estimate only. Confirm at <a href="https://www.va.gov/disability/compensation-rates/veteran-rates/" target="_blank" rel="noopener">va.gov</a>.</p>
      </section>

      <section class="calculator">
        <h3>Post-9/11 GI Bill BAH Estimator</h3>
        <p>Monthly Basic Allowance for Housing while using GI Bill at full enrollment (E-5 with dependents rate, varies by ZIP).</p>
        <div class="calc-form">
          <div class="calc-field">
            <label for="bah-tier">Tier</label>
            <select id="bah-tier">
              <option value="hcol">High cost area (NYC, SF, DC, Honolulu)</option>
              <option value="mid" selected>Mid cost (most metros)</option>
              <option value="lcol">Low cost area</option>
            </select>
          </div>
          <div class="calc-field">
            <label for="bah-pct">% of benefit (based on service)</label>
            <select id="bah-pct">
              <option value="100" selected>100% (3+ years AD)</option>
              <option value="90">90%</option>
              <option value="80">80%</option>
              <option value="70">70%</option>
              <option value="60">60%</option>
              <option value="50">50%</option>
              <option value="40">40%</option>
            </select>
          </div>
          <div class="calc-result">
            <div class="calc-result-label">Estimated monthly BAH</div>
            <div class="calc-result-value" id="bah-result">$2,250</div>
            <div class="calc-result-detail" id="bah-detail">Mid-cost area · 100% benefit</div>
          </div>
        </div>
        <p class="calc-disclaimer">Estimate only. Real BAH is by ZIP at <a href="https://www.benefits.va.gov/gibill/resources/benefits_resources/rates/ch33/ch33rates080123.asp" target="_blank" rel="noopener">benefits.va.gov</a>.</p>
      </section>

      <section class="calculator">
        <h3>Concurrent Receipt (CRDP) Quick Check</h3>
        <p>If you're a retiree, CRDP restores VA waiver dollar-for-dollar at 50%+ disability ratings.</p>
        <div class="calc-form">
          <div class="calc-field">
            <label for="crdp-rating">Disability Rating</label>
            <select id="crdp-rating">
              <option value="0">Below 50%</option>
              <option value="50" selected>50%</option>
              <option value="60">60%</option>
              <option value="70">70%</option>
              <option value="80">80%</option>
              <option value="90">90%</option>
              <option value="100">100%</option>
            </select>
          </div>
          <div class="calc-field">
            <label for="crdp-retired">Years served</label>
            <select id="crdp-retired">
              <option value="20" selected>20+ (retired)</option>
              <option value="under">Under 20</option>
            </select>
          </div>
          <div class="calc-result">
            <div class="calc-result-label">CRDP eligibility</div>
            <div class="calc-result-value" id="crdp-result">Eligible</div>
            <div class="calc-result-detail" id="crdp-detail">50% rating + 20 yr retirement</div>
          </div>
        </div>
        <p class="calc-disclaimer">Estimate only. Apply via DFAS.</p>
      </section>

      <div class="crisis-cta">
        <div class="crisis-cta-eyebrow">Need real help?</div>
        <h3>Free claims assistance</h3>
        <p>VSOs file claims for free — DAV, VFW, American Legion, and Warriors Fund.</p>
        <div class="crisis-cta-actions">
          <a href="https://www.dav.org/" target="_blank" rel="noopener" class="btn btn-primary">DAV Claims Help</a>
          <a href="https://www.warriorsfund.org" target="_blank" rel="noopener" class="btn btn-secondary">Warriors Fund</a>
        </div>
      </div>
    </div>
    <script>
      // VA 2026 disability comp rates (single vet)
      const DIS = {
        '0_alone':0, '10_alone':171.23, '20_alone':338.49, '30_alone':524.31, '40_alone':755.28,
        '50_alone':1075.16, '60_alone':1361.88, '70_alone':1716.28, '80_alone':1995.01, '90_alone':2241.91, '100_alone':3737.85,
        '30_spouse':586.31, '40_spouse':838.28, '50_spouse':1178.16, '60_spouse':1485.88, '70_spouse':1861.28, '80_spouse':2161.01, '90_spouse':2428.91, '100_spouse':3946.25,
        '30_spouse-1':632.31, '40_spouse-1':900.28, '50_spouse-1':1255.16, '60_spouse-1':1577.88, '70_spouse-1':1968.28, '80_spouse-1':2283.01, '90_spouse-1':2566.91, '100_spouse-1':4098.87,
        '30_spouse-2':678.31, '40_spouse-2':962.28, '50_spouse-2':1332.16, '60_spouse-2':1669.88, '70_spouse-2':2075.28, '80_spouse-2':2405.01, '90_spouse-2':2704.91, '100_spouse-2':4251.49
      };
      function recalcDis() {
        const r = document.getElementById('rating').value;
        const d = document.getElementById('dependents').value;
        const key = r === '0' ? '0_alone' : r === '10' ? '10_alone' : r === '20' ? '20_alone' : r + '_' + d;
        const val = DIS[key] !== undefined ? DIS[key] : DIS[r + '_alone'] || 0;
        document.getElementById('disability-result').textContent = '$' + val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const depLabel = { 'alone': 'single veteran', 'spouse': 'with spouse', 'spouse-1': 'with spouse + 1 child', 'spouse-2': 'with spouse + 2 children' }[d] || '';
        document.getElementById('disability-detail').textContent = r + '% rating · ' + depLabel;
      }
      document.getElementById('rating').addEventListener('change', recalcDis);
      document.getElementById('dependents').addEventListener('change', recalcDis);

      const BAH = { hcol: 4500, mid: 2250, lcol: 1400 };
      function recalcBah() {
        const t = document.getElementById('bah-tier').value;
        const p = parseInt(document.getElementById('bah-pct').value, 10);
        const val = Math.round(BAH[t] * (p / 100));
        document.getElementById('bah-result').textContent = '$' + val.toLocaleString('en-US');
        const tierLabel = { hcol: 'High-cost area', mid: 'Mid-cost area', lcol: 'Low-cost area' }[t];
        document.getElementById('bah-detail').textContent = tierLabel + ' · ' + p + '% benefit';
      }
      document.getElementById('bah-tier').addEventListener('change', recalcBah);
      document.getElementById('bah-pct').addEventListener('change', recalcBah);

      function recalcCrdp() {
        const r = parseInt(document.getElementById('crdp-rating').value, 10);
        const ret = document.getElementById('crdp-retired').value;
        const eligible = r >= 50 && ret === '20';
        document.getElementById('crdp-result').textContent = eligible ? 'Eligible' : 'Not eligible';
        document.getElementById('crdp-detail').textContent = eligible ? r + '% rating + 20 yr retirement' : 'CRDP requires 50%+ and 20-yr retirement';
      }
      document.getElementById('crdp-rating').addEventListener('change', recalcCrdp);
      document.getElementById('crdp-retired').addEventListener('change', recalcCrdp);
    </script>`;

  return new Response(shellPage({
    title: 'Veteran Tools & Calculators — Veteran News',
    description: 'VA disability compensation, GI Bill BAH, and CRDP calculators for veterans.',
    canonicalPath: '/tools',
    navActive: 'resources',
    contentHtml: content
  }), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}

// ─── Newsletter dedicated page ────────────────────────────────────────────
async function serveNewsletterPage(env, url, request) {
  const content = `
    <section class="section-hero">
      <div class="container">
        <div class="eyebrow">Newsletters</div>
        <h1>Get it in your inbox.</h1>
        <p>Free email briefings curated for U.S. veterans. Pick the cadence that works for you.</p>
      </div>
    </section>
    <div class="container">
      <div class="resource-grid">
        <div class="resource-card featured">
          <h3>The Daily Standby</h3>
          <p>The most important veteran news of the previous 24 hours. Delivered every morning at 0700 ET.</p>
          <form class="newsletter-form" data-list="daily" style="margin-top:var(--s-3);">
            <input type="email" name="email" placeholder="your@email.mil" required>
            <button type="submit" class="btn btn-gold">Subscribe</button>
          </form>
        </div>
        <div class="resource-card">
          <h3>Weekly Brief</h3>
          <p>The big stories of the week distilled. Sent Sunday evenings — perfect for catch-up.</p>
          <form class="newsletter-form" data-list="weekly" style="margin-top:var(--s-3);">
            <input type="email" name="email" placeholder="your@email.mil" required>
            <button type="submit" class="btn btn-primary">Subscribe</button>
          </form>
        </div>
        <div class="resource-card">
          <h3>Benefits Watch</h3>
          <p>Just benefits — VA policy changes, claim updates, GI Bill, and money matters. Sent when news breaks.</p>
          <form class="newsletter-form" data-list="benefits" style="margin-top:var(--s-3);">
            <input type="email" name="email" placeholder="your@email.mil" required>
            <button type="submit" class="btn btn-primary">Subscribe</button>
          </form>
        </div>
        <div class="resource-card">
          <h3>Breaking Alerts</h3>
          <p>Only the most urgent stories — major policy changes, breaking veteran news, crisis updates.</p>
          <form class="newsletter-form" data-list="breaking" style="margin-top:var(--s-3);">
            <input type="email" name="email" placeholder="your@email.mil" required>
            <button type="submit" class="btn btn-primary">Subscribe</button>
          </form>
        </div>
      </div>
      <div style="text-align:center;margin-top:var(--s-7);font-size:0.875rem;color:var(--ink-soft);">
        We never sell your email. Unsubscribe with one click. Privacy: <a href="/privacy">/privacy</a>.
      </div>
    </div>
    <script>
      document.querySelectorAll('.newsletter-form').forEach(form => {
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const email = form.querySelector('input[type=email]').value.trim();
          const list = form.dataset.list || 'daily';
          if (!email) return;
          try {
            const res = await fetch('/api/newsletter', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email, list })
            });
            if (res.ok) {
              form.querySelector('input').value = '';
              window.VN?.showToast?.('Subscribed to ' + list + '.');
            } else {
              window.VN?.showToast?.('Could not subscribe. Try again.');
            }
          } catch {
            window.VN?.showToast?.('Network error.');
          }
        });
      });
    </script>`;

  return new Response(shellPage({
    title: 'Newsletters — Veteran News',
    description: 'Free email newsletters for veterans — daily briefing, weekly digest, benefits watch, and breaking alerts.',
    canonicalPath: '/newsletter',
    navActive: 'about',
    contentHtml: content
  }), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}

// ─── Saved articles ───────────────────────────────────────────────────────
async function serveSavedPage(env, url, request) {
  const content = `
    <section class="section-hero">
      <div class="container">
        <div class="eyebrow">Your Library</div>
        <h1>Saved articles</h1>
        <p>Stories you've bookmarked — kept locally on this device. Save up to 50.</p>
      </div>
    </section>
    <div class="container">
      <div id="saved-content">
        <div class="loading">Loading…</div>
      </div>
    </div>
    <script>
      function renderSaved() {
        const container = document.getElementById('saved-content');
        const saved = window.VN?.getSaved?.() || [];
        if (!saved.length) {
          container.innerHTML = \`
            <div class="saved-empty">
              <h3>Nothing saved yet.</h3>
              <p style="color:var(--ink-muted);margin-bottom:var(--s-5);">When you find a story worth keeping, click "Save" on the article page. It'll show up here.</p>
              <a href="/news" class="btn btn-primary">Browse the news</a>
            </div>\`;
          return;
        }
        container.innerHTML = '<ul class="row-list">' + saved.map(s => \`
          <li class="row no-image">
            <a href="/news/\${s.slug}" class="row-content" style="display:flex;flex-direction:column;gap:var(--s-2);">
              <span class="tag">\${(s.category || 'NEWS').toUpperCase()}</span>
              <h3 class="row-title">\${s.title}</h3>
              <div class="byline">
                <span class="byline-source">\${s.source || ''}</span>
                <span class="byline-divider">·</span>
                <span>Saved \${new Date(s.savedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
              </div>
            </a>
            <button class="action-btn" onclick="removeSaved('\${s.slug}')" style="height:fit-content;align-self:start;">✕ Remove</button>
          </li>\`).join('') + '</ul>';
      }
      function removeSaved(slug) {
        const saved = window.VN.getSaved().filter(s => s.slug !== slug);
        window.VN.setSaved(saved);
        renderSaved();
      }
      // Wait for shared.js to expose VN
      const tryRender = () => window.VN ? renderSaved() : setTimeout(tryRender, 50);
      tryRender();
    </script>`;

  return new Response(shellPage({
    title: 'Saved Articles — Veteran News',
    description: 'Your locally saved Veteran News articles.',
    canonicalPath: '/saved',
    navActive: '',
    contentHtml: content,
    extraHead: '<meta name="robots" content="noindex">'
  }), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

// ─── Editorial / legal pages ──────────────────────────────────────────────
function legalPage({ slug, title, eyebrow, lede, body }) {
  const content = `
    <section class="page-hero">
      <div class="container-narrow">
        <div class="eyebrow">${escapeHtml(eyebrow)}</div>
        <h1 class="page-title">${escapeHtml(title)}</h1>
        ${lede ? `<p class="page-lede">${escapeHtml(lede)}</p>` : ''}
      </div>
    </section>
    <div class="container-narrow">
      <article class="story-body">${body}</article>
    </div>`;
  return shellPage({
    title: `${title} — Veteran News`,
    description: lede,
    canonicalPath: `/${slug}`,
    navActive: '',
    contentHtml: content
  });
}

async function serveEditorialPage(env, url, request) {
  const body = `
    <h2>Mission &amp; coverage</h2>
    <p>Veteran News provides the daily news intelligence U.S. veterans, service members, and their families need to navigate benefits, healthcare, transition, advocacy, and policy. We curate from the most credible journalism in the veteran beat — we do not generate primary news.</p>

    <h2>Sourcing</h2>
    <p>We aggregate from 14+ vetted publications, including official government sources (VA News), award-winning independent newsrooms (The War Horse, Task &amp; Purpose), the Military Times family of titles, and the major veteran service organizations (DAV, VFW, American Legion). Sources are tiered by editorial rigor. Every article on this site links back to its original publisher.</p>

    <h2>Verification &amp; fact-checking</h2>
    <p>Original reporting and fact-checking is the responsibility of the source publication. We verify that articles come from accredited outlets in good standing and that links resolve to the original. When sources contradict each other, we attempt to surface the disagreement rather than picking a side.</p>

    <h2>Independence</h2>
    <p>Veteran News is published by Warriors Fund, an independent 501(c)(3) nonprofit. We accept no paid advertising. We accept no government funding. Our independence is supported by donations from individuals and from Warriors Fund's general operating budget.</p>

    <h2>Categorization</h2>
    <p>Stories are classified into one of nine sections: <strong>Benefits, Health, Service, Transition, Advocacy, Legacy, Community, Family</strong>, and General. Classification is automated; we manually correct errors when surfaced.</p>

    <h2>What we won't do</h2>
    <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
      <li style="margin-bottom:0.6em;">Editorialize on individual stories. We pick reporting from credible journalists; we do not opine.</li>
      <li style="margin-bottom:0.6em;">Run sponsored content or pay-to-promote articles.</li>
      <li style="margin-bottom:0.6em;">Make political endorsements.</li>
      <li style="margin-bottom:0.6em;">Republish content without attribution.</li>
      <li style="margin-bottom:0.6em;">Sell user data. (See <a href="/privacy">Privacy</a>.)</li>
    </ul>

    <h2>Diversity &amp; inclusion</h2>
    <p>Veterans are not a monolith. Our coverage reflects the full breadth of the veteran community — across race, gender, sexual orientation, branch, era, rank, and service experience. We actively curate to surface coverage of women veterans, LGBTQ+ veterans, veterans of color, and veterans across all service eras. If you see a gap, tell us — see <a href="/contact">contact</a>.</p>

    <h2>Funding &amp; ownership</h2>
    <p>Veteran News is wholly owned and operated by Warriors Fund (warriorsfund.org). Warriors Fund is a 501(c)(3) tax-exempt nonprofit. Annual financials and IRS Form 990s are published at the parent organization site.</p>

    <h2>Last updated</h2>
    <p>This editorial standards document was last reviewed on April 24, 2026.</p>`;

  return new Response(legalPage({
    slug: 'editorial-standards',
    title: 'Editorial Standards',
    eyebrow: 'Standards',
    lede: 'How we curate, verify, and stand behind the news we surface.',
    body
  }), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}

async function servePrivacyPage(env, url, request) {
  const body = `
    <h2>What we collect</h2>
    <p>The shortest list we can manage. We collect: anonymous pageview counts (Cloudflare Analytics Engine), the country your request originates from, the page you came from (referrer), and — if you subscribe — your email address.</p>

    <h2>What we don't collect</h2>
    <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
      <li>We do not track you across websites.</li>
      <li>We do not use third-party advertising trackers.</li>
      <li>We do not have a Facebook pixel or Google Ads conversion tag.</li>
      <li>We do not require you to log in to read.</li>
      <li>We do not sell, rent, or trade your information.</li>
    </ul>

    <h2>Cookies &amp; storage</h2>
    <p>The site uses your browser's local storage for two things only: your theme preference (light/dark) and your saved articles. Both are stored only on your device. We do not use tracking cookies.</p>

    <h2>Email subscriptions</h2>
    <p>If you subscribe to a newsletter, we keep your email address and your preferred frequency. We do not share it. Unsubscribe with one click in any email.</p>

    <h2>Logs</h2>
    <p>Cloudflare retains anonymized request logs (IP geolocation, user-agent) for security and abuse prevention. We do not access individual records absent a security investigation.</p>

    <h2>Children</h2>
    <p>This site is not directed at children under 13.</p>

    <h2>Your rights</h2>
    <p>You can request deletion of any email subscription you've made by emailing us through the <a href="/contact">contact</a> page. We honor unsubscribes immediately.</p>

    <h2>Changes</h2>
    <p>This policy was last updated April 24, 2026. Material changes will be noted at the top of this page.</p>`;

  return new Response(legalPage({
    slug: 'privacy',
    title: 'Privacy Policy',
    eyebrow: 'Legal',
    lede: 'We don\'t sell your data. We don\'t track you across the web. The full story is short.',
    body
  }), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=86400' } });
}

async function serveTermsPage(env, url, request) {
  const body = `
    <h2>Use of the site</h2>
    <p>Veteran News is provided free for personal, non-commercial use. You may read, share, and link to anything on the site. Please do not scrape, mass-redistribute, or republish substantial portions of our content without permission.</p>

    <h2>Links to third parties</h2>
    <p>Articles link to their original publishers. We are not responsible for the content, accuracy, or practices of those external sites. The same applies to resource links (VA, VSOs, government agencies).</p>

    <h2>No medical, legal, or financial advice</h2>
    <p>Nothing on this site is medical, legal, or financial advice. Calculators on the <a href="/tools">tools</a> page are estimates only. Consult appropriate professionals or VA-accredited representatives for your situation.</p>

    <h2>Crisis support disclaimer</h2>
    <p>If you or a veteran you know is in crisis, do not delay. Call 988, press 1. Text 838255. The Veterans Crisis Line is the appropriate resource — not this website.</p>

    <h2>Warranty disclaimer</h2>
    <p>The site is provided "as is" without warranty of any kind, express or implied. While we work hard to keep information accurate and current, we cannot guarantee it.</p>

    <h2>Limitation of liability</h2>
    <p>To the fullest extent permitted by law, Warriors Fund and Veteran News shall not be liable for any indirect, incidental, consequential, or punitive damages arising from use of the site.</p>

    <h2>Governing law</h2>
    <p>These terms are governed by U.S. law and the laws of the state where Warriors Fund is incorporated.</p>

    <h2>Contact</h2>
    <p>Questions about these terms? See <a href="/contact">contact</a>. Last updated April 24, 2026.</p>`;

  return new Response(legalPage({
    slug: 'terms',
    title: 'Terms of Service',
    eyebrow: 'Legal',
    lede: 'The basic ground rules for using Veteran News.',
    body
  }), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=86400' } });
}

async function serveCorrectionsPage(env, url, request) {
  const body = `
    <h2>Our corrections policy</h2>
    <p>If we get something wrong, we fix it — promptly, transparently, and with the change noted on the corrected page.</p>

    <h2>What constitutes an error</h2>
    <p>Veteran News aggregates and curates news from third parties. The most common errors are:</p>
    <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
      <li>Misclassification (story tagged in wrong section)</li>
      <li>Broken or redirected source links</li>
      <li>Outdated or stale headlines from cached feeds</li>
      <li>Typos in our editorial copy (the briefings we write, the resource directory)</li>
    </ul>
    <p>Errors in source articles themselves are the responsibility of the source publication. We will pass corrections back when notified.</p>

    <h2>How to report</h2>
    <p>Email us via the <a href="/contact">contact</a> page or directly to our parent at <a href="https://www.warriorsfund.org" target="_blank" rel="noopener">warriorsfund.org</a>. Please include the URL of the page, what's wrong, and (if possible) your source for the correct information.</p>

    <h2>Response time</h2>
    <p>We aim to acknowledge correction requests within 24 hours and apply corrections within 48 hours of verification.</p>

    <h2>Significant corrections log</h2>
    <p>Material corrections — those affecting facts substantively presented in our editorial copy — will be logged here with the date and nature of the change.</p>
    <p style="color:var(--ink-soft);font-style:italic;">No significant corrections logged to date.</p>`;

  return new Response(legalPage({
    slug: 'corrections',
    title: 'Corrections Policy',
    eyebrow: 'Standards',
    lede: 'When we get it wrong, we fix it. Here\'s how.',
    body
  }), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}

async function servePressPage(env, url, request) {
  const body = `
    <h2>For journalists</h2>
    <p>Veteran News is happy to share data, refer sources, and collaborate on stories about U.S. veterans. We do not provide advance embargo content.</p>

    <h2>For organizations</h2>
    <p>If your veteran-serving organization wants Veteran News to be aware of programs, releases, events, or campaigns, send the details. We will consider them for coverage but do not commit to publication and do not accept paid placements.</p>

    <h2>Brand assets</h2>
    <p>Logo and favicon files are available on request. Please use the full name "Veteran News" on first reference; "VeteransNews.org" on second reference is acceptable.</p>

    <h2>Boilerplate</h2>
    <p style="background:var(--surface);padding:var(--s-4);border-radius:var(--radius);font-style:italic;">Veteran News is the trusted daily intelligence briefing for U.S. veterans, service members, and their families. Published by Warriors Fund — an independent 501(c)(3) nonprofit — Veteran News curates trusted journalism from 14+ vetted sources. Free, ad-free, and editorially independent.</p>

    <h2>Speaking &amp; partnerships</h2>
    <p>For speaking engagements, partnership inquiries, syndication, or licensing, contact Warriors Fund directly at <a href="https://www.warriorsfund.org" target="_blank" rel="noopener">warriorsfund.org</a>.</p>

    <h2>Contact</h2>
    <p>See <a href="/contact">contact</a> for the right channel.</p>`;

  return new Response(legalPage({
    slug: 'press',
    title: 'Press & Media',
    eyebrow: 'For Press',
    lede: 'Resources for journalists and organizations covering veteran issues.',
    body
  }), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=86400' } });
}

// ════════════════════════════════════════════════════════════════════════════
// PREMIUM IMAGE PLACEHOLDER — when no source image available
// Renders an inline SVG with category-tinted gradient + source attribution.
// Replaces the gray "letter on box" weak fallback.
// ════════════════════════════════════════════════════════════════════════════

function placeholderHtml(article, variant = 'card') {
  const cat = (article.category || 'news').toLowerCase();
  const catLabel = cat.charAt(0).toUpperCase() + cat.slice(1);
  const sourceShort = (article.source || 'Veteran News').replace(/^The /, '').slice(0, 20);
  // Get the initial letter as a graceful fallback graphic
  const initial = (article.title || sourceShort).trim().charAt(0).toUpperCase();
  const className = `card-placeholder cat-${cat}` + (variant === 'lead' ? ' lead-story-image' : variant === 'row' ? ' row-image' : variant === 'hero' ? ' story-hero-placeholder' : '');
  return `<div class="${className}" role="img" aria-label="${escapeHtml(catLabel)}: ${escapeHtml(article.title || '')}">
    <div class="card-placeholder-content">
      <span class="card-placeholder-cat">${escapeHtml(catLabel)}</span>
      <span class="card-placeholder-mark">${escapeHtml(initial)}</span>
      <span class="card-placeholder-source">${escapeHtml(sourceShort)}</span>
    </div>
  </div>`;
}

function imageOrPlaceholder(article, variant = 'card', extraImgClass = '') {
  if (article.image) {
    const cls = variant === 'lead' ? 'lead-story-image' : variant === 'row' ? 'row-image' : variant === 'hero' ? 'story-hero-placeholder' : 'card-image';
    const merged = (cls + ' ' + extraImgClass).trim();
    return `<img class="${merged}" src="${escapeHtml(article.image)}" alt="${escapeHtml(article.title || '')}" loading="lazy" onerror="this.outerHTML=this.dataset.fallback">` +
      `<template>${placeholderHtml(article, variant)}</template>`; // not actually used; simplified below
  }
  return placeholderHtml(article, variant);
}

// Simpler image-or-placeholder used inline in template strings (no JS fallback wiring needed
// since we now also degrade gracefully if the URL itself 404s — by swapping to placeholder via JS)
function img(article, variant = 'card', loading = 'lazy') {
  if (article.image) {
    const cls = variant === 'lead' ? 'lead-story-image' : variant === 'row' ? 'row-image' : variant === 'hero' ? 'story-hero-img' : 'card-image';
    const fallbackId = 'ph-' + (article.id || '').toString().replace(/[^a-z0-9]/gi, '').slice(0, 16);
    return `<img class="${cls}" src="${escapeHtml(article.image)}" alt="${escapeHtml(article.title || '')}" loading="${loading}" onerror="(function(el){var f=document.getElementById('${fallbackId}');if(f){el.replaceWith(f.content.cloneNode(true))}else{el.style.display='none'}})(this);this.onerror=null">
<template id="${fallbackId}">${placeholderHtml(article, variant)}</template>`;
  }
  return placeholderHtml(article, variant);
}

// ════════════════════════════════════════════════════════════════════════════
// ADMIN DASHBOARD
// ════════════════════════════════════════════════════════════════════════════
async function serveAdminHealth(env, url, request) {
  let scraperHealth = null;
  try {
    // Try to fetch from the scraper worker (same KV is bound, but the worker
    // may be a separate deployment so we read directly here too).
    const data = await env.ARTICLES_KV.get('articles', { type: 'json' });
    const articles = data?.articles || [];
    const totalArticles = articles.length;
    const articlesWithImages = articles.filter(a => a.image).length;
    const imageFillRate = totalArticles ? Math.round((articlesWithImages / totalArticles) * 100) : 0;
    const brokenLinks = articles.filter(a => a.linkStatus === 'broken').length;
    const lowQuality = articles.filter(a => a.lowQuality).length;
    const lastScrape = data?.lastScrape;
    const lastBackfill = data?.lastImageBackfill;
    const lastDeadLink = data?.lastDeadLinkSweep;

    // Read source health entries
    const allKeys = await env.ARTICLES_KV.list({ prefix: 'health:' });
    const sourceHealth = await Promise.all(allKeys.keys.map(async (k) => {
      const v = await env.ARTICLES_KV.get(k.name, { type: 'json' });
      return { name: k.name.replace('health:', ''), ...v };
    }));

    scraperHealth = {
      totalArticles, articlesWithImages, imageFillRate,
      brokenLinks, lowQuality,
      lastScrape, lastBackfill, lastDeadLink,
      sourceHealth: sourceHealth.sort((a, b) => (a.score ?? 100) - (b.score ?? 100))
    };
  } catch (e) {
    scraperHealth = { error: e.message };
  }

  // JSON if asked
  if (url.searchParams.get('format') === 'json') {
    return json(scraperHealth, 200, { 'Access-Control-Allow-Origin': '*' });
  }

  // HTML dashboard
  const fillStatus = scraperHealth.imageFillRate >= 80 ? 'ok'
    : scraperHealth.imageFillRate >= 60 ? 'warn' : 'bad';
  const sourceCards = (scraperHealth.sourceHealth || []).map(s => {
    const status = s.suspended ? 'bad' : (s.score < 60 ? 'warn' : 'ok');
    const lastSuccess = s.lastSuccess ? formatRelTime(s.lastSuccess) : 'never';
    return `<div class="dash-card ${status}">
      <div class="dash-card-label">${escapeHtml(s.name)}</div>
      <div class="dash-card-value">${s.score ?? 0}<span style="font-size:1rem;color:var(--ink-soft);">/100</span></div>
      <div class="dash-card-detail">
        ${s.suspended ? '<strong style="color:var(--crisis)">SUSPENDED</strong> · ' : ''}
        ${s.consecutiveFailures || 0} failures · ${s.totalArticles || 0} articles · last ok ${lastSuccess}
        ${s.lastError ? `<br><small style="color:var(--ink-soft);">${escapeHtml(s.lastError.slice(0, 80))}</small>` : ''}
      </div>
    </div>`;
  }).join('');

  const content = `
    <section class="page-hero">
      <div class="container">
        <div class="eyebrow">Status Dashboard</div>
        <h1 class="page-title">Newsroom health</h1>
        <p class="page-lede">Live view of scraper status, source health, image-fill rate, and link integrity.</p>
      </div>
    </section>
    <div class="container">
      <h2 style="font-family:var(--font-headline);font-size:1.5rem;margin-bottom:var(--s-4);">Newsroom totals</h2>
      <div class="dash-grid">
        <div class="dash-card ok">
          <div class="dash-card-label">Articles</div>
          <div class="dash-card-value">${scraperHealth.totalArticles ?? 0}</div>
          <div class="dash-card-detail">In rotation</div>
        </div>
        <div class="dash-card ${fillStatus}">
          <div class="dash-card-label">Image Fill Rate</div>
          <div class="dash-card-value">${scraperHealth.imageFillRate ?? 0}%</div>
          <div class="dash-card-detail">${scraperHealth.articlesWithImages ?? 0} of ${scraperHealth.totalArticles ?? 0} have images</div>
        </div>
        <div class="dash-card ${scraperHealth.brokenLinks > 5 ? 'warn' : 'ok'}">
          <div class="dash-card-label">Broken Links</div>
          <div class="dash-card-value">${scraperHealth.brokenLinks ?? 0}</div>
          <div class="dash-card-detail">Excluded from feed</div>
        </div>
        <div class="dash-card ${scraperHealth.lowQuality > 50 ? 'warn' : 'ok'}">
          <div class="dash-card-label">Low Quality</div>
          <div class="dash-card-value">${scraperHealth.lowQuality ?? 0}</div>
          <div class="dash-card-detail">Hidden from main feed</div>
        </div>
      </div>

      <h2 style="font-family:var(--font-headline);font-size:1.5rem;margin:var(--s-7) 0 var(--s-4);">Last cron runs</h2>
      <div class="dash-grid">
        <div class="dash-card ok">
          <div class="dash-card-label">Last Full Scrape</div>
          <div class="dash-card-value" style="font-size:1.25rem;">${scraperHealth.lastScrape?.timestamp ? formatRelTime(scraperHealth.lastScrape.timestamp) : 'never'}</div>
          <div class="dash-card-detail">${scraperHealth.lastScrape?.newArticles ?? 0} new · ${scraperHealth.lastScrape?.duration ? Math.round(scraperHealth.lastScrape.duration / 1000) : 0}s</div>
        </div>
        <div class="dash-card ok">
          <div class="dash-card-label">Last Image Backfill</div>
          <div class="dash-card-value" style="font-size:1.25rem;">${scraperHealth.lastBackfill?.timestamp ? formatRelTime(scraperHealth.lastBackfill.timestamp) : 'never'}</div>
          <div class="dash-card-detail">${scraperHealth.lastBackfill?.backfilled ?? 0}/${scraperHealth.lastBackfill?.attempted ?? 0} recovered</div>
        </div>
        <div class="dash-card ok">
          <div class="dash-card-label">Last Dead-Link Sweep</div>
          <div class="dash-card-value" style="font-size:1.25rem;">${scraperHealth.lastDeadLink?.timestamp ? formatRelTime(scraperHealth.lastDeadLink.timestamp) : 'never'}</div>
          <div class="dash-card-detail">${scraperHealth.lastDeadLink?.broken ?? 0}/${scraperHealth.lastDeadLink?.checked ?? 0} broken</div>
        </div>
      </div>

      <h2 style="font-family:var(--font-headline);font-size:1.5rem;margin:var(--s-7) 0 var(--s-4);">Sources <small style="color:var(--ink-soft);font-size:0.75rem;font-family:var(--font-mono);text-transform:uppercase;letter-spacing:0.08em;font-weight:600;">${(scraperHealth.sourceHealth || []).length} tracked</small></h2>
      <div class="dash-grid">
        ${sourceCards || '<div class="loading">No source-health data yet — runs after first cron tick.</div>'}
      </div>

      <p style="margin-top:var(--s-7);color:var(--ink-soft);font-size:0.875rem;">
        Raw JSON: <a href="/admin/health?format=json">/admin/health?format=json</a>
      </p>
    </div>`;

  return new Response(shellPage({
    title: 'Newsroom Health — Veteran News',
    description: 'Live status dashboard for Veteran News scraper, sources, and content quality.',
    canonicalPath: '/admin/health',
    navActive: '',
    contentHtml: content,
    extraHead: '<meta name="robots" content="noindex">'
  }), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

async function serveContactPage(env, url, request) {
  const body = `
    <h2>For story tips</h2>
    <p>Got a tip on a story we should know about? A source we should be aggregating? A perspective our coverage is missing? Email Warriors Fund through the <a href="https://www.warriorsfund.org" target="_blank" rel="noopener">parent site</a>.</p>

    <h2>For corrections</h2>
    <p>Found an error? Same channel. Please include the URL and what's wrong. See <a href="/corrections">corrections policy</a>.</p>

    <h2>For partnership / press</h2>
    <p>For partnerships, syndication, speaking, or media inquiries, see <a href="/press">press &amp; media</a>.</p>

    <h2>For technical issues</h2>
    <p>Site problems? Email through the <a href="https://www.warriorsfund.org" target="_blank" rel="noopener">contact form at warriorsfund.org</a> with details.</p>

    <h2>For direct help</h2>
    <p>If you're a veteran or family member in need of direct assistance — financial, mental health, or otherwise — contact Warriors Fund directly. They run the assistance programs.</p>

    <div class="crisis-cta">
      <div class="crisis-cta-eyebrow">In crisis?</div>
      <h3>The Veterans Crisis Line is faster.</h3>
      <p>Call 988, press 1. Free, confidential, 24/7.</p>
      <div class="crisis-cta-actions">
        <a href="tel:988" class="btn btn-primary">Call 988 — Press 1</a>
        <a href="sms:838255" class="btn btn-secondary">Text 838255</a>
      </div>
    </div>`;

  return new Response(legalPage({
    slug: 'contact',
    title: 'Contact',
    eyebrow: 'Reach Us',
    lede: 'How to get in touch with the team behind Veteran News.',
    body
  }), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}

// ════════════════════════════════════════════════════════════════════════════
// D1 ARCHIVE — date-based archive, source pages, author pages, image sitemap
// All read from D1 when available, fall back to KV blob.
// ════════════════════════════════════════════════════════════════════════════

async function d1Available(env) {
  return !!env.DB;
}

function slugifyForUrl(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

function articleRowToObj(row) {
  return {
    id: row.id, slug: row.slug, title: row.title, excerpt: row.excerpt,
    content: row.content, category: row.category, author: row.author,
    publishDate: row.publish_date, modifiedDate: row.modified_date,
    image: row.image, source: row.source, sourceSlug: row.source_slug,
    sourceUrl: row.source_url, serviceBranch: row.service_branch,
    priority: row.priority, qualityScore: row.quality_score,
    lowQuality: !!row.low_quality, linkStatus: row.link_status,
    wordCount: row.word_count
  };
}

// ── Archive index ─────────────────────────────────────────────────────────
async function serveArchiveIndex(env, url, request) {
  let years = [];
  if (await d1Available(env)) {
    try {
      const rs = await env.DB.prepare(`
        SELECT substr(date, 1, 4) AS year, COUNT(*) AS days, SUM(article_count) AS articles
        FROM archive_days GROUP BY substr(date, 1, 4) ORDER BY year DESC
      `).all();
      years = rs.results || [];
    } catch (e) { console.error('archive index d1 fail', e); }
  }
  const baseUrl = `https://${CONFIG.publication.domain}`;
  const breadcrumbLd = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${baseUrl}/` },
      { '@type': 'ListItem', position: 2, name: 'Archive', item: `${baseUrl}/archive` }
    ]
  };
  const yearTiles = years.length ? years.map(y => `
    <a href="/archive/${y.year}" class="topic-tile">
      <span class="topic-tile-name">${escapeHtml(y.year)}</span>
      <span class="topic-tile-count">${y.articles || 0} articles · ${y.days || 0} days</span>
    </a>`).join('') : '<p class="loading">Archive is being populated. Check back soon.</p>';
  const content = `
    <section class="page-hero">
      <div class="container">
        <div class="eyebrow">The Archive</div>
        <h1 class="page-title">Every story we've ever curated.</h1>
        <p class="page-lede">Browse the full archive of veteran news. Every article preserved with stable URLs — for research, citation, or to find that piece you remember.</p>
      </div>
    </section>
    <div class="container">
      <section class="section">
        <div class="section-head"><div><div class="eyebrow">By Year</div><h2 class="section-title">Archive index</h2></div></div>
        <div class="topics-grid">${yearTiles}</div>
      </section>
    </div>`;
  return new Response(shellPage({
    title: 'News Archive — Veteran News',
    description: 'Complete archive of veteran news, organized by date.',
    canonicalPath: '/archive',
    navActive: '',
    contentHtml: content,
    extraHead: `<script type="application/ld+json">${JSON.stringify(breadcrumbLd)}</script>`
  }), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}

async function serveArchiveYear(env, url, request, year) {
  let months = [];
  if (await d1Available(env)) {
    try {
      const rs = await env.DB.prepare(`
        SELECT substr(date, 6, 2) AS month, COUNT(*) AS days, SUM(article_count) AS articles
        FROM archive_days WHERE substr(date, 1, 4) = ? GROUP BY substr(date, 6, 2) ORDER BY month DESC
      `).bind(year).all();
      months = rs.results || [];
    } catch {}
  }
  const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const tiles = months.length ? months.map(m => `
    <a href="/archive/${year}/${m.month}" class="topic-tile">
      <span class="topic-tile-name">${escapeHtml(monthNames[parseInt(m.month, 10)] || m.month)} ${year}</span>
      <span class="topic-tile-count">${m.articles || 0} articles · ${m.days || 0} days</span>
    </a>`).join('') : '<p class="loading">No data for this year.</p>';
  const content = `
    <section class="page-hero">
      <div class="container">
        <a href="/archive" class="back-link">← Archive index</a>
        <div class="eyebrow">Year ${escapeHtml(year)}</div>
        <h1 class="page-title">${escapeHtml(year)}</h1>
      </div>
    </section>
    <div class="container">
      <section class="section">
        <div class="topics-grid">${tiles}</div>
      </section>
    </div>`;
  return new Response(shellPage({
    title: `${year} Archive — Veteran News`,
    description: `Veteran news archive for ${year}.`,
    canonicalPath: `/archive/${year}`,
    navActive: '',
    contentHtml: content
  }), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}

async function serveArchiveMonth(env, url, request, year, month) {
  let days = [];
  if (await d1Available(env)) {
    try {
      const rs = await env.DB.prepare(`
        SELECT date, article_count FROM archive_days
        WHERE substr(date, 1, 7) = ? ORDER BY date DESC
      `).bind(`${year}-${month}`).all();
      days = rs.results || [];
    } catch {}
  }
  const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const monthName = monthNames[parseInt(month, 10)] || month;
  const tiles = days.length ? days.map(d => {
    const day = d.date.slice(8, 10);
    return `<a href="/archive/${year}/${month}/${day}" class="topic-tile">
      <span class="topic-tile-name">${monthName} ${parseInt(day, 10)}</span>
      <span class="topic-tile-count">${d.article_count} articles</span>
    </a>`;
  }).join('') : '<p class="loading">No data for this month.</p>';
  const content = `
    <section class="page-hero">
      <div class="container">
        <a href="/archive/${year}" class="back-link">← ${year}</a>
        <div class="eyebrow">Month</div>
        <h1 class="page-title">${escapeHtml(monthName)} ${escapeHtml(year)}</h1>
      </div>
    </section>
    <div class="container">
      <section class="section">
        <div class="topics-grid">${tiles}</div>
      </section>
    </div>`;
  return new Response(shellPage({
    title: `${monthName} ${year} Archive — Veteran News`,
    description: `Veteran news archive for ${monthName} ${year}.`,
    canonicalPath: `/archive/${year}/${month}`,
    navActive: '',
    contentHtml: content
  }), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}

async function serveArchiveDay(env, url, request, year, month, day) {
  const dateStr = `${year}-${month}-${day}`;
  let articles = [];
  if (await d1Available(env)) {
    try {
      const rs = await env.DB.prepare(`
        SELECT id, slug, title, excerpt, category, author, publish_date, image,
               source, source_slug, source_url, service_branch
        FROM articles
        WHERE substr(publish_date, 1, 10) = ? AND link_status != 'broken' AND low_quality = 0
        ORDER BY publish_date DESC
      `).bind(dateStr).all();
      articles = (rs.results || []).map(articleRowToObj);
    } catch {}
  }
  const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const dateLabel = `${monthNames[parseInt(month, 10)] || month} ${parseInt(day, 10)}, ${year}`;

  const baseUrl = `https://${CONFIG.publication.domain}`;
  // PublicationIssue / Newspaper "edition" schema for Google News
  const issueLd = {
    '@context': 'https://schema.org',
    '@type': 'PublicationIssue',
    issueNumber: dateStr,
    datePublished: dateStr,
    isPartOf: { '@id': `${baseUrl}/#website` },
    inLanguage: 'en-US',
    hasPart: articles.slice(0, 20).map(a => ({
      '@type': 'NewsArticle',
      headline: a.title,
      url: `${baseUrl}/news/${a.slug}`,
      datePublished: a.publishDate,
      author: { '@type': 'Organization', name: a.source }
    }))
  };
  const breadcrumbLd = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${baseUrl}/` },
      { '@type': 'ListItem', position: 2, name: 'Archive', item: `${baseUrl}/archive` },
      { '@type': 'ListItem', position: 3, name: year, item: `${baseUrl}/archive/${year}` },
      { '@type': 'ListItem', position: 4, name: dateLabel, item: `${baseUrl}/archive/${year}/${month}/${day}` }
    ]
  };

  const list = articles.length ? articles.map(s => `
    <li class="row">
      <a href="/news/${escapeHtml(s.slug)}" class="row-content" style="display:flex;flex-direction:column;gap:var(--s-2);">
        <span class="tag">${escapeHtml((s.category || 'news').toUpperCase())}</span>
        <h3 class="row-title">${escapeHtml(s.title)}</h3>
        ${s.excerpt ? `<p class="row-excerpt">${escapeHtml((s.excerpt || '').slice(0, 200))}</p>` : ''}
        <div class="byline"><span class="byline-source">${escapeHtml(s.source || '')}</span><span class="byline-divider">·</span><span>${formatRelTime(s.publishDate)}</span></div>
      </a>
      <a href="/news/${escapeHtml(s.slug)}">${img(s, 'row')}</a>
    </li>`).join('') : '<li class="loading">No articles indexed for this day.</li>';

  const content = `
    <section class="page-hero">
      <div class="container">
        <a href="/archive/${year}/${month}" class="back-link">← ${monthNames[parseInt(month, 10)]} ${year}</a>
        <div class="eyebrow">Edition · Issue ${escapeHtml(dateStr)}</div>
        <h1 class="page-title">${escapeHtml(dateLabel)}</h1>
        <p class="page-lede">${articles.length} ${articles.length === 1 ? 'story' : 'stories'} curated for veterans on this date.</p>
      </div>
    </section>
    <div class="container">
      <section class="section">
        <ul class="row-list">${list}</ul>
      </section>
    </div>`;
  const ld = `<script type="application/ld+json">${JSON.stringify([breadcrumbLd, issueLd])}</script>`;
  return new Response(shellPage({
    title: `${dateLabel} — Veteran News`,
    description: `Veteran news archive for ${dateLabel}. ${articles.length} stories.`,
    canonicalPath: `/archive/${year}/${month}/${day}`,
    navActive: '',
    contentHtml: content,
    extraHead: ld
  }), {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'Last-Modified': new Date(`${dateStr}T23:59:59Z`).toUTCString()
    }
  });
}

// ── Sources index + source pages ──────────────────────────────────────────
async function serveSourcesIndex(env, url, request) {
  let sources = [];
  if (await d1Available(env)) {
    try {
      const rs = await env.DB.prepare(`
        SELECT source, source_slug, COUNT(*) AS article_count
        FROM articles WHERE low_quality = 0 AND link_status != 'broken'
        GROUP BY source_slug ORDER BY article_count DESC
      `).all();
      sources = rs.results || [];
    } catch {}
  }
  const tiles = sources.length ? sources.map(s => `
    <a href="/source/${escapeHtml(s.source_slug)}" class="topic-tile">
      <span class="topic-tile-name">${escapeHtml(s.source)}</span>
      <span class="topic-tile-count">${s.article_count} stories</span>
    </a>`).join('') : '<p class="loading">No source data yet.</p>';
  const content = `
    <section class="page-hero">
      <div class="container">
        <div class="eyebrow">Our Network</div>
        <h1 class="page-title">Sources we curate.</h1>
        <p class="page-lede">Every story on Veteran News comes from one of these vetted publications. Click any source to see all of their work we've covered.</p>
      </div>
    </section>
    <div class="container">
      <section class="section">
        <div class="topics-grid">${tiles}</div>
      </section>
    </div>`;
  return new Response(shellPage({
    title: 'Our Sources — Veteran News',
    description: 'The vetted sources Veteran News curates from.',
    canonicalPath: '/sources',
    navActive: '',
    contentHtml: content
  }), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}

async function serveSourcePage(env, url, request, sourceSlug) {
  let articles = [];
  let sourceName = sourceSlug;
  if (await d1Available(env)) {
    try {
      const rs = await env.DB.prepare(`
        SELECT id, slug, title, excerpt, category, publish_date, image,
               source, source_slug, source_url, author
        FROM articles
        WHERE source_slug = ? AND link_status != 'broken' AND low_quality = 0
        ORDER BY publish_date DESC LIMIT 100
      `).bind(sourceSlug).all();
      articles = (rs.results || []).map(articleRowToObj);
      if (articles[0]) sourceName = articles[0].source;
    } catch {}
  }
  if (articles.length === 0) {
    return new Response(shellPage({
      title: 'Source not found — Veteran News',
      description: 'No articles indexed for this source yet.',
      canonicalPath: `/source/${sourceSlug}`,
      navActive: '',
      contentHtml: `<div class="container"><div class="loading" style="padding:var(--s-9);">No articles indexed for this source. <a href="/sources">Browse all sources</a>.</div></div>`,
      extraHead: '<meta name="robots" content="noindex">'
    }), { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }

  const list = articles.map(s => `
    <li class="row">
      <a href="/news/${escapeHtml(s.slug)}" class="row-content" style="display:flex;flex-direction:column;gap:var(--s-2);">
        <span class="tag">${escapeHtml((s.category || 'news').toUpperCase())}</span>
        <h3 class="row-title">${escapeHtml(s.title)}</h3>
        ${s.excerpt ? `<p class="row-excerpt">${escapeHtml((s.excerpt || '').slice(0, 200))}</p>` : ''}
        <div class="byline">${formatRelTime(s.publishDate)}</div>
      </a>
      <a href="/news/${escapeHtml(s.slug)}">${img(s, 'row')}</a>
    </li>`).join('');

  const content = `
    <section class="page-hero">
      <div class="container">
        <a href="/sources" class="back-link">← All sources</a>
        <div class="eyebrow">Source</div>
        <h1 class="page-title">${escapeHtml(sourceName)}</h1>
        <p class="page-lede">${articles.length} ${articles.length === 1 ? 'story' : 'stories'} curated from ${escapeHtml(sourceName)}.</p>
      </div>
    </section>
    <div class="container">
      <section class="section">
        <ul class="row-list">${list}</ul>
      </section>
    </div>`;
  return new Response(shellPage({
    title: `${sourceName} — Veteran News`,
    description: `${articles.length} stories curated from ${sourceName}.`,
    canonicalPath: `/source/${sourceSlug}`,
    navActive: '',
    contentHtml: content
  }), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=900' } });
}

async function serveAuthorPage(env, url, request, authorSlug) {
  let articles = [];
  let authorName = authorSlug.replace(/-/g, ' ');
  if (await d1Available(env)) {
    try {
      // Author slugs are derived from name; match LIKE on slugified author
      const rs = await env.DB.prepare(`
        SELECT id, slug, title, excerpt, category, publish_date, image,
               source, source_slug, source_url, author
        FROM articles
        WHERE LOWER(REPLACE(REPLACE(author, ' ', '-'), '.', '')) = LOWER(?)
          AND link_status != 'broken' AND low_quality = 0
        ORDER BY publish_date DESC LIMIT 50
      `).bind(authorSlug).all();
      articles = (rs.results || []).map(articleRowToObj);
      if (articles[0]) authorName = articles[0].author;
    } catch {}
  }
  if (articles.length === 0) {
    return new Response(shellPage({
      title: 'Author not found — Veteran News',
      description: 'No articles indexed for this author.',
      canonicalPath: `/author/${authorSlug}`,
      navActive: '',
      contentHtml: `<div class="container"><div class="loading" style="padding:var(--s-9);">No articles found for this author.</div></div>`,
      extraHead: '<meta name="robots" content="noindex">'
    }), { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
  const list = articles.map(s => `
    <li class="row">
      <a href="/news/${escapeHtml(s.slug)}" class="row-content" style="display:flex;flex-direction:column;gap:var(--s-2);">
        <span class="tag">${escapeHtml((s.category || 'news').toUpperCase())}</span>
        <h3 class="row-title">${escapeHtml(s.title)}</h3>
        ${s.excerpt ? `<p class="row-excerpt">${escapeHtml((s.excerpt || '').slice(0, 200))}</p>` : ''}
        <div class="byline"><span class="byline-source">${escapeHtml(s.source || '')}</span><span class="byline-divider">·</span><span>${formatRelTime(s.publishDate)}</span></div>
      </a>
      <a href="/news/${escapeHtml(s.slug)}">${img(s, 'row')}</a>
    </li>`).join('');
  const personLd = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: authorName,
    url: `https://${CONFIG.publication.domain}/author/${authorSlug}`,
    jobTitle: 'Journalist',
    worksFor: { '@type': 'NewsMediaOrganization', name: articles[0]?.source || 'Veteran News' }
  };
  const content = `
    <section class="page-hero">
      <div class="container">
        <div class="eyebrow">Author</div>
        <h1 class="page-title">${escapeHtml(authorName)}</h1>
        <p class="page-lede">${articles.length} ${articles.length === 1 ? 'story' : 'stories'} by ${escapeHtml(authorName)}.</p>
      </div>
    </section>
    <div class="container">
      <section class="section">
        <ul class="row-list">${list}</ul>
      </section>
    </div>`;
  return new Response(shellPage({
    title: `${authorName} — Veteran News`,
    description: `Stories by ${authorName} on Veteran News.`,
    canonicalPath: `/author/${authorSlug}`,
    navActive: '',
    contentHtml: content,
    extraHead: `<script type="application/ld+json">${JSON.stringify(personLd)}</script>`
  }), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=900' } });
}

// ── Image sitemap ─────────────────────────────────────────────────────────
async function handleImageSitemap(env) {
  const baseUrl = `https://${CONFIG.publication.domain}`;
  let articles = [];
  if (await d1Available(env)) {
    try {
      const rs = await env.DB.prepare(`
        SELECT slug, title, image, publish_date FROM articles
        WHERE image IS NOT NULL AND image != ''
          AND link_status != 'broken' AND low_quality = 0
        ORDER BY publish_date DESC LIMIT 50000
      `).all();
      articles = rs.results || [];
    } catch {}
  }
  if (!articles.length) {
    // Fallback to KV
    try {
      const data = await env.ARTICLES_KV.get('articles', { type: 'json' });
      articles = (data?.articles || []).filter(a => a.image).slice(0, 1000)
        .map(a => ({ slug: a.slug, title: a.title, image: a.image, publish_date: a.publishDate }));
    } catch {}
  }
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">`;
  for (const a of articles) {
    xml += `\n  <url><loc>${baseUrl}/news/${escapeHtml(a.slug)}</loc><image:image><image:loc>${escapeHtml(a.image)}</image:loc><image:title>${escapeHtml(a.title || '')}</image:title></image:image></url>`;
  }
  xml += '\n</urlset>';
  return new Response(xml, { status: 200, headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}

// ════════════════════════════════════════════════════════════════════════════
// LIFE-SAVING PAGES
// /crisis · /scam-alerts · /claim-help · /survivor-benefits · /buddy-check
// /states · /state/[code]
// ════════════════════════════════════════════════════════════════════════════

async function serveCrisisPage(env, url, request) {
  const baseUrl = `https://${CONFIG.publication.domain}`;
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'What is the Veterans Crisis Line?',
        acceptedAnswer: { '@type': 'Answer', text: 'Free, confidential 24/7 support for veterans, service members, and their families. Call 988 and press 1, text 838255, or chat online at veteranscrisisline.net. You do not need to be enrolled in VA care.' }
      },
      {
        '@type': 'Question',
        name: 'What happens when I call 988 and press 1?',
        acceptedAnswer: { '@type': 'Answer', text: 'A trained responder — many of them veterans themselves — answers. They listen first. They do not start with diagnosis or paperwork. They do not automatically dispatch police or VA. You can stay anonymous. Most calls last 15-30 minutes and end with a plan you helped make.' }
      },
      {
        '@type': 'Question',
        name: 'What if my buddy isn\'t picking up?',
        acceptedAnswer: { '@type': 'Answer', text: 'Drive over if you can. If not, call their last commander, a mutual friend, or a family member who can do a wellness check. As a last resort, call local police for a wellness check — but tell them clearly: this is a veteran in mental health crisis, not an active threat.' }
      }
    ]
  };

  const content = `
    <section class="crisis-page-hero">
      <div class="container">
        <div class="eyebrow">Veterans Crisis Line · 24/7 · Confidential · Free</div>
        <h1>You served. Now let us serve you.</h1>
        <p>If you or a veteran you know is in crisis right now, the line below is the fastest way to reach a trained responder. Many are veterans themselves. You don't need to be enrolled in VA care. You can stay anonymous.</p>
        <div class="crisis-cards">
          <a href="tel:988" class="crisis-card-big">
            <div class="crisis-card-big-label">Call</div>
            <div class="crisis-card-big-action">988 · Press 1</div>
            <div class="crisis-card-big-detail">Free · 24/7 · Confidential</div>
          </a>
          <a href="sms:838255" class="crisis-card-big">
            <div class="crisis-card-big-label">Text</div>
            <div class="crisis-card-big-action">838255</div>
            <div class="crisis-card-big-detail">Send any message — they'll respond</div>
          </a>
          <a href="https://www.veteranscrisisline.net/get-help/chat" target="_blank" rel="noopener" class="crisis-card-big">
            <div class="crisis-card-big-label">Chat</div>
            <div class="crisis-card-big-action">Online</div>
            <div class="crisis-card-big-detail">veteranscrisisline.net</div>
          </a>
        </div>
      </div>
    </section>

    <div class="container-narrow">
      <article class="story-body">
        <h2>If this is now</h2>
        <p>Stop reading and call <strong>988, press 1</strong>. Or text <strong>838255</strong>. The person who picks up will not start with paperwork. They will listen.</p>
        <p>You don't need to be sure it's a "real" crisis. You don't need to have a plan. You don't need to have been deployed, or wounded, or anything. If you're hurting, you qualify.</p>

        <h2>What happens when you call</h2>
        <p>A trained responder — most often a veteran themselves — answers. They will:</p>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li style="margin-bottom:.6em;">Ask if you're safe right now. That's it. No demographic intake. No insurance verification.</li>
          <li style="margin-bottom:.6em;">Let you talk. They will not interrupt with "have you tried therapy?"</li>
          <li style="margin-bottom:.6em;">Help you make a plan that fits the next few hours, not the next few months. Where will you sleep tonight. Who can you call tomorrow. What's one small thing you can do right now.</li>
          <li style="margin-bottom:.6em;">Connect you to your local VA Suicide Prevention Coordinator if you want it. Not if you don't.</li>
          <li style="margin-bottom:.6em;">They will <em>not</em> automatically dispatch police, ambulance, or VA Police. That happens only if you're an immediate danger to yourself or someone else and refuse to make a safety plan.</li>
        </ul>
        <p>Most calls last 15-30 minutes. You can stay anonymous. You can call again, or call about someone else, as many times as you need.</p>

        <h2>If you're worried about a buddy</h2>
        <p>Veterans usually don't reach out — because they don't want to be a burden, because they think they should handle it, because the culture taught them to. So <strong>you</strong> have to be the one to reach out.</p>
        <p><strong>Do this:</strong></p>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li style="margin-bottom:.6em;">Call them, don't text. Voice matters. If they don't pick up, leave a real voicemail.</li>
          <li style="margin-bottom:.6em;">Ask the question directly: "Are you thinking about killing yourself?" Asking does not plant the idea. Research is unanimous on this. It tells them they're not alone in the thought.</li>
          <li style="margin-bottom:.6em;">If they say yes, stay on the line. Get to them in person if you can. If you can't, get someone they trust to.</li>
          <li style="margin-bottom:.6em;">Help them remove access to lethal means — at minimum, lock up firearms or hand them to someone else for the weekend. Most suicide attempts happen within an hour of the decision being made. Time and distance save lives.</li>
        </ul>
        <p><strong>Don't do this:</strong></p>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li style="margin-bottom:.6em;">Don't say "you have so much to live for." It tells them their pain is invalid.</li>
          <li style="margin-bottom:.6em;">Don't argue. They've already had every argument with themselves a hundred times.</li>
          <li style="margin-bottom:.6em;">Don't call the cops as your first move. Police-on-veteran wellness checks have killed people. Use 988 first. Use a buddy first. Use VA Police via the local VA hospital before calling 911 if you can.</li>
        </ul>

        <div class="warning-box">
          <h3>Warning signs</h3>
          <p>Talking about being a burden. Giving away possessions. Sudden calm after a depressive period (the decision feels made). Increase in alcohol or drug use. Withdrawal from family/buddies. Reckless behavior. Unusual interest in funerals or end-of-life planning. Direct or indirect mentions of "ending it" or "checking out."</p>
          <p style="margin-top:var(--s-3);"><strong>Three or more of these in someone you know — do a buddy check today, not tomorrow.</strong></p>
        </div>

        <h2>What if they won't pick up the phone</h2>
        <p>Drive over. That's the answer most of the time. Coffee, drop in, no agenda.</p>
        <p>If you can't get there: call a mutual friend, a sibling, an old commander, anyone in their life who can. If nothing else works, call the local non-emergency police line — not 911 — and request a <em>wellness check on a veteran in mental health crisis</em>. Use those exact words. Ask if they have a Crisis Intervention Trained (CIT) officer.</p>

        <h2>For spouses and family</h2>
        <p>Living with PTSD, TBI, or moral injury affects the household. You are not crazy. You are not selfish for needing support.</p>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li style="margin-bottom:.6em;"><a href="https://www.caregiver.va.gov/" target="_blank" rel="noopener">VA Caregiver Support</a> — free counseling, respite care, and a national caregiver line: <strong>1-855-260-3274</strong></li>
          <li style="margin-bottom:.6em;"><a href="https://www.elizabethdolefoundation.org/hidden-heroes/" target="_blank" rel="noopener">Elizabeth Dole Foundation Hidden Heroes</a> — community for military &amp; veteran caregivers</li>
          <li style="margin-bottom:.6em;"><a href="https://www.bluestarfam.org/" target="_blank" rel="noopener">Blue Star Families</a> — programs for the home front</li>
          <li style="margin-bottom:.6em;"><a href="https://www.taps.org/" target="_blank" rel="noopener">TAPS</a> — for families who have lost a service member or veteran (incl. to suicide). 24/7: <strong>1-800-959-TAPS (8277)</strong></li>
        </ul>

        <h2>Specific support</h2>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li style="margin-bottom:.6em;"><strong>Women veterans:</strong> <a href="https://www.womenshealth.va.gov/" target="_blank" rel="noopener">womenshealth.va.gov</a> · Women Veterans Call Center: 1-855-829-6636</li>
          <li style="margin-bottom:.6em;"><strong>LGBTQ+ veterans:</strong> <a href="https://www.patientcare.va.gov/lgbt/" target="_blank" rel="noopener">patientcare.va.gov/lgbt</a> · Trevor Project (LGBTQ youth/young adult): 1-866-488-7386</li>
          <li style="margin-bottom:.6em;"><strong>MST survivors:</strong> Free VA care regardless of discharge status. <a href="https://www.mentalhealth.va.gov/msthome/" target="_blank" rel="noopener">mentalhealth.va.gov/msthome</a></li>
          <li style="margin-bottom:.6em;"><strong>Substance use:</strong> SAMHSA Helpline 1-800-662-4357 · 24/7</li>
          <li style="margin-bottom:.6em;"><strong>Homeless veterans:</strong> National Call Center 1-877-424-3838</li>
        </ul>

        <h2>Beyond the crisis line</h2>
        <div class="resource-grid">
          <a href="https://stopsoldiersuicide.org/" target="_blank" rel="noopener" class="resource-card">
            <h3>Stop Soldier Suicide</h3>
            <p>Veteran-led peer support &amp; advocacy. Confidential outreach.</p>
            <span class="resource-card-cta">stopsoldiersuicide.org →</span>
          </a>
          <a href="https://giveanhour.org/" target="_blank" rel="noopener" class="resource-card">
            <h3>Give an Hour</h3>
            <p>Free mental health services from licensed providers volunteering their time.</p>
            <span class="resource-card-cta">giveanhour.org →</span>
          </a>
          <a href="https://www.woundedwarriorproject.org/programs/wwp-talk" target="_blank" rel="noopener" class="resource-card">
            <h3>WWP Talk</h3>
            <p>Free peer-support phone calls with trained warriors. Weekly check-ins.</p>
            <span class="resource-card-cta">WWP Talk →</span>
          </a>
          <a href="https://www.nami.org/" target="_blank" rel="noopener" class="resource-card">
            <h3>NAMI Helpline</h3>
            <p>Mental Health America &amp; NAMI Helpline 1-800-950-6264. Information &amp; referrals.</p>
            <span class="resource-card-cta">nami.org →</span>
          </a>
          <a href="/buddy-check" class="resource-card">
            <h3>Buddy Check Tool</h3>
            <p>Quick guide for reaching out to someone you're worried about.</p>
            <span class="resource-card-cta">/buddy-check →</span>
          </a>
          <a href="/resources" class="resource-card">
            <h3>Full Directory</h3>
            <p>VA, VSOs, jobs, healthcare, housing, family — vetted resources.</p>
            <span class="resource-card-cta">/resources →</span>
          </a>
        </div>

        <h2>Lethal means safety</h2>
        <p>Most veteran suicides involve firearms — not because veterans are uniquely violent, but because firearms are uniquely lethal. If a veteran in your life is in a hard period, putting time and distance between them and a firearm is the single highest-impact thing you can do.</p>
        <p>This is not about taking rights. It's about temporary storage. Options:</p>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li style="margin-bottom:.6em;">Have a buddy or family member hold the firearm for the weekend, the month, or as long as needed</li>
          <li style="margin-bottom:.6em;">Use a gun-shop or pawn-shop hold (most are familiar with the concept)</li>
          <li style="margin-bottom:.6em;">Locked safe with combination held by someone else</li>
          <li style="margin-bottom:.6em;">Cable lock around the firearm</li>
        </ul>
        <p>Same logic for medications: put pill bottles in a locked box during a hard time, give the key to a partner.</p>
        <p>The VA has a free <a href="https://www.va.gov/REACH/" target="_blank" rel="noopener">gun lock distribution program</a>. Pick one up at any VA medical center, no questions asked.</p>

        <h2>One more thing</h2>
        <p>If you're reading this because you're hurting: you reached out by reading. That counts. Now make one more move. Pick up the phone. Or text. Or chat. Pick the one that costs you the least energy.</p>
        <p style="margin-top:var(--s-5);">
          <a href="tel:988" class="btn btn-crisis" style="font-size:1.125rem;padding:var(--s-4) var(--s-7);">Call 988 — Press 1</a>
        </p>
      </article>
    </div>`;

  return new Response(shellPage({
    title: 'Crisis Support — Veteran News',
    description: 'Free, confidential 24/7 support for veterans, service members, and families. Call 988 press 1, text 838255, or chat online. What to expect, how to help a buddy, and resources beyond the crisis line.',
    canonicalPath: '/crisis',
    navActive: '',
    contentHtml: content,
    extraHead: `<script type="application/ld+json">${JSON.stringify(ld)}</script>`
  }), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=600', 'X-Important': 'crisis' } });
}

// ── Scam alerts ───────────────────────────────────────────────────────────
async function serveScamAlertsPage(env, url, request) {
  const scams = [
    { name: 'PACT Act / Burn Pit Claim Sharks', summary: 'Companies charging veterans hundreds or thousands to "help file" PACT Act or other VA claims that VSOs file for free.', flags: 'Up-front fees · "We work with the VA" claims · Pressure tactics · Anyone charging ANY money for a VA claim is breaking federal law (Title 38 §5904).', what: 'Hang up. File for free with an accredited VSO (DAV, VFW, American Legion). Report to VA OIG and FTC.', report: 'va.gov/ogc/accreditation.asp · ftc.gov/complaint' },
    { name: 'Pension Poaching', summary: 'Bad-faith advisors talking elderly veterans into restructuring assets to "qualify" for the Aid &amp; Attendance pension — usually with high-fee annuities or trusts that benefit the advisor.', flags: 'Free dinner seminars · "Hide your assets" advice · Annuity sales bundled with VA benefits · Advisor not VA-accredited.', what: 'Walk away. Talk to a VA-accredited attorney or VSO instead. Asset transfers can backfire under VA\'s 3-year look-back rule.', report: 'va.gov/ogc/accreditation.asp · state insurance commissioner' },
    { name: 'Identity Theft via DD-214', summary: 'Scammers obtain or buy DD-214 records and use SSN, service dates, and dependents to open credit, file false tax returns, or steal benefits.', flags: 'Unexpected denials of credit · Mail addressed to a name you don\'t recognize · Tax return rejected as "already filed."', what: 'Freeze credit at all 3 bureaus (free for veterans &amp; family). File IRS form 14039. Place active-duty alert if applicable.', report: 'identitytheft.gov · ftc.gov · IRS Identity Theft 1-800-908-4490' },
    { name: 'Romance Scams', summary: 'Often targeting elderly or recently-widowed veterans through dating apps and social media — eventually asking for money for "emergency" travel, medical bills, or "investments."', flags: 'Romance moves fast · Refuses to video call · Always traveling/deployed · Asks for gift cards or wire transfers · Can\'t meet in person.', what: 'Stop sending money. Talk to a trusted family member. Search photos via reverse image lookup.', report: 'ic3.gov · AARP Fraud Watch Helpline 1-877-908-3360' },
    { name: 'Recruiter / Fake VA Rep Impersonation', summary: 'Caller claims to be from the VA, the DoD, or "Veterans Affairs" and threatens benefit suspension unless personal info is verified.', flags: 'VA does not call to threaten benefit suspension · Caller has Caller-ID-spoofed VA numbers · Asks for SSN, banking info, or to "verify" your VA file number.', what: 'Hang up. Call VA at 1-800-827-1000 directly to confirm.', report: 'oig.va.gov · ftc.gov' },
    { name: 'GI Bill Education Fraud', summary: 'For-profit schools targeting veterans with high-cost programs that don\'t lead to recognized credentials, exhausting GI Bill benefits.', flags: 'Aggressive recruiters · "GI Bill is wasted if not used now" · Programs not regionally accredited · No published job-placement rates.', what: 'Check school accreditation at ed.gov. Look up program at va.gov/education/gi-bill-comparison-tool/.', report: 'va.gov/ogc/feedback · State Approving Agency' },
    { name: 'Vehicle Warranty Scams', summary: 'Aggressive robocalls claiming "your warranty is about to expire" — particularly targeting veterans with VA pension direct-deposit who may seem like easier marks for high-pressure sales.', flags: 'Unsolicited robocall · Demands quick decision · Asks for VIN, address, payment.', what: 'Don\'t engage. Real warranty providers don\'t cold-call.', report: 'donotcall.gov · ftc.gov' },
    { name: 'Stolen Valor Charity Fraud', summary: 'Fake or low-percentage "veteran charities" using military imagery and aggressive telemarketing to collect donations that never reach veterans.', flags: 'High-pressure phone solicitations · Vague descriptions of programs · No financials available · Charity not on Charity Navigator or GuideStar.', what: 'Donate only to known, audited charities. Check Charity Navigator before giving.', report: 'ftc.gov · state attorney general' },
    { name: 'Phantom Loan / Refi Schemes', summary: 'Predatory VA-loan refinancing offers ("$0 closing!", "skip-a-payment!") that strip equity, churn the loan, and lock veterans into worse terms.', flags: 'Unsolicited refinance pitch · "Skip a payment" promises · No comparison to current loan · Pressure to close fast.', what: 'Talk to your current servicer first. Consult a VA-accredited housing counselor.', report: 'va.gov/housing-assistance · CFPB consumerfinance.gov' },
    { name: 'TSP / IRA Rollover Scams', summary: 'Brokers pressuring transitioning service members to roll TSP into high-fee annuities or speculative investments at separation.', flags: 'Free seminars timed to separation · Promises of guaranteed returns · "TSP is government-controlled" fearmongering · Advisor not a fiduciary.', what: 'TSP is one of the lowest-fee retirement vehicles in America. Most service members should leave it alone or roll into a low-fee IRA — never into an annuity sold by the same person advising.', report: 'sec.gov/tcr · finra.org/complaint' },
    { name: 'Caregiver Program Scams', summary: 'Companies promising to "guarantee" approval into the VA Caregiver Program (PCAFC) — a benefit that is determined exclusively by VA clinicians.', flags: 'Up-front fees · "We have inside contacts at VA" · "Guaranteed approval" language.', what: 'Apply directly through caregiver.va.gov. Free help via your local VA Caregiver Support Coordinator.', report: 'va.gov/ogc · oig.va.gov' },
    { name: 'Phantom Job Offers', summary: 'Fake "veteran-priority" job listings collecting personal info or charging for "background processing fees" — sometimes routing through fake LinkedIn profiles of recruiters.', flags: 'Asks for SSN before interview · Charges any fee · Email from public domain (gmail) for a "corporate" job · Salary too good to be true.', what: 'Verify employer through their official .com careers page. Use Hiring Our Heroes &amp; VA Employment for vetted listings.', report: 'ic3.gov · LinkedIn report' }
  ];

  const cards = scams.map(s => `
    <div class="resource-card" style="display:block;">
      <h3>${escapeHtml(s.name)}</h3>
      <p style="margin-bottom:var(--s-3);">${s.summary}</p>
      <p style="font-size:0.8125rem;"><strong>Red flags:</strong> ${s.flags}</p>
      <p style="font-size:0.8125rem;margin-top:var(--s-2);"><strong>What to do:</strong> ${s.what}</p>
      <p style="font-size:0.8125rem;margin-top:var(--s-2);"><strong>Report to:</strong> ${s.report}</p>
    </div>`).join('');

  const content = `
    <section class="page-hero">
      <div class="container">
        <div class="eyebrow">Fraud Watch</div>
        <h1 class="page-title">Veterans are targeted. Here's how to fight back.</h1>
        <p class="page-lede">Scammers know veterans get steady benefits, follow procedure, and trust authority. That's why veterans get hit harder than the general population. The 12 scams below are the ones VA OIG, FTC, and AARP Fraud Watch flag most often. Knowing them is half the defense.</p>
      </div>
    </section>
    <div class="container">
      <div class="warning-box">
        <h3>Two rules that defeat 90% of veteran fraud</h3>
        <p><strong>1. No one charges money to file a VA claim.</strong> It's against federal law (38 USC §5904). VSOs file for free. Anyone asking for money is breaking the law.</p>
        <p><strong>2. The VA does not call to threaten suspension of benefits.</strong> If you're getting that call, it's a scam. Hang up and call VA directly at 1-800-827-1000.</p>
      </div>
      <h2 style="font-family:var(--font-headline);font-size:1.75rem;margin:var(--s-7) 0 var(--s-5);">The 12 most common veteran-targeting scams</h2>
      <div class="crisis-resource-grid">${cards}</div>

      <div class="resource-block" style="margin-top:var(--s-9);">
        <div class="h-eyebrow">If You've Been Targeted</div>
        <h2>Where to report</h2>
        <div class="resource-grid">
          <a href="https://www.ftc.gov/complaint" target="_blank" rel="noopener" class="resource-card">
            <h3>FTC ReportFraud.gov</h3>
            <p>Federal Trade Commission's central fraud complaint portal. Use this for almost anything.</p>
            <span class="resource-card-cta">reportfraud.ftc.gov →</span>
          </a>
          <a href="https://www.va.gov/oig/hotline/" target="_blank" rel="noopener" class="resource-card">
            <h3>VA Office of Inspector General</h3>
            <p>For fraud against the VA itself, accredited-rep violations, or VA-employee misconduct. Hotline: 1-800-488-8244</p>
            <span class="resource-card-cta">va.gov/oig →</span>
          </a>
          <a href="https://www.ic3.gov" target="_blank" rel="noopener" class="resource-card">
            <h3>FBI Internet Crime IC3</h3>
            <p>Online scams, romance fraud, business email compromise.</p>
            <span class="resource-card-cta">ic3.gov →</span>
          </a>
          <a href="https://www.aarp.org/money/scams-fraud/" target="_blank" rel="noopener" class="resource-card">
            <h3>AARP Fraud Watch Helpline</h3>
            <p>Free, even if you're not an AARP member. Counselors who specialize in elder fraud. 1-877-908-3360</p>
            <span class="resource-card-cta">aarp.org/fraud →</span>
          </a>
          <a href="https://www.consumerfinance.gov/complaint" target="_blank" rel="noopener" class="resource-card">
            <h3>CFPB</h3>
            <p>Consumer Financial Protection Bureau — for predatory loans, refis, banking, debt collection.</p>
            <span class="resource-card-cta">consumerfinance.gov →</span>
          </a>
          <a href="https://www.identitytheft.gov" target="_blank" rel="noopener" class="resource-card">
            <h3>IdentityTheft.gov</h3>
            <p>Step-by-step recovery plan if your DD-214, SSN, or credit was used.</p>
            <span class="resource-card-cta">identitytheft.gov →</span>
          </a>
        </div>
      </div>
    </div>`;

  return new Response(shellPage({
    title: 'Scam Alerts: 12 Frauds Targeting Veterans — Veteran News',
    description: 'The most common scams targeting U.S. veterans in 2026. Pension poaching, claim sharks, romance scams, fake charities, identity theft. Red flags, what to do, and where to report.',
    canonicalPath: '/scam-alerts',
    navActive: '',
    contentHtml: content
  }), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}

// ── Buddy check page ──────────────────────────────────────────────────────
async function serveBuddyCheckPage(env, url, request) {
  const content = `
    <section class="page-hero">
      <div class="container-narrow">
        <div class="eyebrow">Buddy Check</div>
        <h1 class="page-title">When in doubt, reach out.</h1>
        <p class="page-lede">Veterans rarely ask for help. So if someone in your unit, your platoon, your old chain, your family — has been quiet, or off, or different — you go first. Here's a 5-minute guide.</p>
      </div>
    </section>
    <div class="container-narrow">
      <article class="story-body">
        <h2>Step 1: Pick up the phone</h2>
        <p>Call. Don't text first. Voice carries everything text can't — tone, breath, the long pause before a "yeah, I'm fine." If they don't pick up, leave a voicemail that's specific (use their name, your name, "just checking in") instead of "call me when you can."</p>

        <h2>Step 2: Open with something specific</h2>
        <p>Don't lead with "are you okay." That's the question they've been told to lie to since basic. Instead:</p>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li style="margin-bottom:.5em;">"I was thinking about that time at [specific shared moment]. How's life?"</li>
          <li style="margin-bottom:.5em;">"What's the worst thing that's happened to you this month? Mine was —"</li>
          <li style="margin-bottom:.5em;">"I owe you a beer. When am I paying up?"</li>
        </ul>
        <p>Specific, low-stakes, easy to answer. Builds the bridge.</p>

        <h2>Step 3: Listen for the iceberg</h2>
        <p>Most of what's wrong is below the waterline. Listen for:</p>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li style="margin-bottom:.5em;">"I'm just tired all the time"</li>
          <li style="margin-bottom:.5em;">"It doesn't matter"</li>
          <li style="margin-bottom:.5em;">"My family would be better off"</li>
          <li style="margin-bottom:.5em;">"I'm fine, but —"</li>
          <li style="margin-bottom:.5em;">Sudden calm after a hard period (decision feels made)</li>
          <li style="margin-bottom:.5em;">Talking about giving things away</li>
        </ul>

        <h2>Step 4: Ask the question</h2>
        <p style="font-size:1.25rem;font-family:var(--font-headline);"><strong>"Are you thinking about killing yourself?"</strong></p>
        <p>Direct. Specific. Yes-or-no.</p>
        <p>Asking does <em>not</em> plant the idea. The American Foundation for Suicide Prevention, the VA, every clinician, every veteran-led peer program — they all agree on this. Not asking is the risk. Asking is the safety check.</p>
        <p>If they say "no, I'm not there" — you've still opened a door. Stay on the call. Talk about whatever they want.</p>
        <p>If they say yes — stay on the line. Don't rush. Don't moralize. Don't promise to fix anything. Just stay. And then:</p>

        <h2>Step 5: Get them to 988</h2>
        <p>"I want you to call the Veterans Crisis Line right now. I'll stay with you while you do, or I'll three-way it with you." Hand them the lifeline. The trained responder on the other end of 988 will do the next part.</p>
        <p style="margin-top:var(--s-5);">
          <a href="tel:988" class="btn btn-crisis" style="font-size:1.0625rem;">Call 988 with them — Press 1</a>
        </p>

        <h2>Step 6: Lethal means</h2>
        <p>If they have a firearm and they're in the dark place, the most important next move is to put time and distance between them and it. Offer to hold it for the weekend. Drive over and pick it up. Or get them to a buddy who can.</p>
        <p>Most attempts happen within an hour of the decision. A gun safe with a combination they don't have is enough to get past that hour.</p>
        <p>This isn't anti-gun. It's anti-loss. They want their firearms back when they're through the storm.</p>

        <h2>Step 7: Don't disappear</h2>
        <p>Day after, day after that, the next week — call again. The buddy check that matters is the second one and the third one. The first call is the door. The follow-ups are the road.</p>

        <div class="warning-box">
          <h3>If you can't reach them and you're worried right now</h3>
          <p>Drive over. If you can't, get someone closer to do it — a sibling, an old commander, anyone who can lay eyes on them.</p>
          <p>Last resort: call the local non-emergency police line and request a wellness check on a veteran in mental health crisis. Use those exact words. Ask if they have a Crisis Intervention Trained (CIT) officer.</p>
          <p style="margin-top:var(--s-2);">Don't lead with 911 unless they have a weapon and are an immediate threat to someone else. Police-on-veteran wellness checks have killed people. Use 988 first, family first, the wellness-check line before 911.</p>
        </div>

        <h2>For yourself</h2>
        <p>Doing buddy checks takes a toll. After a hard call, do a check on yourself. Stop Soldier Suicide, Wounded Warrior Project Talk, Give an Hour — they exist for the people doing the catching, too.</p>
      </article>
    </div>`;

  return new Response(shellPage({
    title: 'Buddy Check Guide — Veteran News',
    description: '5-minute guide for reaching out to a veteran you\'re worried about. What to ask, what to listen for, what to do if they\'re in crisis.',
    canonicalPath: '/buddy-check',
    navActive: '',
    contentHtml: content
  }), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}

// ── Claim help walkthrough ────────────────────────────────────────────────
async function serveClaimHelpPage(env, url, request) {
  const content = `
    <section class="page-hero">
      <div class="container-narrow">
        <div class="eyebrow">Claim Help</div>
        <h1 class="page-title">Are you owed something you haven't filed for?</h1>
        <p class="page-lede">A quick walkthrough to surface VA benefits you may be eligible for. Takes about 2 minutes. Connects you to a free VSO at the end — no fees, ever, for filing a VA claim.</p>
      </div>
    </section>
    <div class="container-narrow">
      <div id="claim-help-app">
        <!-- Question 1 -->
        <div class="claim-question" id="q1">
          <h3>Did you serve on active duty in the U.S. military?</h3>
          <p style="color:var(--ink-muted);margin-bottom:var(--s-4);">Including activated National Guard or Reserve.</p>
          <div class="claim-options">
            <div class="claim-option" data-q="1" data-v="yes"><span class="claim-option-marker"></span> Yes, active duty / activated</div>
            <div class="claim-option" data-q="1" data-v="no"><span class="claim-option-marker"></span> No / Reserve only / Not sure</div>
          </div>
        </div>

        <div class="claim-question" id="q2" hidden>
          <h3>Was your discharge other than dishonorable?</h3>
          <p style="color:var(--ink-muted);margin-bottom:var(--s-4);">Honorable, General, or Under Honorable Conditions all qualify. OTH may still qualify for some benefits.</p>
          <div class="claim-options">
            <div class="claim-option" data-q="2" data-v="yes"><span class="claim-option-marker"></span> Yes, honorable or general</div>
            <div class="claim-option" data-q="2" data-v="oth"><span class="claim-option-marker"></span> OTH / not sure / want to upgrade</div>
            <div class="claim-option" data-q="2" data-v="no"><span class="claim-option-marker"></span> Bad conduct / dishonorable</div>
          </div>
        </div>

        <div class="claim-question" id="q3" hidden>
          <h3>Did you serve in any of these locations or eras?</h3>
          <p style="color:var(--ink-muted);margin-bottom:var(--s-4);">Select all that apply. PACT Act expanded coverage massively in 2022.</p>
          <div class="claim-options">
            <div class="claim-option" data-q="3" data-v="vietnam"><span class="claim-option-marker"></span> Vietnam (in-country, Thailand, Laos, Cambodia)</div>
            <div class="claim-option" data-q="3" data-v="gulf"><span class="claim-option-marker"></span> Gulf War (1990-91)</div>
            <div class="claim-option" data-q="3" data-v="post911"><span class="claim-option-marker"></span> Iraq, Afghanistan, Syria, or Horn of Africa post-9/11</div>
            <div class="claim-option" data-q="3" data-v="burnpit"><span class="claim-option-marker"></span> Anywhere with burn pits or open-air waste burning</div>
            <div class="claim-option" data-q="3" data-v="atomic"><span class="claim-option-marker"></span> Atomic veteran / nuclear test exposure</div>
            <div class="claim-option" data-q="3" data-v="campLejeune"><span class="claim-option-marker"></span> Camp Lejeune 1953-1987</div>
            <div class="claim-option" data-q="3" data-v="other"><span class="claim-option-marker"></span> None of the above / not sure</div>
          </div>
        </div>

        <div class="claim-question" id="q4" hidden>
          <h3>Do you have any of these health conditions?</h3>
          <p style="color:var(--ink-muted);margin-bottom:var(--s-4);">Select any that apply. The PACT Act made many of these "presumptive" — meaning VA assumes service connection if you served in a covered location.</p>
          <div class="claim-options">
            <div class="claim-option" data-q="4" data-v="cancer"><span class="claim-option-marker"></span> Any cancer (especially lung, brain, GI, kidney, head/neck, melanoma)</div>
            <div class="claim-option" data-q="4" data-v="respiratory"><span class="claim-option-marker"></span> Asthma, COPD, chronic bronchitis, sinusitis</div>
            <div class="claim-option" data-q="4" data-v="hypertension"><span class="claim-option-marker"></span> Hypertension</div>
            <div class="claim-option" data-q="4" data-v="diabetes"><span class="claim-option-marker"></span> Type 2 diabetes</div>
            <div class="claim-option" data-q="4" data-v="ischemic"><span class="claim-option-marker"></span> Heart disease (ischemic)</div>
            <div class="claim-option" data-q="4" data-v="parkinsons"><span class="claim-option-marker"></span> Parkinson's, parkinsonism, or tremor</div>
            <div class="claim-option" data-q="4" data-v="ptsd"><span class="claim-option-marker"></span> PTSD, depression, anxiety, substance use</div>
            <div class="claim-option" data-q="4" data-v="hearing"><span class="claim-option-marker"></span> Hearing loss / tinnitus</div>
            <div class="claim-option" data-q="4" data-v="back"><span class="claim-option-marker"></span> Back, knee, joint, or musculoskeletal injury</div>
            <div class="claim-option" data-q="4" data-v="none"><span class="claim-option-marker"></span> None of the above</div>
          </div>
        </div>

        <div class="claim-question" id="result" hidden></div>
      </div>
    </div>
    <script>
      (function () {
        const state = { q1: null, q2: null, q3: new Set(), q4: new Set() };
        document.querySelectorAll('.claim-option').forEach(opt => {
          opt.addEventListener('click', () => {
            const q = opt.dataset.q;
            const v = opt.dataset.v;
            if (q === '3' || q === '4') {
              // multi-select
              const set = state['q' + q];
              if (set.has(v)) { set.delete(v); opt.classList.remove('selected'); }
              else { set.add(v); opt.classList.add('selected'); }
              advance(q);
            } else {
              state['q' + q] = v;
              opt.parentElement.querySelectorAll('.claim-option').forEach(o => o.classList.remove('selected'));
              opt.classList.add('selected');
              advance(q);
            }
          });
        });
        function advance(currentQ) {
          if (currentQ === '1') {
            if (state.q1 === 'yes') showQ('q2');
            else if (state.q1 === 'no') renderResult();
          } else if (currentQ === '2') {
            if (state.q2 === 'yes' || state.q2 === 'oth') showQ('q3');
            else renderResult();
          } else if (currentQ === '3') {
            // Don't auto-advance for multi-select; show next + a "continue" inline
            showQ('q4');
          } else if (currentQ === '4') {
            renderResult();
          }
        }
        function showQ(id) {
          const el = document.getElementById(id);
          if (el) { el.hidden = false; el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
        }
        function renderResult() {
          const result = document.getElementById('result');
          if (!result) return;
          const benefits = [];
          const notes = [];
          if (state.q1 === 'no') {
            benefits.push({ name: 'Limited eligibility', desc: 'Most VA benefits require active-duty service. Activated Reserve / Guard service for federal duty (Title 10) usually qualifies. <a href="https://www.va.gov/find-locations/" target="_blank" rel="noopener">Talk to a Vet Center</a> to confirm.' });
          } else if (state.q2 === 'no') {
            benefits.push({ name: 'Discharge upgrade first', desc: 'A Bad Conduct or Dishonorable discharge blocks most VA benefits. But upgrades happen — especially for combat-related conditions or MST. Free help: <a href="https://www.dischargeupgrades.org/" target="_blank" rel="noopener">dischargeupgrades.org</a>.' });
          } else {
            // Eligible — build benefit list
            benefits.push({ name: 'VA Healthcare', desc: 'Almost certainly eligible. Apply at <a href="https://www.va.gov/health-care/apply/application/introduction" target="_blank" rel="noopener">va.gov</a>. Free or low cost.' });
            if (state.q4.size && !state.q4.has('none')) {
              benefits.push({ name: 'Disability Compensation', desc: 'You have one or more conditions that may be service-connected. File a claim — VSOs do it free. Don\\'t self-rate or downplay.' });
            }
            // PACT Act presumption logic
            const pactLocations = ['burnpit','post911','gulf','vietnam'];
            const presumptiveConditions = ['cancer','respiratory','hypertension'];
            const hasPactLoc = [...state.q3].some(l => pactLocations.includes(l));
            const hasPresumptive = [...state.q4].some(c => presumptiveConditions.includes(c));
            if (hasPactLoc && hasPresumptive) {
              benefits.push({ name: '⚡ PACT Act Presumptive Conditions', desc: 'You may have presumptive service connection — meaning VA assumes the service caused the condition without you having to prove it. <strong>This is the biggest unfiled veteran benefit in America.</strong> File now.' });
            }
            if (state.q3.has('vietnam') && state.q4.has('parkinsons')) {
              benefits.push({ name: 'Agent Orange / Parkinsonism', desc: 'Parkinson\\'s and parkinsonism are presumptive for Vietnam-era veterans exposed to Agent Orange.' });
            }
            if (state.q3.has('vietnam') && state.q4.has('ischemic')) {
              benefits.push({ name: 'Agent Orange / Ischemic Heart Disease', desc: 'Ischemic heart disease is presumptive for Vietnam-era veterans.' });
            }
            if (state.q3.has('vietnam') && state.q4.has('diabetes')) {
              benefits.push({ name: 'Agent Orange / Type 2 Diabetes', desc: 'Type 2 diabetes is presumptive for Vietnam-era veterans.' });
            }
            if (state.q3.has('campLejeune')) {
              benefits.push({ name: 'Camp Lejeune Justice Act', desc: 'Veterans + family members exposed at Camp Lejeune 1953-1987 may file under the Camp Lejeune Justice Act in addition to standard VA claims. Many cancers and chronic illnesses qualify.' });
            }
            if (state.q4.has('hearing')) {
              benefits.push({ name: 'Hearing Loss / Tinnitus', desc: 'These are the two most-claimed VA disabilities. If you served around aircraft, weapons, or explosions — you have a strong claim.' });
            }
            if (state.q4.has('ptsd')) {
              benefits.push({ name: 'PTSD / Mental Health', desc: 'Combat veterans get presumptive PTSD service connection. Non-combat MST survivors and others have a path too. Free, fast, confidential evaluation.' });
            }
            if (state.q2 === 'oth') {
              notes.push('Your OTH discharge may still qualify you for some benefits — and is potentially upgradeable. Free help: <a href="https://www.dischargeupgrades.org/" target="_blank" rel="noopener">dischargeupgrades.org</a>.');
            }
          }
          const eligible = benefits.length > 1 || (state.q1 === 'yes' && state.q2 === 'yes');
          result.hidden = false;
          result.scrollIntoView({ behavior: 'smooth' });
          result.innerHTML = '<div class="result-card ' + (eligible ? 'eligible' : 'partial') + '">' +
            '<h3>' + (eligible ? 'You may be eligible for benefits you haven\\'t filed for.' : 'Some next steps to explore.') + '</h3>' +
            '<ul style="padding-left:1.25em;margin:var(--s-4) 0 0;">' +
              benefits.map(b => '<li style="margin-bottom:.75em;"><strong>' + b.name + '</strong> — ' + b.desc + '</li>').join('') +
            '</ul>' +
            (notes.length ? '<p style="margin-top:var(--s-4);font-size:0.875rem;opacity:0.92;">' + notes.join('<br>') + '</p>' : '') +
          '</div>' +
          '<div class="warning-box"><h3>Now: get free help filing</h3>' +
          '<p>VSOs file VA claims for free. Always free. Anyone charging you is breaking federal law (38 USC §5904). The big ones, in alphabetical order:</p>' +
          '<div class="resource-grid" style="margin-top:var(--s-4);">' +
            '<a href="https://www.dav.org/find-your-local-office/" target="_blank" rel="noopener" class="resource-card"><h3>DAV</h3><p>Disabled American Veterans — largest VA-accredited claims service in the country.</p><span class="resource-card-cta">Find local office →</span></a>' +
            '<a href="https://www.vfw.org/assistance/va-claims-separation-benefits" target="_blank" rel="noopener" class="resource-card"><h3>VFW</h3><p>Veterans of Foreign Wars — claims service in every state.</p><span class="resource-card-cta">VFW claims help →</span></a>' +
            '<a href="https://www.legion.org/serviceofficers" target="_blank" rel="noopener" class="resource-card"><h3>American Legion</h3><p>Service officers in 3,000+ posts nationwide.</p><span class="resource-card-cta">Find a service officer →</span></a>' +
            '<a href="https://www.warriorsfund.org" target="_blank" rel="noopener" class="resource-card"><h3>Warriors Fund</h3><p>Direct assistance and advocacy. Our parent organization.</p><span class="resource-card-cta">Get help →</span></a>' +
          '</div></div>';
        }
      })();
    </script>`;

  return new Response(shellPage({
    title: 'Claim Help: What VA Benefits Are You Owed? — Veteran News',
    description: 'Quick 2-minute walkthrough to surface VA benefits you may be eligible for. PACT Act, Agent Orange, Camp Lejeune, presumptive conditions, hearing loss, PTSD. Connects to free VSO claim filing.',
    canonicalPath: '/claim-help',
    navActive: '',
    contentHtml: content
  }), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}

// ── Survivor benefits ─────────────────────────────────────────────────────
async function serveSurvivorBenefitsPage(env, url, request) {
  const content = `
    <section class="page-hero">
      <div class="container-narrow">
        <div class="eyebrow">For Survivors</div>
        <h1 class="page-title">If you've lost a veteran or service member.</h1>
        <p class="page-lede">There are programs you may not know about, paperwork you don't have to navigate alone, and people whose entire job is helping you. This page is the navigator.</p>
      </div>
    </section>
    <div class="container-narrow">
      <article class="story-body">
        <h2>If this is recent — start here</h2>
        <p><strong>TAPS (Tragedy Assistance Program for Survivors)</strong> is the single most important call. Free 24/7 support, a national peer network, grief counseling, and they walk families through every form, benefit, and decision.</p>
        <p style="font-size:1.125rem;"><a href="tel:18009598277" class="btn btn-primary">Call TAPS — 1-800-959-TAPS (8277)</a></p>

        <h2>Major survivor benefits</h2>
        <h3>Dependency and Indemnity Compensation (DIC)</h3>
        <p>Tax-free monthly payment for surviving spouses, children, or parents of:</p>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li style="margin-bottom:.5em;">A veteran whose death was service-connected</li>
          <li style="margin-bottom:.5em;">A veteran rated 100% disabled for 10+ years before death (or 5 years if rated 100% from time of separation)</li>
          <li style="margin-bottom:.5em;">A service member who died on active duty</li>
        </ul>
        <p>Apply with VA Form 21P-534. Get free help from a VSO — DAV, VFW, American Legion all do this work.</p>

        <h3>Survivors Pension</h3>
        <p>For low-income surviving spouses and unmarried children of deceased wartime veterans. Tax-free. Apply with VA Form 21P-534.</p>

        <h3>CHAMPVA</h3>
        <p>Healthcare for spouses and dependents of veterans rated permanently and totally disabled, or who died from a service-connected condition. <a href="https://www.va.gov/COMMUNITYCARE/programs/dependents/champva/" target="_blank" rel="noopener">CHAMPVA info</a>.</p>

        <h3>Education benefits — Chapter 35 / DEA</h3>
        <p>Up to 36 months of education benefits for spouses and dependents of veterans who died from a service-connected disability or are 100% disabled. <a href="https://www.va.gov/education/survivor-dependent-benefits/" target="_blank" rel="noopener">Apply for DEA</a>.</p>

        <h3>Fry Scholarship</h3>
        <p>For children and surviving spouses of service members who died in the line of duty after 9/11/2001. Up to 36 months of full Post-9/11 GI Bill benefits.</p>

        <h3>Home loan eligibility</h3>
        <p>Surviving spouses can use the deceased veteran's VA home loan benefit (without the funding fee) in many cases.</p>

        <h3>Burial benefits</h3>
        <p>VA pays for burial in a national cemetery, headstone, Presidential Memorial Certificate, and (for some) a burial allowance. <a href="https://www.va.gov/burials-memorials/" target="_blank" rel="noopener">Burials &amp; memorials</a>.</p>

        <h3>SBP — Survivor Benefit Plan</h3>
        <p>Separate from VA. A military retiree pension annuity for surviving spouse. If your veteran was retired, contact DFAS: 1-800-321-1080.</p>

        <h2>Specific situations</h2>
        <h3>Death by suicide</h3>
        <p>You qualify for the same benefits any other surviving family does. Suicide is not disqualifying for survivor benefits.</p>
        <p>TAPS has a dedicated <a href="https://www.taps.org/suicideloss/" target="_blank" rel="noopener">Suicide Loss program</a> — peer support specifically from other suicide-loss families.</p>

        <h3>Death from PACT Act conditions</h3>
        <p>If your veteran died from cancer, respiratory illness, hypertension, or other PACT Act presumptive conditions and served in a covered location — DIC is presumed service-connected even if they never had a claim approved while alive. File anyway.</p>

        <h3>Camp Lejeune family deaths</h3>
        <p>The Camp Lejeune Justice Act covers family members exposed 1953-1987, not just service members. Separate from DIC.</p>

        <h2>Help filing</h2>
        <p>Don't try to navigate this alone. The VSOs that help vets file claims help families file survivor claims too — for free.</p>
        <div class="resource-grid">
          <a href="tel:18009598277" class="resource-card featured">
            <h3>TAPS — first call</h3>
            <p>1-800-959-TAPS (8277). 24/7. Free. Decades of experience walking families through this exact moment.</p>
            <span class="resource-card-cta">Call TAPS →</span>
          </a>
          <a href="https://www.dav.org/find-your-local-office/" target="_blank" rel="noopener" class="resource-card">
            <h3>DAV — claims filing</h3>
            <p>Free DIC and survivor pension claim filing.</p>
            <span class="resource-card-cta">Find local office →</span>
          </a>
          <a href="https://www.vfw.org/assistance/va-claims-separation-benefits" target="_blank" rel="noopener" class="resource-card">
            <h3>VFW — claims service</h3>
            <p>Service officers experienced with survivor claims.</p>
            <span class="resource-card-cta">VFW help →</span>
          </a>
          <a href="https://www.warriorsfund.org" target="_blank" rel="noopener" class="resource-card">
            <h3>Warriors Fund</h3>
            <p>Our parent organization — direct financial assistance during the transition.</p>
            <span class="resource-card-cta">Apply for help →</span>
          </a>
        </div>

        <p style="margin-top:var(--s-7);">
          <a href="/crisis" class="btn btn-secondary">If you need crisis support →</a>
        </p>
      </article>
    </div>`;

  return new Response(shellPage({
    title: 'Survivor Benefits Navigator — Veteran News',
    description: 'For families who have lost a veteran or service member. DIC, Survivors Pension, CHAMPVA, DEA, Fry Scholarship, and where to call first.',
    canonicalPath: '/survivor-benefits',
    navActive: '',
    contentHtml: content
  }), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}

// ── States hub + state pages (placeholder data; populated from agent) ────
const STATE_NAMES = {
  AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',
  CT:'Connecticut',DE:'Delaware',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',
  IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',
  ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',
  MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',
  NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',
  OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',
  TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',
  WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',DC:'District of Columbia'
};

async function serveStatesIndex(env, url, request) {
  const tiles = Object.entries(STATE_NAMES).map(([code, name]) => `
    <a href="/state/${code.toLowerCase()}" class="state-tile">
      <span class="state-tile-code">${code}</span>
      <span class="state-tile-name">${escapeHtml(name)}</span>
    </a>`).join('');

  const content = `
    <section class="page-hero">
      <div class="container">
        <div class="eyebrow">By State</div>
        <h1 class="page-title">Find your state's veteran resources.</h1>
        <p class="page-lede">Every state has its own veteran department, its own benefits, its own programs on top of the federal VA. Here's the directory.</p>
      </div>
    </section>
    <div class="container">
      <div class="state-grid">${tiles}</div>

      <div class="warning-box" style="margin-top:var(--s-9);">
        <h3>Federal VA covers most</h3>
        <p>Disability compensation, healthcare, GI Bill, home loans — all federal. Your state programs are <em>on top</em> of those, not instead. Always file your federal VA claim first via a VSO. Then layer state benefits.</p>
      </div>
    </div>`;

  return new Response(shellPage({
    title: 'Veteran Resources by State — Veteran News',
    description: 'Find your state\'s veteran department, hotline, and standout state-specific benefits. All 50 states + DC.',
    canonicalPath: '/states',
    navActive: '',
    contentHtml: content
  }), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=86400' } });
}

async function serveStatePage(env, url, request, code) {
  const name = STATE_NAMES[code];
  if (!name) return new Response('State not found', { status: 404 });

  const data = (typeof STATES_DATA !== 'undefined' && STATES_DATA[code]) || null;
  const wfStateSlug = name.toLowerCase().replace(/\s+/g, '-');
  const wfDirectoryUrl = `https://warriorsfund.org/resources/state/${wfStateSlug}`;

  const standoutsHtml = data?.standouts?.length ? data.standouts.map(s => `
    <div class="resource-card">
      <h3>${escapeHtml(s.name)}</h3>
      <p>${escapeHtml(s.desc || '')}</p>
    </div>`).join('') : '';

  // Latest VetNews coverage tagged with this state
  let stateNews = [];
  if (env.DB) {
    try {
      const rs = await env.DB.prepare(`
        SELECT slug, title, excerpt, category, publish_date, image, source
        FROM articles
        WHERE (LOWER(title) LIKE ? OR LOWER(excerpt) LIKE ?)
          AND link_status != 'broken' AND low_quality = 0
        ORDER BY publish_date DESC LIMIT 6
      `).bind(`%${name.toLowerCase()}%`, `%${name.toLowerCase()}%`).all();
      stateNews = (rs.results || []).map(articleRowToObj);
    } catch {}
  }
  const newsHtml = stateNews.length ? stateNews.map(s => `
    <a href="/news/${escapeHtml(s.slug)}" class="resource-card">
      <h3>${escapeHtml((s.title || '').slice(0, 90))}</h3>
      <p style="font-size:0.8125rem;">${escapeHtml(s.source || '')} · ${formatRelTime(s.publishDate)}</p>
    </a>`).join('') : '';

  const content = `
    <section class="page-hero">
      <div class="container-narrow">
        <a href="/states" class="back-link">← All states</a>
        <div class="eyebrow">${escapeHtml(code)} · ${escapeHtml(name)}</div>
        <h1 class="page-title">${escapeHtml(name)}</h1>
        ${data?.notes ? `<p class="page-lede">${escapeHtml(data.notes)}</p>` : '<p class="page-lede">State-specific veteran resources, news, and benefits for ' + escapeHtml(name) + '.</p>'}
      </div>
    </section>
    <div class="container-narrow">

      <!-- LEAD: Warriors Fund directory hand-off (the comprehensive finder) -->
      <div class="wf-banner" style="margin-top:0;">
        <div class="wf-shield">WF</div>
        <div class="wf-text">
          <h4>Find every veteran resource in ${escapeHtml(name)}</h4>
          <p>VA hospitals, clinics, vet centers, VSO offices, mental health, housing, employment — maintained by Warriors Fund and updated continuously.</p>
        </div>
        <a href="${wfDirectoryUrl}" target="_blank" rel="noopener" class="btn btn-primary">${escapeHtml(name)} Directory →</a>
      </div>

      ${data ? `
        <div class="resource-block">
          <div class="h-eyebrow">State Veterans Department</div>
          <h2>${escapeHtml(data.deptName || (name + ' Department of Veterans Affairs'))}</h2>
          <div class="resource-grid">
            ${data.deptUrl ? `<a href="${escapeHtml(data.deptUrl)}" target="_blank" rel="noopener" class="resource-card featured"><h3>State Veterans Department</h3><p>${escapeHtml(data.deptName || '')}</p><span class="resource-card-cta">Visit official site →</span></a>` : ''}
            ${data.phone ? `<a href="tel:${data.phone.replace(/[^0-9]/g, '')}" class="resource-card"><h3>State Hotline</h3><p>${escapeHtml(data.phone)}</p><span class="resource-card-cta">Tap to call →</span></a>` : ''}
            <a href="${wfDirectoryUrl}" target="_blank" rel="noopener" class="resource-card">
              <h3>${escapeHtml(name)} Resource Finder</h3>
              <p>Every VA hospital, clinic, vet center, VSO and program in ${escapeHtml(name)}.</p>
              <span class="resource-card-cta">Open finder →</span>
            </a>
          </div>
        </div>
        ${standoutsHtml ? `
          <div class="resource-block">
            <div class="h-eyebrow">Standout State Benefits</div>
            <h2>What's unique to ${escapeHtml(name)}</h2>
            <p class="resource-block-desc">State benefits layered on top of federal VA coverage. File federal first, then layer state.</p>
            <div class="resource-grid">${standoutsHtml}</div>
          </div>` : ''}
      ` : `
        <div class="warning-box">
          <p>State-specific data for <strong>${escapeHtml(name)}</strong> coming soon. In the meantime, the Warriors Fund directory above has every vetted resource in ${escapeHtml(name)} — searchable by what you need.</p>
        </div>`}

      ${newsHtml ? `
        <div class="resource-block">
          <div class="h-eyebrow">${escapeHtml(name)} in the News</div>
          <h2>Latest coverage mentioning ${escapeHtml(name)}</h2>
          <div class="resource-grid">${newsHtml}</div>
        </div>` : ''}

      <div class="crisis-cta">
        <div class="crisis-cta-eyebrow">Veterans Crisis Line</div>
        <h3>Free, confidential support — 24/7</h3>
        <div class="crisis-cta-actions">
          <a href="tel:988" class="btn btn-primary">Call 988 — Press 1</a>
          <a href="sms:838255" class="btn btn-secondary">Text 838255</a>
          <a href="/crisis" class="btn btn-secondary">Full crisis hub →</a>
        </div>
      </div>
    </div>`;

  return new Response(shellPage({
    title: `${name} Veteran Resources — Veteran News`,
    description: `Veteran resources, state department, hotline, and standout state-specific benefits for ${name}.`,
    canonicalPath: `/state/${code.toLowerCase()}`,
    navActive: '',
    contentHtml: content
  }), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=86400' } });
}

// STATES_DATA — verified state-by-state veteran resources directory.
// Source: each state's official .gov + NASDVA cross-reference.
// Note: property tax thresholds in some states are indexed annually.
const STATES_DATA = {
  AL: { name: 'Alabama', deptName: 'Alabama Department of Veterans Affairs', deptUrl: 'https://va.alabama.gov', phone: '334-242-5077', standouts: [{ name: 'Property tax exemption (100% disabled)', desc: 'Full home exemption for permanently and totally disabled vets; vehicle license fees and property taxes also waived on VA-funded vehicles' }, { name: 'Alabama GI Dependent Scholarship', desc: 'Tuition and fees at state schools for spouses/children of vets rated 40%+ service-connected disabled' }, { name: 'No state tax on military retirement', desc: 'Military retired pay fully exempt from Alabama income tax' }], notes: 'Strong tax benefits and dependent education program; ADVA operates 62 county Veterans Service Offices.' },
  AK: { name: 'Alaska', deptName: 'Alaska Office of Veterans Affairs', deptUrl: 'https://veterans.alaska.gov', phone: '907-428-6016', standouts: [{ name: 'Veteran Land Discount', desc: '25% discount on state residential or recreational land for qualifying veterans' }, { name: 'Property tax exemption', desc: 'First $150,000 of assessed value exempt for 50%+ disabled veterans on primary residence' }, { name: 'Permanent Fund Dividend (PFD) eligibility for deployed', desc: 'Service members deployed outside Alaska remain eligible for PFD' }], notes: 'Unique state-land discount and absentee-friendly residency rules for service members.' },
  AZ: { name: 'Arizona', deptName: 'Arizona Department of Veterans\' Services', deptUrl: 'https://dvs.az.gov', phone: '602-255-3373', standouts: [{ name: 'Disabled Veteran Property Tax Exemption', desc: 'Up to ~$4,748 of assessed value exempt, scaled by VA disability percentage; full exemption with income limits' }, { name: 'Immediate in-state tuition residency', desc: 'Veterans and dependents using VA education benefits qualify for in-state tuition with no waiting period' }, { name: 'Military retirement pay tax exemption', desc: 'Military retired pay fully exempt from Arizona state income tax' }], notes: 'Strong tax climate plus instant residency for tuition.' },
  AR: { name: 'Arkansas', deptName: 'Arkansas Department of Veterans Affairs', deptUrl: 'https://www.veterans.arkansas.gov', phone: '501-683-2382', standouts: [{ name: 'Property tax exemption (100% disabled)', desc: 'Full homestead and personal property tax exemption for 100% service-connected disabled vets, surviving spouses, and unmarried widows of KIA' }, { name: 'Free tuition for dependents', desc: 'Free tuition/fees at state-supported schools for dependents of KIA, MIA, POW, or 100% disabled vets' }, { name: 'Military retirement income exemption', desc: 'Military retired pay fully exempt from Arkansas state income tax' }], notes: 'Headline benefit is the broad 100% disabled property tax exemption that includes personal property.' },
  CA: { name: 'California', deptName: 'California Department of Veterans Affairs (CalVet)', deptUrl: 'https://www.calvet.ca.gov', phone: '800-952-5626', standouts: [{ name: 'CalVet Home Loans', desc: 'State-run direct home loan program with competitive rates and no PMI; funding fee waived for 10%+ disabled vets' }, { name: 'Disabled Veterans\' Property Tax Exemption', desc: '$100K basic / $150K low-income exemption on primary residence for 100% disabled vets (indexed annually)' }, { name: 'College Fee Waiver for Veteran Dependents', desc: 'Waives mandatory tuition/fees at any CSU, UC, or California Community College for eligible dependents' }], notes: 'CalVet is unusual in operating its own direct home-loan program.' },
  CO: { name: 'Colorado', deptName: 'Colorado Division of Veterans Affairs', deptUrl: 'https://vets.colorado.gov', phone: '303-914-5832', standouts: [{ name: 'Disabled Veteran Property Tax Exemption', desc: '50% exemption on first $200,000 of actual value for 100% permanently disabled vets; expanded to "individual unemployability" rated vets in 2024' }, { name: 'Military retirement pay subtraction', desc: 'Up to $15,000–$20,000 of military retirement pay deductible from state income tax depending on age' }, { name: 'Tuition Assistance Program for Guard', desc: 'Up to 100% tuition at state schools for Colorado National Guard members' }], notes: 'CDVA directs the network of County Veterans Service Officers in every Colorado county.' },
  CT: { name: 'Connecticut', deptName: 'Connecticut Department of Veterans Affairs', deptUrl: 'https://portal.ct.gov/dva', phone: '860-616-3685', standouts: [{ name: 'Veterans\' Property Tax Exemption', desc: 'Basic $1,000 assessed-value exemption for wartime vets; larger amounts for disabled vets and income-qualified applicants' }, { name: 'Military retirement income exemption', desc: 'Military retired pay fully exempt from Connecticut state income tax' }, { name: 'Tuition waiver at state schools', desc: 'Full tuition waiver at Connecticut public colleges/universities for qualifying wartime veterans' }], notes: 'Free tuition at state colleges is a standout.' },
  DE: { name: 'Delaware', deptName: 'Delaware Commission of Veterans Affairs', deptUrl: 'https://vets.delaware.gov', phone: '800-344-9900', standouts: [{ name: 'Disabled Veterans School Tax Credit', desc: '100% credit against non-vocational school district property tax for 100% service-connected disabled vets (3+ years DE residency)' }, { name: 'Educational Benefit for Children of Deceased Vets', desc: 'Tuition assistance at state schools for children of veterans who died in service or from service-connected causes' }, { name: 'Delaware Veterans Trust Fund', desc: 'Emergency grants for Delaware veterans facing financial crisis' }], notes: 'School tax credit is uniquely Delaware.' },
  FL: { name: 'Florida', deptName: 'Florida Department of Veterans\' Affairs', deptUrl: 'https://www.floridavets.org', phone: '844-693-5838', standouts: [{ name: 'Homestead Property Tax Exemption (100% P&T)', desc: 'Full ad-valorem property tax exemption on homestead for 100% permanently and totally disabled vets; partial exemptions at lower ratings' }, { name: 'Congressman C.W. Bill Young Tuition Waiver', desc: 'Out-of-state tuition fees waived at Florida public colleges/universities for honorably discharged vets residing in FL' }, { name: 'No state income tax', desc: 'Florida has no state income tax, making military retirement and VA benefits effectively untaxed' }], notes: 'Florida Veterans Support Line (1-844-MyFLVet) is a state-run wellness/connect line.' },
  GA: { name: 'Georgia', deptName: 'Georgia Department of Veterans Service', deptUrl: 'https://veterans.georgia.gov', phone: '404-656-2300', standouts: [{ name: 'Disabled Veteran Homestead Exemption', desc: 'Up to ~$117,014 (federally-indexed) homestead exemption for 100% disabled vets' }, { name: 'Military retirement income exemption', desc: 'Up to $17,500 (or $35,000 with earned income) of military retired pay exempt from state income tax for vets under 62; full exemption at 65+' }, { name: 'Georgia HERO Scholarship', desc: 'Up to $8,000 in scholarships for Georgia National Guard and Reserve members who served in combat zones' }], notes: 'GDVS operates two state veterans homes and seven cemeteries.' },
  HI: { name: 'Hawaii', deptName: 'Hawaii Office of Veterans Services', deptUrl: 'https://dod.hawaii.gov/ovs', phone: '808-433-0420', standouts: [{ name: 'Totally Disabled Veteran Property Tax Exemption', desc: 'Home exempt from all real property tax except minimum tax (county-administered)' }, { name: 'Military retirement income exemption', desc: 'Military retired pay fully exempt from Hawaii state income tax' }, { name: 'Special vehicle license plates / fee waivers', desc: 'Free vehicle registration and special plates for disabled veterans, POWs, and Medal of Honor recipients' }], notes: 'Property tax administration is at the county level in Hawaii.' },
  ID: { name: 'Idaho', deptName: 'Idaho Division of Veterans Services', deptUrl: 'https://veterans.idaho.gov', phone: '208-577-2310', standouts: [{ name: 'Property Tax Reduction for 100% Disabled Vets', desc: 'Up to $1,500 property tax reduction on primary residence for 100% service-connected disabled vets, regardless of income' }, { name: 'Idaho Veterans Recognition Income Tax Deduction', desc: 'Special income tax deductions for veterans, including grocery credit refund for disabled vets' }, { name: 'In-state tuition for vets', desc: 'Veterans and qualifying dependents using GI Bill receive immediate in-state residency for tuition' }], notes: 'IDVS runs three state veterans homes (Boise, Lewiston, Pocatello).' },
  IL: { name: 'Illinois', deptName: 'Illinois Department of Veterans Affairs', deptUrl: 'https://veterans.illinois.gov', phone: '800-437-9824', standouts: [{ name: 'Standard Homestead Exemption for Veterans with Disabilities', desc: 'Tiered property tax EAV reduction: $2,500 (30–49%), $5,000 (50–69%), full exemption (70%+ disability)' }, { name: 'Illinois Veteran Grant (IVG)', desc: 'Pays tuition and certain fees at Illinois public universities/community colleges for eligible vets' }, { name: 'MIA/POW Scholarship', desc: 'Tuition/fee scholarship for dependents of veterans who are POW, MIA, KIA, or 100% disabled' }], notes: 'IDVA also runs Veterans Homes in Anna, LaSalle, Manteno, Quincy, and Chicago.' },
  IN: { name: 'Indiana', deptName: 'Indiana Department of Veterans Affairs', deptUrl: 'https://www.in.gov/dva', phone: '317-232-3910', standouts: [{ name: 'Tuition and Fee Exemption for Children of Disabled Vets', desc: '100% tuition/fees at Indiana public colleges for children of disabled or deceased veterans (up to 124 credit hours)' }, { name: 'Indiana Purple Heart Recipient Program', desc: 'Covers 100% of tuition and regularly assessed fees at state schools for Hoosier Purple Heart recipients' }, { name: 'Military Family Relief Fund', desc: 'Grants up to $2,500 for Indiana service members and recently separated vets facing financial hardship' }], notes: 'Tuition benefits for children of disabled veterans are among the most generous in the country.' },
  IA: { name: 'Iowa', deptName: 'Iowa Department of Veterans Affairs', deptUrl: 'https://va.iowa.gov', phone: '515-252-4698', standouts: [{ name: 'Iowa Military Property Tax Exemption', desc: 'Reduces taxable value of homestead by $1,852 for qualifying veterans; 100% disabled vets fully exempt' }, { name: 'Military retirement income exemption', desc: 'Military retired pay fully exempt from Iowa state income tax' }, { name: 'Iowa Veterans Trust Fund', desc: 'Emergency grants up to $5,000 for veterans facing financial hardship' }], notes: 'Iowa Veterans Trust Fund offers wide-ranging emergency assistance categories.' },
  KS: { name: 'Kansas', deptName: 'Kansas Office of Veterans Services', deptUrl: 'https://www.kovs.ks.gov', phone: '785-296-3976', standouts: [{ name: 'Homestead Refund for Disabled Vets', desc: 'Up to $700 property tax refund for 50%+ disabled veterans regardless of income' }, { name: 'Military retirement income exemption', desc: 'Military retired pay fully exempt from Kansas state income tax' }, { name: 'Kansas Veterans Claims Assistance Program', desc: 'KCVAO veterans service representatives file federal/state claims free of charge' }], notes: 'State agency was renamed Kansas Office of Veterans Services (KOVS).' },
  KY: { name: 'Kentucky', deptName: 'Kentucky Department of Veterans Affairs', deptUrl: 'https://veterans.ky.gov', phone: '502-564-9203', standouts: [{ name: 'Kentucky Tuition Waiver', desc: 'Full tuition waiver at KY public colleges, universities, and vocational schools for children, stepchildren, spouses, and unremarried widows of eligible KY veterans' }, { name: 'Disabled Veteran Property Tax Homestead Exemption', desc: 'Homestead exemption (~$49,100, indexed) on assessed value for totally disabled vets' }, { name: 'Military retirement income exemption', desc: 'Up to $31,110 of military retired pay exempt from KY state income tax' }], notes: 'KDVA operates four veterans nursing facilities and three state veterans cemeteries.' },
  LA: { name: 'Louisiana', deptName: 'Louisiana Department of Veterans Affairs', deptUrl: 'https://www.vetaffairs.la.gov', phone: '225-219-5000', standouts: [{ name: 'Disabled Veterans Homestead Exemption', desc: 'Property tax homestead exemption increases to $150,000 (50–69% disabled), $250,000 (70–99%), or full exemption (100%)' }, { name: 'Title 29 Tuition Exemption', desc: 'In-state tuition exemption at LA public colleges for surviving spouses and dependents of vets rated 90%+ disabled or KIA' }, { name: 'Military Family Assistance Fund', desc: 'Grants up to $10,000 for Louisiana service members and families during deployment hardship' }], notes: 'LDVA operates 74 service offices statewide.' },
  ME: { name: 'Maine', deptName: 'Maine Bureau of Veterans\' Services', deptUrl: 'https://www.maine.gov/veterans', phone: '207-287-7020', standouts: [{ name: 'Veteran Property Tax Exemption', desc: '$6,000 exemption from property valuation for wartime veterans 62+ or disabled; $50,000 for paraplegic vets with VA-funded specially adapted housing' }, { name: 'Veterans Dependents Educational Benefits', desc: 'Tuition waiver at Maine public universities, community colleges, and Maine Maritime Academy for spouses/children of 100% disabled or KIA vets' }, { name: 'Lifetime hunting/fishing license & state park pass', desc: 'Free for Maine resident vets rated 50%+ disabled' }], notes: 'Comprehensive education waiver and recreation passes.' },
  MD: { name: 'Maryland', deptName: 'Maryland Department of Veterans & Military Families', deptUrl: 'https://veterans.maryland.gov', phone: '800-446-4926', standouts: [{ name: '100% Disabled Veteran Property Tax Exemption', desc: 'Full exemption from real property taxes on principal residence for 100% permanently/totally disabled vets and qualifying surviving spouses' }, { name: 'Edward T. Conroy Memorial Scholarship', desc: 'Tuition and mandatory fees (~$13K+/yr) at Maryland public colleges for vets with 25%+ disability and qualifying dependents' }, { name: 'Military retirement income subtraction', desc: 'Up to $20,000 (age 55+) or $12,500 (under 55) of military retired pay subtractable from MD income tax' }], notes: 'Department was renamed in 2024.' },
  MA: { name: 'Massachusetts', deptName: 'Massachusetts Executive Office of Veterans Services', deptUrl: 'https://www.mass.gov/orgs/executive-office-of-veterans-services', phone: '617-210-5480', standouts: [{ name: 'Chapter 115 Benefits', desc: 'Means-tested cash assistance + reimbursement for medical expenses for low-income MA veterans and dependents — uniquely robust state safety net' }, { name: 'Annuity for 100% Disabled Vets / Gold Star families', desc: 'Annual annuity for 100% disabled vets, paraplegic vets, Gold Star parents, and unremarried surviving spouses' }, { name: 'Property tax exemptions (Clauses 22, 22A–F)', desc: 'Tiered $400–$1,500+ property tax abatements; full exemption for paraplegic and 100% blind disability ratings' }], notes: 'Chapter 115 is the most comprehensive state-funded means-tested veteran benefit in the U.S.' },
  MI: { name: 'Michigan', deptName: 'Michigan Veterans Affairs Agency', deptUrl: 'https://www.michigan.gov/mvaa', phone: '800-642-4838', standouts: [{ name: '100% Disabled Veteran Property Tax Exemption', desc: 'Full exemption from real property taxes on homestead for 100% permanently/totally disabled vets and unremarried surviving spouses' }, { name: 'Children of Veterans Tuition Grant', desc: 'Up to $2,800/year toward tuition at Michigan public colleges for children (under 26) of totally disabled, KIA, or POW/MIA vets' }, { name: 'MVAA Emergency Resource Assistance', desc: 'Emergency grants for utilities, vehicle/home repairs, medical bills, and other urgent needs' }], notes: 'MVAA operates the Michigan Veteran Resource Service Center (800-MICH-VET).' },
  MN: { name: 'Minnesota', deptName: 'Minnesota Department of Veterans Affairs', deptUrl: 'https://mn.gov/mdva', phone: '888-546-5838', standouts: [{ name: 'Minnesota GI Bill', desc: 'Up to $15,000 lifetime education benefit for post-9/11 MN vets, current service members, and eligible spouses/children — usable on top of federal GI Bill' }, { name: 'Disabled Veteran Homestead Market Value Exclusion', desc: 'Exclusion of $150,000 (70%+ disabled) or $300,000 (100% T&P) from homestead market value' }, { name: 'Surviving Spouse / Dependent Tuition Reimbursement', desc: 'Tuition reimbursement up to $750/semester for spouses and children of deceased or severely disabled MN vets' }], notes: 'Minnesota GI Bill stacks on the federal GI Bill — uncommon and highly used.' },
  MS: { name: 'Mississippi', deptName: 'Mississippi Veterans Affairs Board', deptUrl: 'https://www.msva.ms.gov', phone: '601-576-4850', standouts: [{ name: '100% Disabled Veteran Homestead Exemption', desc: 'Full ad-valorem property tax exemption on homestead for 100% service-connected disabled vets and unremarried surviving spouses' }, { name: 'Military retirement income exemption', desc: 'Military retired pay fully exempt from Mississippi state income tax' }, { name: 'State Veterans Homes', desc: 'Four state-run veterans homes (Collins, Jackson, Kosciusko, Oxford) at reduced rates' }], notes: 'Mississippi VA Board operates four veterans homes.' },
  MO: { name: 'Missouri', deptName: 'Missouri Veterans Commission', deptUrl: 'https://mvc.dps.mo.gov', phone: '573-751-3779', standouts: [{ name: '100% Disabled POW Property Tax Credit', desc: 'Property tax credit up to $1,100 for former POWs with 100% service-connected disability' }, { name: 'Wartime Veteran\'s Survivor Grant', desc: 'Tuition assistance up to $4,800/year at MO public colleges for children/spouses of vets KIA, MIA, or 80%+ disabled from post-9/11 combat' }, { name: 'Military retirement income exemption', desc: 'Military retired pay fully exempt from Missouri state income tax' }], notes: 'MVC operates seven state veterans homes — one of the largest networks in the country.' },
  MT: { name: 'Montana', deptName: 'Montana Veterans Affairs Division', deptUrl: 'https://dma.mt.gov/mvad', phone: '406-324-3740', standouts: [{ name: 'Montana Disabled Veteran Property Tax Assistance', desc: 'Income-based property tax reduction (50%–100%) for 100% service-connected disabled vets and unremarried surviving spouses' }, { name: 'Military retirement income exemption', desc: 'Military retired pay phased to full exemption from Montana state income tax' }, { name: 'In-state tuition for vets', desc: 'Honorably discharged vets and qualifying dependents receive immediate in-state tuition at MUS schools' }], notes: 'MVAD operates nine field service offices and three state veterans homes.' },
  NE: { name: 'Nebraska', deptName: 'Nebraska Department of Veterans\' Affairs', deptUrl: 'https://veterans.nebraska.gov', phone: '402-420-4021', standouts: [{ name: 'Homestead Exemption for Disabled Vets', desc: 'Income-based homestead exemption for 100% service-connected disabled vets (and qualifying paraplegic/specially adapted housing recipients regardless of income)' }, { name: 'Nebraska Waiver of Tuition for Dependents', desc: '100% tuition waiver at Nebraska state colleges/universities for children and spouses of certain disabled, deceased, or POW/MIA vets' }, { name: 'Military retirement income exemption', desc: 'Military retired pay fully exempt from Nebraska state income tax (effective 2022)' }], notes: 'Tuition waiver for dependents is uncapped (full tuition) at NE state schools.' },
  NV: { name: 'Nevada', deptName: 'Nevada Department of Veterans Services', deptUrl: 'https://veterans.nv.gov', phone: '775-688-1653', standouts: [{ name: 'Disabled Veteran Property Tax Exemption', desc: 'Tiered assessed-value exemption ($14,400–$28,800+, indexed) based on disability rating; can be applied to vehicle privilege tax as alternative' }, { name: 'No state income tax', desc: 'Nevada has no state income tax — military retirement, pensions, and VA benefits all untaxed' }, { name: 'Veterans Advocacy and Support Team (VAST)', desc: 'Free statewide claims and benefits assistance through state-employed Veterans Service Officers' }], notes: 'Property tax exemption is portable to vehicle governmental services tax — uniquely flexible.' },
  NH: { name: 'New Hampshire', deptName: 'New Hampshire State Office of Veterans Services', deptUrl: 'https://www.nhveterans.nh.gov', phone: '800-622-9230', standouts: [{ name: 'Standard Veterans\' Tax Credit', desc: '$50 (up to $750 by local option) credit on residential property tax for qualifying wartime veterans' }, { name: 'All Veterans\' Property Tax Credit', desc: 'Local-option credit available to all veterans (not just wartime) at municipality\'s discretion' }, { name: 'No state income tax on wages/retirement', desc: 'NH has no general income tax; interest/dividends tax is also being phased out' }], notes: 'Adopted-locally property tax credits vary by town.' },
  NJ: { name: 'New Jersey', deptName: 'New Jersey Department of Military and Veterans Affairs', deptUrl: 'https://www.nj.gov/military', phone: '888-865-8387', standouts: [{ name: '100% Disabled Veteran Property Tax Exemption', desc: 'Full property tax exemption on principal residence for 100% permanently/totally disabled vets and surviving spouses' }, { name: 'NJ Veterans Income Tax Exemption', desc: '$6,000 additional state income tax exemption for honorably discharged veterans' }, { name: 'NJ Vet2Vet Helpline', desc: 'State-run 24/7 peer-support helpline at 1-866-VETS-NJ-4' }], notes: 'NJ Vet2Vet is a notable state-run, 24/7 peer-support phone line beyond 988.' },
  NM: { name: 'New Mexico', deptName: 'New Mexico Department of Veterans Services', deptUrl: 'https://www.nmdvs.org', phone: '866-433-8387', standouts: [{ name: 'Veterans\' Property Tax Exemption', desc: '$4,000 reduction in taxable property value for honorably discharged vets; full exemption for 100% service-connected disabled vets' }, { name: 'Vietnam Veterans Scholarship', desc: 'Tuition, books, and fees at NM public schools for NM residents who served in Vietnam combat zone' }, { name: 'Military retirement income exemption', desc: 'Up to $30,000 of military retired pay exempt from NM state income tax (phased increase)' }], notes: 'NMDVS operates 16 field offices statewide.' },
  NY: { name: 'New York', deptName: 'New York State Department of Veterans\' Services', deptUrl: 'https://veterans.ny.gov', phone: '888-838-7697', standouts: [{ name: 'Alternative Veterans Property Tax Exemption', desc: '15% assessed-value reduction for wartime vets, additional 10% for combat zone, plus disability-based reduction (caps set locally)' }, { name: 'Blind Annuity Program', desc: '$1,395+/year (state-funded) annuity to legally blind NYS wartime vets and unremarried surviving spouses, regardless of service connection' }, { name: 'Veterans Tuition Awards (VTA)', desc: 'Up to full SUNY tuition for eligible combat veterans pursuing undergraduate or vocational study' }], notes: 'Blind Annuity is unique in the country.' },
  NC: { name: 'North Carolina', deptName: 'North Carolina Department of Military & Veterans Affairs', deptUrl: 'https://www.milvets.nc.gov', phone: '844-624-8387', standouts: [{ name: 'Disabled Veteran Property Tax Homestead Exclusion', desc: 'Excludes first $45,000 of appraised value of permanent residence from property taxes for 100% service-connected disabled vets and unremarried surviving spouses' }, { name: 'NC Scholarship for Children of Wartime Vets', desc: 'Tuition assistance at NC public schools for children of disabled, deceased, combat, or POW/MIA vets' }, { name: 'Military retirement income exemption', desc: 'Military retired pay (with 20+ years or medical retirement) fully exempt from NC state income tax' }], notes: 'Hotline 844-NC4-VETS connects to state benefits specialists in 12 regional offices.' },
  ND: { name: 'North Dakota', deptName: 'North Dakota Department of Veterans Affairs', deptUrl: 'https://www.veterans.nd.gov', phone: '866-634-8387', standouts: [{ name: 'Disabled Veterans Property Tax Credit', desc: 'Property tax credit on homestead for 50%+ service-connected disabled vets, scaled to disability rating' }, { name: 'Dependent Tuition Waiver', desc: 'Free tuition at ND public colleges for spouses/children of vets KIA, MIA, POW, or 100% disabled' }, { name: 'Military retirement income exemption', desc: 'Military retired pay fully exempt from ND state income tax (effective 2019)' }], notes: 'NDDVA operates the ND Veterans Home in Lisbon.' },
  OH: { name: 'Ohio', deptName: 'Ohio Department of Veterans Services', deptUrl: 'https://dvs.ohio.gov', phone: '614-644-0898', standouts: [{ name: 'Ohio Homestead Exemption for Disabled Vets', desc: 'Reduces taxable value of homestead by $50,000 for 100% service-connected disabled vets, regardless of income' }, { name: 'Ohio War Orphans Scholarship', desc: 'Tuition assistance at OH public colleges for children of deceased or severely disabled vets — up to 5 academic years' }, { name: 'Ohio National Guard Scholarship Program (ONGSP)', desc: '100% tuition at state-funded public colleges for current Ohio National Guard members' }], notes: 'Ohio also offers a "GI Promise" allowing nonresident vets/dependents to skip the residency requirement for in-state tuition.' },
  OK: { name: 'Oklahoma', deptName: 'Oklahoma Department of Veterans Affairs', deptUrl: 'https://oklahoma.gov/veterans.html', phone: '888-655-2838', standouts: [{ name: '100% Disabled Veteran Sales Tax Exemption', desc: 'Annual sales tax exemption up to $25,000 for 100% service-connected disabled vets ($1,000 for unremarried surviving spouses); requires registration in OK Veterans Registry' }, { name: 'Disabled Veteran Property Tax Exemption', desc: 'Full homestead property tax exemption for 100% service-connected disabled vets and unremarried surviving spouses' }, { name: 'Military retirement income exemption', desc: '100% of military retired pay exempt from OK state income tax (effective 2022)' }], notes: 'Sales tax exemption with annual cap is unusual and frequently used at point of sale.' },
  OR: { name: 'Oregon', deptName: 'Oregon Department of Veterans\' Affairs', deptUrl: 'https://www.oregon.gov/odva', phone: '800-692-9666', standouts: [{ name: 'ODVA Home Loan Program', desc: 'State-run direct home loan program (since 1945) with competitive rates and no PMI; over $10B lent to Oregon vets' }, { name: 'Disabled Veteran Property Tax Exemption', desc: 'Reduces assessed value of primary residence for 40%+ disabled vets (~$30,000+ exemption, indexed annually)' }, { name: 'Oregon Veteran Educational Aid', desc: 'Up to $150/month (full-time) for up to 36 months for vets attending Oregon schools who used <12 months of federal GI Bill' }], notes: 'Oregon and California are the only two states still operating their own direct VA-style home loan programs.' },
  PA: { name: 'Pennsylvania', deptName: 'Pennsylvania Department of Military and Veterans Affairs', deptUrl: 'https://www.pa.gov/agencies/dmva', phone: '800-547-2838', standouts: [{ name: 'Disabled Veterans\' Real Estate Tax Exemption', desc: 'Full property tax exemption on principal residence for 100% disabled (or paraplegic, blind, or loss of two limbs) wartime vets meeting financial-need criteria' }, { name: 'PA Educational Gratuity Program', desc: '$500/term (up to 4 years) for children of honorably discharged vets with service-connected disabilities or KIA wartime vets' }, { name: 'Veterans\' Trust Fund Grants', desc: 'Grants for VSOs and county directors; supports homelessness, behavioral health, and emergency needs' }], notes: '5th largest veteran population; PA VETConnect resource navigation platform statewide.' },
  RI: { name: 'Rhode Island', deptName: 'Rhode Island Office of Veterans Services', deptUrl: 'https://vets.ri.gov', phone: '401-921-2119', standouts: [{ name: 'Veterans\' Property Tax Exemption', desc: 'Local-option property tax exemption for honorably discharged veterans; enhanced exemptions for disabled vets, Gold Star families, and POWs (varies by city/town)' }, { name: 'Military retirement income exemption', desc: 'Military retirement pay fully exempt from RI state income tax (effective 2023)' }, { name: 'Free tuition at CCRI/RIC/URI', desc: 'Tuition waiver at RI public colleges for children of vets KIA or MIA' }], notes: 'RI Veterans Home in Bristol — recently rebuilt.' },
  SC: { name: 'South Carolina', deptName: 'South Carolina Department of Veterans\' Affairs', deptUrl: 'https://scdva.sc.gov', phone: '803-734-0200', standouts: [{ name: 'Total Disability Property Tax Exemption', desc: 'Full property tax exemption on home (up to 5 acres) and up to 2 vehicles for total/permanent service-connected disabled vets; retroactive up to 2 years' }, { name: 'Military retirement income exemption', desc: '100% of military retired pay exempt from SC state income tax with no earned-income cap (effective 2022)' }, { name: 'Free Tuition for Children of Wartime Vets', desc: 'Tuition exemption at SC public colleges for children of certain disabled or KIA wartime vets' }], notes: 'SCDVA elevated to cabinet-level state agency in 2019.' },
  SD: { name: 'South Dakota', deptName: 'South Dakota Department of Veterans Affairs', deptUrl: 'https://vetaffairs.sd.gov', phone: '605-773-3269', standouts: [{ name: 'Property Tax Exemption for Disabled Vets', desc: 'Up to $200,000 of full and true value of dwelling exempt for 100% permanently/totally service-connected disabled vets and unremarried surviving spouses' }, { name: 'Free tuition for dependents', desc: 'Free tuition at state-supported universities and technical colleges for spouses and dependents of qualifying vets' }, { name: 'No state income tax', desc: 'South Dakota has no state income tax — all retirement and VA pay untaxed' }], notes: 'SDDVA operates the SD Veterans Home in Hot Springs.' },
  TN: { name: 'Tennessee', deptName: 'Tennessee Department of Veterans Services', deptUrl: 'https://www.tn.gov/veteran', phone: '615-741-2931', standouts: [{ name: 'Property Tax Relief for Disabled Vets', desc: 'Property tax relief on first $175,000 of market value for 100% service-connected disabled (or P&T) vets and unremarried surviving spouses' }, { name: 'No state income tax on wages', desc: 'Tennessee has no general state income tax — military retirement and VA benefits effectively untaxed' }, { name: 'Helping Heroes Grant', desc: 'Up to $1,000/semester at TN public schools for vets and certain reservists who served on active duty since 9/11' }], notes: 'TDVS operates four state veterans homes and Veterans Cemeteries.' },
  TX: { name: 'Texas', deptName: 'Texas Veterans Commission', deptUrl: 'https://www.tvc.texas.gov', phone: '800-252-8387', standouts: [{ name: 'Hazlewood Act', desc: 'Up to 150 credit hours of tuition and most fees waived at TX public colleges/universities; "Legacy" provision allows transfer of unused hours to a child' }, { name: '100% Disabled Veteran Homestead Exemption', desc: 'Full property tax exemption on residence homestead for 100% service-connected disabled vets and qualifying surviving spouses (regardless of home value)' }, { name: 'Veterans Land Board (VLB) Loan Programs', desc: 'Below-market-rate state loans for land, home purchases, and home improvements administered by the Texas General Land Office' }], notes: 'Hazlewood + Legacy is one of the most generous education benefits in the nation.' },
  UT: { name: 'Utah', deptName: 'Utah Department of Veterans and Military Affairs', deptUrl: 'https://veterans.utah.gov', phone: '801-326-2372', standouts: [{ name: 'Veterans Property Tax Abatement', desc: 'Tax abatement on principal residence/personal property scaled to disability rating, up to $479,504+ of taxable value (indexed) for 100% disabled vets' }, { name: 'Scott B. Lundell Military Survivors Scholarship', desc: 'Full tuition waiver at UT public schools for surviving dependents of service members who died in line of duty post-9/11' }, { name: 'Military retirement income exemption', desc: 'Military retired pay fully exempt from Utah state income tax (effective 2021)' }], notes: 'UDVMA operates four state veterans homes.' },
  VT: { name: 'Vermont', deptName: 'Vermont Office of Veterans Affairs', deptUrl: 'https://veterans.vermont.gov', phone: '888-666-9844', standouts: [{ name: 'Veterans Property Tax Exemption', desc: '$10,000 (local option up to $40,000) of appraised value exempt for wartime vets receiving VA disability/pension or 50%+ disabled' }, { name: 'Vermont Veteran Assistance Fund', desc: 'One-time emergency grants up to $500 for low-income Vermont vets in financial crisis (housing, utilities)' }, { name: 'Military retirement income exemption', desc: 'Up to $10,000 of military retired pay exempt from VT state income tax (income-tested)' }], notes: 'OVA operates Vermont Veterans\' Home in Bennington.' },
  VA: { name: 'Virginia', deptName: 'Virginia Department of Veterans Services', deptUrl: 'https://www.dvs.virginia.gov', phone: '804-786-0286', standouts: [{ name: '100% Disabled Veteran Real Estate Tax Exemption', desc: 'Full real estate tax exemption on principal residence for 100% permanent/total service-connected disabled vets and surviving spouses' }, { name: 'Virginia Military Survivors and Dependents Education Program', desc: 'Tuition and mandatory fee waiver (up to 8 semesters) at VA public colleges/universities for spouses/children of vets 90%+ disabled, KIA, MIA, or POW' }, { name: 'Military retirement income subtraction', desc: 'Up to $40,000 (phased to full) of military retired pay subtractable from VA income tax for vets 55+' }], notes: 'DVS operates 38 benefit service offices and four Veterans Care Centers.' },
  WA: { name: 'Washington', deptName: 'Washington State Department of Veterans Affairs', deptUrl: 'https://www.dva.wa.gov', phone: '800-562-2308', standouts: [{ name: 'Property Tax Exemption for Disabled Vets', desc: 'Income-based property tax exemption for 80%+ service-connected disabled vets on primary residence' }, { name: 'No state income tax', desc: 'Washington has no state income tax — military retirement and VA benefits effectively untaxed' }, { name: 'Veterans Innovations Program (VIP)', desc: 'Emergency financial assistance grants for eligible WA veterans in crisis (utilities, mortgage, etc.)' }], notes: 'WDVA operates four state veterans homes.' },
  WV: { name: 'West Virginia', deptName: 'West Virginia Department of Veterans Assistance', deptUrl: 'https://veterans.wv.gov', phone: '866-445-8491', standouts: [{ name: '100% Disabled Veteran Property Tax Homestead Exemption', desc: 'Homestead exemption on first $20,000 of assessed value (stackable on senior exemption) for 100% disabled vets' }, { name: 'WV Veterans Re-Education Assistance', desc: 'Up to $500/semester for vets pursuing tuition, professional licensure tests, or training materials' }, { name: 'Military retirement income exemption', desc: 'Up to $20,000 of military retired pay exempt from WV state income tax' }], notes: 'WVDVA operates 16 service offices statewide.' },
  WI: { name: 'Wisconsin', deptName: 'Wisconsin Department of Veterans Affairs', deptUrl: 'https://dva.wi.gov', phone: '800-947-8387', standouts: [{ name: 'Wisconsin GI Bill', desc: 'Full tuition and segregated-fee remission at any UW System or WTCS school for up to 8 semesters / 128 credits — for eligible vets, spouses, and children' }, { name: 'WI Veterans & Surviving Spouses Property Tax Credit', desc: 'Refundable income tax credit equal to property taxes paid on primary residence for 100% disabled vets and unremarried surviving spouses' }, { name: 'Military retirement income exemption', desc: 'Military retired pay fully exempt from Wisconsin state income tax' }], notes: 'WDVA operates three state veterans homes.' },
  WY: { name: 'Wyoming', deptName: 'Wyoming Veterans Commission', deptUrl: 'https://www.wyomilitary.wyo.gov/veterans', phone: '800-833-5987', standouts: [{ name: 'Veterans Property Tax Exemption', desc: '$3,000 (assessed value) property tax exemption on primary residence (or vehicle license fees) for honorably discharged wartime vets and disabled vets' }, { name: 'No state income tax', desc: 'Wyoming has no state income tax — military retirement and VA benefits all untaxed' }, { name: 'Free hunting/fishing licenses for disabled vets', desc: 'Free Wyoming hunting and fishing licenses for resident veterans rated 50%+ service-connected disabled' }], notes: 'Smallest population of any state but well-resourced per-capita.' },
  DC: { name: 'District of Columbia', deptName: 'DC Mayor\'s Office of Veterans Affairs', deptUrl: 'https://communityaffairs.dc.gov/mova', phone: '202-724-5454', standouts: [{ name: 'VetsRide Program', desc: 'Free, on-demand shared-ride transportation for DC veterans for medical, employment, and housing trips' }, { name: 'DC Veteran Hiring Preference', desc: 'Hiring preference for DC government jobs for veterans and certain spouses' }, { name: 'District Veteran Service Officers', desc: 'MOVA District VSOs provide free claims assistance for federal VA benefits' }], notes: 'DC is unique in not having state-level property/income tax breaks comparable to states.' }
};
