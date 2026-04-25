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

    // Health check
    if (pathname === '/health' || pathname === '/api/health') {
      return handleHealth(env);
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
    // Also clean excerpts of leaked HTML attributes
    const allArticles = deduplicateArticles(data.articles || []).map(a => ({
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
        return `<li class="row ${a.image ? '' : 'no-image'}"><a href="/news/${escapeHtml(slug)}" class="row-content" style="display:flex;flex-direction:column;gap:var(--s-2);"><span class="tag">${escapeHtml(cat)}</span><h3 class="row-title">${escapeHtml(a.title)}</h3>${excerpt ? `<p class="row-excerpt">${escapeHtml(excerpt)}</p>` : ''}<div class="byline"><span class="byline-source">${escapeHtml(a.source || '')}</span><span class="byline-divider">·</span><span>${rel}</span></div></a>${a.image ? `<a href="/news/${escapeHtml(slug)}"><img src="${escapeHtml(a.image)}" alt="" class="row-image" loading="lazy" onerror="this.src='/placeholder.svg';this.onerror=null"></a>` : ''}</li>`;
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
    return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600', 'X-SSR': 'true' } });
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
      ${article.image ? `<figure class="story-hero"><img src="${escapeHtml(article.image)}" alt="" onerror="this.src='/placeholder.svg';this.onerror=null"></figure>` : ''}
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
    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>News | ${siteName}</title><meta name="description" content="All the latest news from ${siteName}." /><meta property="og:title" content="All News | ${siteName}" /><meta property="og:url" content="https://${domain}/news" /><link rel="canonical" href="https://${domain}/news" /><link rel="icon" type="image/svg+xml" href="/favicon.svg" /><link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin /><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Source+Serif+Pro:wght@600;700&display=swap" rel="stylesheet" />${getNewsPageStyles()}</head><body><div id="app"><header class="masthead"><div><a href="/" class="brand">${siteName}</a></div><div style="display:flex;gap:1rem"><a href="/news" class="nav-link nav-active">News</a><a href="/events" class="nav-link">Events</a><a href="/resources" class="nav-link">Resources</a></div></header><main class="main"><h1 class="page-title">All News</h1><nav class="category-nav"><a href="/news" class="category-link category-active">All</a>${catLinks}</nav><div class="news-feed">${articleListHtml || '<p class="empty">No articles yet.</p>'}</div></main><footer class="footer"><p class="footer-tagline">${siteName}</p><nav class="footer-nav"><a href="/news">All News</a><a href="/events">Events</a><a href="/resources">Resources</a></nav><p style="margin-bottom:0.5rem"><a href="https://warriorsfund.org" target="_blank" rel="noopener" style="color:var(--color-accent);font-size:0.875rem;font-weight:500">Veteran Resources | Warriors Fund</a></p><p class="footer-copyright">&copy; 2026 ${siteName} &middot; <a href="https://nexcom.media">Nexcom Media</a></p></footer></div></body></html>`;
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
          ${lead.image ? `<img class="lead-story-image" src="${escapeHtml(lead.image)}" alt="" loading="eager" onerror="this.src='/placeholder.svg';this.onerror=null">` : `<div class="lead-story-image"></div>`}
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
            ${s.image ? `<img class="card-image" src="${escapeHtml(s.image)}" alt="" loading="lazy" onerror="this.src='/placeholder.svg';this.onerror=null">` : `<div class="card-image" style="background:var(--surface-2);display:flex;align-items:center;justify-content:center;font-family:var(--font-headline);font-size:2rem;color:var(--ink-soft);">${escapeHtml(formatCat(s.category)).charAt(0)}</div>`}
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
  try {
    const data = await env.ARTICLES_KV.get('articles', { type: 'json' });
    const articles = deduplicateArticles(data?.articles || []);
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">`;
    for (const a of articles.slice(0, 50000)) {
      const slug = a.slug || generateSlug(a.title);
      const lastmod = a.publishDate ? new Date(a.publishDate).toISOString() : '';
      xml += `\n  <url><loc>${baseUrl}/news/${slug}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}<changefreq>weekly</changefreq><priority>0.8</priority>${a.image ? `<image:image><image:loc>${escapeHtml(a.image)}</image:loc><image:title>${escapeHtml(a.title || '')}</image:title></image:image>` : ''}</url>`;
    }
    xml += '\n</urlset>';
    return new Response(xml, { status: 200, headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=900' } });
  } catch (e) {
    return new Response(`<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${baseUrl}/news</loc></url></urlset>`, { status: 200, headers: { 'Content-Type': 'application/xml' } });
  }
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
      ['VA pension', 'https://www.va.gov/pension/']
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
      ['Women Veterans Health', 'https://www.womenshealth.va.gov/']
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
      ['Survivor Benefits', 'https://www.benefits.va.gov/persona/dependent-survivor.asp'],
      ['Blue Star Families', 'https://www.bluestarfam.org/'],
      ['Elizabeth Dole Foundation', 'https://www.elizabethdolefoundation.org/']
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
          <a href="/resources"${isActive('resources')}>Resources</a>
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
    <a href="/resources">Resources</a>
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
            <li><a href="/resources">Resources</a></li>
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
      return `<li class="row ${s.image ? '' : 'no-image'}"><a href="/news/${escapeHtml(slug)}" class="row-content" style="display:flex;flex-direction:column;gap:var(--s-2);"><span class="tag">${escapeHtml(meta.title)}</span><h3 class="row-title">${escapeHtml(s.title)}</h3>${excerpt ? `<p class="row-excerpt">${escapeHtml(excerpt)}</p>` : ''}<div class="byline"><span class="byline-source">${escapeHtml(s.source || '')}</span><span class="byline-divider">·</span><span>${formatRelTime(s.publishDate)}</span></div></a>${s.image ? `<a href="/news/${escapeHtml(slug)}"><img src="${escapeHtml(s.image)}" alt="${escapeHtml(s.title || '')}" class="row-image" loading="lazy" onerror="this.src='/placeholder.svg';this.onerror=null"></a>` : ''}</li>`;
    }).join('');

    const quickLinksHtml = meta.quickLinks?.length ? `
      <div class="quick-actions">
        <h2>Quick links · ${escapeHtml(meta.title)}</h2>
        <div class="quick-grid">
          ${meta.quickLinks.map(([label, href]) => `
            <a href="${escapeHtml(href)}" target="_blank" rel="noopener" class="quick-card">
              <div class="quick-icon">→</div>
              <span class="quick-card-title">${escapeHtml(label)}</span>
            </a>`).join('')}
        </div>
      </div>` : '';

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
      return `<li class="row ${s.image ? '' : 'no-image'}"><a href="/news/${escapeHtml(slug)}" class="row-content" style="display:flex;flex-direction:column;gap:var(--s-2);"><span class="tag">${escapeHtml(s.category || meta.name)}</span><h3 class="row-title">${escapeHtml(s.title)}</h3>${s.excerpt ? `<p class="row-excerpt">${escapeHtml(s.excerpt.slice(0, 200))}</p>` : ''}<div class="byline"><span class="byline-source">${escapeHtml(s.source || '')}</span><span class="byline-divider">·</span><span>${formatRelTime(s.publishDate)}</span></div></a>${s.image ? `<a href="/news/${escapeHtml(slug)}"><img src="${escapeHtml(s.image)}" alt="${escapeHtml(s.title || '')}" class="row-image" loading="lazy" onerror="this.src='/placeholder.svg';this.onerror=null"></a>` : ''}</li>`;
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
