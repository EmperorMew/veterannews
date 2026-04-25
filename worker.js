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
    // Debug: read last homepage error from KV
    if (pathname === '/api/debug/homepage') {
      const e = await env.ARTICLES_KV.get('debug:homepage:lasterror');
      return new Response(e || '{"msg":"no error logged"}',
        { status: 200, headers: { 'Content-Type': 'application/json' } });
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
    if (pathname === '/feed.json') {
      return handleJsonFeed(env);
    }
    // Daily Brief permalink — citable archive of any past day's briefing
    const briefMatch = pathname.match(/^\/briefing\/(\d{4})\/(\d{2})\/(\d{2})\/?$/);
    if (briefMatch) {
      return serveDailyBrief(env, url, request, briefMatch[1], briefMatch[2], briefMatch[3]);
    }
    // Today's brief — convenience route
    if (pathname === '/briefing/today' || pathname === '/briefing') {
      const t = new Date();
      const y = t.getUTCFullYear();
      const m = String(t.getUTCMonth() + 1).padStart(2, '0');
      const d = String(t.getUTCDate()).padStart(2, '0');
      return Response.redirect(`https://${CONFIG.domain}/briefing/${y}/${m}/${d}`, 302);
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
        return serveArticleBySlug(env, url, request, ctx);
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
    if (pathname === '/sitemap-topics.xml') {
      return handleTopicsSitemap(env);
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
      return serveEventsPage(env, url, request);
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
    const topicMatch = pathname.match(/^\/topic\/([a-z0-9-]+)\/?$/);
    if (topicMatch) {
      return serveTopicPage(env, url, request, topicMatch[1]);
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
    if (pathname === '/pact-act' || pathname === '/burn-pits' || pathname === '/agent-orange') {
      return servePactActPage(env, url, request);
    }
    if (pathname === '/gi-bill' || pathname === '/post-9-11-gi-bill' || pathname === '/montgomery-gi-bill') {
      return serveGIBillPage(env, url, request);
    }
    if (pathname === '/va-disability' || pathname === '/disability-rating' || pathname === '/disability-compensation') {
      return serveDisabilityPage(env, url, request);
    }
    if (pathname === '/mental-health' || pathname === '/ptsd' || pathname === '/mst' || pathname === '/depression') {
      return serveMentalHealthPage(env, url, request);
    }
    if (pathname === '/homeless-veterans' || pathname === '/housing' || pathname === '/hud-vash' || pathname === '/ssvf') {
      return serveHomelessPage(env, url, request);
    }
    if (pathname === '/caregivers' || pathname === '/caregiver' || pathname === '/pcafc') {
      return serveCaregiversPage(env, url, request);
    }
    if (pathname === '/transition-guide' || pathname === '/separating' || pathname === '/leaving-service' || pathname === '/tap') {
      return serveTransitionGuidePage(env, url, request);
    }
    if (pathname === '/discharge-upgrade' || pathname === '/oth-upgrade' || pathname === '/character-of-discharge') {
      return serveDischargeUpgradePage(env, url, request);
    }
    if (pathname === '/tbi' || pathname === '/traumatic-brain-injury' || pathname === '/concussion') {
      return serveTBIPage(env, url, request);
    }
    if (pathname === '/women-veterans' || pathname === '/women' || pathname === '/female-veterans') {
      return serveWomenVeteransPage(env, url, request);
    }
    if (pathname === '/va-appeals' || pathname === '/appeals' || pathname === '/decision-review') {
      return serveAppealsPage(env, url, request);
    }
    if (pathname === '/va-home-loan' || pathname === '/home-loan' || pathname === '/va-loan') {
      return serveHomeLoanPage(env, url, request);
    }
    if (pathname === '/va-healthcare' || pathname === '/healthcare' || pathname === '/va-health-care') {
      return serveVAHealthcarePage(env, url, request);
    }
    if (pathname === '/veteran-jobs' || pathname === '/military-jobs' || pathname === '/employment') {
      return serveVeteranJobsPage(env, url, request);
    }
    if (pathname === '/military-spouses' || pathname === '/spouses' || pathname === '/military-spouse') {
      return serveSpousesPage(env, url, request);
    }
    if (pathname === '/va-pension' || pathname === '/pension' || pathname === '/aid-and-attendance' || pathname === '/aid-attendance') {
      return serveVAPensionPage(env, url, request);
    }
    if (pathname === '/military-discounts' || pathname === '/veteran-discounts' || pathname === '/discounts') {
      return serveDiscountsPage(env, url, request);
    }
    if (pathname === '/guides' || pathname === '/all-guides' || pathname === '/help-index') {
      return serveGuidesHubPage(env, url, request);
    }
    if (pathname === '/tricare') {
      return serveTricarePage(env, url, request);
    }
    if (pathname === '/military-funeral-honors' || pathname === '/funeral-honors' || pathname === '/burial' || pathname === '/burial-benefits') {
      return serveFuneralHonorsPage(env, url, request);
    }
    if (pathname === '/military-id' || pathname === '/veteran-id' || pathname === '/vic' || pathname === '/vhic') {
      return serveMilitaryIdPage(env, url, request);
    }
    if (pathname === '/veteran-tax-benefits' || pathname === '/tax-benefits' || pathname === '/military-tax') {
      return serveTaxBenefitsPage(env, url, request);
    }
    if (pathname === '/military-retirement-pay' || pathname === '/retirement-pay' || pathname === '/military-retirement') {
      return serveRetirementPayPage(env, url, request);
    }
    if (pathname === '/tdiu' || pathname === '/individual-unemployability' || pathname === '/iu') {
      return serveTDIUPage(env, url, request);
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

  if (url.pathname === '/api/admin/search-stats') {
    return serveSearchStats(env, cors, url);
  }

  if (url.pathname === '/api/admin/indexnow') {
    return serveIndexNowPing(env, cors, url);
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

  if (url.pathname === '/api/most-read') {
    return serveMostRead(env, cors, url);
  }

  if (url.pathname === '/api/related') {
    return serveRelated(env, cors, url);
  }

  return json({ error: 'Not found' }, 404, cors);
}

async function serveMostRead(env, cors, url) {
  const window = url.searchParams.get('window') || '24h';
  const limit = Math.min(parseInt(url.searchParams.get('limit')) || 10, 50);
  if (!env.DB) return json({ articles: [], window }, 200, cors);
  try {
    const col = window === '7d' ? 'views_7d' : window === 'all' ? 'total_views' : 'views_24h';
    const rs = await env.DB.prepare(`
      SELECT a.id, a.slug, a.title, a.excerpt, a.category, a.publish_date, a.image, a.source, v.${col} AS views
      FROM article_view_totals v
      JOIN articles a ON a.slug = v.article_id
      WHERE a.link_status != 'broken' AND a.low_quality = 0 AND v.${col} > 0
      ORDER BY v.${col} DESC LIMIT ?
    `).bind(limit).all();
    const articles = (rs.results || []).map(r => ({
      id: r.id, slug: r.slug, title: r.title, excerpt: r.excerpt, category: r.category,
      publishDate: r.publish_date, image: r.image, source: r.source, views: r.views
    }));
    return json({ articles, window, limit }, 200, cors,
      { 'Cache-Control': 'public, max-age=300' });
  } catch (e) {
    return json({ error: e.message }, 500, cors);
  }
}

async function serveRelated(env, cors, url) {
  const slug = url.searchParams.get('slug');
  const limit = Math.min(parseInt(url.searchParams.get('limit')) || 5, 20);
  if (!slug) return json({ error: 'slug required' }, 400, cors);
  if (!env.DB) return json({ articles: [] }, 200, cors);

  try {
    // First try the article_relations table (computed by cron)
    let rs = await env.DB.prepare(`
      SELECT a.id, a.slug, a.title, a.excerpt, a.category, a.publish_date, a.image, a.source, r.score
      FROM article_relations r
      JOIN articles a ON a.slug = r.related_id
      WHERE r.article_id = ? AND a.link_status != 'broken' AND a.low_quality = 0
      ORDER BY r.score DESC LIMIT ?
    `).bind(slug, limit).all();

    let articles = rs.results || [];

    // Fallback: pull other articles in the same category
    if (articles.length < limit) {
      const seedRs = await env.DB.prepare(
        'SELECT category FROM articles WHERE slug = ? LIMIT 1'
      ).bind(slug).first();
      if (seedRs?.category) {
        const fallback = await env.DB.prepare(`
          SELECT id, slug, title, excerpt, category, publish_date, image, source
          FROM articles
          WHERE slug != ? AND category = ? AND link_status != 'broken' AND low_quality = 0
          ORDER BY publish_date DESC LIMIT ?
        `).bind(slug, seedRs.category, limit).all();
        const have = new Set(articles.map(a => a.slug));
        for (const a of (fallback.results || [])) {
          if (have.has(a.slug)) continue;
          articles.push({ ...a, score: 0 });
          if (articles.length >= limit) break;
        }
      }
    }

    return json({
      articles: articles.map(r => ({
        id: r.id, slug: r.slug, title: r.title, excerpt: r.excerpt,
        category: r.category, publishDate: r.publish_date,
        image: r.image, source: r.source, score: r.score
      }))
    }, 200, cors, { 'Cache-Control': 'public, max-age=600' });
  } catch (e) {
    return json({ error: e.message }, 500, cors);
  }
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

function computeBriefing(articles, max = 8) {
  if (!articles.length) return [];

  // Sort by date (newest first), then by qualityScore as a tiebreaker
  const sorted = [...articles].sort((a, b) => {
    const dateA = new Date(a.publishDate || a.pubDate || 0);
    const dateB = new Date(b.publishDate || b.pubDate || 0);
    if (dateB - dateA !== 0) return dateB - dateA;
    return (b.qualityScore || 0) - (a.qualityScore || 0);
  });

  // Two-pass: first pass enforces category diversity (max 2 per category) so
  // the briefing rail isn't dominated by one section. Second pass fills any
  // remaining slots from newest-first.
  const stories = [];
  const seen = new Set();
  const catCount = new Map();

  for (const article of sorted) {
    if (stories.length >= max) break;
    const key = article.id || article.slug || article.title;
    if (seen.has(key)) continue;
    const cat = (article.category || 'news').toLowerCase();
    if ((catCount.get(cat) || 0) >= 2) continue;
    stories.push(article);
    seen.add(key);
    catCount.set(cat, (catCount.get(cat) || 0) + 1);
  }
  // Fill any remaining slots ignoring category cap
  for (const article of sorted) {
    if (stories.length >= max) break;
    const key = article.id || article.slug || article.title;
    if (seen.has(key)) continue;
    stories.push(article);
    seen.add(key);
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
async function trackArticleView(env, slug) {
  if (!env.DB || !slug) return;
  try {
    await env.DB.prepare(`
      INSERT INTO article_view_totals (article_id, total_views, views_24h, views_7d, last_viewed)
      VALUES (?, 1, 1, 1, datetime('now'))
      ON CONFLICT(article_id) DO UPDATE SET
        total_views = total_views + 1,
        views_24h = views_24h + 1,
        views_7d = views_7d + 1,
        last_viewed = datetime('now')
    `).bind(slug).run();
  } catch {}
}

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
  const baseUrl = `https://${CONFIG.publication.domain}`;
  console.log('[serveNewsPage] entered, url=', url.toString());
  try {
    const data = await env.ARTICLES_KV.get('articles', { type: 'json' });
    console.log('[serveNewsPage] kv loaded', !!data, data?.articles?.length);
    const allArticles = deduplicateArticles(data?.articles || []);
    const PAGE_SIZE = 20;
    const pageParam = parseInt(url.searchParams.get('page') || '1');
    const page = Math.max(1, isNaN(pageParam) ? 1 : pageParam);
    const offset = (page - 1) * PAGE_SIZE;
    const articles = allArticles.slice(offset, offset + PAGE_SIZE);
    const totalPages = Math.max(1, Math.ceil(allArticles.length / PAGE_SIZE));

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
      // Use a function-form replacement so $-characters in titles don't get
      // interpreted as match-group references.
      html = html.replace(/<li class="loading">Loading news…<\/li>/, () => listHtml);
      html = html.replace(/<li class="loading">Loading news\.\.\.<\/li>/, () => listHtml);
    }

    // ItemList schema + rel=prev/next pagination links
    const canonicalUrl = page === 1 ? `${baseUrl}/news` : `${baseUrl}/news?page=${page}`;
    const prevUrl = page > 1 ? (page === 2 ? `${baseUrl}/news` : `${baseUrl}/news?page=${page - 1}`) : null;
    const nextUrl = page < totalPages ? `${baseUrl}/news?page=${page + 1}` : null;
    const itemListLd = {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: page === 1 ? 'Latest Veteran News' : `Veteran News — Page ${page}`,
      url: canonicalUrl,
      numberOfItems: articles.length,
      itemListElement: articles.slice(0, 20).map((a, i) => ({
        '@type': 'ListItem',
        position: offset + i + 1,
        url: `${baseUrl}/news/${a.slug || generateSlug(a.title)}`,
        name: a.title || ''
      }))
    };
    const headBits = [];
    if (page > 1) {
      headBits.push(`<link rel="canonical" href="${canonicalUrl}">`);
      headBits.push(`<meta name="robots" content="noindex, follow">`);
    }
    if (prevUrl) headBits.push(`<link rel="prev" href="${prevUrl}">`);
    if (nextUrl) headBits.push(`<link rel="next" href="${nextUrl}">`);
    headBits.push(`<script type="application/ld+json">${JSON.stringify(itemListLd)}</script>`);
    if (page > 1) {
      // Drop the static canonical (template hardcodes /news)
      html = html.replace(/<link rel="canonical" href="[^"]*"\s*\/?>/, '');
    }
    const injection = headBits.join('\n  ');
    html = html.replace('</head>', () => `  ${injection}\n</head>`);

    return addSecurityHeaders(new Response(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300', 'X-SSR': 'news' }
    }));
  } catch (error) {
    console.error('serveNewsPage error:', error?.message);
    const newsRequest = new Request(new URL('/news.html', url.origin), request);
    return env.ASSETS.fetch(newsRequest);
  }
}

async function serveArticleBySlug(env, url, request, ctx) {
  const slug = url.pathname.replace('/news/', '').replace(/\/$/, '');
  try {
    const data = await env.ARTICLES_KV.get('articles', { type: 'json' });
    const articles = data?.articles || [];
    let article = articles.find(a => a.slug === slug);
    if (!article) article = articles.find(a => generateSlug(a.title) === slug);
    if (!article) return new Response('Article not found', { status: 404 });

    // Track view (non-blocking)
    if (ctx?.waitUntil) ctx.waitUntil(trackArticleView(env, article.slug || slug));

    // Pre-compute related articles for SSR (faster perceived load, better SEO)
    let relatedArticles = [];
    try {
      const sameCategory = articles
        .filter(a => a !== article && a.category === article.category && a.linkStatus !== 'broken' && !a.lowQuality)
        .slice(0, 6);
      relatedArticles = sameCategory.slice(0, 3);
    } catch {}
    article.__related = relatedArticles;

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

  // Build keyword tags: section + branch + extracted keywords from title
  const titleWords = (article.title || '').toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
  const stopwords = new Set(['that','this','with','from','have','will','about','into','they','them','their','these','those','what','when','where','which','while','your','said','says','says','also','more','than','some','what','being','been']);
  const keywordList = [
    articleSection.toLowerCase(),
    'veterans',
    ...(article.serviceBranch ? [article.serviceBranch.toLowerCase()] : []),
    ...titleWords.filter(w => !stopwords.has(w)).slice(0, 5)
  ];
  const articleTags = [...new Set(keywordList)].slice(0, 8);

  // Inject extra meta tags right before </head>
  const metaTags = `
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="${escapeHtml(article.title || siteName)}" />
  <meta property="article:published_time" content="${datePublished}" />
  <meta property="article:modified_time" content="${dateModified}" />
  <meta property="article:section" content="${escapeHtml(articleSection)}" />
  <meta property="article:publisher" content="https://${domain}" />
  <meta property="article:author" content="${escapeHtml(article.author || article.source || siteName)}" />
  ${articleTags.map(t => `<meta property="article:tag" content="${escapeHtml(t)}" />`).join('\n  ')}
  <meta name="news_keywords" content="${escapeHtml(articleTags.join(', '))}" />
  <meta name="keywords" content="${escapeHtml(articleTags.join(', '))}" />
  <meta name="author" content="${escapeHtml(article.author || article.source || siteName)}" />
  <meta name="twitter:label1" content="Reading time" />
  <meta name="twitter:data1" content="${Math.max(1, Math.ceil(wordCount / 230))} min read" />
  <meta name="twitter:label2" content="Section" />
  <meta name="twitter:data2" content="${escapeHtml(articleSection)}" />
  <link rel="alternate" hreflang="en-us" href="${articleUrl}" />
  <link rel="alternate" type="application/json" href="${articleUrl}.json" title="${escapeHtml(article.title || '')} (JSON)" />`;
  html = html.replace('</head>', metaTags + '\n</head>');

  // NewsArticle schema with full SEO signals + isBasedOn for source attribution
  const sourceOrigin = (() => { try { return new URL(article.sourceUrl).origin; } catch { return null; } })();
  const newsArticleLd = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    '@id': articleUrl + '#article',
    url: articleUrl,
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
    isFamilyFriendly: true,
    articleSection,
    articleBody: articleBody.slice(0, 5000),
    wordCount,
    keywords: articleTags,
    // Speakable selectors — Google Assistant + voice-search compatibility.
    // Tells voice readers which DOM regions are best for TTS playback.
    speakable: {
      '@type': 'SpeakableSpecification',
      cssSelector: ['.story-title', '.tldr p', '.story-body p']
    },
    author: article.author
      ? {
          '@type': 'Person',
          name: article.author,
          url: `https://${domain}/author/${article.author.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`,
          jobTitle: 'Journalist',
          worksFor: { '@type': 'Organization', name: article.source || siteName }
        }
      : {
          '@type': 'Organization',
          name: article.source || siteName,
          url: sourceOrigin || `https://${domain}`
        },
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
    mainEntityOfPage: { '@type': 'WebPage', '@id': articleUrl }
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
        <button class="action-btn" data-share data-share-title="${escapeHtml(article.title || '')}" data-share-url="${articleUrl}">↗ Share</button>
        <button class="action-btn" id="copy-btn" onclick="navigator.clipboard.writeText(window.location.href).then(()=>{this.textContent='✓ Copied'});setTimeout(()=>{this.textContent='📋 Copy link'},1500)">📋 Copy link</button>
        <a class="action-btn" target="_blank" rel="noopener" href="https://twitter.com/intent/tweet?text=${shareTitle}&url=${shareUrl}" aria-label="Share on X">𝕏</a>
        <a class="action-btn" target="_blank" rel="noopener" href="https://www.linkedin.com/sharing/share-offsite/?url=${shareUrl}" aria-label="Share on LinkedIn">in</a>
        <a class="action-btn" target="_blank" rel="noopener" href="https://www.facebook.com/sharer/sharer.php?u=${shareUrl}" aria-label="Share on Facebook">f</a>
        <a class="action-btn" href="mailto:?subject=${shareTitle}&body=${shareUrl}" aria-label="Share via email">✉</a>
      </div>
      ${article.image ? `<figure class="story-hero"><img src="${escapeHtml(article.image)}" alt="${escapeHtml(article.title || '')}" onerror="this.parentElement.outerHTML='<figure class=\\'story-hero\\'>${placeholderHtml(article, 'hero').replace(/'/g, '\\\'')}</figure>';this.onerror=null"></figure>` : `<figure class="story-hero">${placeholderHtml(article, 'hero')}</figure>`}
      ${article.excerpt && article.excerpt.length > 60 ? `<aside class="tldr" aria-label="Quick summary"><div class="tldr-eyebrow">Quick read</div><p>${escapeHtml(article.excerpt.slice(0, 320))}</p></aside>` : ''}
      ${needsCrisisIntercept(article) ? crisisInterceptHtml() : ''}
      <div class="story-body">
        ${formatArticleContent(article.content || article.excerpt || 'No content available.')}
      </div>
      ${article.sourceUrl ? `<div class="story-source">Originally reported by <strong>${escapeHtml(article.source || 'Source')}</strong>. <a href="${escapeHtml(article.sourceUrl)}" target="_blank" rel="noopener">Read the original article →</a></div>` : ''}
      ${relatedPillarsHtml(article)}
      ${article.__related && article.__related.length ? `
        <section class="related-articles">
          <div class="section-head" style="margin-top: var(--s-7);">
            <div>
              <div class="eyebrow">More like this</div>
              <h2 class="section-title">Related ${escapeHtml(articleSection)} stories</h2>
            </div>
            <a href="/${escapeHtml((article.category || 'news').toLowerCase())}" class="section-link">All in section</a>
          </div>
          <div class="feed-grid">
            ${article.__related.map(r => {
              const rSlug = r.slug || generateSlug(r.title);
              return `<article class="card">
                <a href="/news/${escapeHtml(rSlug)}" style="display:flex;flex-direction:column;flex:1;">
                  ${r.image ? `<img class="card-image" src="${escapeHtml(r.image)}" alt="${escapeHtml(r.title || '')}" loading="lazy" onerror="this.src='/placeholder.svg';this.onerror=null">` : `<div class="card-image" style="background:var(--surface-2);display:flex;align-items:center;justify-content:center;font-family:var(--font-headline);font-size:2rem;color:var(--ink-soft);">${escapeHtml((r.category || 'N').charAt(0).toUpperCase())}</div>`}
                  <div class="card-body">
                    <span class="tag">${escapeHtml((r.category || 'news').charAt(0).toUpperCase() + (r.category || 'news').slice(1))}</span>
                    <h3 class="card-title">${escapeHtml(r.title)}</h3>
                    ${r.excerpt ? `<p class="card-excerpt">${escapeHtml(cleanExcerpt(r.excerpt).slice(0, 140))}</p>` : ''}
                    <div class="byline">
                      ${sourceAvatar(r.source)}
                      <span class="byline-source">${escapeHtml(r.source || 'Veteran News')}</span>
                    </div>
                  </div>
                </a>
              </article>`;
            }).join('')}
          </div>
        </section>` : '<div class="related-articles" id="related-articles"></div>'}`;

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
  console.log('[serveHomepage] entered url=', url.pathname);
  try {
    let data = await env.ARTICLES_KV.get('articles', { type: 'json' });
    console.log('[serveHomepage] kv', !!data, data?.articles?.length);

    // Fallback: if KV is cold/empty, hydrate from D1 so homepage is never blank
    if ((!data?.articles?.length) && env.DB) {
      try {
        const rs = await env.DB.prepare(`
          SELECT id, slug, title, excerpt, category, author, publish_date, image,
                 source, source_slug, source_url, service_branch, priority, quality_score, word_count
          FROM articles WHERE link_status != 'broken' AND low_quality = 0
          ORDER BY publish_date DESC LIMIT 100
        `).all();
        if (rs.results?.length) {
          data = { ...(data || {}), articles: rs.results.map(r => ({
            id: r.id, slug: r.slug, title: r.title, excerpt: r.excerpt,
            category: r.category, author: r.author, publishDate: r.publish_date,
            image: r.image, source: r.source, sourceSlug: r.source_slug,
            sourceUrl: r.source_url, serviceBranch: r.service_branch,
            priority: r.priority, qualityScore: r.quality_score, wordCount: r.word_count
          })) };
          console.log('[serveHomepage] hydrated from D1', data.articles.length);
        }
      } catch (e) { console.error('[serveHomepage] D1 fallback fail', e?.message); }
    }

    const allArticles = deduplicateArticles(data?.articles || []).map(a => ({
      ...a,
      excerpt: a.excerpt ? cleanExcerpt(a.excerpt) : a.excerpt
    }));
    const events = (data?.events || []);
    const briefing = computeBriefing(allArticles).slice(0, 8);
    const briefingIds = new Set(briefing.map(s => s.id));
    const otherStories = allArticles.filter(a => !briefingIds.has(a.id)).slice(0, 9);

    let templateResponse = await env.ASSETS.fetch(new Request(new URL('/index.html', url.origin), { method: 'GET', redirect: 'follow' }));
    if ([301, 302, 307].includes(templateResponse.status)) {
      const loc = templateResponse.headers.get('Location');
      if (loc) templateResponse = await env.ASSETS.fetch(new Request(new URL(loc, url.origin), { method: 'GET' }));
    }
    let html = await templateResponse.text();

    // Inject lead story — replace ONLY the inner content of #lead-story-mount.
    // Use balanced-tag replacement so structural changes to index.html
    // don't break SSR injection (the previous regex was fragile).
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
      html = replaceElementInner(html, 'lead-story-mount', leadHtml);
    }

    // Inject briefing list (rest of briefing) — up to 7 items so the desktop
    // middle column matches lead-story height.
    const restBrf = briefing.slice(1, 8);
    if (restBrf.length) {
      const brfHtml = restBrf.map(s => {
        const slug = escapeHtml(s.slug || generateSlug(s.title));
        const thumb = s.image
          ? `<img class="briefing-item-thumb" src="${escapeHtml(s.image)}" alt="${escapeHtml(s.title || '')}" loading="lazy" onerror="this.parentElement.classList.add('no-thumb');this.remove();">`
          : '';
        return `
          <li class="briefing-item${s.image ? '' : ' no-thumb'}">
            <a href="/news/${slug}">
              <div class="briefing-item-content">
                <span class="tag">${escapeHtml(formatCat(s.category))}</span>
                <h3>${escapeHtml(s.title)}</h3>
                <div class="byline"><span class="byline-source">${escapeHtml(s.source || 'Veteran News')}</span><span class="byline-divider">·</span><span>${formatRelTime(s.publishDate || s.pubDate)}</span></div>
              </div>
              ${thumb}
            </a>
          </li>`;
      }).join('');
      html = replaceElementInner(html, 'briefing-list', brfHtml);
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
      html = replaceElementInner(html, 'story-list', storyHtml);
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
      html = replaceElementInner(html, 'events-list', evHtml);
    }

    // Inject Most Read column (top 5 by qualityScore in last 24h)
    const dayAgo = Date.now() - 24 * 3600 * 1000;
    const mostReadPool = allArticles
      .filter(a => !briefingIds.has(a.id))
      .filter(a => {
        const t = a.publishDate ? new Date(a.publishDate).getTime() : 0;
        return t >= dayAgo;
      });
    const mostReadList = (mostReadPool.length >= 7 ? mostReadPool : allArticles.filter(a => !briefingIds.has(a.id)))
      .slice()
      .sort((a, b) => (b.qualityScore || 0) - (a.qualityScore || 0))
      .slice(0, 7);
    if (mostReadList.length) {
      const mrHtml = mostReadList.map(s => `
        <li>
          <a href="/news/${escapeHtml(s.slug || generateSlug(s.title))}">${escapeHtml(s.title)}</a>
          <span class="most-read-source">${escapeHtml(s.source || 'Veteran News')} · ${formatRelTime(s.publishDate || s.pubDate)}</span>
        </li>`).join('');
      html = replaceElementInner(html, 'most-read-list', mrHtml);
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
    console.error('[serveHomepage] error:', error?.message, error?.stack);
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

    if (env.DB && q.length >= 2 && q.length <= 200) {
      try {
        await env.DB.prepare(
          'INSERT INTO search_queries (query, result_count, searched_at) VALUES (?, ?, ?)'
        ).bind(q, matches.length, new Date().toISOString()).run();
      } catch (_) {}
    }

    return json({
      query: q,
      articles: matches.slice(0, limit),
      total: matches.length
    }, 200, cors, { 'Cache-Control': 'public, max-age=60' });
  } catch (error) {
    return json({ error: 'Search failed' }, 500, cors);
  }
}

// IndexNow — instant URL submission to Bing/Yandex/Seznam/Naver.
// Manually triggerable for our pillar pages so new evergreen guides
// (e.g., /mental-health) get crawled within minutes instead of weeks.
async function serveIndexNowPing(env, cors, url) {
  const INDEXNOW_KEY = '433801bfb00e4bfea4f333be1a083e8e';
  const baseUrl = `https://${CONFIG.publication.domain}`;
  const PILLAR_URLS = [
    '/', '/news',
    '/pact-act', '/gi-bill', '/va-disability',
    '/mental-health', '/homeless-veterans', '/caregivers',
    '/transition-guide', '/discharge-upgrade', '/tbi', '/women-veterans', '/va-appeals',
    '/va-home-loan', '/va-healthcare', '/veteran-jobs', '/military-spouses',
    '/va-pension', '/military-discounts', '/guides', '/tricare', '/military-funeral-honors',
    '/military-id', '/veteran-tax-benefits', '/military-retirement-pay', '/tdiu',
    '/scam-alerts', '/claim-help', '/survivor-benefits', '/buddy-check',
    '/crisis', '/states', '/branches',
    '/sitemap.xml', '/sitemap-pages.xml', '/sitemap-articles.xml', '/sitemap-news.xml'
  ].map(p => `${baseUrl}${p}`);

  const extra = (url.searchParams.get('urls') || '').split(',').map(s => s.trim()).filter(Boolean);
  const urlList = [...new Set([...PILLAR_URLS, ...extra])];

  const body = {
    host: CONFIG.publication.domain,
    key: INDEXNOW_KEY,
    keyLocation: `${baseUrl}/${INDEXNOW_KEY}.txt`,
    urlList
  };

  const out = { submitted: urlList.length, results: {} };
  try {
    const r = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000)
    });
    out.results.indexnow = r.status;
  } catch (e) { out.results.indexnow = `err: ${e.message}`; }
  try {
    const r = await fetch(`https://www.bing.com/ping?sitemap=${encodeURIComponent(`${baseUrl}/sitemap.xml`)}`, { signal: AbortSignal.timeout(8000) });
    out.results.bing_sitemap = r.status;
  } catch (e) { out.results.bing_sitemap = `err: ${e.message}`; }
  return json(out, 200, cors);
}

async function serveSearchStats(env, cors, url) {
  if (!env.DB) return json({ error: 'No DB binding' }, 500, cors);
  const days = Math.min(parseInt(url.searchParams.get('days')) || 30, 365);
  const since = new Date(Date.now() - days * 86400000).toISOString();
  try {
    const top = await env.DB.prepare(`
      SELECT query, COUNT(*) as searches, AVG(result_count) as avg_results, MAX(searched_at) as last_seen
      FROM search_queries WHERE searched_at >= ?
      GROUP BY query ORDER BY searches DESC LIMIT 100
    `).bind(since).all();
    const gaps = await env.DB.prepare(`
      SELECT query, COUNT(*) as searches, MAX(searched_at) as last_seen
      FROM search_queries WHERE searched_at >= ? AND result_count = 0
      GROUP BY query ORDER BY searches DESC LIMIT 100
    `).bind(since).all();
    const total = await env.DB.prepare(`
      SELECT COUNT(*) as total, COUNT(DISTINCT query) as distinct_queries
      FROM search_queries WHERE searched_at >= ?
    `).bind(since).first();
    return json({
      window_days: days,
      total_searches: total?.total || 0,
      distinct_queries: total?.distinct_queries || 0,
      top: top.results || [],
      content_gaps: gaps.results || []
    }, 200, cors, { 'Cache-Control': 'private, max-age=300' });
  } catch (error) {
    return json({ error: error.message }, 500, cors);
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

/**
 * Replace the INNER content of an element identified by id="...".
 * Walks the HTML balancing matched div/section/ol/aside tags so that nested
 * structures don't break the replacement. Robust to template changes.
 *
 * Falls back to the original html if the id isn't found.
 */
function replaceElementInner(html, elementId, newInner) {
  const startRe = new RegExp(`<(div|section|ol|aside|ul|nav|main|article|figure)\\b[^>]*\\bid=["']${elementId}["'][^>]*>`, 'i');
  const m = html.match(startRe);
  if (!m) return html;
  const tagName = m[1].toLowerCase();
  const startIdx = m.index;
  const openEndIdx = startIdx + m[0].length;

  // Walk forward balancing same-tag opens/closes
  const openTagRe = new RegExp(`<${tagName}\\b[^>]*>`, 'gi');
  const closeTagRe = new RegExp(`<\\/${tagName}\\s*>`, 'gi');
  openTagRe.lastIndex = openEndIdx;
  closeTagRe.lastIndex = openEndIdx;
  let depth = 1;
  let cursor = openEndIdx;
  while (depth > 0) {
    openTagRe.lastIndex = cursor;
    closeTagRe.lastIndex = cursor;
    const nextOpen = openTagRe.exec(html);
    const nextClose = closeTagRe.exec(html);
    if (!nextClose) return html; // unbalanced — bail
    if (nextOpen && nextOpen.index < nextClose.index) {
      depth++;
      cursor = nextOpen.index + nextOpen[0].length;
    } else {
      depth--;
      cursor = nextClose.index + nextClose[0].length;
      if (depth === 0) {
        const innerStart = openEndIdx;
        const innerEnd = nextClose.index;
        return html.slice(0, innerStart) + newInner + html.slice(innerEnd);
      }
    }
  }
  return html;
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
  <sitemap><loc>${baseUrl}/sitemap-topics.xml</loc><lastmod>${now}</lastmod></sitemap>
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
    { path: '/crisis', priority: 0.95, freq: 'monthly' },
    { path: '/scam-alerts', priority: 0.85, freq: 'weekly' },
    { path: '/claim-help', priority: 0.85, freq: 'monthly' },
    { path: '/pact-act', priority: 0.85, freq: 'monthly' },
    { path: '/gi-bill', priority: 0.85, freq: 'monthly' },
    { path: '/va-disability', priority: 0.85, freq: 'monthly' },
    { path: '/mental-health', priority: 0.9, freq: 'monthly' },
    { path: '/homeless-veterans', priority: 0.9, freq: 'monthly' },
    { path: '/caregivers', priority: 0.85, freq: 'monthly' },
    { path: '/transition-guide', priority: 0.85, freq: 'monthly' },
    { path: '/discharge-upgrade', priority: 0.85, freq: 'monthly' },
    { path: '/tbi', priority: 0.85, freq: 'monthly' },
    { path: '/women-veterans', priority: 0.9, freq: 'monthly' },
    { path: '/va-appeals', priority: 0.85, freq: 'monthly' },
    { path: '/va-home-loan', priority: 0.85, freq: 'monthly' },
    { path: '/va-healthcare', priority: 0.85, freq: 'monthly' },
    { path: '/veteran-jobs', priority: 0.85, freq: 'monthly' },
    { path: '/military-spouses', priority: 0.85, freq: 'monthly' },
    { path: '/va-pension', priority: 0.85, freq: 'monthly' },
    { path: '/military-discounts', priority: 0.8, freq: 'weekly' },
    { path: '/guides', priority: 0.95, freq: 'weekly' },
    { path: '/tricare', priority: 0.85, freq: 'monthly' },
    { path: '/military-funeral-honors', priority: 0.85, freq: 'monthly' },
    { path: '/military-id', priority: 0.85, freq: 'monthly' },
    { path: '/veteran-tax-benefits', priority: 0.85, freq: 'monthly' },
    { path: '/military-retirement-pay', priority: 0.85, freq: 'monthly' },
    { path: '/tdiu', priority: 0.9, freq: 'monthly' },
    { path: '/survivor-benefits', priority: 0.8, freq: 'monthly' },
    { path: '/buddy-check', priority: 0.8, freq: 'monthly' },
    { path: '/states', priority: 0.7, freq: 'monthly' },
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
  // Single freshness timestamp used for both meta and visible "Last updated" stamp.
  const lastUpdated = new Date().toISOString();
  const lastUpdatedDisplay = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="Veteran News">
  <meta name="format-detection" content="telephone=yes">
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
  <meta property="og:updated_time" content="${lastUpdated}">
  <meta property="article:modified_time" content="${lastUpdated}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${ogImage}">
  <link rel="alternate" type="application/rss+xml" title="Veteran News" href="/rss.xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Source+Serif+Pro:wght@600;700&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/style.css">
  <script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `https://${domain}/#website`,
        url: `https://${domain}/`,
        name: 'Veteran News',
        description: 'National news for U.S. veterans, service members, and their families. A Warriors Fund initiative.',
        publisher: { '@id': `https://${domain}/#organization` },
        potentialAction: {
          '@type': 'SearchAction',
          target: { '@type': 'EntryPoint', urlTemplate: `https://${domain}/news?q={search_term_string}` },
          'query-input': 'required name=search_term_string'
        },
        inLanguage: 'en-US'
      },
      {
        '@type': 'NewsMediaOrganization',
        '@id': `https://${domain}/#organization`,
        name: 'Veteran News',
        url: `https://${domain}/`,
        logo: { '@type': 'ImageObject', url: `https://${domain}/og-image.png`, width: 1200, height: 630 },
        parentOrganization: { '@type': 'Organization', name: 'Warriors Fund', url: 'https://www.warriorsfund.org/' },
        diversityPolicy: `https://${domain}/editorial-standards`,
        ethicsPolicy: `https://${domain}/editorial-standards`,
        correctionsPolicy: `https://${domain}/corrections`,
        masthead: `https://${domain}/about`,
        missionCoveragePrioritiesPolicy: `https://${domain}/editorial-standards`,
        knowsAbout: ['Veterans Affairs', 'PACT Act', 'Veteran Healthcare', 'Military', 'GI Bill', 'VA Disability', 'Veteran Suicide Prevention']
      }
    ]
  })}</script>
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
  <!-- Section anchor strip — desktop-only secondary nav -->
  <nav class="section-anchor-strip" aria-label="Sections">
    <div class="container">
      <div class="section-anchor-strip-inner">
        <a href="/benefits">Benefits</a>
        <a href="/health">Health</a>
        <a href="/service">Service</a>
        <a href="/transition">Transition</a>
        <a href="/advocacy">Advocacy</a>
        <a href="/legacy">Legacy</a>
        <a href="/community">Community</a>
        <a href="/family">Family</a>
        <a href="/branches">Branches</a>
        <a href="/states">By State</a>
        <a href="/tools">Tools</a>
        <a href="/crisis" style="color:var(--crisis);">Crisis 988</a>
      </div>
    </div>
  </nav>
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
  <div class="last-updated-stamp" aria-label="Page last updated"><div class="container"><span>Updated ${lastUpdatedDisplay}</span></div></div>
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
          <h4>Guides</h4>
          <ul>
            <li><a href="/pact-act">PACT Act</a></li>
            <li><a href="/va-disability">VA Disability</a></li>
            <li><a href="/va-appeals">VA Appeals</a></li>
            <li><a href="/gi-bill">GI Bill</a></li>
            <li><a href="/va-home-loan">VA Home Loan</a></li>
            <li><a href="/va-healthcare">VA Healthcare</a></li>
            <li><a href="/guides"><strong>All 28 Guides →</strong></a></li>
          </ul>
        </div>
        <div class="footer-col">
          <h4>For Families</h4>
          <ul>
            <li><a href="/mental-health">Mental Health</a></li>
            <li><a href="/caregivers">Caregivers</a></li>
            <li><a href="/military-spouses">Military Spouses</a></li>
            <li><a href="/survivor-benefits">Survivor Benefits</a></li>
            <li><a href="/buddy-check">Buddy Check Guide</a></li>
            <li><a href="/women-veterans">Women Veterans</a></li>
          </ul>
        </div>
        <div class="footer-col">
          <h4>Get Help</h4>
          <ul>
            <li><a href="tel:988"><strong>Crisis Line: 988</strong></a></li>
            <li><a href="sms:838255">Crisis Text: 838255</a></li>
            <li><a href="/crisis">Crisis Hub</a></li>
            <li><a href="/claim-help">File a Claim</a></li>
            <li><a href="/scam-alerts">Scam Alerts</a></li>
            <li><a href="/states">By State</a></li>
          </ul>
        </div>
        <div class="footer-col">
          <h4>Site</h4>
          <ul>
            <li><a href="/news">All News</a></li>
            <li><a href="/events">Events</a></li>
            <li><a href="/resources">Find Help</a></li>
            <li><a href="/about">About</a></li>
            <li><a href="/editorial-standards">Editorial Standards</a></li>
            <li><a href="/corrections">Corrections</a></li>
            <li><a href="/press">Press</a></li>
            <li><a href="/privacy">Privacy</a></li>
            <li><a href="/terms">Terms</a></li>
            <li><a href="/rss.xml">RSS</a></li>
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
    const itemListLd = {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      url: `${baseUrl}/${section}`,
      name: `Latest in ${meta.title}`,
      numberOfItems: Math.min(rest.length + (lead ? 1 : 0), 20),
      itemListElement: [lead, ...rest].filter(Boolean).slice(0, 20).map((a, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: `${baseUrl}/news/${a.slug || generateSlug(a.title)}`,
        name: a.title
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

    const ldScript = `<script type="application/ld+json">${JSON.stringify([breadcrumbLd, collectionLd, itemListLd])}</script>`;

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

    // Granular topics (PACT Act, GI Bill, PTSD, etc.) from D1
    let granularTopics = [];
    if (env.DB) {
      try {
        const rs = await env.DB.prepare(`
          SELECT slug, name, description, article_count
          FROM topics WHERE article_count > 0
          ORDER BY article_count DESC LIMIT 24
        `).all();
        granularTopics = rs.results || [];
      } catch {}
    }
    const granularTilesHtml = granularTopics.length ? granularTopics.map(t =>
      `<a href="/topic/${escapeHtml(t.slug)}" class="topic-tile">
        <span class="topic-tile-name">${escapeHtml(t.name)}</span>
        <span class="topic-tile-count">${t.article_count} ${t.article_count === 1 ? 'story' : 'stories'}</span>
      </a>`
    ).join('') : '';

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
          <div class="section-head"><div><div class="eyebrow">By Section</div><h2 class="section-title">Coverage areas</h2></div></div>
          <div class="topics-grid">${tiles}</div>
        </section>
        ${granularTilesHtml ? `
        <section class="section">
          <div class="section-head"><div><div class="eyebrow">By Tag</div><h2 class="section-title">Hot topics</h2></div></div>
          <div class="topics-grid">${granularTilesHtml}</div>
        </section>` : ''}
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
        <div id="streak-mount" style="margin-top:var(--s-4);"></div>
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

      // Reading streak chip
      try {
        const s = JSON.parse(localStorage.getItem('vn:streak:v1') || '{}');
        const streak = s.streak || 0;
        if (streak > 1) {
          document.getElementById('streak-mount').innerHTML =
            \`<span class="streak-chip"><span class="streak-chip-fire">🔥</span> <span class="streak-chip-num">\${streak}</span> day reading streak</span>\`;
        }
      } catch {}
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

/**
 * Source avatar — initials in a brand-tinted circle. Politico-style.
 * Used on cards as a visual trust signal next to the byline.
 */
function sourceAvatar(source) {
  if (!source) return '';
  const s = source.toLowerCase();
  let cls = 'src-default';
  if (/military times|sightline/.test(s)) cls = 'src-mt';
  else if (/task.*purpose/.test(s)) cls = 'src-tp';
  else if (/war horse/.test(s)) cls = 'src-th';
  else if (/^va news|^va\b|department of veterans/.test(s)) cls = 'src-va';
  else if (/we are the mighty/.test(s)) cls = 'src-wm';
  else if (/^military\.com/.test(s)) cls = 'src-mc';
  else if (/^dav\b|disabled american/.test(s)) cls = 'src-dav';
  else if (/^vfw\b|veterans of foreign/.test(s)) cls = 'src-vfw';
  else if (/american legion/.test(s)) cls = 'src-legion';
  // Initials: take first letter of each significant word, max 2
  const initials = (source || '').replace(/^The /i, '')
    .split(/\s+/).filter(w => w.length > 1)
    .slice(0, 2)
    .map(w => w[0])
    .join('').toUpperCase() || '?';
  return `<span class="source-avatar ${cls}" aria-hidden="true">${escapeHtml(initials)}</span>`;
}

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
  let searchInsights = null;
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

  // Search insights from D1 (last 30 days)
  if (env.DB) {
    try {
      const since = new Date(Date.now() - 30 * 86400000).toISOString();
      const top = await env.DB.prepare(`
        SELECT query, COUNT(*) as searches, AVG(result_count) as avg_results
        FROM search_queries WHERE searched_at >= ?
        GROUP BY query ORDER BY searches DESC LIMIT 15
      `).bind(since).all();
      const gaps = await env.DB.prepare(`
        SELECT query, COUNT(*) as searches
        FROM search_queries WHERE searched_at >= ? AND result_count = 0
        GROUP BY query ORDER BY searches DESC LIMIT 15
      `).bind(since).all();
      const totals = await env.DB.prepare(`
        SELECT COUNT(*) as total, COUNT(DISTINCT query) as distinct_queries,
               SUM(CASE WHEN result_count = 0 THEN 1 ELSE 0 END) as zero_result_searches
        FROM search_queries WHERE searched_at >= ?
      `).bind(since).first();
      searchInsights = {
        total: totals?.total || 0,
        distinct: totals?.distinct_queries || 0,
        zeroResults: totals?.zero_result_searches || 0,
        top: top.results || [],
        gaps: gaps.results || []
      };
    } catch (e) {
      searchInsights = { error: e.message };
    }
  }

  // JSON if asked
  if (url.searchParams.get('format') === 'json') {
    return json({ ...scraperHealth, searchInsights }, 200, { 'Access-Control-Allow-Origin': '*' });
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

      ${searchInsights && !searchInsights.error ? `
      <h2 style="font-family:var(--font-headline);font-size:1.5rem;margin:var(--s-7) 0 var(--s-4);">Search insights <small style="color:var(--ink-soft);font-size:0.75rem;font-family:var(--font-mono);text-transform:uppercase;letter-spacing:0.08em;font-weight:600;">last 30 days</small></h2>
      <div class="dash-grid">
        <div class="dash-card ok">
          <div class="dash-card-label">Total searches</div>
          <div class="dash-card-value">${searchInsights.total}</div>
          <div class="dash-card-detail">${searchInsights.distinct} distinct queries</div>
        </div>
        <div class="dash-card ${searchInsights.zeroResults > searchInsights.total * 0.3 ? 'warn' : 'ok'}">
          <div class="dash-card-label">Zero-result searches</div>
          <div class="dash-card-value">${searchInsights.zeroResults}</div>
          <div class="dash-card-detail">${searchInsights.total ? Math.round(searchInsights.zeroResults / searchInsights.total * 100) : 0}% of total — content gaps</div>
        </div>
      </div>
      ${searchInsights.top.length ? `
        <h3 style="font-family:var(--font-headline);font-size:1.125rem;margin:var(--s-5) 0 var(--s-3);">Top queries</h3>
        <table style="width:100%;border-collapse:collapse;font-size:0.875rem;">
          <thead><tr style="border-bottom:1px solid var(--rule);"><th style="text-align:left;padding:0.5rem;">Query</th><th style="text-align:right;padding:0.5rem;">Searches</th><th style="text-align:right;padding:0.5rem;">Avg results</th></tr></thead>
          <tbody>${searchInsights.top.map(q => `<tr style="border-bottom:1px solid var(--rule);"><td style="padding:0.5rem;font-family:var(--font-mono);">${escapeHtml(q.query)}</td><td style="text-align:right;padding:0.5rem;">${q.searches}</td><td style="text-align:right;padding:0.5rem;color:${q.avg_results < 1 ? 'var(--crisis)' : 'var(--ink-soft)'};">${Math.round(q.avg_results || 0)}</td></tr>`).join('')}</tbody>
        </table>` : ''}
      ${searchInsights.gaps.length ? `
        <h3 style="font-family:var(--font-headline);font-size:1.125rem;margin:var(--s-5) 0 var(--s-3);">Content gaps <small style="font-weight:400;color:var(--ink-soft);">— users searched, found nothing</small></h3>
        <table style="width:100%;border-collapse:collapse;font-size:0.875rem;">
          <thead><tr style="border-bottom:1px solid var(--rule);"><th style="text-align:left;padding:0.5rem;">Query</th><th style="text-align:right;padding:0.5rem;">Times searched</th></tr></thead>
          <tbody>${searchInsights.gaps.map(q => `<tr style="border-bottom:1px solid var(--rule);"><td style="padding:0.5rem;font-family:var(--font-mono);">${escapeHtml(q.query)}</td><td style="text-align:right;padding:0.5rem;">${q.searches}</td></tr>`).join('')}</tbody>
        </table>` : ''}
      ` : ''}

      <p style="margin-top:var(--s-7);color:var(--ink-soft);font-size:0.875rem;">
        Raw JSON: <a href="/admin/health?format=json">/admin/health?format=json</a> ·
        Search stats: <a href="/api/admin/search-stats">/api/admin/search-stats</a>
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
  // CollectionPage + Organization schema for the source
  const baseUrl = `https://${CONFIG.publication.domain}`;
  const collectionLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    url: `${baseUrl}/source/${sourceSlug}`,
    name: `${sourceName} on Veteran News`,
    description: `${articles.length} stories curated from ${sourceName}.`,
    isPartOf: { '@id': `${baseUrl}/#website` },
    about: { '@type': 'Organization', name: sourceName },
    numberOfItems: articles.length,
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: articles.slice(0, 30).map((a, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: `${baseUrl}/news/${a.slug}`,
        name: a.title
      }))
    }
  };
  const breadcrumbLd = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${baseUrl}/` },
      { '@type': 'ListItem', position: 2, name: 'Sources', item: `${baseUrl}/sources` },
      { '@type': 'ListItem', position: 3, name: sourceName, item: `${baseUrl}/source/${sourceSlug}` }
    ]
  };

  return new Response(shellPage({
    title: `${sourceName} — Veteran News`,
    description: `${articles.length} stories curated from ${sourceName}.`,
    canonicalPath: `/source/${sourceSlug}`,
    navActive: '',
    contentHtml: content,
    extraHead: `<script type="application/ld+json">${JSON.stringify([collectionLd, breadcrumbLd])}</script>`
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
    worksFor: { '@type': 'NewsMediaOrganization', name: articles[0]?.source || 'Veteran News' },
    knowsAbout: ['veteran affairs', 'military news', 'VA benefits', articles[0]?.category].filter(Boolean)
  };
  const breadcrumbLd = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `https://${CONFIG.publication.domain}/` },
      { '@type': 'ListItem', position: 2, name: 'Authors', item: `https://${CONFIG.publication.domain}/sources` },
      { '@type': 'ListItem', position: 3, name: authorName, item: `https://${CONFIG.publication.domain}/author/${authorSlug}` }
    ]
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
    extraHead: `<script type="application/ld+json">${JSON.stringify([personLd, breadcrumbLd])}</script>`
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

  // FAQPage schema — every scam becomes a FAQ entry. Eligible for Google's
  // FAQ rich result on SERP. Doubles SERP real estate.
  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: scams.map(s => ({
      '@type': 'Question',
      name: `What is the ${s.name} scam targeting veterans?`,
      acceptedAnswer: {
        '@type': 'Answer',
        text: `${stripTags(s.summary)} Red flags: ${stripTags(s.flags)} What to do: ${stripTags(s.what)} Report to: ${stripTags(s.report)}`
      }
    }))
  };
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `https://${CONFIG.publication.domain}/` },
      { '@type': 'ListItem', position: 2, name: 'Find Help', item: `https://${CONFIG.publication.domain}/resources` },
      { '@type': 'ListItem', position: 3, name: 'Scam Alerts', item: `https://${CONFIG.publication.domain}/scam-alerts` }
    ]
  };

  return new Response(shellPage({
    title: 'Scam Alerts: 12 Frauds Targeting Veterans — Veteran News',
    description: 'The most common scams targeting U.S. veterans in 2026. Pension poaching, claim sharks, romance scams, fake charities, identity theft. Red flags, what to do, and where to report.',
    canonicalPath: '/scam-alerts',
    navActive: '',
    contentHtml: content,
    extraHead: `<script type="application/ld+json">${JSON.stringify([faqLd, breadcrumbLd])}</script>`
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

  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'How do I check on a veteran I\'m worried about?', acceptedAnswer: { '@type': 'Answer', text: 'Pick up the phone — don\'t text first. Call. If they don\'t answer, leave a real voicemail using their name and yours, asking them to call back today. Follow up by text 30 minutes later if no callback. If still no response, call someone close to them and ask if they\'re physically with them.' } },
      { '@type': 'Question', name: 'How do I ask a veteran if they\'re thinking about suicide?', acceptedAnswer: { '@type': 'Answer', text: 'Ask directly: "Are you thinking about killing yourself?" Research is unanimous — asking does NOT plant the idea, and it gives them permission to tell the truth. Soft language like "hurting yourself" gets soft answers.' } },
      { '@type': 'Question', name: 'What do I do if a veteran tells me they want to die?', acceptedAnswer: { '@type': 'Answer', text: 'Stay on the line. Don\'t rush, don\'t moralize, don\'t promise to fix anything. Then say: "I want you to call the Veterans Crisis Line right now. I\'ll stay with you while you do." Get them to dial 988, press 1.' } },
      { '@type': 'Question', name: 'Should I take a veteran\'s firearms?', acceptedAnswer: { '@type': 'Answer', text: 'Most suicide attempts happen within an hour of the decision. Putting time and distance between someone and a firearm during a hard period is the highest-impact intervention. Offer to hold it for the weekend. A gun safe with a code only you know is enough to get past the danger window.' } },
      { '@type': 'Question', name: 'Should I call 911 for a veteran wellness check?', acceptedAnswer: { '@type': 'Answer', text: 'Last resort. Police-on-veteran wellness checks have killed people. Call 988, press 1 first — they have protocols and can coordinate. If you must call local police, ask for the non-emergency line and request a Crisis Intervention Trained (CIT) officer.' } }
    ]
  };
  const breadcrumbLd = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `https://${CONFIG.publication.domain}/` },
      { '@type': 'ListItem', position: 2, name: 'Crisis Support', item: `https://${CONFIG.publication.domain}/crisis` },
      { '@type': 'ListItem', position: 3, name: 'Buddy Check', item: `https://${CONFIG.publication.domain}/buddy-check` }
    ]
  };

  return new Response(shellPage({
    title: 'Buddy Check Guide — Veteran News',
    description: '5-minute guide for reaching out to a veteran you\'re worried about. What to ask, what to listen for, what to do if they\'re in crisis.',
    canonicalPath: '/buddy-check',
    navActive: '',
    contentHtml: content,
    extraHead: `<script type="application/ld+json">${JSON.stringify([faqLd, breadcrumbLd])}</script>`
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

  // HowTo schema — eligible for Google's HowTo rich result on SERP
  const howToLd = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: 'How to file a VA disability claim and find what you\'re owed',
    description: 'A 2-minute walkthrough to determine your VA benefits eligibility — PACT Act, Agent Orange, Camp Lejeune, hearing loss, PTSD — and connect to a free VSO who files the claim for you.',
    totalTime: 'PT2M',
    estimatedCost: { '@type': 'MonetaryAmount', currency: 'USD', value: '0' },
    supply: [
      { '@type': 'HowToSupply', name: 'DD-214 (or other discharge document)' },
      { '@type': 'HowToSupply', name: 'List of medical conditions and treatment dates' },
      { '@type': 'HowToSupply', name: 'Service location history (especially burn-pit, Vietnam, Camp Lejeune, Gulf War)' }
    ],
    tool: [
      { '@type': 'HowToTool', name: 'A free Veterans Service Organization (VSO) — DAV, VFW, or American Legion' }
    ],
    step: [
      {
        '@type': 'HowToStep',
        position: 1,
        name: 'Confirm eligibility',
        text: 'Verify you served on active duty (or activated National Guard / Reserve) and your discharge was other than dishonorable. Honorable, General, or Under Honorable Conditions all qualify. Other-than-honorable discharges may still qualify for some benefits and are often upgradeable.',
        url: `https://${CONFIG.publication.domain}/claim-help#q1`
      },
      {
        '@type': 'HowToStep',
        position: 2,
        name: 'Identify covered service locations',
        text: 'List where and when you served. Vietnam (Agent Orange), Gulf War 1990-91, post-9/11 deployments to Iraq/Afghanistan/Syria/Horn of Africa (burn pits), Camp Lejeune 1953-1987, and atomic-veteran sites all trigger PACT Act presumptive conditions.',
        url: `https://${CONFIG.publication.domain}/claim-help#q3`
      },
      {
        '@type': 'HowToStep',
        position: 3,
        name: 'Match conditions to presumptive lists',
        text: 'PACT Act presumptive conditions include many cancers, respiratory illness, hypertension, and reproductive cancers. Agent Orange covers Type 2 diabetes, ischemic heart disease, Parkinson\'s, and several cancers. Hearing loss / tinnitus are the two most-claimed VA disabilities.',
        url: `https://${CONFIG.publication.domain}/claim-help#q4`
      },
      {
        '@type': 'HowToStep',
        position: 4,
        name: 'File for free with a VSO',
        text: 'Anyone who charges to file a VA claim is breaking federal law (38 USC §5904). DAV, VFW, and American Legion service officers file claims for free in every state. Find your local office through their websites.',
        url: 'https://www.dav.org/find-your-local-office/'
      }
    ]
  };
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `https://${CONFIG.publication.domain}/` },
      { '@type': 'ListItem', position: 2, name: 'Find Help', item: `https://${CONFIG.publication.domain}/resources` },
      { '@type': 'ListItem', position: 3, name: 'Claim Help', item: `https://${CONFIG.publication.domain}/claim-help` }
    ]
  };

  return new Response(shellPage({
    title: 'Claim Help: What VA Benefits Are You Owed? — Veteran News',
    description: 'Quick 2-minute walkthrough to surface VA benefits you may be eligible for. PACT Act, Agent Orange, Camp Lejeune, presumptive conditions, hearing loss, PTSD. Connects to free VSO claim filing.',
    canonicalPath: '/claim-help',
    navActive: '',
    contentHtml: content,
    extraHead: `<script type="application/ld+json">${JSON.stringify([howToLd, breadcrumbLd])}</script>`
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

  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'What is DIC and who qualifies?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Dependency and Indemnity Compensation (DIC) is a tax-free monthly VA payment for surviving spouses, children, or parents of a service member who died on active duty, a veteran whose death was service-connected, or a veteran rated 100% disabled for 10+ years before death (or 5 years if rated 100% from time of separation). Apply with VA Form 21P-534. A VSO like DAV, VFW, or American Legion will help file for free.'
        }
      },
      {
        '@type': 'Question',
        name: 'Does suicide disqualify families from survivor benefits?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'No. Surviving families of veterans who died by suicide qualify for the same VA benefits as any other surviving family. Suicide is not disqualifying for DIC, Survivors Pension, CHAMPVA, or burial benefits. TAPS has a dedicated Suicide Loss program for peer support from other suicide-loss families.'
        }
      },
      {
        '@type': 'Question',
        name: 'What is CHAMPVA and who is eligible?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'CHAMPVA is a healthcare program for spouses and dependents of veterans who are rated permanently and totally disabled, or who died from a service-connected condition. It covers most medically necessary care similar to TRICARE.'
        }
      },
      {
        '@type': 'Question',
        name: 'What education benefits are available for surviving spouses and children?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Two main programs: Chapter 35 / Survivors and Dependents Educational Assistance (DEA) provides up to 36 months of benefits for spouses and dependents of veterans who died from service-connected disability or are 100% disabled. The Fry Scholarship provides up to 36 months of full Post-9/11 GI Bill benefits for children and surviving spouses of service members who died in the line of duty after 9/11/2001.'
        }
      },
      {
        '@type': 'Question',
        name: 'Who should I call first after losing a veteran?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Call TAPS — Tragedy Assistance Program for Survivors — at 1-800-959-TAPS (8277). It is free, available 24/7, and they walk families through every form, benefit, and decision. They have decades of experience navigating this exact moment, including grief counseling and a national peer network.'
        }
      },
      {
        '@type': 'Question',
        name: 'Can a surviving spouse use the veteran\u2019s VA home loan benefit?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes — in many cases. Surviving spouses can use the deceased veteran\u2019s VA home loan benefit without paying the funding fee. Eligibility depends on whether the veteran died from a service-connected disability or was rated permanently and totally disabled.'
        }
      },
      {
        '@type': 'Question',
        name: 'How does the PACT Act affect survivor claims?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'If a veteran died from cancer, respiratory illness, hypertension, or other PACT Act presumptive conditions and served in a covered location, DIC is presumed service-connected — even if the veteran never had a claim approved while alive. Survivors should file regardless of prior claim history.'
        }
      }
    ]
  };
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://veterannews.org/' },
      { '@type': 'ListItem', position: 2, name: 'Survivor Benefits', item: 'https://veterannews.org/survivor-benefits' }
    ]
  };

  return new Response(shellPage({
    title: 'Survivor Benefits Navigator — Veteran News',
    description: 'For families who have lost a veteran or service member. DIC, Survivors Pension, CHAMPVA, DEA, Fry Scholarship, and where to call first.',
    canonicalPath: '/survivor-benefits',
    navActive: '',
    contentHtml: content,
    extraHead: `<script type="application/ld+json">${JSON.stringify([faqLd, breadcrumbLd])}</script>`
  }), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}

// ── PACT Act dedicated landing page ──────────────────────────────────────
async function servePactActPage(env, url, request) {
  const content = `
    <section class="page-hero">
      <div class="container-narrow">
        <div class="eyebrow">PACT Act Guide</div>
        <h1 class="page-title">The PACT Act, in plain English.</h1>
        <p class="page-lede">The largest expansion of veteran healthcare and benefits in 50 years. If you served near burn pits, in Vietnam, or were exposed to radiation — this changed what you're owed. Here's what to know.</p>
      </div>
    </section>
    <div class="container-narrow">
      <article class="story-body">
        <h2>The 60-second version</h2>
        <p>Signed in August 2022, the PACT Act expanded VA healthcare and benefits to <strong>more than 5 million veterans</strong> exposed to toxins during service. It made dozens of cancers and respiratory illnesses "presumptive" — meaning the VA presumes service connection without you having to prove it.</p>
        <p>If you served in <strong>Iraq, Afghanistan, the Gulf, Vietnam, or near burn pits anywhere</strong> — and you have one of the listed conditions — you almost certainly qualify. Filing is free. There is no statute of limitations.</p>
        <p style="font-size:1.125rem;"><a href="/claim-help" class="btn btn-primary">Check your eligibility →</a></p>

        <h2>Who's covered</h2>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li style="margin-bottom:.5em;"><strong>Post-9/11 veterans</strong> who served in Iraq, Afghanistan, Syria, Djibouti, Egypt, Jordan, Lebanon, Somalia, Uzbekistan, Yemen, or any location with open-air burn pits</li>
          <li style="margin-bottom:.5em;"><strong>Gulf War veterans</strong> (1990-1991) who served in the Southwest Asia theater</li>
          <li style="margin-bottom:.5em;"><strong>Vietnam-era veterans</strong> exposed to Agent Orange — including in Thailand, Laos, Cambodia, Guam, and Johnston Atoll (the law expanded covered locations)</li>
          <li style="margin-bottom:.5em;"><strong>Atomic veterans</strong> exposed to radiation from nuclear tests, Hiroshima/Nagasaki occupation, or radioactive material handling</li>
          <li style="margin-bottom:.5em;"><strong>Surviving family members</strong> — if your veteran died from a covered condition, DIC is presumed</li>
        </ul>

        <h2>Presumptive conditions — the big list</h2>
        <p>If you have any of these AND served in a covered location, the VA presumes service connection:</p>

        <h3>Cancers (any type, but especially)</h3>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li>Brain cancer · Glioblastoma</li>
          <li>Gastrointestinal cancer (stomach, colon, pancreatic)</li>
          <li>Kidney cancer · Bladder cancer</li>
          <li>Head and neck cancer · Throat cancer</li>
          <li>Lung cancer (any type)</li>
          <li>Lymphoma (any type) · Leukemia</li>
          <li>Melanoma</li>
          <li>Reproductive cancers</li>
        </ul>

        <h3>Respiratory illnesses</h3>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li>Asthma diagnosed after service</li>
          <li>Chronic bronchitis · COPD</li>
          <li>Chronic obstructive pulmonary disease</li>
          <li>Chronic rhinitis · Chronic sinusitis</li>
          <li>Constrictive bronchiolitis · Obliterative bronchiolitis</li>
          <li>Emphysema</li>
          <li>Granulomatous disease</li>
          <li>Interstitial lung disease (ILD)</li>
          <li>Pleuritis · Pulmonary fibrosis · Sarcoidosis</li>
        </ul>

        <h3>Other conditions</h3>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li>Hypertension (Vietnam veterans)</li>
          <li>Monoclonal gammopathy of undetermined significance (MGUS)</li>
        </ul>

        <h2>What to do, in order</h2>
        <ol style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li style="margin-bottom:.75em;"><strong>Get a free toxic exposure screening</strong> at any VA medical facility. Required by law — every enrolled vet gets one every 5 years. You don't need an appointment.</li>
          <li style="margin-bottom:.75em;"><strong>File a claim — even if you've been denied before.</strong> The PACT Act lets you re-open old claims that were denied because the condition wasn't presumptive then. The VA will reconsider.</li>
          <li style="margin-bottom:.75em;"><strong>Use a VSO. For free.</strong> DAV, VFW, American Legion — they file VA claims professionally, at no cost. <a href="https://www.va.gov/get-help-from-accredited-representative/find-rep">Find one here</a>.</li>
          <li style="margin-bottom:.75em;"><strong>Don't pay a "claim shark."</strong> Companies that charge fees for VA claims are predators. See our <a href="/scam-alerts">scam alerts page</a>.</li>
        </ol>

        <h2>If your claim was already denied</h2>
        <p>Re-file. The PACT Act explicitly invites veterans whose claims were denied for non-presumptive reasons to file again under the new presumptions. This is not a normal appeal — it's a supplemental claim under new evidence (the law itself).</p>

        <h2>If you've passed the typical filing window</h2>
        <p>There is no statute of limitations on filing for VA disability. You can file 50 years after service.</p>

        <h2>Surviving family members</h2>
        <p>If your veteran died from a PACT Act presumptive condition — even if they never filed — you may be entitled to <strong>Dependency and Indemnity Compensation (DIC)</strong>. See our <a href="/survivor-benefits">survivor benefits page</a>.</p>

        <h2>Get help</h2>
        <div class="resource-grid">
          <a href="/claim-help" class="resource-card featured">
            <h3>Claim Help Walkthrough</h3>
            <p>2-minute eligibility check that tells you which PACT Act benefits to file for.</p>
            <span class="resource-card-cta">Start walkthrough →</span>
          </a>
          <a href="https://www.va.gov/resources/the-pact-act-and-your-va-benefits/" target="_blank" rel="noopener" class="resource-card">
            <h3>VA.gov — Official PACT Act page</h3>
            <p>The full official list of conditions, locations, and forms.</p>
            <span class="resource-card-cta">va.gov/pact →</span>
          </a>
          <a href="https://www.dav.org/find-your-local-office/" target="_blank" rel="noopener" class="resource-card">
            <h3>DAV — File for free</h3>
            <p>Disabled American Veterans files PACT Act claims at no cost. National network.</p>
            <span class="resource-card-cta">Find DAV office →</span>
          </a>
          <a href="https://www.vfw.org/assistance/va-claims-separation-benefits" target="_blank" rel="noopener" class="resource-card">
            <h3>VFW — Service officers</h3>
            <p>Veterans of Foreign Wars also files claims free. Especially strong on Vietnam claims.</p>
            <span class="resource-card-cta">VFW help →</span>
          </a>
        </div>

        <p style="margin-top:var(--s-7);">
          <a href="/topic/pact-act" class="btn btn-secondary">Latest PACT Act news →</a>
        </p>
      </article>
    </div>`;

  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'What is the PACT Act?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'The PACT Act, signed in August 2022, is the largest expansion of VA healthcare and benefits in more than 50 years. It expanded eligibility to over 5 million veterans exposed to toxins from burn pits, Agent Orange, and radiation, and it added dozens of cancers and respiratory illnesses to the VA presumptive conditions list.'
        }
      },
      {
        '@type': 'Question',
        name: 'Who qualifies for PACT Act benefits?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Veterans who served in Iraq, Afghanistan, Syria, the Gulf War theater, Vietnam, Thailand, Laos, Cambodia, Guam, or any location with open-air burn pits. Atomic veterans exposed to radiation also qualify. Surviving family members of deceased veterans with presumptive conditions may qualify for DIC.'
        }
      },
      {
        '@type': 'Question',
        name: 'What conditions are covered by the PACT Act?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Most cancers (lung, brain, GI, kidney, head and neck, melanoma, lymphoma, leukemia, reproductive), respiratory illnesses (asthma, COPD, chronic bronchitis, sinusitis, pulmonary fibrosis, sarcoidosis), hypertension for Vietnam veterans, and MGUS. The full list is on VA.gov.'
        }
      },
      {
        '@type': 'Question',
        name: 'I was denied a VA claim before. Can I file again under the PACT Act?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes. The PACT Act explicitly invites veterans whose claims were denied for non-presumptive reasons to file again under the new presumptions. This is a supplemental claim, not a normal appeal — file under the law itself as new evidence.'
        }
      },
      {
        '@type': 'Question',
        name: 'Is there a deadline to file a PACT Act claim?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'No. There is no statute of limitations on filing for VA disability benefits. You can file decades after separation. However, filing sooner means benefits start sooner.'
        }
      },
      {
        '@type': 'Question',
        name: 'Should I pay a company to file my PACT Act claim?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'No. It is illegal for anyone other than an accredited VSO, agent, or attorney to charge for filing an initial VA disability claim. Companies that charge fees up front are scams. Use a free Veterans Service Organization like DAV, VFW, or American Legion instead.'
        }
      },
      {
        '@type': 'Question',
        name: 'My veteran died from a PACT Act condition. Do I qualify for benefits?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes. Surviving spouses, children, and dependent parents may be entitled to Dependency and Indemnity Compensation (DIC) — even if the veteran never filed a claim. The DIC presumption applies just like the disability presumption.'
        }
      }
    ]
  };
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `https://${CONFIG.publication.domain}/` },
      { '@type': 'ListItem', position: 2, name: 'Tools', item: `https://${CONFIG.publication.domain}/resources` },
      { '@type': 'ListItem', position: 3, name: 'PACT Act Guide', item: `https://${CONFIG.publication.domain}/pact-act` }
    ]
  };

  return new Response(shellPage({
    title: 'PACT Act Guide — Plain-English Eligibility & Conditions — Veteran News',
    description: 'The PACT Act in plain English. Who qualifies, every presumptive condition, how to file, and what to do if you were denied before. Free, no claim sharks.',
    canonicalPath: '/pact-act',
    navActive: '',
    contentHtml: content,
    extraHead: `<script type="application/ld+json">${JSON.stringify([faqLd, breadcrumbLd])}</script>`
  }), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}

// ── GI Bill landing page ──────────────────────────────────────────────────
async function serveGIBillPage(env, url, request) {
  const content = `
    <section class="page-hero">
      <div class="container-narrow">
        <div class="eyebrow">Education Benefits</div>
        <h1 class="page-title">The GI Bill, in plain English.</h1>
        <p class="page-lede">If you served, you've earned education benefits worth tens of thousands of dollars. Tuition, housing, books, certifications, even apprenticeships. Here's what's actually available — and how to use it without losing money.</p>
      </div>
    </section>
    <div class="container-narrow">
      <article class="story-body">
        <h2>Which GI Bill is yours?</h2>
        <p>There are several. The right one depends on when you served and what your goals are. Most modern veterans use one of these:</p>

        <h3>Post-9/11 GI Bill (Chapter 33)</h3>
        <p>For service after September 10, 2001. The big one. Pays:</p>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li style="margin-bottom:.5em;"><strong>100% of in-state public tuition</strong> at any public school, or up to <strong>$28,937.09</strong>/year (2025-26) at private/foreign schools</li>
          <li style="margin-bottom:.5em;"><strong>Monthly housing stipend</strong> equal to local E-5-with-dependents BAH for the school's ZIP code</li>
          <li style="margin-bottom:.5em;"><strong>Up to $1,000/year</strong> for books and supplies</li>
          <li style="margin-bottom:.5em;"><strong>Yellow Ribbon Program</strong> — covers tuition gap above the cap at participating private schools</li>
          <li style="margin-bottom:.5em;"><strong>36 months of benefits</strong>, transferable to spouse or dependents (with 6+ years of service and 4 more years of obligation)</li>
        </ul>
        <p>You earn the full benefit at 36 months of qualifying service after 9/11/2001. Reduced percentages for shorter service periods.</p>

        <h3>Montgomery GI Bill — Active Duty (MGIB-AD / Chapter 30)</h3>
        <p>For pre-2001 service members and some still on active duty. Pays a flat monthly amount — about $2,358/month (2025) full-time. Less generous than Post-9/11 for most, but doesn't run on academic schedule and works overseas.</p>

        <h3>Montgomery GI Bill — Selected Reserve (MGIB-SR / Chapter 1606)</h3>
        <p>For Reserve and National Guard members with a 6-year obligation. Pays about $466/month (2025) full-time. Often combined with state tuition assistance.</p>

        <h3>Survivors' &amp; Dependents' Educational Assistance (DEA / Chapter 35)</h3>
        <p>For spouses and children of veterans who died from a service-connected disability or are 100% disabled. Up to 36 months of benefits.</p>

        <h3>Fry Scholarship</h3>
        <p>For children and surviving spouses of service members who died in the line of duty after 9/11/2001. Provides full Post-9/11 GI Bill benefits.</p>

        <h2>What you can use it for — beyond a 4-year degree</h2>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li style="margin-bottom:.5em;"><strong>Trade and technical schools</strong> — welding, HVAC, electrical, CDL, A&amp;P</li>
          <li style="margin-bottom:.5em;"><strong>Apprenticeships and on-the-job training</strong> — earn while you learn, with monthly stipend</li>
          <li style="margin-bottom:.5em;"><strong>Certifications</strong> — IT certs (CompTIA, Cisco), project management (PMP), industry licenses</li>
          <li style="margin-bottom:.5em;"><strong>Flight training</strong> — private pilot through ATP</li>
          <li style="margin-bottom:.5em;"><strong>Entrepreneurship training</strong> — VetFran, Boots to Business</li>
          <li style="margin-bottom:.5em;"><strong>Tutoring and licensing exam fees</strong></li>
          <li style="margin-bottom:.5em;"><strong>National testing programs</strong> — SAT, GRE, LSAT, AP</li>
        </ul>

        <h2>How to apply</h2>
        <ol style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li style="margin-bottom:.75em;"><strong>Get your Certificate of Eligibility (COE).</strong> File <a href="https://www.va.gov/education/how-to-apply/" target="_blank" rel="noopener">VA Form 22-1990</a> on VA.gov. Takes about 30 days.</li>
          <li style="margin-bottom:.75em;"><strong>Pick a school approved for VA benefits.</strong> Use the <a href="https://www.va.gov/education/gi-bill-comparison-tool/" target="_blank" rel="noopener">GI Bill Comparison Tool</a> — it shows graduation rates, default rates, salary outcomes, and known complaints for every school.</li>
          <li style="margin-bottom:.75em;"><strong>Apply to the school</strong> like any other student.</li>
          <li style="margin-bottom:.75em;"><strong>Submit your COE</strong> to the school's VA certifying official (every school has one).</li>
          <li style="margin-bottom:.75em;"><strong>Track your benefits</strong> at <a href="https://www.va.gov/education/gi-bill/" target="_blank" rel="noopener">va.gov/education</a>.</li>
        </ol>

        <h2>Schools to be careful about</h2>
        <p>Predatory schools target veterans for the GI Bill money. Red flags:</p>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li style="margin-bottom:.5em;">Aggressive recruiters who keep calling, texting, or DMing</li>
          <li style="margin-bottom:.5em;">"Lock in your tuition today" pressure</li>
          <li style="margin-bottom:.5em;">High default rates (under 10% is healthy)</li>
          <li style="margin-bottom:.5em;">Job-placement claims that aren't backed up by data</li>
          <li style="margin-bottom:.5em;">Programs that aren't accredited by a recognized agency</li>
          <li style="margin-bottom:.5em;">Anything advertised primarily to veterans rather than students generally</li>
        </ul>
        <p><a href="/scam-alerts">Predatory school recruiters are #4 on our scam alerts list.</a></p>

        <h2>The 90/10 Rule (and why it matters)</h2>
        <p>Federal law requires for-profit schools to get at least 10% of revenue from sources other than federal aid. GI Bill funds were once exempt — letting some schools recruit aggressively from veterans. Closing that loophole was a major Veteran of Foreign Wars and Student Veterans of America priority. Schools relying on veteran money to game this rule are a red flag.</p>

        <h2>Transferring to family</h2>
        <p>Post-9/11 GI Bill benefits can be transferred to your spouse and/or children if you've served at least 6 years and commit to 4 more. You must initiate the transfer <strong>while still serving</strong> — you cannot transfer after separation.</p>

        <h2>Combining with other aid</h2>
        <p>You can stack the GI Bill with state veteran tuition waivers, Pell Grants, ROTC scholarships, and many private scholarships. The Yellow Ribbon Program covers gaps above the private-school cap. Use the comparison tool to model exactly what you'll pay.</p>

        <h2>If your benefits get cut off</h2>
        <p>Common reasons: school stopped certifying enrollment, you withdrew from courses, your school lost approval, or VA processing delay. Call the GI Bill hotline first: <strong>1-888-442-4551</strong>. If unresolved, contact a VSO or Student Veterans of America chapter.</p>

        <h2>Get help</h2>
        <div class="resource-grid">
          <a href="https://www.va.gov/education/gi-bill-comparison-tool/" target="_blank" rel="noopener" class="resource-card featured">
            <h3>GI Bill Comparison Tool</h3>
            <p>Compare schools for GI Bill value: tuition, housing, grad rates, salary outcomes, complaints.</p>
            <span class="resource-card-cta">va.gov →</span>
          </a>
          <a href="https://studentveterans.org/" target="_blank" rel="noopener" class="resource-card">
            <h3>Student Veterans of America</h3>
            <p>Chapters at 1,500+ schools. Peer support, advocacy, and help when benefits go sideways.</p>
            <span class="resource-card-cta">studentveterans.org →</span>
          </a>
          <a href="https://www.va.gov/education/how-to-apply/" target="_blank" rel="noopener" class="resource-card">
            <h3>Apply on VA.gov</h3>
            <p>Form 22-1990 — Certificate of Eligibility. About 30 days to process.</p>
            <span class="resource-card-cta">Apply now →</span>
          </a>
          <a href="/claim-help" class="resource-card">
            <h3>Other benefits walkthrough</h3>
            <p>Quick check for VA benefits beyond education that you may not have filed for.</p>
            <span class="resource-card-cta">/claim-help →</span>
          </a>
        </div>

        <p style="margin-top:var(--s-7);">
          <a href="/topic/gi-bill" class="btn btn-secondary">Latest GI Bill news →</a>
        </p>
      </article>
    </div>`;

  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'What is the Post-9/11 GI Bill?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'The Post-9/11 GI Bill (Chapter 33) is the most generous education benefit for veterans who served after September 10, 2001. It pays 100% of in-state public-school tuition or up to $28,937.09 a year at private schools (2025-26 rate), a monthly housing stipend at the local E-5 BAH rate, and up to $1,000 a year for books — plus 36 months of benefits that can transfer to family.'
        }
      },
      {
        '@type': 'Question',
        name: 'Can I use the GI Bill for trade schools, certifications, or apprenticeships?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes. The Post-9/11 GI Bill covers trade and technical schools (welding, HVAC, electrical, CDL, A&P), apprenticeships and on-the-job training (with monthly stipend), industry certifications (CompTIA, Cisco, PMP), flight training, entrepreneurship programs, and licensing exams. You are not limited to four-year degrees.'
        }
      },
      {
        '@type': 'Question',
        name: 'Can I transfer my GI Bill benefits to my spouse or children?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes — but only while you are still serving. You must have at least 6 years of service and commit to 4 additional years. Once you separate, you cannot transfer benefits. Surviving family members may instead use the Fry Scholarship or Chapter 35 DEA, depending on circumstances.'
        }
      },
      {
        '@type': 'Question',
        name: 'How do I apply for the GI Bill?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'File VA Form 22-1990 on VA.gov to get your Certificate of Eligibility (COE). Processing typically takes about 30 days. Then apply to a VA-approved school like any other student and submit your COE to the school\u2019s VA certifying official.'
        }
      },
      {
        '@type': 'Question',
        name: 'How can I tell if a school is a good GI Bill school?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Use the GI Bill Comparison Tool on VA.gov. It shows graduation rates, loan default rates, salary outcomes, and any complaints filed against the school. Avoid schools with aggressive veteran-targeted recruiting, high default rates, unverified job-placement claims, or accreditation only from organizations you have not heard of.'
        }
      },
      {
        '@type': 'Question',
        name: 'Can I combine the GI Bill with other financial aid?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes. The GI Bill stacks with state veteran tuition waivers, Pell Grants, ROTC scholarships, and most private scholarships. The Yellow Ribbon Program covers tuition gaps above the private-school cap at participating institutions. Use the VA comparison tool to estimate your out-of-pocket cost.'
        }
      },
      {
        '@type': 'Question',
        name: 'What if my GI Bill benefits get cut off?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Call the GI Bill hotline at 1-888-442-4551. Common causes are the school not certifying enrollment, course withdrawal, the school losing VA approval, or VA processing delays. If the issue is not resolved quickly, contact a VSO or your campus Student Veterans of America chapter.'
        }
      }
    ]
  };
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `https://${CONFIG.publication.domain}/` },
      { '@type': 'ListItem', position: 2, name: 'Tools', item: `https://${CONFIG.publication.domain}/resources` },
      { '@type': 'ListItem', position: 3, name: 'GI Bill Guide', item: `https://${CONFIG.publication.domain}/gi-bill` }
    ]
  };

  return new Response(shellPage({
    title: 'GI Bill Guide — Plain-English Education Benefits — Veteran News',
    description: 'The GI Bill in plain English. Post-9/11 vs. Montgomery, what schools and trades it covers, how to transfer to family, how to apply, and how to avoid predatory schools.',
    canonicalPath: '/gi-bill',
    navActive: '',
    contentHtml: content,
    extraHead: `<script type="application/ld+json">${JSON.stringify([faqLd, breadcrumbLd])}</script>`
  }), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}

// ── VA Disability rating landing page ────────────────────────────────────
async function serveDisabilityPage(env, url, request) {
  const content = `
    <section class="page-hero">
      <div class="container-narrow">
        <div class="eyebrow">VA Disability</div>
        <h1 class="page-title">VA disability ratings, in plain English.</h1>
        <p class="page-lede">A rating is a tax-free monthly payment. Higher rating, higher payment, more healthcare access. Most veterans qualify for something. Here's how the rating system actually works — and how to file without getting taken.</p>
      </div>
    </section>
    <div class="container-narrow">
      <article class="story-body">
        <h2>What a "rating" actually is</h2>
        <p>A VA disability rating is a percentage — 0%, 10%, 20%, all the way to 100% in 10-point steps — that represents how much a service-connected condition affects your earning capacity. The higher your combined rating, the more you receive in tax-free monthly compensation, and the more VA healthcare you get.</p>

        <h2>2025 monthly compensation rates (basic, no dependents)</h2>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;font-family:var(--font-mono);">
          <li>10% — $171.23/month</li>
          <li>20% — $338.49/month</li>
          <li>30% — $524.31/month</li>
          <li>40% — $755.28/month</li>
          <li>50% — $1,075.16/month</li>
          <li>60% — $1,361.88/month</li>
          <li>70% — $1,716.28/month</li>
          <li>80% — $1,995.01/month</li>
          <li>90% — $2,241.91/month</li>
          <li>100% — $3,737.85/month</li>
        </ul>
        <p style="font-size:0.875rem;color:var(--ink-soft);">Rates above are basic. Higher amounts apply at 30%+ if you have a dependent spouse, child, or parent. Special Monthly Compensation (SMC) is paid in addition for severe loss-of-use cases.</p>

        <h2>How "combined rating" math actually works</h2>
        <p>If you have one 50% disability and one 30% disability — your combined rating is <strong>not</strong> 80%. The VA uses what's called "VA math" or the whole-person theory.</p>
        <ol style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li style="margin-bottom:.5em;">Start with 100% efficiency.</li>
          <li style="margin-bottom:.5em;">Apply the highest disability first — 50% leaves you 50% efficient.</li>
          <li style="margin-bottom:.5em;">Apply the next disability to remaining efficiency — 30% of 50% = 15% loss.</li>
          <li style="margin-bottom:.5em;">Subtract from 100% — 100 - 50 - 15 = 35% combined.</li>
          <li style="margin-bottom:.5em;">Round to nearest 10% — your rating is <strong>40%</strong>.</li>
        </ol>
        <p>This is why high ratings are hard. Plug your disabilities into the <a href="https://www.va.gov/disability/about-disability-ratings/" target="_blank" rel="noopener">VA combined ratings calculator</a> instead of doing the math yourself.</p>

        <h2>What "service connection" means</h2>
        <p>For a condition to be rated, it must be <strong>service-connected</strong> — meaning the VA accepts that your service caused or aggravated it. There are several paths:</p>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li style="margin-bottom:.5em;"><strong>Direct</strong> — clear in-service incident or exposure (a documented injury, an MOS-related condition).</li>
          <li style="margin-bottom:.5em;"><strong>Presumptive</strong> — the law presumes connection if you served in a covered location and have a covered condition. Most PACT Act conditions are presumptive. <a href="/pact-act">See the full list</a>.</li>
          <li style="margin-bottom:.5em;"><strong>Secondary</strong> — a condition caused by another already-service-connected condition (e.g., depression caused by chronic pain).</li>
          <li style="margin-bottom:.5em;"><strong>Aggravated</strong> — pre-existing condition made worse by service.</li>
        </ul>

        <h2>How to file — for free</h2>
        <ol style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li style="margin-bottom:.75em;"><strong>Use a Veterans Service Organization (VSO).</strong> DAV, VFW, American Legion, MOAA, PVA — they file VA disability claims at no cost. Always. <a href="https://www.va.gov/get-help-from-accredited-representative/find-rep" target="_blank" rel="noopener">Find one here</a>.</li>
          <li style="margin-bottom:.75em;"><strong>Gather your medical evidence.</strong> Service records (DD-214, STRs), VA medical records, private doctor records, current diagnosis. The VSO helps with this.</li>
          <li style="margin-bottom:.75em;"><strong>File the claim</strong> on VA.gov (Form 21-526EZ). Or let the VSO do it for you.</li>
          <li style="margin-bottom:.75em;"><strong>Attend the C&amp;P exam</strong> when scheduled. Be honest, be specific about bad days, don't downplay.</li>
          <li style="margin-bottom:.75em;"><strong>Wait for the decision letter.</strong> Currently averaging about 4 months for fully developed claims.</li>
        </ol>

        <h2>The C&amp;P exam — what to know</h2>
        <p>The Compensation &amp; Pension exam is how the VA evaluates your condition. It's NOT treatment — the examiner is just collecting data for the rating decision. Tips:</p>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li style="margin-bottom:.5em;">Describe your <strong>worst day</strong>, not your average day.</li>
          <li style="margin-bottom:.5em;">Be specific about how the condition affects work, sleep, relationships.</li>
          <li style="margin-bottom:.5em;">Don't push through pain to "look strong." Honest range of motion is what gets rated.</li>
          <li style="margin-bottom:.5em;">Bring a list of symptoms and frequency.</li>
        </ul>

        <h2>If you get a low rating — appeal</h2>
        <p>About 35% of initial decisions get changed on appeal. Three options:</p>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li style="margin-bottom:.5em;"><strong>Higher-Level Review</strong> — senior reviewer looks at the same record. No new evidence.</li>
          <li style="margin-bottom:.5em;"><strong>Supplemental Claim</strong> — adds new evidence (medical record, lay statement, doctor's letter).</li>
          <li style="margin-bottom:.5em;"><strong>Board Appeal</strong> — goes to the Board of Veterans' Appeals. Slower, but most favorable on contested issues.</li>
        </ul>
        <p>VSOs handle appeals, free.</p>

        <h2>Don't pay a "claim shark"</h2>
        <p>Companies that charge percentage fees ("we'll get your rating up for 25% of your back pay") are illegal under federal law for filing initial claims. They are also the largest scam category targeting veterans. <a href="/scam-alerts">See our scam alerts page.</a></p>

        <h2>Get help</h2>
        <div class="resource-grid">
          <a href="/claim-help" class="resource-card featured">
            <h3>Claim Help Walkthrough</h3>
            <p>2-minute eligibility check that surfaces every disability program you may qualify for.</p>
            <span class="resource-card-cta">Start →</span>
          </a>
          <a href="https://www.va.gov/disability/how-to-file-claim/" target="_blank" rel="noopener" class="resource-card">
            <h3>VA.gov — File a claim</h3>
            <p>Official Form 21-526EZ. File online or get a fillable PDF.</p>
            <span class="resource-card-cta">va.gov →</span>
          </a>
          <a href="https://www.dav.org/find-your-local-office/" target="_blank" rel="noopener" class="resource-card">
            <h3>DAV — File for free</h3>
            <p>Disabled American Veterans files disability claims and appeals at no cost.</p>
            <span class="resource-card-cta">Find DAV office →</span>
          </a>
          <a href="https://www.vfw.org/assistance/va-claims-separation-benefits" target="_blank" rel="noopener" class="resource-card">
            <h3>VFW — Service officers</h3>
            <p>VFW service officers handle initial claims and appeals nationwide.</p>
            <span class="resource-card-cta">VFW help →</span>
          </a>
        </div>

        <p style="margin-top:var(--s-7);">
          <a href="/pact-act" class="btn btn-secondary">PACT Act presumptive conditions →</a>
        </p>
      </article>
    </div>`;

  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'How does the VA disability rating system work?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'The VA assigns a percentage rating from 0% to 100%, in 10-point steps, based on how much a service-connected condition affects earning capacity. Higher ratings mean higher tax-free monthly compensation and more VA healthcare access. Multiple disabilities are combined using "VA math" — the whole-person theory — which produces a lower combined rating than a simple sum.'
        }
      },
      {
        '@type': 'Question',
        name: 'How much is VA disability compensation per month in 2025?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'For 2025, basic monthly rates with no dependents are roughly: 10% $171, 20% $338, 30% $524, 40% $755, 50% $1,075, 60% $1,362, 70% $1,716, 80% $1,995, 90% $2,242, and 100% $3,738. Higher amounts apply at 30% and above if you have a dependent spouse, child, or parent. Special Monthly Compensation can be added for severe cases.'
        }
      },
      {
        '@type': 'Question',
        name: 'How do I file a VA disability claim?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'File VA Form 21-526EZ on VA.gov, or have a free Veterans Service Organization (DAV, VFW, American Legion) file it for you. Gather service records, medical records, and a current diagnosis. Attend the C&P exam when scheduled. Most fully developed claims average about 4 months for a decision.'
        }
      },
      {
        '@type': 'Question',
        name: 'What is the C&P exam and how should I approach it?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'The Compensation & Pension exam is the VA\u2019s evaluation of your service-connected condition. It is not treatment — the examiner is gathering data for the rating decision. Describe your worst day, not your average day. Be specific about how the condition affects work, sleep, and relationships. Do not push through pain or downplay symptoms.'
        }
      },
      {
        '@type': 'Question',
        name: 'What can I do if my disability rating is too low?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'You can request a Higher-Level Review (senior reviewer, no new evidence), file a Supplemental Claim with new evidence, or file a Board Appeal to the Board of Veterans\u2019 Appeals. About 35% of initial decisions are changed on appeal. VSOs handle appeals at no cost.'
        }
      },
      {
        '@type': 'Question',
        name: 'Should I pay a company to file my VA disability claim?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'No. It is illegal under federal law for unaccredited companies to charge fees for filing initial VA disability claims. "Claim shark" companies that charge a percentage of back pay are predatory and one of the most reported scam categories targeting veterans. Use a free, accredited VSO instead.'
        }
      }
    ]
  };
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `https://${CONFIG.publication.domain}/` },
      { '@type': 'ListItem', position: 2, name: 'Tools', item: `https://${CONFIG.publication.domain}/resources` },
      { '@type': 'ListItem', position: 3, name: 'VA Disability Guide', item: `https://${CONFIG.publication.domain}/va-disability` }
    ]
  };

  return new Response(shellPage({
    title: 'VA Disability Ratings — Plain-English Guide — Veteran News',
    description: 'How VA disability ratings actually work in 2025. Combined rating math, monthly rates, service connection, the C&P exam, and how to file — for free.',
    canonicalPath: '/va-disability',
    navActive: '',
    contentHtml: content,
    extraHead: `<script type="application/ld+json">${JSON.stringify([faqLd, breadcrumbLd])}</script>`
  }), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}

// ── Mental Health navigator (PTSD, MST, depression, anxiety) ─────────────
async function serveMentalHealthPage(env, url, request) {
  const content = `
    <section class="page-hero">
      <div class="container-narrow">
        <div class="eyebrow">Mental Health Navigator</div>
        <h1 class="page-title">You earned every door we're about to walk you through.</h1>
        <p class="page-lede">If you served, you have access to mental health care from day one — even before you enroll in VA healthcare, even with an OTH discharge, even if you've never filed a claim. Here's how to actually use it.</p>
      </div>
    </section>
    <div class="container-narrow">
      <article class="story-body">
        <h2>If you need someone to talk to right now</h2>
        <p style="font-size:1.125rem;"><a href="tel:988" class="btn btn-primary">Call 988 — Press 1</a> &nbsp; <a href="sms:838255" class="btn btn-secondary">Text 838255</a></p>
        <p>Veterans Crisis Line. Free, confidential, 24/7. You don't have to be in crisis to call. Many vets call just to talk it out — that's what it's for.</p>

        <h2>Vet Centers — the place most veterans don't know about</h2>
        <p>Vet Centers are not VA medical centers. They're small, community-based readjustment counseling offices. <strong>You walk in. No appointment. No paperwork up front.</strong></p>
        <p>Eligibility is broader than VA healthcare:</p>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li style="margin-bottom:.5em;">Combat veterans (any era)</li>
          <li style="margin-bottom:.5em;">Anyone who served in a war-zone or hostile-area</li>
          <li style="margin-bottom:.5em;">Sexual trauma during military service (any era, any discharge)</li>
          <li style="margin-bottom:.5em;">Drone crew members</li>
          <li style="margin-bottom:.5em;">Family members of veterans (counseling, family services)</li>
          <li style="margin-bottom:.5em;">Bereavement counseling for survivors of OEF/OIF/OND deaths</li>
        </ul>
        <p>What they offer: individual counseling, group therapy, marriage and family counseling, MST counseling, bereavement counseling, employment guidance — all free, all confidential, none of it gets shared with the VA disability claims system unless you ask.</p>
        <p><a href="https://www.va.gov/find-locations/?facilityType=vet_center" target="_blank" rel="noopener" class="btn btn-secondary">Find your Vet Center →</a></p>

        <h2>PTSD — what's actually on offer</h2>
        <p>PTSD treatment at the VA is genuinely good. Evidence-based therapies, all free if you're enrolled in VA healthcare. The big three:</p>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li style="margin-bottom:.5em;"><strong>Cognitive Processing Therapy (CPT)</strong> — 12 sessions, focused on the stuck points keeping the trauma alive. Works for combat, MST, and other trauma.</li>
          <li style="margin-bottom:.5em;"><strong>Prolonged Exposure (PE)</strong> — repeated, structured talking through the trauma to reduce its grip. About 8-15 sessions.</li>
          <li style="margin-bottom:.5em;"><strong>EMDR</strong> — eye-movement desensitization. Less talk, more processing. Some vets find this easier when words feel impossible.</li>
        </ul>
        <p>Medications: SSRIs (sertraline, paroxetine) and prazosin for nightmares. Many vets do therapy + meds together.</p>
        <p>Newer options at most VAs: Stellate Ganglion Block (SGB), TMS, ketamine for treatment-resistant depression and PTSD.</p>

        <h2>Military Sexual Trauma (MST)</h2>
        <p>If you experienced sexual assault or harassment during your service — including before basic, during deployment, after deployment, on or off duty — <strong>you qualify for free MST-related care for life.</strong> No claim, no proof, no rating required. Eligibility is universal regardless of:</p>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li>When you served · what era · what branch</li>
          <li>Length of service or discharge characterization</li>
          <li>Whether you reported it at the time</li>
          <li>Whether you have a service-connection rating</li>
        </ul>
        <p>Every VA medical center has MST-trained providers. You can request a same-gender provider. Vet Centers offer MST counseling outside the VA system.</p>
        <p><a href="https://www.mentalhealth.va.gov/msthome.asp" target="_blank" rel="noopener">VA MST resources</a> · <a href="tel:18774728477">MST helpline: 1-877-VA-MSTRP (1-877-472-8477)</a></p>

        <h2>If you have an "Other Than Honorable" (OTH) discharge</h2>
        <p>You can still get mental healthcare. The VA's "Character of Discharge" rules changed: <strong>OTH veterans are eligible for free mental health and substance use care for service-connected conditions</strong>, especially conditions tied to PTSD, MST, or TBI. Don't accept "you're not eligible" as a final answer — ask for a Character of Discharge determination.</p>

        <h2>Depression, anxiety, substance use</h2>
        <p>You don't have to be in crisis to ask for help. The VA offers:</p>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li style="margin-bottom:.5em;">Individual therapy (CBT, ACT, behavioral activation)</li>
          <li style="margin-bottom:.5em;">Group therapy</li>
          <li style="margin-bottom:.5em;">Medication management</li>
          <li style="margin-bottom:.5em;">Substance use treatment — outpatient through residential</li>
          <li style="margin-bottom:.5em;">Sleep medicine (insomnia is the most under-treated veteran condition)</li>
          <li style="margin-bottom:.5em;">Pain management — addressing chronic pain that drives depression</li>
        </ul>

        <h2>If the VA isn't working for you</h2>
        <p><strong>VA Community Care</strong> lets you see a non-VA provider, paid for by VA, when:</p>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li>The VA can't schedule you within 28 days for mental health</li>
          <li>The drive is over 60 minutes</li>
          <li>The VA recommends it</li>
        </ul>
        <p>Ask your primary care provider for a Community Care referral. If you hit resistance, escalate to the Patient Advocate at the medical center — every VA has one.</p>

        <h2>Veteran-specific therapists outside the VA</h2>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li style="margin-bottom:.5em;"><strong>Give an Hour</strong> — free mental health care from licensed providers. <a href="https://giveanhour.org/" target="_blank" rel="noopener">giveanhour.org</a></li>
          <li style="margin-bottom:.5em;"><strong>Cohen Veterans Network</strong> — confidential, free or low-cost, no VA red tape. <a href="https://www.cohenveteransnetwork.org/" target="_blank" rel="noopener">cohenveteransnetwork.org</a></li>
          <li style="margin-bottom:.5em;"><strong>Headstrong</strong> — trauma-focused, free, post-9/11 veterans. <a href="https://www.getheadstrong.org/" target="_blank" rel="noopener">getheadstrong.org</a></li>
          <li style="margin-bottom:.5em;"><strong>Stop Soldier Suicide</strong> — case management, suicide-specific. <a href="https://stopsoldiersuicide.org/" target="_blank" rel="noopener">stopsoldiersuicide.org</a></li>
          <li style="margin-bottom:.5em;"><strong>Wounded Warrior Project Talk</strong> — peer-to-peer, anytime. <a href="https://www.woundedwarriorproject.org/programs/talk" target="_blank" rel="noopener">wwp.org/talk</a></li>
        </ul>

        <h2>If you're worried about a veteran in your life</h2>
        <p>Read our <a href="/buddy-check">buddy check guide</a>. 5 minutes. The most useful thing you can do is pick up the phone today — not tomorrow.</p>

        <h2>Get help</h2>
        <div class="resource-grid">
          <a href="tel:988" class="resource-card featured">
            <h3>Veterans Crisis Line</h3>
            <p>Call 988 press 1 · Text 838255 · Chat at veteranscrisisline.net. Free, confidential, 24/7. You don't have to be in crisis to call.</p>
            <span class="resource-card-cta">Call 988 →</span>
          </a>
          <a href="https://www.va.gov/find-locations/?facilityType=vet_center" target="_blank" rel="noopener" class="resource-card">
            <h3>Vet Centers</h3>
            <p>Walk-in counseling. No appointment. Confidential. For combat veterans, MST survivors, and family.</p>
            <span class="resource-card-cta">Find one →</span>
          </a>
          <a href="https://www.va.gov/health-care/health-needs-conditions/mental-health/" target="_blank" rel="noopener" class="resource-card">
            <h3>VA Mental Health</h3>
            <p>Full directory of VA mental health programs, eligibility, and how to enroll.</p>
            <span class="resource-card-cta">va.gov →</span>
          </a>
          <a href="/buddy-check" class="resource-card">
            <h3>Worried about someone?</h3>
            <p>5-minute buddy check guide. What to ask, what to listen for, what to do.</p>
            <span class="resource-card-cta">Buddy check →</span>
          </a>
        </div>
      </article>
    </div>`;

  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'Can I get mental health care from the VA without a service-connected disability rating?', acceptedAnswer: { '@type': 'Answer', text: 'Yes. Any veteran enrolled in VA healthcare can receive mental health treatment regardless of disability rating. Combat veterans get five years of free mental health care after separation under VA Priority Group 6. Vet Centers serve combat veterans, MST survivors, and certain family members with no enrollment required.' } } ,
      { '@type': 'Question', name: 'What is a Vet Center and how is it different from the VA?', acceptedAnswer: { '@type': 'Answer', text: 'Vet Centers are small, community-based readjustment counseling offices separate from VA medical centers. You can walk in without an appointment. They serve combat veterans (any era), MST survivors (any era, any discharge), drone crews, and family members. Counseling is free and confidential, and is not shared with the VA disability claims system unless you authorize it.' } },
      { '@type': 'Question', name: 'What PTSD treatments does the VA offer?', acceptedAnswer: { '@type': 'Answer', text: 'The VA offers Cognitive Processing Therapy (CPT), Prolonged Exposure (PE), and EMDR — all evidence-based and free for enrolled veterans. Medications include SSRIs and prazosin for nightmares. Many VAs also offer Stellate Ganglion Block, TMS, and ketamine for treatment-resistant cases.' } },
      { '@type': 'Question', name: 'I experienced military sexual trauma — am I eligible for VA care?', acceptedAnswer: { '@type': 'Answer', text: 'Yes. Free MST-related care is available for life regardless of when you served, your discharge characterization, length of service, whether you reported the assault, or whether you have a disability rating. Every VA medical center has MST-trained providers, and you can request a same-gender provider. Vet Centers also offer MST counseling.' } },
      { '@type': 'Question', name: 'Can I get VA mental health care with an Other Than Honorable (OTH) discharge?', acceptedAnswer: { '@type': 'Answer', text: 'Often yes. OTH veterans are eligible for free mental health and substance use care for service-connected conditions, especially those tied to PTSD, MST, or TBI. Request a Character of Discharge determination if you are initially told you are ineligible.' } },
      { '@type': 'Question', name: 'What if I cannot get a timely VA mental health appointment?', acceptedAnswer: { '@type': 'Answer', text: 'You may qualify for VA Community Care, which lets you see a non-VA provider paid for by the VA. Triggers include the VA being unable to schedule you within 28 days, drives longer than 60 minutes, or a clinical recommendation. Ask your primary care provider for a referral; escalate to the medical center Patient Advocate if needed.' } }
    ]
  };
  const breadcrumbLd = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `https://${CONFIG.publication.domain}/` },
      { '@type': 'ListItem', position: 2, name: 'Crisis Support', item: `https://${CONFIG.publication.domain}/crisis` },
      { '@type': 'ListItem', position: 3, name: 'Mental Health', item: `https://${CONFIG.publication.domain}/mental-health` }
    ]
  };

  return new Response(shellPage({
    title: 'Veteran Mental Health Navigator — PTSD, MST, Depression Care — Veteran News',
    description: 'How to actually use VA mental health care. Vet Centers, PTSD therapies (CPT, PE, EMDR), MST care, OTH eligibility, Community Care, and free non-VA options.',
    canonicalPath: '/mental-health',
    navActive: '',
    contentHtml: content,
    extraHead: `<script type="application/ld+json">${JSON.stringify([faqLd, breadcrumbLd])}</script>`
  }), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}

// ── Homeless Veterans navigator ──────────────────────────────────────────
async function serveHomelessPage(env, url, request) {
  const content = `
    <section class="page-hero">
      <div class="container-narrow">
        <div class="eyebrow">Housing Navigator</div>
        <h1 class="page-title">If you've lost your housing, or are about to.</h1>
        <p class="page-lede">There is real help, available today, and most veterans don't know it exists. This page walks through HUD-VASH, SSVF, the National Call Center, and Vet Centers — what each one does, how to qualify, and who to call first.</p>
      </div>
    </section>
    <div class="container-narrow">
      <article class="story-body">
        <h2>Call this number first</h2>
        <p style="font-size:1.125rem;"><a href="tel:18774244357" class="btn btn-primary">National Call Center for Homeless Veterans — 1-877-4AID-VET (1-877-424-3838)</a></p>
        <p>Free. 24/7. Confidential. They route you to the right local program — emergency shelter, housing voucher, food, mental health, employment, all coordinated through one call. Don't try to navigate this alone.</p>

        <h2>The four major programs</h2>

        <h3>HUD-VASH (HUD-VA Supportive Housing)</h3>
        <p>The biggest program. A Section 8 housing voucher (paid by HUD) <strong>plus</strong> VA case management (mental health, substance use, employment).</p>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li>Pays most of your rent — you typically pay 30% of income</li>
          <li>You pick the apartment (within program rules)</li>
          <li>Includes a VA caseworker assigned to you</li>
          <li>Long-term — not a 90-day program</li>
          <li>Eligible: chronically homeless, mental illness, substance use, or other vulnerability</li>
        </ul>
        <p>Apply through your local VA Medical Center's Homeless Programs office, or call 1-877-4AID-VET.</p>

        <h3>SSVF (Supportive Services for Veteran Families)</h3>
        <p>For veterans who are <strong>at risk of homelessness</strong> or recently homeless. SSVF prevents the eviction or rapidly re-houses you.</p>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li>Emergency rental assistance</li>
          <li>Security deposit, first month's rent, utility deposits</li>
          <li>Furnishings and household goods</li>
          <li>Help with transportation, childcare, legal services</li>
          <li>Time-limited (usually up to 9 months) but flexible</li>
        </ul>
        <p>SSVF is delivered by community partner agencies, not the VA itself. Find your local provider through 1-877-4AID-VET.</p>

        <h3>Grant and Per Diem (GPD)</h3>
        <p>Transitional housing — usually 30 days to 24 months, run by community agencies. Includes meals, case management, employment services, and mental-health/substance-use treatment if needed.</p>
        <p>Right tier: you're not ready for independent housing yet, you need stability and structure to stabilize.</p>

        <h3>Health Care for Homeless Veterans (HCHV)</h3>
        <p>The on-ramp. Outreach workers go to shelters, soup kitchens, encampments, jails, and on the street. They help homeless vets connect to housing, healthcare, benefits — without you having to navigate the bureaucracy alone.</p>

        <h2>Specific situations</h2>

        <h3>"I can stay one more night, but I'm out of options after that"</h3>
        <p>Call 1-877-4AID-VET tonight. Ask specifically about SSVF — that's the prevention program. Many SSVF agencies can issue same-day or next-day rental assistance.</p>

        <h3>"I'm in my car"</h3>
        <p>You qualify for HCHV outreach right now. The VA has dedicated outreach teams. The National Call Center will connect you. <strong>Don't wait until you're "really homeless"</strong> — case workers prefer to engage early.</p>

        <h3>"I have a family, including kids"</h3>
        <p>SSVF is family-friendly and prioritizes families with children. Mention it on the call.</p>

        <h3>"I have an OTH or bad-paper discharge"</h3>
        <p>Most homeless veteran programs accept OTH discharges. The "Character of Discharge" determination happens through the VA. HCHV outreach workers walk you through it.</p>

        <h3>"I'm a Reservist or Guard, never activated"</h3>
        <p>Some programs require activation; some don't. SSVF community providers often serve all veterans. Call and ask — don't assume no.</p>

        <h2>What to bring (or get help getting)</h2>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li>DD-214 (or a copy — VSO's can pull this for you fast)</li>
          <li>Government ID</li>
          <li>Social Security card</li>
          <li>Income verification (pay stubs, benefits letter)</li>
          <li>If you have it: VA Member ID, prior VA case manager's contact</li>
        </ul>
        <p>If you don't have these, the case manager helps you replace them. Don't let missing paperwork stop you from making the call.</p>

        <h2>Mental health while housed</h2>
        <p>HUD-VASH and SSVF both connect you to ongoing VA mental health care. Many homeless veterans benefit from <a href="/mental-health">PTSD treatment, substance-use programs, or Vet Centers</a> alongside housing.</p>

        <h2>Get help</h2>
        <div class="resource-grid">
          <a href="tel:18774244357" class="resource-card featured">
            <h3>National Call Center</h3>
            <p>1-877-4AID-VET (1-877-424-3838). 24/7. Free. They route you to local programs.</p>
            <span class="resource-card-cta">Call now →</span>
          </a>
          <a href="https://www.va.gov/homeless/" target="_blank" rel="noopener" class="resource-card">
            <h3>VA Homeless Programs</h3>
            <p>Full directory of HUD-VASH, SSVF, GPD, HCHV, and how to apply.</p>
            <span class="resource-card-cta">va.gov/homeless →</span>
          </a>
          <a href="https://nchv.org/" target="_blank" rel="noopener" class="resource-card">
            <h3>National Coalition for Homeless Veterans</h3>
            <p>Searchable directory of community partners by state.</p>
            <span class="resource-card-cta">nchv.org →</span>
          </a>
          <a href="https://www.warriorsfund.org" target="_blank" rel="noopener" class="resource-card">
            <h3>Warriors Fund</h3>
            <p>Direct emergency financial assistance — rent, utilities, car repair, food. Apply online.</p>
            <span class="resource-card-cta">warriorsfund.org →</span>
          </a>
        </div>
      </article>
    </div>`;

  const faqLd = {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'Who do I call first if I am a homeless veteran?', acceptedAnswer: { '@type': 'Answer', text: 'Call the National Call Center for Homeless Veterans at 1-877-4AID-VET (1-877-424-3838). It is free, available 24/7, and routes you to the correct local programs — HUD-VASH, SSVF, transitional housing, mental health, and benefits — through a single call.' } },
      { '@type': 'Question', name: 'What is HUD-VASH?', acceptedAnswer: { '@type': 'Answer', text: 'HUD-VASH combines a Section 8 rental voucher (funded by HUD) with VA case management. You typically pay about 30% of income for rent, choose your own apartment within program rules, and get an assigned VA caseworker. It is long-term, not time-limited.' } },
      { '@type': 'Question', name: 'What is SSVF and how is it different from HUD-VASH?', acceptedAnswer: { '@type': 'Answer', text: 'SSVF (Supportive Services for Veteran Families) prevents homelessness or rapidly re-houses recently homeless veterans. It can pay back rent, security deposits, first month\u2019s rent, utility deposits, and other emergency costs. It is delivered by community partner agencies and is generally time-limited up to about 9 months. HUD-VASH, by contrast, is long-term housing for chronically homeless veterans with vulnerabilities.' } },
      { '@type': 'Question', name: 'Can I qualify for homeless veteran programs with an OTH discharge?', acceptedAnswer: { '@type': 'Answer', text: 'Most homeless veteran programs accept Other Than Honorable (OTH) discharges. The VA may need to make a Character of Discharge determination, but HCHV outreach teams help walk you through it. Do not assume you are ineligible.' } },
      { '@type': 'Question', name: 'What if I am living in my car or vehicle?', acceptedAnswer: { '@type': 'Answer', text: 'You qualify for HCHV (Health Care for Homeless Veterans) outreach right now. Outreach workers meet veterans where they are — shelters, encampments, parking lots, jails, ERs. Calling 1-877-4AID-VET connects you to local outreach.' } }
    ]
  };
  const breadcrumbLd = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `https://${CONFIG.publication.domain}/` },
      { '@type': 'ListItem', position: 2, name: 'Find Help', item: `https://${CONFIG.publication.domain}/resources` },
      { '@type': 'ListItem', position: 3, name: 'Homeless Veterans', item: `https://${CONFIG.publication.domain}/homeless-veterans` }
    ]
  };

  return new Response(shellPage({
    title: 'Homeless Veteran Navigator — HUD-VASH, SSVF, & 24/7 Help — Veteran News',
    description: 'If you are a veteran without housing or about to lose it. HUD-VASH, SSVF, transitional housing, the 24/7 National Call Center, and what to do tonight.',
    canonicalPath: '/homeless-veterans',
    navActive: '',
    contentHtml: content,
    extraHead: `<script type="application/ld+json">${JSON.stringify([faqLd, breadcrumbLd])}</script>`
  }), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}

// ── Caregivers (PCAFC) navigator ─────────────────────────────────────────
async function serveCaregiversPage(env, url, request) {
  const content = `
    <section class="page-hero">
      <div class="container-narrow">
        <div class="eyebrow">For Caregivers</div>
        <h1 class="page-title">You're carrying a lot. Here's what's actually available.</h1>
        <p class="page-lede">Caregivers of veterans are eligible for stipends, training, respite care, and direct mental-health support. PCAFC is the major program. Most caregivers don't know it exists.</p>
      </div>
    </section>
    <div class="container-narrow">
      <article class="story-body">
        <h2>The big program: PCAFC</h2>
        <p>The <strong>Program of Comprehensive Assistance for Family Caregivers (PCAFC)</strong> pays a monthly stipend to family caregivers of eligible veterans. It also provides:</p>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li>Caregiver training and skills education</li>
          <li>Mental health counseling for the caregiver</li>
          <li>Respite care (someone covers for you, up to 30 days/year)</li>
          <li>Travel benefits (mileage, lodging) for VA appointments</li>
          <li>Health insurance coverage if the caregiver doesn't have it (CHAMPVA)</li>
        </ul>

        <h3>Who's eligible (caregiver side)</h3>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li>Spouse, child, parent, step-family, in-law, or anyone living with the veteran full-time</li>
          <li>At least 18 years old</li>
        </ul>

        <h3>Who's eligible (veteran side)</h3>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li>Service-connected disability rating of <strong>70%+</strong> (combined or single)</li>
          <li>Need help with at least one activity of daily living (bathing, dressing, eating, transferring, toileting), <strong>OR</strong> need supervision/protection because of memory/judgement issues</li>
          <li>Personal care services from a caregiver are necessary for at least 6 continuous months</li>
        </ul>
        <p>Veterans of all eras qualify. Apply at <a href="https://www.va.gov/family-and-caregiver-benefits/health-and-disability/comprehensive-assistance-for-family-caregivers/" target="_blank" rel="noopener">va.gov caregiver application</a>.</p>

        <h2>The lighter program: PGCSS</h2>
        <p>The <strong>Program of General Caregiver Support Services (PGCSS)</strong> doesn't pay a stipend, but is available to caregivers of any veteran enrolled in VA healthcare. It includes:</p>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li>Caregiver Support Coordinator at every VA medical center</li>
          <li>Skills training, peer support, online resources</li>
          <li>Respite care</li>
          <li>Counseling and self-care resources</li>
          <li>VA Caregiver Support Line: 1-855-260-3274</li>
        </ul>

        <h2>Caregivers of post-9/11 veterans</h2>
        <p>Eligibility was expanded in 2020 to include all caregivers of veterans who served in any era — not just post-9/11. If you applied before 2020 and were denied, reapply.</p>

        <h2>Veteran-Directed Care (VDC)</h2>
        <p>Lets the veteran (with help) hire and pay their own caregiver — including a family member — using a flexible monthly budget from the VA. Available in most states.</p>

        <h2>If you're a caregiver under 18</h2>
        <p>You can't be the primary caregiver under PCAFC, but the VA Caregiver Support Line connects you to family resources. If you're a child caregiver, <a href="https://www.aacy.org" target="_blank" rel="noopener">American Association of Caregiving Youth</a> has dedicated programs.</p>

        <h2>Mental health for the caregiver</h2>
        <p>Caregiver burnout is real. The VA offers caregivers free counseling under both PCAFC and PGCSS. <a href="/mental-health">Vet Centers</a> also serve caregivers and family members of combat veterans.</p>

        <h2>If your veteran dies</h2>
        <p>You may be entitled to <a href="/survivor-benefits">survivor benefits</a> including DIC, CHAMPVA, education benefits, and Survivors Pension. TAPS (1-800-959-TAPS) is the first call.</p>

        <h2>Get help</h2>
        <div class="resource-grid">
          <a href="tel:18552603274" class="resource-card featured">
            <h3>VA Caregiver Support Line</h3>
            <p>1-855-260-3274. Mon-Fri 8am-10pm ET, Sat 8am-5pm ET. Real human, real help.</p>
            <span class="resource-card-cta">Call →</span>
          </a>
          <a href="https://www.caregiver.va.gov/" target="_blank" rel="noopener" class="resource-card">
            <h3>caregiver.va.gov</h3>
            <p>Full PCAFC and PGCSS info, application, eligibility tool, and Caregiver Support Coordinators.</p>
            <span class="resource-card-cta">caregiver.va.gov →</span>
          </a>
          <a href="https://hiddenheroes.org/" target="_blank" rel="noopener" class="resource-card">
            <h3>Elizabeth Dole Foundation — Hidden Heroes</h3>
            <p>Peer support, resources, advocacy specifically for military caregivers.</p>
            <span class="resource-card-cta">hiddenheroes.org →</span>
          </a>
          <a href="https://www.warriorsfund.org" target="_blank" rel="noopener" class="resource-card">
            <h3>Warriors Fund — Caregivers</h3>
            <p>Direct financial assistance and peer programs for military and veteran caregivers.</p>
            <span class="resource-card-cta">warriorsfund.org →</span>
          </a>
        </div>
      </article>
    </div>`;

  const faqLd = {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'What is PCAFC?', acceptedAnswer: { '@type': 'Answer', text: 'The Program of Comprehensive Assistance for Family Caregivers (PCAFC) is the VA\u2019s primary caregiver program. It pays a monthly stipend, plus training, mental health counseling, respite care, travel benefits, and CHAMPVA-style health coverage to family caregivers of eligible veterans of any era.' } },
      { '@type': 'Question', name: 'Who is eligible for the PCAFC stipend?', acceptedAnswer: { '@type': 'Answer', text: 'The veteran must have a service-connected rating of 70% or higher and need help with an activity of daily living or supervision due to a cognitive impairment, for at least 6 continuous months. The caregiver must be at least 18 and a family member or live full-time with the veteran. Veterans of all eras qualify since the 2020 program expansion.' } },
      { '@type': 'Question', name: 'My PCAFC application was denied before 2020 — should I reapply?', acceptedAnswer: { '@type': 'Answer', text: 'Yes. The 2020 expansion opened PCAFC to caregivers of veterans from all eras and broadened eligibility criteria. Many previously denied applicants now qualify under the updated rules.' } },
      { '@type': 'Question', name: 'Is there caregiver support if PCAFC does not apply?', acceptedAnswer: { '@type': 'Answer', text: 'Yes. The Program of General Caregiver Support Services (PGCSS) is available to caregivers of any veteran enrolled in VA healthcare. It does not include a stipend but provides skills training, peer support, respite care, counseling, and a dedicated Caregiver Support Coordinator at every VA medical center.' } },
      { '@type': 'Question', name: 'Can a veteran hire a family member as a paid caregiver?', acceptedAnswer: { '@type': 'Answer', text: 'Yes, through Veteran-Directed Care (VDC). The veteran receives a flexible monthly VA budget and can hire their own caregiver — including a family member — to provide personal care services. VDC is available in most states.' } }
    ]
  };
  const breadcrumbLd = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `https://${CONFIG.publication.domain}/` },
      { '@type': 'ListItem', position: 2, name: 'Family', item: `https://${CONFIG.publication.domain}/family` },
      { '@type': 'ListItem', position: 3, name: 'Caregivers', item: `https://${CONFIG.publication.domain}/caregivers` }
    ]
  };

  return new Response(shellPage({
    title: 'Caregiver Navigator — PCAFC, Stipends, & VA Support — Veteran News',
    description: 'For family caregivers of veterans. The PCAFC stipend, PGCSS, respite care, mental-health support, Veteran-Directed Care, and the 855 helpline that gets things done.',
    canonicalPath: '/caregivers',
    navActive: '',
    contentHtml: content,
    extraHead: `<script type="application/ld+json">${JSON.stringify([faqLd, breadcrumbLd])}</script>`
  }), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}

// ── Transition Guide (separating servicemember playbook) ─────────────────
async function serveTransitionGuidePage(env, url, request) {
  const content = `
    <section class="page-hero">
      <div class="container-narrow">
        <div class="eyebrow">Transition Guide</div>
        <h1 class="page-title">If you're separating in the next 12 months.</h1>
        <p class="page-lede">A 9-step playbook for the things you must do, the deadlines you can't miss, and the benefits most servicemembers leave on the table because no one told them.</p>
      </div>
    </section>
    <div class="container-narrow">
      <article class="story-body">
        <h2>The non-negotiables — start here</h2>
        <ol style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li style="margin-bottom:.75em;"><strong>Attend TAP (Transition Assistance Program).</strong> Required by law no later than 365 days before separation. Get on it as early as you can — 12-18 months out is ideal so you have time to act on what you learn.</li>
          <li style="margin-bottom:.75em;"><strong>File the BDD claim.</strong> The Benefits Delivery at Discharge program lets you file VA disability between 90 and 180 days before separation. <strong>Don't skip this.</strong> A claim filed before separation typically processes 4-6 months faster than one filed after.</li>
          <li style="margin-bottom:.75em;"><strong>Get every condition documented in your service medical record.</strong> If it's not in your STR, it's harder (not impossible) to prove later. Sleep apnea, tinnitus, joint problems, mental health — get them on paper before you out-process.</li>
          <li style="margin-bottom:.75em;"><strong>Schedule your separation physical seriously.</strong> Report every issue. Don't tough it out. The exam is the foundation of every disability claim you'll file.</li>
          <li style="margin-bottom:.75em;"><strong>Save your DD-214 in 5 places.</strong> Cloud, email, paper safe, family member, USB. You'll need it forever.</li>
          <li style="margin-bottom:.75em;"><strong>Apply for VA healthcare.</strong> Combat veterans get 5 years of free care after separation regardless of disability rating. Don't wait — apply on VA.gov before your last day.</li>
          <li style="margin-bottom:.75em;"><strong>Apply for the GI Bill (or transfer it).</strong> If you have 6+ years and want to give it to a spouse or dependent, you must do this <em>while still on active duty</em>. <a href="/gi-bill">See our GI Bill guide.</a></li>
          <li style="margin-bottom:.75em;"><strong>Convert your SGLI to VGLI within 240 days.</strong> SGLI ends within 120 days of separation. VGLI is veterans' group life insurance — no medical exam required if you convert within 240 days.</li>
          <li style="margin-bottom:.75em;"><strong>Get your civilian credentials translated.</strong> COOL (Credentialing Opportunities On-Line) maps your MOS to civilian licenses and certifications.</li>
        </ol>

        <h2>Money matters</h2>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li style="margin-bottom:.5em;"><strong>SBP (Survivor Benefit Plan)</strong> — irrevocable election. Lifetime spouse annuity for retirees. Decide carefully; you have 30 days post-retirement to opt out.</li>
          <li style="margin-bottom:.5em;"><strong>TSP</strong> — your Roth/Traditional Thrift Savings Plan stays with you. You can roll it over or leave it. Don't cash out — taxes + penalties wreck retirement compound interest.</li>
          <li style="margin-bottom:.5em;"><strong>Disability Severance Pay vs. Retirement Pay</strong> — if you're medically separated, ask a JAG or NVF/Wounded Warrior Project advocate about offsets and how PACT-Act presumptive ratings could change things.</li>
          <li style="margin-bottom:.5em;"><strong>Unused leave</strong> — sell back or take terminal leave. Each option has tax implications. Talk to S-1.</li>
        </ul>

        <h2>Healthcare</h2>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li style="margin-bottom:.5em;"><strong>VA enrollment</strong> — free for combat vets in PG 6 for 5 years; otherwise based on income/disability rating.</li>
          <li style="margin-bottom:.5em;"><strong>TRICARE</strong> — continues for retirees. Active duty separating without retirement: TRICARE ends within months. Look at TRICARE Reserve Select if Guard/Reserve.</li>
          <li style="margin-bottom:.5em;"><strong>CHCBP</strong> — Continued Healthcare Benefit Program. 18-36 months of TRICARE-like coverage post-separation. Buy within 60 days of separation.</li>
          <li style="margin-bottom:.5em;"><strong>VA Toxic Exposure Screening</strong> — free, every 5 years. <a href="/pact-act">Tied to PACT Act presumptions.</a></li>
        </ul>

        <h2>Career, education, housing</h2>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li style="margin-bottom:.5em;"><strong>SkillBridge</strong> — last 6 months on active duty interning at a civilian employer (paid by DoD). Apply 6-12 months before your DEROS.</li>
          <li style="margin-bottom:.5em;"><strong>Hiring Our Heroes / DoD Skillbridge directory</strong> — vetted partners.</li>
          <li style="margin-bottom:.5em;"><strong>VA Home Loan</strong> — start the COE process 3-6 months out. Especially powerful with no down payment, no PMI.</li>
          <li style="margin-bottom:.5em;"><strong>VR&amp;E (Chapter 31)</strong> — vocational rehab if you have a service-connected disability. Often more generous than the GI Bill for vets pivoting careers due to injury.</li>
          <li style="margin-bottom:.5em;"><strong>Vet preference</strong> — federal civil service hiring. Do not skip the SF-15 or VOW certification.</li>
        </ul>

        <h2>Mental health — the part TAP downplays</h2>
        <p>Transition is one of the hardest psychological periods of military life. The structure, identity, and relationships you've had for years all change at once. <strong>Pre-emptive mental health care is not weakness; it's risk management.</strong></p>
        <p>Combat veterans qualify for free VA mental health care for 5 years post-separation, no rating required. <a href="/mental-health">Vet Centers</a> are walk-in, no appointment, family included.</p>

        <h2>If you're getting an OTH or bad-paper discharge</h2>
        <p>You may still qualify for many benefits — and you may be able to upgrade your discharge. <a href="/discharge-upgrade">See our discharge upgrade guide.</a></p>

        <h2>Get help</h2>
        <div class="resource-grid">
          <a href="/claim-help" class="resource-card featured">
            <h3>Claim Help</h3>
            <p>2-minute walkthrough that surfaces every VA benefit you may qualify for after separation.</p>
            <span class="resource-card-cta">Start →</span>
          </a>
          <a href="https://www.dodtap.mil/" target="_blank" rel="noopener" class="resource-card">
            <h3>TAP — official portal</h3>
            <p>Schedule your transition workshop, access modules, find local resources.</p>
            <span class="resource-card-cta">dodtap.mil →</span>
          </a>
          <a href="https://skillbridge.osd.mil/" target="_blank" rel="noopener" class="resource-card">
            <h3>DoD SkillBridge</h3>
            <p>Last 6 months on active duty interning at a civilian employer. Paid.</p>
            <span class="resource-card-cta">skillbridge.osd.mil →</span>
          </a>
          <a href="/gi-bill" class="resource-card">
            <h3>GI Bill Guide</h3>
            <p>Know what to do BEFORE you separate, especially the family transfer.</p>
            <span class="resource-card-cta">/gi-bill →</span>
          </a>
        </div>

        <p style="margin-top:var(--s-7);">
          <a href="/transition" class="btn btn-secondary">Latest transition news →</a>
        </p>
      </article>
    </div>`;

  const faqLd = {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'What is BDD and why should I file before I separate?', acceptedAnswer: { '@type': 'Answer', text: 'Benefits Delivery at Discharge (BDD) lets you file your VA disability claim between 90 and 180 days before separation. Claims filed under BDD typically process 4-6 months faster than post-separation claims, meaning your benefits start sooner. Active medical records also remain accessible while you are still in. Almost every separating servicemember should file under BDD.' } },
      { '@type': 'Question', name: 'When should I attend TAP?', acceptedAnswer: { '@type': 'Answer', text: 'Federal law requires TAP no later than 365 days before separation. Best practice is to attend 12-18 months out so you have time to act on what you learn — file BDD, line up SkillBridge, get medical conditions documented, and apply to schools or jobs.' } },
      { '@type': 'Question', name: 'What is SkillBridge?', acceptedAnswer: { '@type': 'Answer', text: 'DoD SkillBridge lets servicemembers spend up to the last 180 days of active duty interning, training, or apprenticing with a civilian employer while still drawing military pay and benefits. Apply 6-12 months before your separation date through skillbridge.osd.mil.' } },
      { '@type': 'Question', name: 'Can I keep my GI Bill if I transfer it to my spouse or kids?', acceptedAnswer: { '@type': 'Answer', text: 'You can transfer Post-9/11 GI Bill benefits to a spouse or dependents, but only while you are still on active duty with at least 6 years of service and a 4-year additional service obligation. Once you separate, you cannot initiate a transfer. Plan this before you start out-processing.' } },
      { '@type': 'Question', name: 'How long does VA healthcare last after separation?', acceptedAnswer: { '@type': 'Answer', text: 'Combat veterans get 5 years of free VA healthcare regardless of disability rating, in Priority Group 6. After 5 years, eligibility is means-tested or based on rating. Apply through VA.gov as early as possible — ideally before your last day.' } },
      { '@type': 'Question', name: 'What if I have an OTH discharge?', acceptedAnswer: { '@type': 'Answer', text: 'You may still qualify for many benefits and you can pursue a discharge upgrade. The VA can also make a Character of Discharge determination separate from DoD. See our discharge upgrade guide for the process.' } }
    ]
  };
  const breadcrumbLd = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `https://${CONFIG.publication.domain}/` },
      { '@type': 'ListItem', position: 2, name: 'Transition', item: `https://${CONFIG.publication.domain}/transition` },
      { '@type': 'ListItem', position: 3, name: 'Transition Guide', item: `https://${CONFIG.publication.domain}/transition-guide` }
    ]
  };

  return new Response(shellPage({
    title: 'Transition Guide — 9-Step Playbook for Separating Servicemembers — Veteran News',
    description: 'The complete transition playbook. TAP, BDD claim, SGLI/VGLI conversion, GI Bill transfer, SkillBridge, VA healthcare, and the deadlines you cannot miss.',
    canonicalPath: '/transition-guide',
    navActive: '',
    contentHtml: content,
    extraHead: `<script type="application/ld+json">${JSON.stringify([faqLd, breadcrumbLd])}</script>`
  }), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}

// ── Discharge Upgrade Guide ──────────────────────────────────────────────
async function serveDischargeUpgradePage(env, url, request) {
  const content = `
    <section class="page-hero">
      <div class="container-narrow">
        <div class="eyebrow">Discharge Upgrade</div>
        <h1 class="page-title">A bad discharge is not a life sentence.</h1>
        <p class="page-lede">If you got an Other Than Honorable, Bad Conduct, or Dishonorable discharge — you may be able to upgrade it. Tens of thousands of veterans have. Here's the process, the timing, and the free help.</p>
      </div>
    </section>
    <div class="container-narrow">
      <article class="story-body">
        <h2>Why upgrade matters</h2>
        <p>Your discharge characterization affects access to:</p>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li style="margin-bottom:.5em;">VA healthcare and disability compensation</li>
          <li style="margin-bottom:.5em;">GI Bill education benefits</li>
          <li style="margin-bottom:.5em;">VA home loans</li>
          <li style="margin-bottom:.5em;">Burial benefits</li>
          <li style="margin-bottom:.5em;">Federal jobs and security clearances</li>
          <li style="margin-bottom:.5em;">State veteran benefits (property tax exemption, license plates, etc.)</li>
          <li style="margin-bottom:.5em;">How you describe your service to civilian employers</li>
        </ul>

        <h2>Two boards, two routes</h2>

        <h3>Discharge Review Board (DRB) — the easier route</h3>
        <p>Each branch has a DRB. Apply with <strong>DD Form 293</strong>. The DRB can change a discharge to honorable, general, or any other characterization (except a court-martial).</p>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li>Filing window: <strong>15 years</strong> from discharge</li>
          <li>Best for: administrative discharges, OTH</li>
          <li>Hearing: optional (in-person or video) or paper review</li>
        </ul>

        <h3>Board for Correction of Military Records (BCMR/BCNR) — for everything else</h3>
        <p>If you're past 15 years, or if your case involves complex factual disputes, file with the BCMR using <strong>DD Form 149</strong>. There is no statute of limitations, but you must explain why you didn't file earlier.</p>

        <h2>When boards have to grant relief — Hagel/Kurta/Wilkie memos</h2>
        <p>DoD has issued binding guidance to discharge boards: <strong>liberal consideration</strong> must be given when discharge involves:</p>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li style="margin-bottom:.5em;"><strong>PTSD or TBI</strong> related to service (Hagel memo, 2014)</li>
          <li style="margin-bottom:.5em;"><strong>Mental health conditions</strong> (Kurta memo, 2017)</li>
          <li style="margin-bottom:.5em;"><strong>Sexual assault, sexual harassment, or sexual orientation</strong> (Wilkie memo, 2018)</li>
        </ul>
        <p>If your discharge can be tied to any of these, your odds of upgrade increase dramatically. The <a href="https://www.vetsprobono.org/" target="_blank" rel="noopener">Veterans Pro Bono Project</a> and other free legal help focus on these cases.</p>

        <h2>VA Character of Discharge — separate path to benefits</h2>
        <p>Even without an upgrade, the VA can make its own <strong>Character of Discharge determination</strong> for benefits eligibility. The VA may classify your service as honorable for VA purposes even when DoD calls it OTH. File <a href="https://www.va.gov/decision-reviews/" target="_blank" rel="noopener">VA Form 21-0781</a> with the regional office or work through a VSO.</p>

        <h2>What the application needs</h2>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li style="margin-bottom:.5em;">Personal statement explaining your service and why an upgrade is justified</li>
          <li style="margin-bottom:.5em;">Service medical records (especially anything mental health, TBI, or assault-related)</li>
          <li style="margin-bottom:.5em;">VA medical records if available</li>
          <li style="margin-bottom:.5em;">Letters from doctors, therapists, employers, family — character evidence</li>
          <li style="margin-bottom:.5em;">Evidence of post-service rehabilitation (employment, education, sobriety, community involvement)</li>
        </ul>

        <h2>Get help — for free</h2>
        <p>You should not pay for this. Many specialized veteran legal projects handle discharge upgrades pro bono:</p>
        <div class="resource-grid">
          <a href="https://www.vetsprobono.org/" target="_blank" rel="noopener" class="resource-card featured">
            <h3>Veterans Pro Bono Project</h3>
            <p>Free legal help for discharge upgrades, especially Hagel/Kurta/Wilkie cases.</p>
            <span class="resource-card-cta">vetsprobono.org →</span>
          </a>
          <a href="https://swords-to-plowshares.org/" target="_blank" rel="noopener" class="resource-card">
            <h3>Swords to Plowshares</h3>
            <p>Decades of experience. Strong on PTSD/MST cases.</p>
            <span class="resource-card-cta">swords-to-plowshares.org →</span>
          </a>
          <a href="https://nvlsp.org/" target="_blank" rel="noopener" class="resource-card">
            <h3>NVLSP — Lawyers Serving Warriors</h3>
            <p>National Veterans Legal Services Program. Pro bono representation for discharge upgrades and VA appeals.</p>
            <span class="resource-card-cta">nvlsp.org →</span>
          </a>
          <a href="https://www.va.gov/get-help-from-accredited-representative/find-rep" target="_blank" rel="noopener" class="resource-card">
            <h3>Accredited VSO / VA agent</h3>
            <p>Many DAV, VFW, and American Legion service officers handle DRB filings.</p>
            <span class="resource-card-cta">Find one →</span>
          </a>
        </div>

        <p style="margin-top:var(--s-7);">
          <a href="/mental-health" class="btn btn-secondary">Mental health for OTH veterans →</a>
        </p>
      </article>
    </div>`;

  const faqLd = {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'Can I upgrade an Other Than Honorable (OTH) discharge?', acceptedAnswer: { '@type': 'Answer', text: 'Often yes. File DD Form 293 with your service\u2019s Discharge Review Board within 15 years of discharge. If your separation is connected to PTSD, TBI, mental health, MST, or sexual orientation, the Hagel, Kurta, and Wilkie memos require boards to give liberal consideration to upgrade.' } },
      { '@type': 'Question', name: 'What is the deadline to apply for a discharge upgrade?', acceptedAnswer: { '@type': 'Answer', text: 'The Discharge Review Board has a 15-year filing window. After 15 years, file with the Board for Correction of Military Records (BCMR/BCNR) using DD Form 149. The BCMR has no strict statute of limitations but you must explain why you did not file earlier.' } },
      { '@type': 'Question', name: 'What are the Hagel, Kurta, and Wilkie memos?', acceptedAnswer: { '@type': 'Answer', text: 'Binding DoD guidance to discharge review boards. Hagel (2014) requires liberal consideration when PTSD or TBI may be involved. Kurta (2017) extends this to other mental health conditions. Wilkie (2018) extends it to discharges related to sexual assault, harassment, or sexual orientation. These memos significantly improve upgrade odds for qualifying cases.' } },
      { '@type': 'Question', name: 'Do I need a lawyer for a discharge upgrade?', acceptedAnswer: { '@type': 'Answer', text: 'Not always, but cases involving combat trauma, MST, or complex facts usually go better with help. Several organizations provide free representation: Veterans Pro Bono Project, Swords to Plowshares, NVLSP Lawyers Serving Warriors, and accredited VSO service officers.' } },
      { '@type': 'Question', name: 'Can I get VA benefits without upgrading my discharge?', acceptedAnswer: { '@type': 'Answer', text: 'Sometimes. The VA can make its own Character of Discharge determination, separate from DoD. Even with an OTH discharge, the VA may consider your service honorable for VA purposes — especially for service-connected mental health and substance use treatment. Pursue both paths simultaneously when possible.' } }
    ]
  };
  const breadcrumbLd = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `https://${CONFIG.publication.domain}/` },
      { '@type': 'ListItem', position: 2, name: 'Tools', item: `https://${CONFIG.publication.domain}/tools` },
      { '@type': 'ListItem', position: 3, name: 'Discharge Upgrade', item: `https://${CONFIG.publication.domain}/discharge-upgrade` }
    ]
  };

  return new Response(shellPage({
    title: 'Discharge Upgrade Guide — OTH to Honorable — Veteran News',
    description: 'How to upgrade an OTH, BCD, or other discharge. DD-293 vs. DD-149, the Hagel/Kurta/Wilkie memos, the VA Character of Discharge process, and free legal help.',
    canonicalPath: '/discharge-upgrade',
    navActive: '',
    contentHtml: content,
    extraHead: `<script type="application/ld+json">${JSON.stringify([faqLd, breadcrumbLd])}</script>`
  }), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}

// ── Traumatic Brain Injury (TBI) ─────────────────────────────────────────
async function serveTBIPage(env, url, request) {
  const content = `
    <section class="page-hero">
      <div class="container-narrow">
        <div class="eyebrow">TBI Navigator</div>
        <h1 class="page-title">If you've been hit, blasted, or knocked out — read this.</h1>
        <p class="page-lede">Hundreds of thousands of post-9/11 veterans have a TBI in their service medical record. Many more have undiagnosed blast exposure. Symptoms — irritability, sleep problems, memory issues, headaches, depression — get blamed on PTSD or "transition stress." Here's what TBI actually is, what to file for, and how to get treated.</p>
      </div>
    </section>
    <div class="container-narrow">
      <article class="story-body">
        <h2>What counts as TBI</h2>
        <p>The VA recognizes traumatic brain injury at three severity levels:</p>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li style="margin-bottom:.5em;"><strong>Mild (concussion)</strong> — loss of consciousness 0-30 min, or being dazed for less than 24 hours. Can have lasting symptoms even after a single mild TBI. Most blast/fall/MVA injuries fall here.</li>
          <li style="margin-bottom:.5em;"><strong>Moderate</strong> — loss of consciousness 30 min to 24 hours, post-traumatic amnesia 1-7 days.</li>
          <li style="margin-bottom:.5em;"><strong>Severe</strong> — loss of consciousness over 24 hours, post-traumatic amnesia over 7 days.</li>
        </ul>
        <p><strong>Repeat blast or impact exposure matters.</strong> Even without any single severe event, repeated exposure (door breachers, mortar crews, recoilless rifle gunners, combat engineers, repeat IED proximity) is recognized as causing chronic neurological symptoms.</p>

        <h2>Common symptoms</h2>
        <p>TBI symptoms overlap heavily with PTSD and depression — that's why so many veterans get the wrong diagnosis. Look for:</p>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li>Headaches (especially post-exertional)</li>
          <li>Memory problems · word-finding difficulty</li>
          <li>Irritability · "short fuse"</li>
          <li>Sleep disruption · insomnia</li>
          <li>Light/noise sensitivity</li>
          <li>Balance issues · dizziness</li>
          <li>Anxiety · depression</li>
          <li>Fatigue · cognitive slowing</li>
        </ul>

        <h2>VA care — what's actually available</h2>
        <p>Every VA medical center has a polytrauma/TBI program. Available treatments:</p>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li style="margin-bottom:.5em;"><strong>Cognitive rehabilitation therapy</strong> — speech-language pathology, occupational therapy</li>
          <li style="margin-bottom:.5em;"><strong>Headache management</strong> — neurology, often with newer CGRP-class meds</li>
          <li style="margin-bottom:.5em;"><strong>Sleep medicine</strong> — sleep studies, CPAP if indicated, behavioral interventions</li>
          <li style="margin-bottom:.5em;"><strong>Vestibular rehab</strong> — balance and dizziness</li>
          <li style="margin-bottom:.5em;"><strong>Mental health integration</strong> — TBI/PTSD overlap requires combined treatment</li>
          <li style="margin-bottom:.5em;"><strong>Caregiver support (PCAFC)</strong> — for moderate to severe TBI <a href="/caregivers">see caregiver guide</a></li>
        </ul>
        <p>Polytrauma centers (Tampa, Richmond, Minneapolis, Palo Alto, San Antonio) are the top-tier centers for severe cases. Most veterans are managed at their local VA.</p>

        <h2>Filing a TBI disability claim</h2>
        <p>VA TBI ratings range 0-100% based on impairment in 10 facets (memory, orientation, language, social interaction, etc.). The C&amp;P exam is critical — request a TBI-trained examiner, not a general medical examiner.</p>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li style="margin-bottom:.5em;">Document the original injury or exposure (incident reports, awards, statements from buddies)</li>
          <li style="margin-bottom:.5em;">Track symptoms over time — a journal is gold</li>
          <li style="margin-bottom:.5em;">Get a private neuropsychological evaluation if you can — it's usually more thorough than the C&amp;P</li>
          <li style="margin-bottom:.5em;">Have a buddy statement if your behavior changed after the event</li>
        </ul>
        <p>TBI is often rated alongside PTSD. They can be rated separately or under a combined diagnosis depending on which produces a higher rating.</p>

        <h2>Blast exposure without diagnosis — Project ENDURE / clinical trials</h2>
        <p>VA, DoD, and Walter Reed are running large studies on subclinical blast exposure (gunners, breachers, mortar crews) — chronic symptoms without a clear single TBI event. Ask your VA neurologist about referral to a Brain Health Center or a research protocol.</p>

        <h2>Specific situations</h2>

        <h3>"I never got knocked out, but I was around a lot of blast"</h3>
        <p>You may still qualify. The Sergeant First Class Heath Robinson Honoring our Promise to Address Comprehensive Toxics (PACT) Act and DoD Brain Health initiatives now recognize chronic effects from repeat blast. File anyway — describe the exposure (frequency, distance, type of weapon system).</p>

        <h3>"I was diagnosed with PTSD but symptoms don't fit"</h3>
        <p>Headaches that don't respond to PTSD meds, light sensitivity, balance issues, or word-finding problems point toward TBI rather than (or in addition to) PTSD. Ask for a neuropsychological evaluation.</p>

        <h2>Get help</h2>
        <div class="resource-grid">
          <a href="https://www.va.gov/health-care/health-needs-conditions/military-exposures/traumatic-brain-injury/" target="_blank" rel="noopener" class="resource-card featured">
            <h3>VA TBI Programs</h3>
            <p>Polytrauma System of Care, including the 5 polytrauma centers and 22 polytrauma network sites.</p>
            <span class="resource-card-cta">va.gov →</span>
          </a>
          <a href="https://health.mil/Military-Health-Topics/Centers-of-Excellence/Traumatic-Brain-Injury-Center-of-Excellence" target="_blank" rel="noopener" class="resource-card">
            <h3>TBI Center of Excellence</h3>
            <p>DoD's research and clinical programs. Studies on blast exposure and chronic effects.</p>
            <span class="resource-card-cta">health.mil →</span>
          </a>
          <a href="/claim-help" class="resource-card">
            <h3>Filing help</h3>
            <p>Free VSO walkthrough — VFW, DAV, American Legion handle TBI claims.</p>
            <span class="resource-card-cta">/claim-help →</span>
          </a>
          <a href="https://elizabethdolefoundation.org/" target="_blank" rel="noopener" class="resource-card">
            <h3>Elizabeth Dole Foundation</h3>
            <p>Caregiver and family support for veterans with moderate-to-severe TBI.</p>
            <span class="resource-card-cta">elizabethdolefoundation.org →</span>
          </a>
        </div>
      </article>
    </div>`;

  const faqLd = {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'What counts as a service-connected TBI?', acceptedAnswer: { '@type': 'Answer', text: 'The VA recognizes mild (concussion, loss of consciousness 0-30 min), moderate (loss of consciousness 30 min to 24 hours), and severe (loss of consciousness over 24 hours) TBI. Repeat blast or impact exposure — even without a single severe event — is also recognized as causing chronic neurological symptoms.' } },
      { '@type': 'Question', name: 'Can I claim TBI without ever being knocked unconscious?', acceptedAnswer: { '@type': 'Answer', text: 'Yes. Chronic effects from repeat blast or impact exposure are increasingly recognized, including for door breachers, mortar crews, recoilless rifle gunners, combat engineers, and others with frequent close-proximity blast. Document the exposure (frequency, distance, weapon systems) when filing.' } },
      { '@type': 'Question', name: 'How is VA TBI rated?', acceptedAnswer: { '@type': 'Answer', text: 'TBI is rated 0-100% based on impairment across 10 cognitive and behavioral facets including memory, orientation, language, judgment, social interaction, and consciousness. A TBI-trained C&P examiner produces a more accurate rating than a general medical examiner — request one.' } },
      { '@type': 'Question', name: 'I was diagnosed with PTSD but symptoms do not fit. Could it be TBI?', acceptedAnswer: { '@type': 'Answer', text: 'Possibly. Headaches that do not respond to PTSD medications, light or noise sensitivity, balance problems, and word-finding difficulty point toward TBI rather than — or in addition to — PTSD. Ask your provider for a neuropsychological evaluation.' } },
      { '@type': 'Question', name: 'Can I be rated for TBI and PTSD separately?', acceptedAnswer: { '@type': 'Answer', text: 'Sometimes. TBI and PTSD can be rated under a combined diagnosis or separately, depending on which produces the higher rating. A VSO experienced with TBI claims helps determine the optimal filing strategy.' } }
    ]
  };
  const breadcrumbLd = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `https://${CONFIG.publication.domain}/` },
      { '@type': 'ListItem', position: 2, name: 'Health', item: `https://${CONFIG.publication.domain}/health` },
      { '@type': 'ListItem', position: 3, name: 'TBI', item: `https://${CONFIG.publication.domain}/tbi` }
    ]
  };

  return new Response(shellPage({
    title: 'TBI Guide — Traumatic Brain Injury Care & Claims — Veteran News',
    description: 'TBI in plain English for veterans. Mild/moderate/severe definitions, blast exposure, VA polytrauma care, how to file, and the overlap with PTSD that gets veterans misdiagnosed.',
    canonicalPath: '/tbi',
    navActive: '',
    contentHtml: content,
    extraHead: `<script type="application/ld+json">${JSON.stringify([faqLd, breadcrumbLd])}</script>`
  }), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}

// ── Women Veterans Navigator ─────────────────────────────────────────────
async function serveWomenVeteransPage(env, url, request) {
  const content = `
    <section class="page-hero">
      <div class="container-narrow">
        <div class="eyebrow">Women Veterans</div>
        <h1 class="page-title">Built by, and for, women who served.</h1>
        <p class="page-lede">Women are the fastest-growing veteran demographic — and the most underserved. Here's the shortlist of programs, providers, and protections you've earned, and the calls to make first.</p>
      </div>
    </section>
    <div class="container-narrow">
      <article class="story-body">
        <h2>Start with one call</h2>
        <p style="font-size:1.125rem;"><a href="tel:18558298526" class="btn btn-primary">Women Veterans Call Center — 1-855-VA-WOMEN (1-855-829-6636)</a></p>
        <p>Free. Confidential. Staffed entirely by women, including many veterans themselves. They walk you through enrollment, find a Women Veterans Program Manager near you, and connect you to providers who specialize in women's care.</p>

        <h2>What's available at the VA</h2>
        <p>Every VA medical center has a <strong>Women Veterans Program Manager (WVPM)</strong> — a single point of contact whose job is making sure your care goes right. Ask for them by title.</p>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li style="margin-bottom:.5em;"><strong>Designated women's clinics</strong> at most VAMCs and CBOCs</li>
          <li style="margin-bottom:.5em;"><strong>Comprehensive primary care</strong> including reproductive health, contraception, family planning</li>
          <li style="margin-bottom:.5em;"><strong>Maternity care</strong> covered through community providers (you don't deliver at the VA, but the VA pays); 7 days infant care</li>
          <li style="margin-bottom:.5em;"><strong>Gender-specific cancer screening</strong> — mammography, cervical screening, colonoscopy</li>
          <li style="margin-bottom:.5em;"><strong>Mental health</strong> with women-only groups, MST-trained providers, and same-gender provider available on request</li>
          <li style="margin-bottom:.5em;"><strong>Urology, gynecology, pelvic health</strong> — through the VA or community care</li>
          <li style="margin-bottom:.5em;"><strong>Specialized homeless programs for women</strong> (some HUD-VASH and SSVF agencies focus on women)</li>
        </ul>

        <h2>Military Sexual Trauma (MST) — your rights</h2>
        <p>If you experienced sexual assault or harassment during service, <strong>free MST-related care is available for life</strong> — regardless of when you served, your discharge, length of service, whether you reported, or whether you have a rating. <a href="/mental-health">See full MST details on our mental health page.</a></p>
        <p>Every VA medical center has MST-trained providers and same-gender providers on request. Vet Centers also offer MST counseling outside the VA system.</p>

        <h2>Reproductive health that the VA actually covers</h2>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li>Contraception (all FDA-approved methods)</li>
          <li>Pre-conception counseling</li>
          <li>Maternity care, prenatal/postnatal services</li>
          <li>7 days of newborn care after delivery</li>
          <li>Infertility treatment and limited IVF (for service-connected infertility)</li>
          <li>Adoption reimbursement (up to $2,000) for service-connected infertility</li>
          <li>Gender-affirming care (federally approved as of 2023)</li>
        </ul>

        <h2>Disability claims — file what you've earned</h2>
        <p>Women veterans file for disability at lower rates than men, and the most underclaimed conditions are:</p>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li><strong>Pelvic floor dysfunction</strong> from rucking, weight-bearing, parachute jumps</li>
          <li><strong>Endometriosis</strong> linked to chemical exposure</li>
          <li><strong>Stress urinary incontinence</strong> — service-connected for many infantry and aviation roles</li>
          <li><strong>Reproductive cancers</strong> with PACT Act coverage</li>
          <li><strong>MST-related PTSD, depression, anxiety, sexual dysfunction</strong></li>
          <li><strong>Hip, back, knee injuries</strong> from gear designed for male bodies</li>
          <li><strong>Tinnitus, hearing loss, sleep apnea</strong> — same as for any combat-arms vet</li>
        </ul>
        <p>Use a VSO. The <a href="https://wwwm.womenvetsusa.org/" target="_blank" rel="noopener">Women Veterans USA</a> network and <a href="https://www.serviceWomen.org/" target="_blank" rel="noopener">Service Women's Action Network (SWAN)</a> offer claim help with women-specific expertise.</p>

        <h2>If you've experienced harassment in VA care</h2>
        <p>This is unfortunately still common. The VA has a zero-tolerance harassment policy and a reporting system: <strong>1-855-VA-WOMEN</strong> or your facility's Patient Advocate. Document the incident with date/time/witnesses. Reporting protects future women veterans even if you don't pursue your own complaint.</p>

        <h2>Specific resources</h2>
        <h3>If you're a survivor of MST</h3>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li><strong>Safe Helpline (DoD)</strong> — 1-877-995-5247 · <a href="https://www.safehelpline.org/" target="_blank" rel="noopener">safehelpline.org</a> · 24/7 confidential MST support including for active duty</li>
          <li><strong>RAINN</strong> — 1-800-656-HOPE · 24/7 sexual assault hotline (women veterans included)</li>
          <li><strong>Protect Our Defenders</strong> — legal advocacy and discharge upgrade help for MST survivors</li>
        </ul>

        <h3>Community and support</h3>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li><strong>Women Veterans of America</strong> — peer chapters in 50 states</li>
          <li><strong>Service Women's Action Network (SWAN)</strong> — policy advocacy and case-by-case support</li>
          <li><strong>Final Salute Inc.</strong> — homeless women veterans and survivors of domestic violence; transitional housing</li>
          <li><strong>Code of Vets</strong> — emergency assistance with focus on women and family veterans</li>
        </ul>

        <h2>Get help</h2>
        <div class="resource-grid">
          <a href="tel:18558298526" class="resource-card featured">
            <h3>Women Veterans Call Center</h3>
            <p>1-855-VA-WOMEN (1-855-829-6636). Mon-Fri 8am-10pm ET, Sat 8am-6:30pm ET. Staffed by women.</p>
            <span class="resource-card-cta">Call →</span>
          </a>
          <a href="https://www.womenshealth.va.gov/" target="_blank" rel="noopener" class="resource-card">
            <h3>VA Women's Health</h3>
            <p>Full women's services directory: providers, locations, programs, and how to enroll.</p>
            <span class="resource-card-cta">womenshealth.va.gov →</span>
          </a>
          <a href="/mental-health" class="resource-card">
            <h3>Mental Health Navigator</h3>
            <p>PTSD, MST, depression. Vet Centers, evidence-based therapy, free non-VA options.</p>
            <span class="resource-card-cta">/mental-health →</span>
          </a>
          <a href="/claim-help" class="resource-card">
            <h3>Claim Help Walkthrough</h3>
            <p>2-minute eligibility check that surfaces VA disability benefits you may have missed.</p>
            <span class="resource-card-cta">Start →</span>
          </a>
        </div>

        <p style="margin-top:var(--s-7);">
          <a href="/topic/women-veterans" class="btn btn-secondary">Latest women veterans news →</a>
        </p>
      </article>
    </div>`;

  const faqLd = {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'What VA services are specifically available for women veterans?', acceptedAnswer: { '@type': 'Answer', text: 'Every VA medical center has a Women Veterans Program Manager and most have a designated women\u2019s clinic. Services include comprehensive primary care, contraception and family planning, maternity care through community providers (with 7 days of newborn care), gender-specific cancer screening, women-only mental health groups, MST-trained providers, gynecology, urology, pelvic health, and gender-affirming care.' } },
      { '@type': 'Question', name: 'How do I reach the Women Veterans Call Center?', acceptedAnswer: { '@type': 'Answer', text: 'Call 1-855-VA-WOMEN (1-855-829-6636), Monday through Friday 8am-10pm ET and Saturday 8am-6:30pm ET. The center is staffed entirely by women, including veterans themselves, who help with enrollment, finding a Women Veterans Program Manager, and connecting to women-trained providers.' } },
      { '@type': 'Question', name: 'Does the VA cover maternity care?', acceptedAnswer: { '@type': 'Answer', text: 'Yes. The VA does not deliver babies at VA hospitals, but it pays for maternity care at community providers — including prenatal, delivery, postnatal services, and 7 days of newborn care after delivery. Pre-conception counseling, contraception, and infertility treatment for service-connected infertility are also covered.' } },
      { '@type': 'Question', name: 'I am a survivor of MST. What care am I entitled to?', acceptedAnswer: { '@type': 'Answer', text: 'Free MST-related care for life, regardless of when you served, your discharge characterization, length of service, whether you reported, or whether you have a rating. Every VA medical center has MST-trained providers and you can request a same-gender provider. Vet Centers also offer MST counseling outside the VA system.' } },
      { '@type': 'Question', name: 'What disability conditions do women veterans most often miss filing for?', acceptedAnswer: { '@type': 'Answer', text: 'Pelvic floor dysfunction, endometriosis, stress urinary incontinence, reproductive cancers under the PACT Act, MST-related PTSD/depression/anxiety, and musculoskeletal injuries (hip, back, knee) from male-spec gear are commonly underclaimed. A VSO experienced with women-veteran claims, such as Service Women\u2019s Action Network, can help.' } },
      { '@type': 'Question', name: 'What if I experience harassment at a VA facility?', acceptedAnswer: { '@type': 'Answer', text: 'The VA has a zero-tolerance harassment policy. Report to 1-855-VA-WOMEN or your facility\u2019s Patient Advocate. Document the incident — date, time, witnesses — and follow up. Reporting protects future women veterans even if you do not pursue a formal complaint yourself.' } }
    ]
  };
  const breadcrumbLd = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `https://${CONFIG.publication.domain}/` },
      { '@type': 'ListItem', position: 2, name: 'Health', item: `https://${CONFIG.publication.domain}/health` },
      { '@type': 'ListItem', position: 3, name: 'Women Veterans', item: `https://${CONFIG.publication.domain}/women-veterans` }
    ]
  };

  return new Response(shellPage({
    title: 'Women Veterans Navigator — Care, MST, & Disability Claims — Veteran News',
    description: 'For the fastest-growing veteran demographic. VA women\u2019s health, MST care for life, the Women Veterans Call Center, reproductive coverage, and the disability claims women miss most.',
    canonicalPath: '/women-veterans',
    navActive: '',
    contentHtml: content,
    extraHead: `<script type="application/ld+json">${JSON.stringify([faqLd, breadcrumbLd])}</script>`
  }), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}

// ── VA Appeals (Decision Review) ─────────────────────────────────────────
async function serveAppealsPage(env, url, request) {
  const content = `
    <section class="page-hero">
      <div class="container-narrow">
        <div class="eyebrow">VA Appeals</div>
        <h1 class="page-title">If you got a low rating or a denial — appeal.</h1>
        <p class="page-lede">About 35% of VA disability decisions are changed on appeal. There are three appeal lanes, each with different speed, evidence rules, and odds. This page picks the right lane for you and walks the timeline.</p>
      </div>
    </section>
    <div class="container-narrow">
      <article class="story-body">
        <h2>The 1-year rule</h2>
        <p>You have <strong>one year</strong> from the date on your VA decision letter to appeal. Miss that window and the decision becomes final — you can still file a Supplemental Claim with new evidence later, but you lose the early effective date that matters for back pay.</p>

        <h2>The three appeal lanes (AMA decision review)</h2>

        <h3>1. Higher-Level Review (HLR)</h3>
        <p>A senior reviewer at a different VA office takes a fresh look at the same record. <strong>No new evidence allowed.</strong></p>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li>Average time: <strong>~125 days</strong></li>
          <li>Best for: clear errors of law or fact in the original decision</li>
          <li>Form: <strong>VA Form 20-0996</strong></li>
          <li>Optional informal "phone call" with reviewer — request it on the form. Often improves outcomes.</li>
        </ul>

        <h3>2. Supplemental Claim</h3>
        <p>Submit <strong>new and relevant evidence</strong> — medical records, doctor's letter, lay statements, the law itself (PACT Act). VA must give a duty-to-assist review.</p>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li>Average time: <strong>~140 days</strong></li>
          <li>Best for: when you have new evidence, or want to add a buddy statement / private medical opinion</li>
          <li>Form: <strong>VA Form 20-0995</strong></li>
          <li>Can re-file as many times as you want, indefinitely</li>
        </ul>

        <h3>3. Board Appeal (Board of Veterans' Appeals)</h3>
        <p>Goes to a Veterans Law Judge in Washington. Three sub-options:</p>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li style="margin-bottom:.5em;"><strong>Direct review</strong> — same record. ~365 days. Fastest Board option.</li>
          <li style="margin-bottom:.5em;"><strong>Evidence submission</strong> — new evidence allowed for 90 days after filing. ~550 days.</li>
          <li style="margin-bottom:.5em;"><strong>Hearing</strong> — virtual or in-person hearing with the judge. ~700+ days. Highest grant rate of any lane.</li>
        </ul>
        <p>Form: <strong>VA Form 10182</strong></p>

        <h2>How to pick the right lane</h2>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li style="margin-bottom:.5em;"><strong>Got a doctor's letter you didn't have before?</strong> → Supplemental Claim</li>
          <li style="margin-bottom:.5em;"><strong>VA ignored evidence already in your file?</strong> → Higher-Level Review</li>
          <li style="margin-bottom:.5em;"><strong>VA misapplied the law?</strong> → HLR or Board direct review</li>
          <li style="margin-bottom:.5em;"><strong>Want a hearing in front of a judge?</strong> → Board (hearing option)</li>
          <li style="margin-bottom:.5em;"><strong>Was your claim denied for a non-presumptive condition that's now presumptive?</strong> → Supplemental Claim citing the law (PACT Act etc.)</li>
        </ul>

        <h2>Effective dates and back pay</h2>
        <p>If you file any appeal within <strong>1 year</strong> of the original decision, you keep the original effective date. That means your back pay accrues from that earlier date — sometimes years of compensation. <strong>This is why the 1-year deadline matters.</strong></p>
        <p>If you blow the 1-year deadline and file a Supplemental Claim later, you can still get the increase but only from the date of the new claim.</p>

        <h2>If you missed the 1-year deadline</h2>
        <p>You can still file a Supplemental Claim — just with a later effective date. You can also file a CUE (Clear and Unmistakable Error) motion if the original decision had an obvious legal error. CUE has no time limit.</p>

        <h2>The Court of Appeals for Veterans Claims (CAVC)</h2>
        <p>If the Board denies you, you can appeal to the CAVC — a federal court. You have <strong>120 days</strong> from the Board decision. CAVC review is purely on the legal record; you can't bring new evidence. Free legal help is available through the <a href="https://www.vetsprobono.org/" target="_blank" rel="noopener">Veterans Pro Bono Project</a>.</p>

        <h2>Common appeal mistakes</h2>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li>Filing the wrong form (HLR form for a supplemental claim, etc.)</li>
          <li>Missing the 1-year window</li>
          <li>Submitting new evidence on an HLR (it'll be ignored)</li>
          <li>Not requesting the informal HLR phone call (often the cheapest path to a win)</li>
          <li>Going straight to Board when an HLR or Supplemental Claim would be faster</li>
          <li>Using a "claim shark" — illegal under federal law for initial claims and a known scam pattern</li>
        </ul>

        <h2>Get help — for free</h2>
        <p>VSOs handle appeals at no cost. They know the lanes, the forms, and the local Regional Office quirks.</p>
        <div class="resource-grid">
          <a href="https://www.va.gov/decision-reviews/" target="_blank" rel="noopener" class="resource-card featured">
            <h3>VA.gov — Decision Reviews</h3>
            <p>Official portal. File HLR, Supplemental, or Board Appeal online. Track status.</p>
            <span class="resource-card-cta">va.gov/decision-reviews →</span>
          </a>
          <a href="https://www.dav.org/find-your-local-office/" target="_blank" rel="noopener" class="resource-card">
            <h3>DAV — File appeals free</h3>
            <p>Disabled American Veterans handles HLRs, Supplementals, and Board appeals nationwide.</p>
            <span class="resource-card-cta">Find office →</span>
          </a>
          <a href="https://www.vfw.org/assistance/va-claims-separation-benefits" target="_blank" rel="noopener" class="resource-card">
            <h3>VFW Service Officers</h3>
            <p>Strong on Vietnam, Iraq, Afghanistan presumptive cases.</p>
            <span class="resource-card-cta">VFW help →</span>
          </a>
          <a href="https://nvlsp.org/" target="_blank" rel="noopener" class="resource-card">
            <h3>NVLSP — Lawyers Serving Warriors</h3>
            <p>Pro bono representation for complex appeals, especially CAVC cases.</p>
            <span class="resource-card-cta">nvlsp.org →</span>
          </a>
        </div>
      </article>
    </div>`;

  const faqLd = {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'How long do I have to appeal a VA decision?', acceptedAnswer: { '@type': 'Answer', text: 'You have one year from the date on your VA decision letter to file an appeal that preserves the original effective date. After one year, the decision is final, but you can still file a Supplemental Claim with new evidence — you would just lose the earlier effective date for back pay purposes.' } },
      { '@type': 'Question', name: 'What are the three VA appeal lanes?', acceptedAnswer: { '@type': 'Answer', text: 'Under the Appeals Modernization Act (AMA), there are three lanes: Higher-Level Review (HLR), where a senior reviewer takes another look at the same record (~125 days, no new evidence); Supplemental Claim, where you submit new and relevant evidence (~140 days); and Board Appeal to the Board of Veterans\u2019 Appeals, with direct review, evidence submission, or hearing options.' } },
      { '@type': 'Question', name: 'Which VA appeal lane should I choose?', acceptedAnswer: { '@type': 'Answer', text: 'Choose Supplemental Claim if you have new evidence like a doctor\u2019s letter or buddy statement. Choose Higher-Level Review if you believe the VA misapplied existing evidence or law. Choose Board Appeal — especially with a hearing — for complex cases or when other lanes have failed. Hearings have the highest grant rate but take 700+ days.' } },
      { '@type': 'Question', name: 'Can I bring new evidence to a Higher-Level Review?', acceptedAnswer: { '@type': 'Answer', text: 'No. HLR is a same-record review by a senior VA reviewer. Submitting new evidence wastes the lane. If you have new evidence, file a Supplemental Claim instead.' } },
      { '@type': 'Question', name: 'What if I missed the 1-year appeal deadline?', acceptedAnswer: { '@type': 'Answer', text: 'You can still file a Supplemental Claim, but the effective date will be the new filing date instead of the original. For obvious legal errors in the original decision, you can also file a Clear and Unmistakable Error (CUE) motion at any time.' } },
      { '@type': 'Question', name: 'Should I pay a lawyer or company to handle my appeal?', acceptedAnswer: { '@type': 'Answer', text: 'No, in most cases. Veterans Service Organizations like DAV, VFW, and American Legion handle VA appeals at no charge. For complex Board or CAVC appeals, NVLSP\u2019s Lawyers Serving Warriors and the Veterans Pro Bono Project offer free representation. Beware "claim shark" companies — they are illegal for initial claims and often charge predatory percentages of back pay.' } }
    ]
  };
  const breadcrumbLd = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `https://${CONFIG.publication.domain}/` },
      { '@type': 'ListItem', position: 2, name: 'Tools', item: `https://${CONFIG.publication.domain}/tools` },
      { '@type': 'ListItem', position: 3, name: 'VA Appeals', item: `https://${CONFIG.publication.domain}/va-appeals` }
    ]
  };

  return new Response(shellPage({
    title: 'VA Appeals Guide — HLR, Supplemental, Board — Veteran News',
    description: 'How to appeal a VA disability decision. The three AMA lanes (Higher-Level Review, Supplemental, Board), the 1-year deadline, effective dates, and the free help that wins cases.',
    canonicalPath: '/va-appeals',
    navActive: '',
    contentHtml: content,
    extraHead: `<script type="application/ld+json">${JSON.stringify([faqLd, breadcrumbLd])}</script>`
  }), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}

// ── VA Home Loan Guide ───────────────────────────────────────────────────
async function serveHomeLoanPage(env, url, request) {
  const content = `
    <section class="page-hero">
      <div class="container-narrow">
        <div class="eyebrow">VA Home Loan</div>
        <h1 class="page-title">$0 down. No PMI. The benefit you've already earned.</h1>
        <p class="page-lede">The VA Home Loan is one of the most valuable benefits in the entire military toolkit — competitive rates, no down payment, no private mortgage insurance, and lifelong reusability. Here's how it actually works.</p>
      </div>
    </section>
    <div class="container-narrow">
      <article class="story-body">
        <h2>Why it matters</h2>
        <p>A VA-backed loan isn't issued by the VA — it's issued by a private lender, with the VA guaranteeing 25% of the loan amount. That guarantee is why lenders skip the down payment and PMI, often offer below-market rates, and have lighter credit thresholds than conventional loans.</p>

        <h2>The benefits at a glance</h2>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li style="margin-bottom:.5em;"><strong>$0 down payment</strong> in most cases — no county loan limits since 2020 for full-entitlement vets</li>
          <li style="margin-bottom:.5em;"><strong>No PMI</strong> — saves you ~0.5–1% of the loan annually for the life of the loan</li>
          <li style="margin-bottom:.5em;"><strong>Competitive interest rates</strong> — usually 0.25–0.5% lower than conventional</li>
          <li style="margin-bottom:.5em;"><strong>Limited closing costs</strong> — VA caps what you can be charged; sellers can pay them</li>
          <li style="margin-bottom:.5em;"><strong>Reusable for life</strong> — pay it off, sell, and use it again</li>
          <li style="margin-bottom:.5em;"><strong>Funding fee waived</strong> if 10%+ service-connected disabled, or for surviving spouses receiving DIC</li>
          <li style="margin-bottom:.5em;"><strong>Easier credit</strong> — most lenders accept FICO scores in the 580-620 range</li>
        </ul>

        <h2>Who qualifies</h2>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li><strong>Veterans</strong> with 90 days continuous service in wartime, or 181 days peacetime, or 6 years in Reserves/Guard with honorable discharge (varies)</li>
          <li><strong>Active duty</strong> after 90 days of continuous service</li>
          <li><strong>Surviving spouses</strong> of service members who died in the line of duty or from service-connected conditions, or who were 100% P&amp;T disabled</li>
        </ul>
        <p>Even an OTH discharge may qualify — request a Character of Discharge determination from the VA. <a href="/discharge-upgrade">See discharge upgrade options.</a></p>

        <h2>Step-by-step</h2>
        <ol style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li style="margin-bottom:.75em;"><strong>Get your Certificate of Eligibility (COE).</strong> Request through VA.gov, your lender, or by mailing VA Form 26-1880. Most lenders pull it instantly.</li>
          <li style="margin-bottom:.75em;"><strong>Pre-approval</strong> from a VA-savvy lender. Not all lenders have VA expertise — ask how many VA loans they close per year. Veterans United, Navy Federal, USAA, and Penny Mac are common starting points but rates vary; shop 3-5 lenders.</li>
          <li style="margin-bottom:.75em;"><strong>Find a VA-friendly real estate agent.</strong> Some agents discriminate against VA buyers because they assume slow closings or seller-paid costs. Get one who has done it before.</li>
          <li style="margin-bottom:.75em;"><strong>Make an offer.</strong> Houses must pass the VA appraisal — which checks Minimum Property Requirements (no lead paint, working systems, etc.).</li>
          <li style="margin-bottom:.75em;"><strong>VA appraisal</strong> happens. Lower than expected? You can re-negotiate, request a Reconsideration of Value (ROV), or pay the difference in cash.</li>
          <li style="margin-bottom:.75em;"><strong>Close.</strong> Most VA loans close in 30-45 days, on par with conventional.</li>
        </ol>

        <h2>The funding fee — what it is, who pays</h2>
        <p>The funding fee is the VA's way of keeping the program self-funded. It's a one-time fee rolled into the loan (you don't pay cash at close).</p>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li>First-time use, $0 down: <strong>2.15%</strong> regular, <strong>2.40%</strong> Reserves/Guard</li>
          <li>Subsequent use, $0 down: <strong>3.30%</strong></li>
          <li>5% down: drops to ~1.5–1.75%</li>
          <li>10%+ down: drops further</li>
          <li><strong>Waived</strong> for 10%+ service-connected disabled veterans and surviving spouses receiving DIC</li>
        </ul>

        <h2>Common myths debunked</h2>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li style="margin-bottom:.5em;"><strong>"VA loans take forever to close."</strong> Untrue — average 30-45 days, same as conventional.</li>
          <li style="margin-bottom:.5em;"><strong>"You can only buy single-family homes."</strong> 1-4 unit properties qualify if you live in one. Condos must be VA-approved.</li>
          <li style="margin-bottom:.5em;"><strong>"You can't refinance a VA loan."</strong> The IRRRL (Interest Rate Reduction Refinance Loan) and Cash-Out refinance are core features.</li>
          <li style="margin-bottom:.5em;"><strong>"You only get one VA loan."</strong> Reusable for life. Multiple at once is even possible with restored entitlement.</li>
          <li style="margin-bottom:.5em;"><strong>"You can't buy a fixer-upper."</strong> The VA Renovation Loan exists for moderate rehab; for major rehab, look at FHA 203(k) or conventional.</li>
        </ul>

        <h2>The IRRRL refinance — your secret weapon</h2>
        <p>If rates drop, the Interest Rate Reduction Refinance Loan lets you refinance with minimal paperwork — usually no appraisal, no income verification, low cost. Best move when rates fall significantly below your current rate.</p>

        <h2>State home loan programs that stack on top</h2>
        <p><strong>California (CalVet)</strong> and <strong>Oregon (ODVA)</strong> run their own state-level direct VA-style loan programs. <strong>Texas (VLB)</strong> offers below-market state loans for land purchases. Many other states offer first-time-homebuyer assistance for veterans on top of the federal VA loan.</p>

        <h2>If you've defaulted on a VA loan before</h2>
        <p>Lost a VA-backed home? You may still qualify for a new one. Restoration of entitlement is possible after foreclosure (with conditions) and especially common for surviving spouses or service members who lost the home due to deployment-related hardship.</p>

        <h2>Get help</h2>
        <div class="resource-grid">
          <a href="https://www.va.gov/housing-assistance/home-loans/" target="_blank" rel="noopener" class="resource-card featured">
            <h3>VA.gov — Home Loans</h3>
            <p>Official portal. Get your Certificate of Eligibility, find approved lenders, run the math.</p>
            <span class="resource-card-cta">va.gov →</span>
          </a>
          <a href="https://www.benefits.va.gov/HOMELOANS/coe.asp" target="_blank" rel="noopener" class="resource-card">
            <h3>Get your COE</h3>
            <p>Certificate of Eligibility — your golden ticket. Most lenders can pull it instantly.</p>
            <span class="resource-card-cta">Apply for COE →</span>
          </a>
          <a href="/state/ca" class="resource-card">
            <h3>State VA loan programs</h3>
            <p>CalVet, ODVA, and Texas VLB stack on top of the federal benefit.</p>
            <span class="resource-card-cta">/states →</span>
          </a>
          <a href="/scam-alerts" class="resource-card">
            <h3>Avoid VA loan scams</h3>
            <p>"VA-approved" lender scams, IRRRL churning, and predatory refinancing.</p>
            <span class="resource-card-cta">/scam-alerts →</span>
          </a>
        </div>
      </article>
    </div>`;

  const faqLd = {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'Do I really pay $0 down on a VA home loan?', acceptedAnswer: { '@type': 'Answer', text: 'In most cases, yes. The VA guarantees 25% of the loan to the lender, which is why most VA loans require no down payment. Closing costs may still apply, but sellers are allowed to pay them. There is also no private mortgage insurance (PMI) at any down-payment level.' } },
      { '@type': 'Question', name: 'What is the VA funding fee?', acceptedAnswer: { '@type': 'Answer', text: 'A one-time fee rolled into the loan that funds the VA loan program. For first-time use with no down payment, it is 2.15% (regular service) or 2.40% (Reserves/Guard). The fee drops with larger down payments and is waived for veterans rated 10% or more service-connected disabled and surviving spouses receiving DIC.' } },
      { '@type': 'Question', name: 'Can I use my VA loan more than once?', acceptedAnswer: { '@type': 'Answer', text: 'Yes. The VA home loan benefit is reusable for life. After paying off or selling a home, your entitlement is restored and you can use it again. With sufficient remaining entitlement, it is even possible to have two VA loans simultaneously.' } },
      { '@type': 'Question', name: 'What is an IRRRL?', acceptedAnswer: { '@type': 'Answer', text: 'The Interest Rate Reduction Refinance Loan lets you refinance an existing VA loan to a lower interest rate with minimal paperwork — usually no appraisal and no income verification. It is one of the simplest refinances in mortgage. Best when interest rates fall significantly below your current rate.' } },
      { '@type': 'Question', name: 'Can I buy a multi-family property with a VA loan?', acceptedAnswer: { '@type': 'Answer', text: 'Yes. VA loans can be used to buy 1-4 unit properties as long as you occupy one of the units as your primary residence. Condos must be on the VA-approved condo list.' } },
      { '@type': 'Question', name: 'Will a low VA appraisal kill my deal?', acceptedAnswer: { '@type': 'Answer', text: 'Not necessarily. You can negotiate the price down, request a Reconsideration of Value (ROV) with comparable sales evidence, ask the seller to make repairs to address Minimum Property Requirement issues, or pay the appraisal gap in cash. Many deals survive a low VA appraisal.' } },
      { '@type': 'Question', name: 'Can a surviving spouse use the VA home loan benefit?', acceptedAnswer: { '@type': 'Answer', text: 'Yes. Surviving spouses of service members who died in the line of duty or from service-connected conditions, or whose veteran was rated 100% permanent and total disabled, may qualify for the VA home loan benefit. The funding fee is also waived for these spouses.' } }
    ]
  };
  const breadcrumbLd = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `https://${CONFIG.publication.domain}/` },
      { '@type': 'ListItem', position: 2, name: 'Tools', item: `https://${CONFIG.publication.domain}/tools` },
      { '@type': 'ListItem', position: 3, name: 'VA Home Loan', item: `https://${CONFIG.publication.domain}/va-home-loan` }
    ]
  };

  return new Response(shellPage({
    title: 'VA Home Loan Guide — $0 Down, No PMI Explained — Veteran News',
    description: 'How the VA home loan actually works. $0 down, no PMI, the funding fee, COE, IRRRL refinance, who qualifies, and the myths that scare lenders away.',
    canonicalPath: '/va-home-loan',
    navActive: '',
    contentHtml: content,
    extraHead: `<script type="application/ld+json">${JSON.stringify([faqLd, breadcrumbLd])}</script>`
  }), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}

// ── VA Healthcare Enrollment ─────────────────────────────────────────────
async function serveVAHealthcarePage(env, url, request) {
  const content = `
    <section class="page-hero">
      <div class="container-narrow">
        <div class="eyebrow">VA Healthcare</div>
        <h1 class="page-title">If you served, you've earned care. Here's how to actually use it.</h1>
        <p class="page-lede">Enrollment is free, takes 30 minutes online, and unlocks lifetime access to VA medical centers, prescription coverage, mental health, dental (limited), and Community Care. Most veterans qualify but never enroll. This page fixes that.</p>
      </div>
    </section>
    <div class="container-narrow">
      <article class="story-body">
        <h2>Who qualifies</h2>
        <p>Most veterans who served on active duty and have an honorable, general, or under-honorable-conditions discharge qualify. Active duty must total 24 continuous months OR the full period for which you were called/ordered to active duty (some exceptions apply for medical or hardship discharges).</p>

        <h3>Reserves and Guard</h3>
        <p>Activated members of the Reserves or Guard who completed their full call-up period qualify. Title 10 federal activations count; some Title 32 activations also count.</p>

        <h3>Combat veterans (5-year window)</h3>
        <p>If you served in combat or a hazardous-duty area after 9/11, you get <strong>5 years of free VA healthcare</strong> after separation, in Priority Group 6 — <em>regardless of disability rating</em>. The clock starts at separation. Enroll while you can.</p>

        <h3>OTH and bad-paper discharges</h3>
        <p>You can still get care for service-connected mental health, substance use, and other conditions even with an OTH. Request a Character of Discharge determination. <a href="/discharge-upgrade">See discharge upgrade.</a></p>

        <h2>How to enroll — three options</h2>
        <ol style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li style="margin-bottom:.75em;"><strong>Online:</strong> <a href="https://www.va.gov/health-care/apply/application/introduction" target="_blank" rel="noopener">va.gov/health-care/apply</a>. Takes ~30 min. Have your DD-214 handy.</li>
          <li style="margin-bottom:.75em;"><strong>By phone:</strong> Call 1-877-222-VETS (8387). Mon-Fri 8am-8pm ET.</li>
          <li style="margin-bottom:.75em;"><strong>In person:</strong> Walk into any VA medical center or CBOC. The enrollment coordinator will help.</li>
        </ol>

        <h2>What's covered</h2>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li><strong>Primary care</strong> — annual physicals, preventive care</li>
          <li><strong>Specialty care</strong> — cardiology, orthopedics, dermatology, oncology, etc.</li>
          <li><strong>Mental health</strong> — therapy, medications, MST care, PTSD treatment</li>
          <li><strong>Prescriptions</strong> — most generic drugs free; brand-name copays based on priority group</li>
          <li><strong>Hospital and surgical care</strong></li>
          <li><strong>Hearing aids and prosthetics</strong></li>
          <li><strong>Limited dental</strong> (only for 100% disabled, former POWs, or recently discharged combat vets)</li>
          <li><strong>Limited vision</strong> (eye exams, glasses for service-connected vision issues)</li>
          <li><strong>Toxic Exposure Screening</strong> — every 5 years, free</li>
          <li><strong>Community Care</strong> — non-VA providers paid by VA when wait/distance criteria met</li>
        </ul>

        <h2>The 8 Priority Groups</h2>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li><strong>PG 1:</strong> 50%+ disabled, individually unemployable</li>
          <li><strong>PG 2:</strong> 30-40% disabled</li>
          <li><strong>PG 3:</strong> 10-20% disabled, former POWs, Purple Heart, MoH</li>
          <li><strong>PG 4:</strong> Catastrophically disabled (non-service-connected)</li>
          <li><strong>PG 5:</strong> Low income, no service-connection</li>
          <li><strong>PG 6:</strong> Combat veterans within 5 years post-separation; 0% service-connected</li>
          <li><strong>PG 7:</strong> Sub-threshold income with copay assistance</li>
          <li><strong>PG 8:</strong> Higher income; copays apply</li>
        </ul>
        <p>Lower priority group = lower or no copays. Higher priority group = copays for some services.</p>

        <h2>Community Care — when the VA can't see you fast enough</h2>
        <p>If the VA can't schedule you within <strong>20 days for primary care or mental health (28 days as of late 2024)</strong>, or you'd have to drive over <strong>30 minutes for primary care or 60 minutes for specialty</strong>, you qualify for Community Care — VA pays a non-VA provider.</p>
        <p>Ask your primary care provider for a Community Care referral. If you hit resistance, escalate to the medical center Patient Advocate.</p>

        <h2>Common pitfalls</h2>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li style="margin-bottom:.5em;"><strong>Not enrolling within the 5-year combat window.</strong> If you blow it, future enrollment depends on income or disability rating.</li>
          <li style="margin-bottom:.5em;"><strong>Not requesting a Toxic Exposure Screening.</strong> Free, every 5 years, foundational for PACT Act presumptive claims.</li>
          <li style="margin-bottom:.5em;"><strong>Letting "you don't qualify" be the final answer.</strong> The first call doesn't always get it right. Escalate, get a written denial, request a Character of Discharge determination if needed.</li>
          <li style="margin-bottom:.5em;"><strong>Not knowing about Community Care.</strong> If your local VA can't see you in time, you don't have to wait — you have rights.</li>
        </ul>

        <h2>Get help</h2>
        <div class="resource-grid">
          <a href="https://www.va.gov/health-care/apply/application/introduction" target="_blank" rel="noopener" class="resource-card featured">
            <h3>Apply on VA.gov</h3>
            <p>Official enrollment. ~30 minutes. Have DD-214, SSN, and bank account ready (for direct deposit if eligible).</p>
            <span class="resource-card-cta">Apply now →</span>
          </a>
          <a href="tel:18772228387" class="resource-card">
            <h3>Enrollment Hotline</h3>
            <p>1-877-222-VETS (8387). Mon-Fri 8am-8pm ET.</p>
            <span class="resource-card-cta">Call →</span>
          </a>
          <a href="/pact-act" class="resource-card">
            <h3>PACT Act presumptions</h3>
            <p>Newly covered conditions for burn pit, Agent Orange, and radiation exposure.</p>
            <span class="resource-card-cta">/pact-act →</span>
          </a>
          <a href="/mental-health" class="resource-card">
            <h3>Mental Health Navigator</h3>
            <p>VA mental health, Vet Centers, MST, and free non-VA options.</p>
            <span class="resource-card-cta">/mental-health →</span>
          </a>
        </div>
      </article>
    </div>`;

  const faqLd = {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'Who qualifies for VA healthcare?', acceptedAnswer: { '@type': 'Answer', text: 'Most veterans with an honorable, general, or under-honorable-conditions discharge who served at least 24 continuous months on active duty (or the full call-up period for activated Reserves/Guard) qualify. Combat veterans get 5 years of free VA healthcare after separation regardless of disability rating. Even some OTH veterans qualify for service-connected care.' } },
      { '@type': 'Question', name: 'How do I enroll in VA healthcare?', acceptedAnswer: { '@type': 'Answer', text: 'Apply online at va.gov/health-care/apply (about 30 minutes), call 1-877-222-VETS (8387), or walk into any VA medical center or CBOC. You need your DD-214 and SSN to enroll.' } },
      { '@type': 'Question', name: 'What is VA Community Care?', acceptedAnswer: { '@type': 'Answer', text: 'A program that pays a non-VA provider when the VA cannot see you within 20 days for primary care/mental health (28 days as of late 2024), or when the drive exceeds 30 minutes for primary care or 60 minutes for specialty care. Ask your primary care provider for a referral; escalate to the Patient Advocate if needed.' } },
      { '@type': 'Question', name: 'Does the VA cover dental care?', acceptedAnswer: { '@type': 'Answer', text: 'Limited. Routine VA dental coverage is generally only for veterans rated 100% service-connected disabled, former POWs, or recently discharged combat vets. Other veterans can use the VA Dental Insurance Program (VADIP) — discounted private dental insurance.' } },
      { '@type': 'Question', name: 'I served in combat — am I really entitled to 5 years of free VA care?', acceptedAnswer: { '@type': 'Answer', text: 'Yes. Combat veterans separated after 9/11 receive five years of free VA healthcare in Priority Group 6, regardless of disability rating. The clock starts at separation. After the 5-year window, eligibility is means-tested or based on rating.' } },
      { '@type': 'Question', name: 'What is the Priority Group system?', acceptedAnswer: { '@type': 'Answer', text: 'The VA places enrolled veterans into one of eight Priority Groups (PG 1 through PG 8) based on disability rating, income, special status (Purple Heart, MoH, POW), and other factors. Lower-numbered groups have lower or no copays for services; higher-numbered groups may have copays.' } }
    ]
  };
  const breadcrumbLd = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `https://${CONFIG.publication.domain}/` },
      { '@type': 'ListItem', position: 2, name: 'Health', item: `https://${CONFIG.publication.domain}/health` },
      { '@type': 'ListItem', position: 3, name: 'VA Healthcare', item: `https://${CONFIG.publication.domain}/va-healthcare` }
    ]
  };

  return new Response(shellPage({
    title: 'VA Healthcare Enrollment — Eligibility, Coverage & Community Care — Veteran News',
    description: 'How to enroll in VA healthcare, what\u2019s covered, the 8 Priority Groups, the 5-year combat window, and Community Care for non-VA providers when the VA cannot see you.',
    canonicalPath: '/va-healthcare',
    navActive: '',
    contentHtml: content,
    extraHead: `<script type="application/ld+json">${JSON.stringify([faqLd, breadcrumbLd])}</script>`
  }), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}

// ── Veteran Jobs / Employment ────────────────────────────────────────────
async function serveVeteranJobsPage(env, url, request) {
  const content = `
    <section class="page-hero">
      <div class="container-narrow">
        <div class="eyebrow">Veteran Employment</div>
        <h1 class="page-title">Translate the work. Land the job. Use what you've earned.</h1>
        <p class="page-lede">Hiring preference, vetted employers who actually deliver, federal vet preference, military-credential translation, and the support programs that move you from "looking" to "starting Monday."</p>
      </div>
    </section>
    <div class="container-narrow">
      <article class="story-body">
        <h2>Federal Civil Service — Vet Preference</h2>
        <p>If you served honorably, you get hiring preference for federal jobs. Two main tiers:</p>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li style="margin-bottom:.5em;"><strong>5-point preference</strong> — wartime service, campaign-medal recipients, post-9/11 service</li>
          <li style="margin-bottom:.5em;"><strong>10-point preference</strong> — service-connected disability rated 10%+, Purple Heart, certain spouses and unremarried widows</li>
        </ul>
        <p>You also have access to the <strong>VRA (Veterans Recruitment Appointment)</strong> non-competitive hiring authority, the <strong>VEOA</strong> for veterans with 3+ years of substantially continuous service, and <strong>30% Disabled Veteran Authority</strong>.</p>
        <p>Apply at <a href="https://www.usajobs.gov" target="_blank" rel="noopener">USAJOBS.gov</a> with the <strong>SF-15</strong> for 10-point preference and your DD-214.</p>

        <h2>SkillBridge — for those still in</h2>
        <p>Last 180 days of active duty interning at a civilian employer while still drawing military pay. Apply 6-12 months before your separation date. <a href="/transition-guide">See full transition guide.</a></p>

        <h2>VR&amp;E (Chapter 31) — career retraining</h2>
        <p>If you have a service-connected disability and an "employment handicap," <strong>VR&amp;E pays for retraining, education, and job placement</strong>. Often more generous than the GI Bill for vets pivoting due to injury.</p>
        <p>Five tracks: re-employment, rapid access to employment, self-employment, employment through long-term services, and independent living. Apply through VA.gov.</p>

        <h2>USERRA — your old job is protected</h2>
        <p>If you were activated from a civilian job, the <strong>Uniformed Services Employment and Reemployment Rights Act</strong> requires your employer to give you your old job back (or one of like seniority and status), with all the raises and pension contributions you would have earned during deployment.</p>
        <p>If your employer pushes back: ESGR (Employer Support of the Guard and Reserve) mediates for free at <strong>1-800-336-4590</strong>.</p>

        <h2>Translate your MOS to civilian</h2>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li style="margin-bottom:.5em;"><strong>COOL</strong> (Credentialing Opportunities On-Line) — official DoD tool that maps your MOS to civilian licenses and certifications, with funding</li>
          <li style="margin-bottom:.5em;"><strong>Hiring Our Heroes</strong> — Chamber of Commerce program with vetted employers and military-spouse track</li>
          <li style="margin-bottom:.5em;"><strong>O*NET Military Crosswalk</strong> — free MOS-to-civilian-occupation translator</li>
        </ul>

        <h2>Vetted job boards (not the spammy ones)</h2>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li><a href="https://www.fedshirevets.gov/" target="_blank" rel="noopener">FedsHireVets</a> — federal jobs targeted at vets</li>
          <li><a href="https://recruitmilitary.com/" target="_blank" rel="noopener">RecruitMilitary</a> — military-friendly job board with hiring fairs</li>
          <li><a href="https://www.hiringourheroes.org/" target="_blank" rel="noopener">Hiring Our Heroes</a> — Chamber of Commerce, vetted employers</li>
          <li><a href="https://www.veteranowned.com/" target="_blank" rel="noopener">VeteranOwned.com</a> — focused on veteran-owned businesses</li>
          <li><a href="https://www.fourblock.org/" target="_blank" rel="noopener">FourBlock</a> — career readiness program at major universities</li>
          <li><a href="https://americancorporatepartners.org/" target="_blank" rel="noopener">American Corporate Partners (ACP)</a> — free 1-on-1 mentorship with executives at Fortune 500 companies</li>
        </ul>

        <h2>Self-employment and entrepreneurship</h2>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li><strong>Boots to Business</strong> — free SBA program for transitioning service members</li>
          <li><strong>Boots to Business Reboot</strong> — same program for veterans, spouses, and Guard/Reserve members no longer on active duty</li>
          <li><strong>Veterans Business Outreach Centers (VBOC)</strong> — local SBA-funded business advisors</li>
          <li><strong>VetFran</strong> — franchise discount program (300+ brands)</li>
          <li><strong>SBA Veteran Loan Programs</strong> — reduced fees, dedicated outreach</li>
          <li><strong>Vet-Owned Set-Aside</strong> — federal contracts reserved for service-disabled veteran-owned small businesses (SDVOSB)</li>
        </ul>

        <h2>Wage replacement during job search</h2>
        <p><strong>Unemployment Compensation for Ex-Servicemembers (UCX)</strong> — recently separated vets may qualify for state unemployment benefits funded by the federal government. Contact your state unemployment office; they administer.</p>

        <h2>If discrimination is in play</h2>
        <p>USERRA, ADA, and the Vietnam Era Veterans' Readjustment Assistance Act prohibit discrimination based on military service. <strong>VETS Service Center</strong> at the Department of Labor handles complaints — 1-866-4-USA-DOL.</p>

        <h2>Get help</h2>
        <div class="resource-grid">
          <a href="https://www.usajobs.gov/" target="_blank" rel="noopener" class="resource-card featured">
            <h3>USAJOBS.gov</h3>
            <p>Federal job portal. Filter by veteran preference. Upload SF-15 for 10-point preference.</p>
            <span class="resource-card-cta">usajobs.gov →</span>
          </a>
          <a href="https://www.va.gov/careers-employment/vocational-rehabilitation/" target="_blank" rel="noopener" class="resource-card">
            <h3>VR&amp;E (Chapter 31)</h3>
            <p>Free retraining and job placement for vets with service-connected disabilities and employment handicaps.</p>
            <span class="resource-card-cta">va.gov/vre →</span>
          </a>
          <a href="https://www.cool.osd.mil/" target="_blank" rel="noopener" class="resource-card">
            <h3>COOL — Credentialing</h3>
            <p>Map your MOS to civilian licenses and certifications, with funding.</p>
            <span class="resource-card-cta">cool.osd.mil →</span>
          </a>
          <a href="https://www.dol.gov/agencies/vets" target="_blank" rel="noopener" class="resource-card">
            <h3>DOL — VETS</h3>
            <p>USERRA enforcement, employment statistics, and grant programs for veteran employment.</p>
            <span class="resource-card-cta">dol.gov/vets →</span>
          </a>
        </div>

        <p style="margin-top:var(--s-7);">
          <a href="/topic/veteran-employment" class="btn btn-secondary">Latest veteran employment news →</a>
        </p>
      </article>
    </div>`;

  const faqLd = {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'What is veterans\u2019 preference for federal jobs?', acceptedAnswer: { '@type': 'Answer', text: 'Honorably discharged veterans are entitled to either 5-point or 10-point preference when applying for federal civil service jobs. 5-point preference covers wartime service, campaign-medal recipients, and post-9/11 service. 10-point preference covers veterans with a service-connected disability of 10% or more, Purple Heart recipients, and certain spouses or surviving spouses. Apply on USAJOBS.gov with your DD-214 and SF-15 for 10-point preference.' } },
      { '@type': 'Question', name: 'What is VR&E (Chapter 31)?', acceptedAnswer: { '@type': 'Answer', text: 'Veteran Readiness and Employment (VR&E), or "Chapter 31," provides retraining, education, certification, and job placement for veterans with service-connected disabilities and an employment handicap. It is often more generous than the GI Bill for veterans who need to change careers due to injury.' } },
      { '@type': 'Question', name: 'What does USERRA do?', acceptedAnswer: { '@type': 'Answer', text: 'The Uniformed Services Employment and Reemployment Rights Act requires civilian employers to give activated service members their old jobs back — or jobs of like seniority, status, and pay — when they return from military duty, including all raises and pension contributions they would have earned. ESGR mediates disputes for free at 1-800-336-4590.' } },
      { '@type': 'Question', name: 'How do I translate my MOS into civilian jobs?', acceptedAnswer: { '@type': 'Answer', text: 'Use COOL (Credentialing Opportunities On-Line) at cool.osd.mil — the official DoD tool that maps every MOS to civilian licenses and certifications, often with funding to help you earn them. The O*NET Military Crosswalk and the Hiring Our Heroes program also offer translation tools.' } },
      { '@type': 'Question', name: 'Can I collect unemployment as a recently separated veteran?', acceptedAnswer: { '@type': 'Answer', text: 'Yes. Unemployment Compensation for Ex-Servicemembers (UCX) provides state-administered, federally-funded unemployment benefits to recently separated veterans. Apply through your state unemployment office. Eligibility and amount depend on the state.' } }
    ]
  };
  const breadcrumbLd = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `https://${CONFIG.publication.domain}/` },
      { '@type': 'ListItem', position: 2, name: 'Transition', item: `https://${CONFIG.publication.domain}/transition` },
      { '@type': 'ListItem', position: 3, name: 'Veteran Jobs', item: `https://${CONFIG.publication.domain}/veteran-jobs` }
    ]
  };

  return new Response(shellPage({
    title: 'Veteran Jobs Guide — Vet Preference, VR&E, USERRA & More — Veteran News',
    description: 'Federal civil service vet preference, VR&E retraining, USERRA reemployment rights, MOS translation, vetted job boards, and the entrepreneurship paths that actually work.',
    canonicalPath: '/veteran-jobs',
    navActive: '',
    contentHtml: content,
    extraHead: `<script type="application/ld+json">${JSON.stringify([faqLd, breadcrumbLd])}</script>`
  }), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}

// ── Military Spouses Navigator ───────────────────────────────────────────
async function serveSpousesPage(env, url, request) {
  const content = `
    <section class="page-hero">
      <div class="container-narrow">
        <div class="eyebrow">Military Spouses</div>
        <h1 class="page-title">You hold the home line. Here's what's actually available.</h1>
        <p class="page-lede">Education benefits, employment programs, healthcare, mental-health support, and emergency assistance — designed specifically for military spouses and partners. Most go unused because no one tells you.</p>
      </div>
    </section>
    <div class="container-narrow">
      <article class="story-body">
        <h2>Career and education</h2>

        <h3>MyCAA — up to $4,000 for licensure</h3>
        <p>The <strong>Military Spouse Career Advancement Account</strong> covers up to $4,000 (over 3 years) toward licenses, certifications, or associate degrees in a portable career field. Eligible: spouses of active duty E-1 to E-6, W-1 to W-2, and O-1 to O-3.</p>
        <p>Apply at <a href="https://mycaa.militaryonesource.mil/" target="_blank" rel="noopener">mycaa.militaryonesource.mil</a>. Process takes about a week.</p>

        <h3>GI Bill transfer</h3>
        <p>If your service member has 6+ years and commits to 4 more, they can transfer Post-9/11 GI Bill benefits to you. <strong>This must happen while they're still on active duty.</strong> Once they separate, transfer is impossible. <a href="/gi-bill">See full GI Bill guide.</a></p>

        <h3>Spouse Education and Career Opportunities (SECO)</h3>
        <p>Free career coaching, resume help, interview prep, and access to job postings — through <strong>Military OneSource</strong>. 1-800-342-9647.</p>

        <h3>Survivor and dependent education benefits</h3>
        <p>If your service member dies in line of duty or from service-connected causes, the <strong>Fry Scholarship</strong> (post-9/11 deaths) or <strong>Chapter 35 DEA</strong> covers up to 36 months of education. <a href="/survivor-benefits">See survivor benefits.</a></p>

        <h2>Employment</h2>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li style="margin-bottom:.5em;"><strong>Military Spouse Employment Partnership (MSEP)</strong> — 600+ partner employers committed to recruiting, hiring, and retaining military spouses</li>
          <li style="margin-bottom:.5em;"><strong>Hiring Our Heroes</strong> — Chamber of Commerce program with a dedicated military spouse track</li>
          <li style="margin-bottom:.5em;"><strong>USAJOBS spouse preference</strong> — non-competitive federal hiring authority for spouses of active duty (Executive Order 13473)</li>
          <li style="margin-bottom:.5em;"><strong>State licensure portability</strong> — 2024 federal law (Servicemembers Civil Relief Act expansion) requires states to recognize out-of-state professional licenses for military spouses during PCS</li>
        </ul>

        <h2>Healthcare</h2>
        <p><strong>TRICARE</strong> — you're covered as a dependent while your service member is on active duty, plus 30 days after separation under TRICARE. Retirees can keep TRICARE for life with the Survivor Benefit Plan election.</p>
        <p><strong>CHCBP</strong> — Continued Healthcare Benefit Program. 18-36 months of TRICARE-like coverage post-separation. Buy within 60 days.</p>
        <p><strong>CHAMPVA</strong> — for spouses of veterans rated 100% P&T disabled or who died from service-connected causes. Free comprehensive healthcare. <a href="/survivor-benefits">More on CHAMPVA.</a></p>

        <h2>Mental health</h2>
        <p>Military spouses are at elevated risk for depression, anxiety, and isolation — especially during deployments. Available support:</p>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li><strong>Vet Centers</strong> — yes, military spouses qualify for <a href="/mental-health">free Vet Center counseling</a>. No appointment, no paperwork.</li>
          <li><strong>Military OneSource</strong> — up to 12 free counseling sessions per issue, no diagnosis required. 1-800-342-9647.</li>
          <li><strong>Give an Hour</strong> — free counseling for military families.</li>
          <li><strong>Cohen Veterans Network</strong> — free or low-cost, family-inclusive.</li>
          <li><strong>Wounded Warrior Project</strong> — Family Programs and peer support.</li>
        </ul>

        <h2>Caregiving</h2>
        <p>If your service member has a serious service-connected injury, you may qualify for the <strong>PCAFC stipend</strong> — monthly pay, mental-health support, training, respite care, and CHAMPVA-style health coverage. <a href="/caregivers">See caregiver guide.</a></p>

        <h2>Emergency assistance</h2>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li><strong>Branch Aid Societies</strong> — Army Emergency Relief, Navy-Marine Corps Relief, Air Force Aid Society, Coast Guard Mutual Assistance. Interest-free loans, grants, and budget counseling.</li>
          <li><strong>Operation Homefront</strong> — emergency financial assistance for active-duty and veteran families</li>
          <li><strong>Warriors Fund</strong> — direct financial assistance during transition or hardship</li>
          <li><strong>Modest Needs</strong> — short-term emergency grants for working military families</li>
        </ul>

        <h2>Housing during PCS</h2>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li><strong>BAH</strong> — non-taxable housing allowance. Find your rate at <a href="https://www.defensetravel.dod.mil/site/bah.cfm" target="_blank" rel="noopener">defensetravel.dod.mil</a>.</li>
          <li><strong>VA Home Loan</strong> — usable on PCS purchases. <a href="/va-home-loan">Full guide.</a></li>
          <li><strong>Military OneSource Plan My Move</strong> — checklist generator for every PCS phase</li>
          <li><strong>SCRA</strong> — Servicemembers Civil Relief Act lets you break a lease without penalty when PCSing</li>
        </ul>

        <h2>Survivor &amp; family programs</h2>
        <p>If the worst happens, <a href="/survivor-benefits">survivor benefits</a> are extensive — DIC, CHAMPVA, Fry Scholarship, Survivor Benefit Plan, burial benefits. <strong>TAPS</strong> (1-800-959-TAPS) is the first call.</p>

        <h2>If your relationship is in crisis</h2>
        <p>The military lifestyle puts unique stress on relationships. Free, confidential help:</p>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li><strong>Military and Family Life Counseling (MFLC)</strong> — free, confidential, on most installations. Not in your medical record.</li>
          <li><strong>Military OneSource</strong> — couples counseling, parenting support.</li>
          <li><strong>National Domestic Violence Hotline</strong> — 1-800-799-7233. Military-specific advocates available.</li>
        </ul>

        <h2>Get help</h2>
        <div class="resource-grid">
          <a href="tel:18003429647" class="resource-card featured">
            <h3>Military OneSource</h3>
            <p>1-800-342-9647. 24/7. Free counseling, education, employment, taxes, financial — all of it.</p>
            <span class="resource-card-cta">Call →</span>
          </a>
          <a href="https://mycaa.militaryonesource.mil/" target="_blank" rel="noopener" class="resource-card">
            <h3>MyCAA</h3>
            <p>Up to $4,000 for licenses, certifications, or associate degrees in portable career fields.</p>
            <span class="resource-card-cta">Apply →</span>
          </a>
          <a href="https://msepjobs.militaryonesource.mil/msep/" target="_blank" rel="noopener" class="resource-card">
            <h3>MSEP Job Search</h3>
            <p>Search 600+ partner employers committed to hiring military spouses.</p>
            <span class="resource-card-cta">Search jobs →</span>
          </a>
          <a href="/caregivers" class="resource-card">
            <h3>Caregiver Guide</h3>
            <p>PCAFC stipend, training, respite care, mental-health support.</p>
            <span class="resource-card-cta">/caregivers →</span>
          </a>
        </div>
      </article>
    </div>`;

  const faqLd = {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'What is MyCAA?', acceptedAnswer: { '@type': 'Answer', text: 'The Military Spouse Career Advancement Account covers up to $4,000 (over 3 years) toward licenses, certifications, and associate degrees in portable career fields. Eligible: spouses of active duty members in pay grades E-1 to E-6, W-1 to W-2, and O-1 to O-3. Apply at mycaa.militaryonesource.mil.' } },
      { '@type': 'Question', name: 'Can I use my service member\u2019s GI Bill as a spouse?', acceptedAnswer: { '@type': 'Answer', text: 'Yes, if they transfer it. The Post-9/11 GI Bill is transferable to a spouse or dependents while the service member is still on active duty with at least 6 years of service and a 4-year additional service obligation. Once the service member separates, transfer is impossible. Plan ahead.' } },
      { '@type': 'Question', name: 'Are military spouses eligible for Vet Center counseling?', acceptedAnswer: { '@type': 'Answer', text: 'Yes. Vet Centers serve combat veterans, MST survivors, drone crews, and family members of these groups. Counseling is free, confidential, and not shared with the VA disability claims system unless you authorize it.' } },
      { '@type': 'Question', name: 'How does TRICARE work for military spouses after separation?', acceptedAnswer: { '@type': 'Answer', text: 'You\u2019re covered as a dependent during active duty, plus 30 days after separation. After that, the Continued Healthcare Benefit Program (CHCBP) provides 18-36 months of TRICARE-like coverage if purchased within 60 days. Spouses of veterans 100% P&T disabled or who died from service-connected causes may qualify for free CHAMPVA.' } },
      { '@type': 'Question', name: 'What employment help is available for military spouses?', acceptedAnswer: { '@type': 'Answer', text: 'The Military Spouse Employment Partnership (MSEP) connects spouses with 600+ committed employers. USAJOBS offers spouse preference (non-competitive federal hiring under EO 13473). Hiring Our Heroes runs a dedicated spouse track. State licensure portability laws now require states to recognize out-of-state professional licenses during PCS.' } },
      { '@type': 'Question', name: 'Can I break a lease without penalty if my service member PCSes?', acceptedAnswer: { '@type': 'Answer', text: 'Yes. The Servicemembers Civil Relief Act (SCRA) lets a service member terminate a residential lease without penalty after receiving PCS or deployment orders. The protection extends to the spouse named on the lease.' } }
    ]
  };
  const breadcrumbLd = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `https://${CONFIG.publication.domain}/` },
      { '@type': 'ListItem', position: 2, name: 'Family', item: `https://${CONFIG.publication.domain}/family` },
      { '@type': 'ListItem', position: 3, name: 'Military Spouses', item: `https://${CONFIG.publication.domain}/military-spouses` }
    ]
  };

  return new Response(shellPage({
    title: 'Military Spouse Navigator — MyCAA, GI Bill Transfer, MSEP & Mental Health — Veteran News',
    description: 'For military spouses. MyCAA up to $4,000, MSEP employer network, USAJOBS spouse preference, free Vet Center counseling, CHAMPVA, and emergency assistance.',
    canonicalPath: '/military-spouses',
    navActive: '',
    contentHtml: content,
    extraHead: `<script type="application/ld+json">${JSON.stringify([faqLd, breadcrumbLd])}</script>`
  }), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}

// ── VA Pension + Aid & Attendance ────────────────────────────────────────
async function serveVAPensionPage(env, url, request) {
  const content = `
    <section class="page-hero">
      <div class="container-narrow">
        <div class="eyebrow">VA Pension</div>
        <h1 class="page-title">If you're an older wartime veteran or surviving spouse — read this.</h1>
        <p class="page-lede">VA Pension and Aid &amp; Attendance can pay <strong>$1,500–$3,500+ per month</strong> tax-free, even if you have no service-connected disability. Most eligible veterans don't apply. This page explains what's on offer, who qualifies, and how to file without losing money to a "pension poacher."</p>
      </div>
    </section>
    <div class="container-narrow">
      <article class="story-body">
        <h2>What VA Pension actually is</h2>
        <p>A monthly tax-free payment to wartime veterans and surviving spouses who are <strong>low income</strong> and either <strong>over 65</strong> or <strong>permanently and totally disabled</strong>. It's separate from VA Disability Compensation — pension does NOT require a service-connected condition.</p>

        <h2>Three pension levels</h2>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li style="margin-bottom:.5em;"><strong>Basic Pension</strong> — for low-income wartime veterans 65+ or P&T disabled. ~$16,500/year (vet alone).</li>
          <li style="margin-bottom:.5em;"><strong>Housebound</strong> — adds an enhancement if you're substantially confined to home due to disability. ~$20,200/year.</li>
          <li style="margin-bottom:.5em;"><strong>Aid &amp; Attendance (A&amp;A)</strong> — adds the highest enhancement if you need help with activities of daily living (bathing, dressing, eating), or are bedridden, blind, or in a nursing home. <strong>~$28,300/year for a vet, ~$33,500/year if married, ~$18,200/year for a surviving spouse.</strong></li>
        </ul>
        <p>2025 maximums change annually — check VA.gov for current amounts.</p>

        <h2>Eligibility — the basics</h2>

        <h3>Service requirement</h3>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li>At least <strong>90 days of active service</strong> (or 24 continuous months if entered after 9/7/1980)</li>
          <li>At least <strong>1 day during a wartime period</strong>:
            <ul style="margin-top:.4em;">
              <li>WWII: Dec 7, 1941 – Dec 31, 1946</li>
              <li>Korean War: June 27, 1950 – Jan 31, 1955</li>
              <li>Vietnam: Aug 5, 1964 – May 7, 1975 (or Feb 28, 1961 if served in-country)</li>
              <li>Gulf War: Aug 2, 1990 – present (still considered a wartime period)</li>
            </ul>
          </li>
          <li>Discharge other than dishonorable</li>
        </ul>

        <h3>Income and net worth</h3>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li><strong>Net worth limit (2025):</strong> $159,240 (combined assets + countable annual income)</li>
          <li>Primary home, vehicle, and household goods <strong>do NOT count</strong> toward net worth</li>
          <li>Unreimbursed medical expenses (long-term care, in-home care, copays, prescriptions) <strong>reduce countable income</strong> — often dramatically</li>
        </ul>

        <h2>Aid &amp; Attendance — the underused enhancement</h2>
        <p>If you (or your spouse, or a surviving spouse) need help with at least <strong>two activities of daily living</strong> — bathing, dressing, eating, transferring, toileting, or medication management — you may qualify for A&amp;A.</p>
        <p>Common scenarios:</p>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li>You're paying for in-home care or assisted living</li>
          <li>You're in a nursing home or memory care facility</li>
          <li>You have severe vision loss (5/200 visual acuity or worse, both eyes)</li>
          <li>You're bedridden due to disability</li>
        </ul>
        <p><strong>Long-term care cost = countable medical expense.</strong> If you're paying $5,000/mo for assisted living, that essentially zeros your countable income for pension calculation, often unlocking the maximum benefit.</p>

        <h2>Surviving spouse benefits</h2>
        <p>Surviving spouses of wartime veterans may qualify for <strong>Survivors Pension</strong> (formerly "death pension") + Aid &amp; Attendance enhancement. This is separate from DIC and has different rules. Both can sometimes be received depending on circumstances.</p>
        <p>2025 rates: Survivors Pension alone ~$11,100/year; with Housebound ~$13,600; with A&amp;A ~$18,200.</p>

        <h2>How to apply</h2>
        <ol style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li style="margin-bottom:.75em;"><strong>Use a free VSO.</strong> DAV, VFW, American Legion, MOAA, AMVETS — they file pension claims at no cost. Pension claims are paperwork-heavy and a VSO knows the tricks (medical expense documentation, asset protection rules).</li>
          <li style="margin-bottom:.75em;"><strong>File VA Form 21P-527EZ</strong> for veterans, or VA Form 21P-534EZ for surviving spouses.</li>
          <li style="margin-bottom:.75em;"><strong>Document medical expenses meticulously.</strong> Every doctor visit, every prescription copay, every long-term care bill — these reduce countable income and unlock benefit.</li>
          <li style="margin-bottom:.75em;"><strong>Track effective date.</strong> Benefits are paid back to the month you filed an "intent to file" if claim is approved within 1 year.</li>
        </ol>

        <h2>Watch out — Pension Poaching</h2>
        <p><strong>This is one of the largest scams targeting elderly veterans.</strong> "Veteran consultants," "annuity advisors," and even some attorneys charge thousands of dollars to "structure your assets" so you qualify for VA Pension — usually by buying high-commission annuities or trusts that lock up your money for 5+ years and may actually trigger penalty periods.</p>
        <p>Red flags:</p>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li>Asking for money up front to "help you qualify" for VA Pension (illegal under federal law for initial claims)</li>
          <li>Pushing you to buy an annuity, life insurance, or trust before applying</li>
          <li>Promising guaranteed approval</li>
          <li>Free "VA benefit seminars" at retirement communities or assisted living facilities — often poaching dressed up as education</li>
        </ul>
        <p>Real help is free. <a href="/scam-alerts">See full scam alerts.</a></p>

        <h2>The 3-year lookback (asset transfers)</h2>
        <p>Since 2018, the VA looks back <strong>3 years</strong> at asset transfers. Giving away assets to qualify can trigger a <strong>5-year penalty period</strong> where you're ineligible. Plan with a real fee-only fiduciary, not a salesperson.</p>

        <h2>Get help</h2>
        <div class="resource-grid">
          <a href="https://www.va.gov/pension/" target="_blank" rel="noopener" class="resource-card featured">
            <h3>VA.gov — Pension</h3>
            <p>Official portal. Eligibility, current rates, application forms.</p>
            <span class="resource-card-cta">va.gov/pension →</span>
          </a>
          <a href="https://www.dav.org/find-your-local-office/" target="_blank" rel="noopener" class="resource-card">
            <h3>DAV — File pension claims free</h3>
            <p>Disabled American Veterans handles VA Pension and A&amp;A claims at no cost.</p>
            <span class="resource-card-cta">DAV office →</span>
          </a>
          <a href="https://www.legion.org/serviceofficers" target="_blank" rel="noopener" class="resource-card">
            <h3>American Legion</h3>
            <p>Local service officers in every state. Strong on pension claims for older veterans.</p>
            <span class="resource-card-cta">legion.org →</span>
          </a>
          <a href="/scam-alerts" class="resource-card">
            <h3>Pension Poaching Alert</h3>
            <p>What to watch for if someone offers to "help you qualify" for VA Pension.</p>
            <span class="resource-card-cta">/scam-alerts →</span>
          </a>
        </div>
      </article>
    </div>`;

  const faqLd = {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'What is VA Pension and how is it different from VA disability compensation?', acceptedAnswer: { '@type': 'Answer', text: 'VA Pension is a tax-free monthly benefit for low-income wartime veterans who are 65 or older, or permanently and totally disabled. It does not require a service-connected condition. VA Disability Compensation, by contrast, requires a service-connected disability rating. The two are separate programs and a veteran cannot collect both at the same time — VA pays whichever is greater.' } },
      { '@type': 'Question', name: 'What is Aid & Attendance?', acceptedAnswer: { '@type': 'Answer', text: 'Aid & Attendance (A&A) is a Pension enhancement for veterans or surviving spouses who need help with activities of daily living, are bedridden, are in a nursing home, or have severe vision loss. In 2025, A&A maxes around $28,300/year for a veteran alone, $33,500/year for a married veteran, and $18,200/year for a surviving spouse — all tax-free.' } },
      { '@type': 'Question', name: 'Who is eligible for VA Pension?', acceptedAnswer: { '@type': 'Answer', text: 'A wartime veteran with at least 90 days active service (24 continuous months for post-9/7/1980 service) and one day during a wartime period (WWII, Korea, Vietnam, Gulf War). The veteran must be 65+ or permanently and totally disabled, with discharge other than dishonorable, and meet income and net-worth limits. The 2025 net-worth limit is $159,240, excluding primary home, vehicle, and household goods.' } },
      { '@type': 'Question', name: 'How does long-term care affect VA Pension eligibility?', acceptedAnswer: { '@type': 'Answer', text: 'Long-term care costs — assisted living, nursing home, memory care, in-home care — count as unreimbursed medical expenses that reduce countable income. A veteran paying $5,000/month for assisted living often has effectively zero countable income for pension calculation, unlocking the maximum benefit including Aid & Attendance.' } },
      { '@type': 'Question', name: 'What is pension poaching and how do I avoid it?', acceptedAnswer: { '@type': 'Answer', text: 'Pension poaching is a scam where "veteran consultants" or annuity salespeople charge fees to "structure your assets" so you qualify for VA Pension — often by selling commission-heavy annuities or trusts that lock up your money. Charging fees for help with initial VA claims is illegal under federal law. Use a free VSO instead. Watch out for "free VA benefit seminars" at retirement communities — often poaching in disguise.' } },
      { '@type': 'Question', name: 'Can a surviving spouse collect VA Pension?', acceptedAnswer: { '@type': 'Answer', text: 'Yes. The Survivors Pension (formerly "death pension") provides tax-free monthly income to low-income surviving spouses of wartime veterans. With Aid & Attendance enhancement, the 2025 max is around $18,200/year. This is separate from DIC, though both can sometimes be received depending on circumstances.' } }
    ]
  };
  const breadcrumbLd = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `https://${CONFIG.publication.domain}/` },
      { '@type': 'ListItem', position: 2, name: 'Tools', item: `https://${CONFIG.publication.domain}/tools` },
      { '@type': 'ListItem', position: 3, name: 'VA Pension', item: `https://${CONFIG.publication.domain}/va-pension` }
    ]
  };

  return new Response(shellPage({
    title: 'VA Pension Guide — Aid & Attendance for Wartime Veterans — Veteran News',
    description: 'Tax-free VA pension for low-income wartime veterans 65+ or disabled. Aid & Attendance can add thousands a month for assisted living, in-home care, or nursing-home costs.',
    canonicalPath: '/va-pension',
    navActive: '',
    contentHtml: content,
    extraHead: `<script type="application/ld+json">${JSON.stringify([faqLd, breadcrumbLd])}</script>`
  }), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}

// ── Veteran Discounts ────────────────────────────────────────────────────
async function serveDiscountsPage(env, url, request) {
  const content = `
    <section class="page-hero">
      <div class="container-narrow">
        <div class="eyebrow">Veteran Discounts</div>
        <h1 class="page-title">Discounts you've earned, by category.</h1>
        <p class="page-lede">A curated list of the most-used military and veteran discounts — verified, organized by category, and updated regularly. Most are year-round; the best deals stack on holidays (Memorial Day, July 4, Veterans Day).</p>
      </div>
    </section>
    <div class="container-narrow">
      <article class="story-body">
        <h2>How to verify (so retailers honor it)</h2>
        <p>Most retailers use one of three verification systems:</p>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li style="margin-bottom:.5em;"><strong>VA Health ID Card</strong> or <strong>VIC (Veteran Identification Card)</strong> — apply free at VA.gov</li>
          <li style="margin-bottom:.5em;"><strong>ID.me</strong> — used by Home Depot, Lowe's, Under Armour, etc. Free verification one-time</li>
          <li style="margin-bottom:.5em;"><strong>SheerID</strong> — used by Adobe, Apple Music, etc.</li>
          <li style="margin-bottom:.5em;"><strong>State driver's license with veteran designation</strong> — many states put a "VETERAN" mark on licenses</li>
          <li style="margin-bottom:.5em;"><strong>DD-214</strong> — old school but works at independent retailers</li>
          <li style="margin-bottom:.5em;"><strong>VetRewards card</strong> — by Vets Advantage</li>
        </ul>

        <h2>Travel</h2>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li><strong>Hotels:</strong> Hilton, Marriott, IHG, Hyatt, Wyndham, Choice — most offer 10–25% off via military rate. Always ask.</li>
          <li><strong>Car rentals:</strong> Hertz, Avis, Budget, Enterprise — military codes; up to 30% off plus age waiver for under-25 active duty</li>
          <li><strong>Airlines:</strong> No standing veteran discount, but Veterans Advantage offers United/Alaska deals; many airlines waive bag fees for active duty in uniform</li>
          <li><strong>Cruises:</strong> Royal Caribbean, Carnival, Norwegian — military rates significantly below public</li>
          <li><strong>National parks:</strong> Free lifetime access pass for veterans + Gold Star families (request at any NPS site)</li>
          <li><strong>Disney:</strong> Salute Tickets — heavily discounted multi-day passes for active duty + 100% disabled vets</li>
        </ul>

        <h2>Home improvement and tools</h2>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li><strong>Home Depot:</strong> 10% off, max $500/year for veterans; year-round for active duty/retirees + their spouses (verify via ID.me)</li>
          <li><strong>Lowe's:</strong> 10% off most items year-round (verify via ID.me or in-store)</li>
          <li><strong>Ace Hardware:</strong> Varies by store; many offer 10%</li>
          <li><strong>Tractor Supply:</strong> 10% off Memorial Day / July 4 / Veterans Day; ongoing for active duty</li>
        </ul>

        <h2>Auto and vehicle</h2>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li><strong>Ford / GM / Toyota / Hyundai / Subaru / Nissan / Mazda:</strong> $500–$1,000 military rebate on new vehicle purchase</li>
          <li><strong>Jeep / RAM / Dodge:</strong> Military bonus cash, often stackable with other rebates</li>
          <li><strong>Insurance:</strong> USAA, GEICO Military, Armed Forces Insurance — significantly below average rates</li>
          <li><strong>Tires:</strong> Goodyear Service, Discount Tire — small per-tire discount + free flat repair</li>
        </ul>

        <h2>Phone and internet</h2>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li><strong>Verizon:</strong> $25/line discount on unlimited plans for active duty, vets, Gold Star families</li>
          <li><strong>T-Mobile (Magenta Military):</strong> 50% off lines 2-6 for vets and active duty</li>
          <li><strong>AT&amp;T (Signature Program):</strong> 25% off unlimited plans</li>
          <li><strong>Spectrum:</strong> Discounts on internet for active duty + vets</li>
        </ul>

        <h2>Apparel and gear</h2>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li><strong>Under Armour, Nike, Adidas, Reebok:</strong> 10–20% off (online via ID.me/SheerID)</li>
          <li><strong>Columbia, North Face, Patagonia:</strong> 15–25% military discount</li>
          <li><strong>Carhartt:</strong> 25% off via ID.me</li>
          <li><strong>5.11 Tactical, Magpul, Vortex, Eberlestock:</strong> Military programs with significant discounts</li>
        </ul>

        <h2>Restaurants and food</h2>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li><strong>Veterans Day freebies:</strong> Chili's, Applebee's, Outback, Red Lobster, Cracker Barrel, Buffalo Wild Wings, Texas Roadhouse, IHOP, Denny's — free meal on Nov 11 with proof of service</li>
          <li><strong>Year-round:</strong> Chick-fil-A (varies), Dunkin' (most stores 10%), Buffalo Wild Wings (Tuesdays at participating)</li>
          <li><strong>Costco/Sam's Club:</strong> Discounted membership for military + vets</li>
        </ul>

        <h2>Streaming and tech</h2>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li><strong>Apple Music:</strong> 50% off (via ID.me)</li>
          <li><strong>Adobe Creative Cloud:</strong> 60% off for active duty/vets/spouses (via ID.me)</li>
          <li><strong>Spotify:</strong> Discount via Veterans Advantage</li>
          <li><strong>YouTube TV:</strong> Discount via SheerID military verification</li>
        </ul>

        <h2>Education</h2>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li><strong>LinkedIn Learning:</strong> 1 year free for veterans (via Veteran Workforce Initiative)</li>
          <li><strong>Coursera, edX, Udacity:</strong> Various military discounts and scholarships</li>
          <li><strong>Khan Academy:</strong> Free always</li>
          <li><strong>State colleges</strong> with veteran in-state tuition (immediate residency for GI Bill users in many states — see <a href="/states">your state</a>)</li>
        </ul>

        <h2>Financial</h2>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li><strong>USAA, Navy Federal Credit Union, Pentagon Federal:</strong> Lower fees, better rates, no minimum balances on most products</li>
          <li><strong>TurboTax:</strong> Free Federal + State for active duty; veterans Federal-free in many cases</li>
          <li><strong>H&amp;R Block:</strong> Discount for active duty</li>
        </ul>

        <h2>Be aware — discounts can be a vector for scams</h2>
        <p>"Free veteran benefit consultations," "exclusive military rates" promoted by phone, or "you've qualified for" emails are often pension poaching, identity theft, or annuity sales pitches. <a href="/scam-alerts">See scam alerts.</a></p>

        <h2>Resources that maintain updated lists</h2>
        <div class="resource-grid">
          <a href="https://www.military.com/discounts" target="_blank" rel="noopener" class="resource-card featured">
            <h3>Military.com Discount Guide</h3>
            <p>Continuously updated discount database, searchable by category.</p>
            <span class="resource-card-cta">military.com →</span>
          </a>
          <a href="https://www.veteransadvantage.com/" target="_blank" rel="noopener" class="resource-card">
            <h3>Veterans Advantage / VetRewards</h3>
            <p>Membership program that aggregates exclusive deals from major brands.</p>
            <span class="resource-card-cta">veteransadvantage.com →</span>
          </a>
          <a href="https://id.me/" target="_blank" rel="noopener" class="resource-card">
            <h3>ID.me — verify once, use everywhere</h3>
            <p>Free one-time verification used by Home Depot, Lowe's, Apple, Adobe, Under Armour and many more.</p>
            <span class="resource-card-cta">id.me →</span>
          </a>
          <a href="https://www.va.gov/records/get-veteran-id-cards/vic/" target="_blank" rel="noopener" class="resource-card">
            <h3>VA Veteran ID Card (VIC)</h3>
            <p>Free official ID card for honorably discharged veterans.</p>
            <span class="resource-card-cta">Apply →</span>
          </a>
        </div>
      </article>
    </div>`;

  const faqLd = {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'How do I prove I\u2019m a veteran for discounts?', acceptedAnswer: { '@type': 'Answer', text: 'Most retailers accept one of: a VA Health ID Card or Veteran ID Card (VIC), ID.me verification (used by Home Depot, Lowe\u2019s, Apple, Adobe, Under Armour and others), SheerID, a state driver\u2019s license with veteran designation, or a DD-214. ID.me is free and only takes one verification to use across many partners.' } },
      { '@type': 'Question', name: 'Do veterans get free national park access?', acceptedAnswer: { '@type': 'Answer', text: 'Yes. Veterans and Gold Star Family members receive free lifetime access to all National Parks, National Wildlife Refuges, and other federal recreation lands. Request the pass at any National Park Service entrance with proof of service (DD-214 or VHIC).' } },
      { '@type': 'Question', name: 'Which home improvement stores offer year-round veteran discounts?', acceptedAnswer: { '@type': 'Answer', text: 'Home Depot offers 10% off (capped at $500/year) for veterans; year-round for active duty, retirees, and their spouses, verified via ID.me. Lowe\u2019s offers 10% off most items year-round, also via ID.me. Both apply in-store and online.' } },
      { '@type': 'Question', name: 'What free meal deals do restaurants offer on Veterans Day?', acceptedAnswer: { '@type': 'Answer', text: 'Many chain restaurants offer free meals on November 11 with proof of service: Chili\u2019s, Applebee\u2019s, Outback Steakhouse, Red Lobster, Cracker Barrel, Buffalo Wild Wings, Texas Roadhouse, IHOP, and Denny\u2019s among them. Specific menus vary year to year.' } },
      { '@type': 'Question', name: 'Can military discounts be a scam vector?', acceptedAnswer: { '@type': 'Answer', text: 'Yes. "Free veteran benefit consultations," unsolicited "exclusive military rates" by phone or text, and "you\u2019ve qualified for" emails are often pension poaching, identity theft, or commission-driven annuity pitches. Verify offers directly with the named retailer or program. See our scam alerts page for red flags.' } }
    ]
  };
  const breadcrumbLd = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `https://${CONFIG.publication.domain}/` },
      { '@type': 'ListItem', position: 2, name: 'Tools', item: `https://${CONFIG.publication.domain}/tools` },
      { '@type': 'ListItem', position: 3, name: 'Veteran Discounts', item: `https://${CONFIG.publication.domain}/military-discounts` }
    ]
  };

  return new Response(shellPage({
    title: 'Veteran Discounts Guide — Travel, Home, Auto, Tech & More — Veteran News',
    description: 'Verified veteran and military discounts by category. How to verify (ID.me, VIC, SheerID), where to find current deals, and how to avoid discount-themed scams.',
    canonicalPath: '/military-discounts',
    navActive: '',
    contentHtml: content,
    extraHead: `<script type="application/ld+json">${JSON.stringify([faqLd, breadcrumbLd])}</script>`
  }), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}

// ── Guides Hub (flat index of all evergreen pillars) ─────────────────────
async function serveGuidesHubPage(env, url, request) {
  const groups = [
    {
      title: 'Get help right now',
      eyebrow: 'Crisis & Mental Health',
      cards: [
        { path: '/crisis', name: 'Crisis & 988 Navigator', desc: 'Veterans Crisis Line, multiple paths in, confidential support 24/7.' },
        { path: '/mental-health', name: 'Mental Health Navigator', desc: 'PTSD, MST, depression. Vet Centers, evidence-based therapy, free non-VA options.' },
        { path: '/buddy-check', name: 'Buddy Check', desc: '5-minute reach-out guide for friends and family worried about a veteran.' },
        { path: '/tbi', name: 'TBI Guide', desc: 'Severity, blast exposure, polytrauma care, and the PTSD overlap that gets veterans misdiagnosed.' }
      ]
    },
    {
      title: 'Disability & benefits',
      eyebrow: 'VA Money',
      cards: [
        { path: '/pact-act', name: 'PACT Act Guide', desc: 'Largest VA expansion in 50 years. Burn pits, Agent Orange, every covered condition.' },
        { path: '/va-disability', name: 'VA Disability Ratings', desc: 'How ratings work, the C&P exam, 2025 rate table, and how to file without paying a "claim shark."' },
        { path: '/tdiu', name: 'TDIU / Individual Unemployability', desc: 'How to get the 100% pay rate when service-connected disabilities prevent work.' },
        { path: '/va-appeals', name: 'VA Appeals Guide', desc: 'HLR, Supplemental Claim, Board Appeal. Pick the right lane and the 1-year deadline.' },
        { path: '/va-pension', name: 'VA Pension & Aid \u0026 Attendance', desc: 'Tax-free pension for low-income wartime vets 65+ or disabled.' },
        { path: '/military-retirement-pay', name: 'Military Retirement Pay', desc: 'Final Pay, High-3, BRS, Reserves, medical retirement, SBP, TSP rules.' },
        { path: '/claim-help', name: 'Claim Help Walkthrough', desc: '2-minute eligibility check that surfaces VA benefits you may not have filed for.' }
      ]
    },
    {
      title: 'Healthcare & education',
      eyebrow: 'Use What You\u2019ve Earned',
      cards: [
        { path: '/va-healthcare', name: 'VA Healthcare Enrollment', desc: 'Eligibility, the 8 priority groups, Community Care, and the 5-year combat window.' },
        { path: '/tricare', name: 'TRICARE Guide', desc: 'Prime, Select, TFL, TRS \u2014 the right plan, separation transitions, denials and appeals.' },
        { path: '/gi-bill', name: 'GI Bill Guide', desc: 'Post-9/11 vs. Montgomery, transferring to family, schools to avoid.' },
        { path: '/va-home-loan', name: 'VA Home Loan', desc: '$0 down, no PMI, COE, IRRRL refinance, funding fee waivers.' }
      ]
    },
    {
      title: 'Life situations',
      eyebrow: 'Transitions & Family',
      cards: [
        { path: '/transition-guide', name: 'Transition Playbook', desc: '9-step playbook for separating servicemembers. BDD, SkillBridge, GI Bill transfer.' },
        { path: '/discharge-upgrade', name: 'Discharge Upgrade', desc: 'OTH to honorable. Hagel/Kurta/Wilkie memos. Free legal help.' },
        { path: '/veteran-jobs', name: 'Veteran Jobs Guide', desc: 'Federal vet preference, VR&E, USERRA, MOS translation, vetted job boards.' },
        { path: '/military-spouses', name: 'Military Spouse Navigator', desc: 'MyCAA, MSEP, USAJOBS spouse preference, free counseling, CHAMPVA.' },
        { path: '/caregivers', name: 'Caregiver Guide', desc: 'PCAFC stipend, PGCSS, Veteran-Directed Care, respite, mental-health support.' },
        { path: '/women-veterans', name: 'Women Veterans Navigator', desc: 'VA women\u2019s health, MST for life, the 1-855-VA-WOMEN line, underclaimed disabilities.' },
        { path: '/homeless-veterans', name: 'Homeless Veteran Help', desc: 'HUD-VASH, SSVF, the 24/7 1-877-4AID-VET line. What to do tonight.' }
      ]
    },
    {
      title: 'For survivors & families',
      eyebrow: 'After Loss',
      cards: [
        { path: '/survivor-benefits', name: 'Survivor Benefits', desc: 'DIC, CHAMPVA, Fry Scholarship, Survivor Benefit Plan, TAPS first call.' },
        { path: '/military-funeral-honors', name: 'Funeral Honors & Burial', desc: 'Free national cemetery burial, military funeral honors, headstones, burial allowances.' }
      ]
    },
    {
      title: 'Stay safe & save money',
      eyebrow: 'Practical',
      cards: [
        { path: '/scam-alerts', name: 'Scam Alerts', desc: '12 frauds targeting veterans. Red flags and where to report.' },
        { path: '/military-discounts', name: 'Veteran Discounts', desc: 'Verified discounts by category: travel, home, auto, tech, food.' },
        { path: '/veteran-tax-benefits', name: 'Veteran Tax Benefits', desc: 'VA disability tax-free, state exemptions, CRSC/CRDP, free filing.' },
        { path: '/military-id', name: 'Veteran IDs Guide', desc: 'VHIC, VIC, state driver\u2019s license designation, REAL ID, replace DD-214.' }
      ]
    },
    {
      title: 'Local resources',
      eyebrow: 'By State',
      cards: [
        { path: '/states', name: 'All 50 States + DC', desc: 'State veterans department, hotline, and standout state-specific benefits for every state.' }
      ]
    }
  ];

  const groupsHtml = groups.map(g => `
    <section class="guides-group">
      <div class="guides-group-head">
        <div class="eyebrow">${escapeHtml(g.eyebrow)}</div>
        <h2>${escapeHtml(g.title)}</h2>
      </div>
      <div class="guides-grid">
        ${g.cards.map(c => `
          <a href="${c.path}" class="guides-card">
            <h3>${escapeHtml(c.name)}</h3>
            <p>${escapeHtml(c.desc)}</p>
            <span class="guides-card-cta">${escapeHtml(c.path)} →</span>
          </a>`).join('')}
      </div>
    </section>`).join('');

  const totalGuides = groups.reduce((sum, g) => sum + g.cards.length, 0);

  const content = `
    <section class="page-hero">
      <div class="container-narrow">
        <div class="eyebrow">All Guides</div>
        <h1 class="page-title">Plain-English veteran guides, all in one place.</h1>
        <p class="page-lede">${totalGuides} evergreen guides covering crisis, benefits, healthcare, education, transition, family, and more. Each one is built to help a real veteran take a real next step. Browse by category below.</p>
      </div>
    </section>
    <div class="container-narrow" style="padding-top:0;">
      ${groupsHtml}
      <div class="crisis-cta" style="margin-top:var(--s-9);">
        <div class="crisis-cta-eyebrow">Veterans Crisis Line</div>
        <h3>Free, confidential support — 24/7</h3>
        <div class="crisis-cta-actions">
          <a href="tel:988" class="btn btn-primary">Call 988 — Press 1</a>
          <a href="sms:838255" class="btn btn-secondary">Text 838255</a>
        </div>
      </div>
    </div>`;

  // ItemList JSON-LD with all guide URLs — gives Google a single rich list
  const baseUrl = `https://${CONFIG.publication.domain}`;
  const allCards = groups.flatMap(g => g.cards);
  const itemListLd = {
    '@context': 'https://schema.org', '@type': 'ItemList',
    name: 'Veteran News — All Guides',
    numberOfItems: allCards.length,
    itemListElement: allCards.map((c, i) => ({
      '@type': 'ListItem', position: i + 1, url: `${baseUrl}${c.path}`, name: c.name
    }))
  };
  const breadcrumbLd = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${baseUrl}/` },
      { '@type': 'ListItem', position: 2, name: 'All Guides', item: `${baseUrl}/guides` }
    ]
  };

  return new Response(shellPage({
    title: 'All Veteran Guides — Crisis, Benefits, Healthcare, Family — Veteran News',
    description: `Browse all ${totalGuides} plain-English guides covering crisis support, VA benefits, healthcare, education, transition, family, and life situations for U.S. veterans.`,
    canonicalPath: '/guides',
    navActive: '',
    contentHtml: content,
    extraHead: `<script type="application/ld+json">${JSON.stringify([itemListLd, breadcrumbLd])}</script>`
  }), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}

// ── TRICARE Navigator ────────────────────────────────────────────────────
async function serveTricarePage(env, url, request) {
  const content = `
    <section class="page-hero">
      <div class="container-narrow">
        <div class="eyebrow">TRICARE</div>
        <h1 class="page-title">TRICARE, in plain English.</h1>
        <p class="page-lede">TRICARE covers active duty, retirees, and most family members. Five plans, three regions, dozens of edge cases. This page tells you which plan fits and what to do at separation, retirement, and major life events.</p>
      </div>
    </section>
    <div class="container-narrow">
      <article class="story-body">
        <h2>The five major plans</h2>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li style="margin-bottom:.5em;"><strong>TRICARE Prime</strong> — HMO-style. Active duty MUST be on Prime; family members and retirees can opt in. Lowest cost, requires referrals through PCM.</li>
          <li style="margin-bottom:.5em;"><strong>TRICARE Select</strong> — PPO-style. See any TRICARE-authorized provider, no referrals. Higher costs but flexibility.</li>
          <li style="margin-bottom:.5em;"><strong>TRICARE for Life (TFL)</strong> — for Medicare-eligible retirees and dependents. Wraps around Medicare; you must enroll in Medicare Part A and B.</li>
          <li style="margin-bottom:.5em;"><strong>TRICARE Reserve Select (TRS)</strong> — for Selected Reserve members not on active orders. Premium-based, like a marketplace plan.</li>
          <li style="margin-bottom:.5em;"><strong>TRICARE Retired Reserve (TRR)</strong> — for "gray area" retired Reservists not yet eligible for retired pay (under 60).</li>
        </ul>

        <h2>Coverage at separation</h2>
        <p>Active duty separating without retirement: TRICARE ends within months of your last day. Two bridge options:</p>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li style="margin-bottom:.5em;"><strong>Transitional Assistance Management Program (TAMP)</strong> — 180 days of Prime/Select coverage at no cost for involuntary or stop-loss separations</li>
          <li style="margin-bottom:.5em;"><strong>Continued Health Care Benefit Program (CHCBP)</strong> — 18-36 months of TRICARE-like coverage. <strong>Buy within 60 days of separation.</strong> Premiums apply.</li>
        </ul>
        <p>Retirees keep TRICARE for life — Prime/Select before 65, TFL after.</p>

        <h2>Big life events that change your TRICARE</h2>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li><strong>PCS:</strong> Update DEERS within 30 days. Prime enrollees may need to re-enroll regionally.</li>
          <li><strong>Marriage:</strong> Add spouse in DEERS within 90 days for retroactive coverage.</li>
          <li><strong>New child:</strong> Add to DEERS within 90 days for retroactive coverage; enroll in Prime/Select if you want primary care assigned.</li>
          <li><strong>Divorce:</strong> Former spouse may keep TRICARE under 20/20/20 or 20/20/15 rules; otherwise CHCBP.</li>
          <li><strong>Retirement:</strong> Re-enroll within 90 days to avoid lapse.</li>
          <li><strong>Aging out at 26 (kids):</strong> Children lose TRICARE; may purchase TRICARE Young Adult through age 26.</li>
        </ul>

        <h2>Mental health under TRICARE</h2>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li>Same coverage as physical care</li>
          <li>No mental health <strong>visit limits</strong> as of 2017</li>
          <li>Telehealth covered for therapy</li>
          <li>Marriage counseling, family therapy, and substance use covered</li>
        </ul>

        <h2>Pharmacy</h2>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li>Military pharmacy: zero copay for formulary drugs</li>
          <li>TRICARE Mail Order: low cost for 90-day supplies</li>
          <li>Network retail pharmacy: small copay (varies by drug tier)</li>
          <li>Non-network: highest cost; usually avoid</li>
        </ul>

        <h2>Out-of-pocket costs by plan (2025 sample)</h2>
        <p>Costs change yearly; check TRICARE.mil for current numbers. Active duty pay nothing. Retirees and family members have:</p>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li><strong>Prime:</strong> $0–$25 copays for most visits, low annual catastrophic cap</li>
          <li><strong>Select:</strong> deductible + cost-share, no referrals</li>
          <li><strong>TFL:</strong> covers what Medicare doesn't; you pay Medicare premiums and TFL is free</li>
          <li><strong>TRS:</strong> monthly premium; competitive with marketplace plans</li>
        </ul>

        <h2>Common mistakes</h2>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li>Not updating DEERS after a life event — coverage interrupted</li>
          <li>Missing the 60-day CHCBP window after separation</li>
          <li>Not enrolling in Medicare Part B at 65 — you'll lose TFL eligibility</li>
          <li>Out-of-pocket purchase of branded drugs at network retail when MOP would cost less</li>
        </ul>

        <h2>If TRICARE denies a service</h2>
        <p>You can appeal at three levels: reconsideration by the regional contractor, formal review, and finally the TRICARE National Quality Monitoring Contractor. Your <a href="https://newgov.tricare.mil/Resources/AppealsAndHearings" target="_blank" rel="noopener">written denial letter</a> tells you which level applies.</p>

        <h2>Get help</h2>
        <div class="resource-grid">
          <a href="https://www.tricare.mil/" target="_blank" rel="noopener" class="resource-card featured">
            <h3>TRICARE.mil</h3>
            <p>Official portal: enrollment, plan comparison, regional contractor info, claims status.</p>
            <span class="resource-card-cta">tricare.mil →</span>
          </a>
          <a href="https://www.tricare.mil/About/Regions" target="_blank" rel="noopener" class="resource-card">
            <h3>Regional Contractors</h3>
            <p>East: HumanaMilitary. West: TriWest. Overseas: International SOS.</p>
            <span class="resource-card-cta">Find your region →</span>
          </a>
          <a href="https://milconnect.dmdc.osd.mil/" target="_blank" rel="noopener" class="resource-card">
            <h3>milConnect / DEERS</h3>
            <p>Update DEERS, verify eligibility, manage TRICARE enrollment.</p>
            <span class="resource-card-cta">milconnect →</span>
          </a>
          <a href="/transition-guide" class="resource-card">
            <h3>Transition Guide</h3>
            <p>What to do with TRICARE during separation, including TAMP and CHCBP windows.</p>
            <span class="resource-card-cta">/transition-guide →</span>
          </a>
        </div>
      </article>
    </div>`;

  const faqLd = {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'What is TRICARE?', acceptedAnswer: { '@type': 'Answer', text: 'TRICARE is the U.S. Department of Defense health program covering active duty service members, retirees, family members, and most National Guard and Reserve members. It includes five major plans: TRICARE Prime, TRICARE Select, TRICARE for Life (Medicare-eligible retirees), TRICARE Reserve Select, and TRICARE Retired Reserve.' } },
      { '@type': 'Question', name: 'What\u2019s the difference between TRICARE Prime and Select?', acceptedAnswer: { '@type': 'Answer', text: 'Prime is HMO-style: lower cost, primary care manager, referrals required for specialty care. Active duty must be on Prime. Select is PPO-style: higher cost-share, no referrals, see any TRICARE-authorized provider. Retirees and family members can choose either.' } },
      { '@type': 'Question', name: 'How long does TRICARE last after separation?', acceptedAnswer: { '@type': 'Answer', text: 'Active duty TRICARE ends within months of separation. The Transitional Assistance Management Program (TAMP) provides 180 days of free Prime/Select coverage for involuntary separations. The Continued Health Care Benefit Program (CHCBP) offers 18-36 months of TRICARE-like coverage for a premium — but you must purchase it within 60 days of separation.' } },
      { '@type': 'Question', name: 'How does TRICARE for Life work with Medicare?', acceptedAnswer: { '@type': 'Answer', text: 'TRICARE for Life (TFL) wraps around Medicare for retirees age 65 and older. You must be enrolled in both Medicare Part A and Part B. Medicare pays first, TFL pays the gap. TFL itself has no premium beyond Medicare\u2019s.' } },
      { '@type': 'Question', name: 'How do I add a new spouse or child to TRICARE?', acceptedAnswer: { '@type': 'Answer', text: 'Update DEERS within 90 days of the life event for retroactive coverage. Bring your marriage certificate or birth certificate to a RAPIDS site (most installation ID card offices), or use milConnect online for some updates. After DEERS, enroll the new dependent in Prime or Select via TRICARE.mil.' } },
      { '@type': 'Question', name: 'What if TRICARE denies coverage for a service?', acceptedAnswer: { '@type': 'Answer', text: 'Appeal at three levels: reconsideration by the regional contractor (HumanaMilitary East, TriWest West), formal review, and final review by the TRICARE National Quality Monitoring Contractor. Your written denial letter explains the level and deadline. Most denials should be appealed — many overturn on reconsideration.' } }
    ]
  };
  const breadcrumbLd = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `https://${CONFIG.publication.domain}/` },
      { '@type': 'ListItem', position: 2, name: 'Health', item: `https://${CONFIG.publication.domain}/health` },
      { '@type': 'ListItem', position: 3, name: 'TRICARE', item: `https://${CONFIG.publication.domain}/tricare` }
    ]
  };

  return new Response(shellPage({
    title: 'TRICARE Guide — Prime, Select, TFL, TRS Explained — Veteran News',
    description: 'TRICARE in plain English. The five plans, separation/retirement transitions, life-event updates, mental health coverage, and how to appeal a denial.',
    canonicalPath: '/tricare',
    navActive: '',
    contentHtml: content,
    extraHead: `<script type="application/ld+json">${JSON.stringify([faqLd, breadcrumbLd])}</script>`
  }), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}

// ── Military Funeral Honors & Burial Benefits ────────────────────────────
async function serveFuneralHonorsPage(env, url, request) {
  const content = `
    <section class="page-hero">
      <div class="container-narrow">
        <div class="eyebrow">Burial &amp; Funeral Honors</div>
        <h1 class="page-title">The honors your veteran earned. The benefits the family is owed.</h1>
        <p class="page-lede">Every honorably-discharged veteran is entitled to military funeral honors and a free national-cemetery burial. Most families don't know exactly what's available or how to request it. This page walks the entire process — calmly, in order.</p>
      </div>
    </section>
    <div class="container-narrow">
      <article class="story-body">
        <h2>If a veteran has just died — start here</h2>
        <p style="font-size:1.125rem;"><a href="tel:18005354025" class="btn btn-primary">National Cemetery Scheduling Office — 1-800-535-1117</a></p>
        <p>Open 24/7. Free. They schedule the burial, request the headstone, and coordinate honors. Your funeral director can call on your behalf.</p>

        <h2>Free at any national cemetery</h2>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li style="margin-bottom:.5em;"><strong>Gravesite</strong> in any of 155+ VA national cemeteries (with available space)</li>
          <li style="margin-bottom:.5em;"><strong>Opening and closing of the grave</strong></li>
          <li style="margin-bottom:.5em;"><strong>Vault or grave liner</strong></li>
          <li style="margin-bottom:.5em;"><strong>Headstone or marker</strong> (upright marble or flat granite/bronze)</li>
          <li style="margin-bottom:.5em;"><strong>Burial flag</strong> (pre-paid by VA, given to next of kin)</li>
          <li style="margin-bottom:.5em;"><strong>Presidential Memorial Certificate</strong> (signed certificate from the sitting president)</li>
          <li style="margin-bottom:.5em;"><strong>Perpetual care</strong> of the gravesite</li>
        </ul>

        <h2>Military funeral honors</h2>
        <p>Every eligible veteran is entitled to military funeral honors at no cost — including the playing of Taps and the folding and presentation of the U.S. flag.</p>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li><strong>Two-person honor detail</strong> minimum (one from the veteran's branch)</li>
          <li><strong>Live or recorded Taps</strong> (live availability varies by region)</li>
          <li><strong>Folding and presentation of the burial flag</strong> to next of kin</li>
          <li><strong>Three-volley salute</strong> when an honor guard with rifles is available</li>
        </ul>
        <p>Your funeral director arranges this through DD Form 2065 or by calling the appropriate branch's funeral honors coordinator. <a href="https://www.militaryonesource.mil/military-life-cycle/death-survivors/funeral-honors/" target="_blank" rel="noopener">More on Military OneSource</a>.</p>

        <h2>Burial allowances</h2>
        <p>For veterans whose family is paying for a private burial (not at a national cemetery), the VA offers limited reimbursement:</p>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li style="margin-bottom:.5em;"><strong>Service-connected death:</strong> up to ~$2,000 burial allowance + plot allowance + transportation</li>
          <li style="margin-bottom:.5em;"><strong>Non-service-connected death (VA hospital):</strong> ~$916 burial allowance + plot allowance</li>
          <li style="margin-bottom:.5em;"><strong>Non-service-connected death (other):</strong> ~$916 burial allowance + ~$916 plot allowance for low-income veterans</li>
        </ul>
        <p>File <a href="https://www.va.gov/burials-memorials/veterans-burial-allowance/" target="_blank" rel="noopener">VA Form 21P-530</a>. You have 2 years from burial to claim non-service-connected; no time limit for service-connected.</p>

        <h2>Eligibility</h2>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li>Veterans with discharge other than dishonorable — eligible for national cemetery burial</li>
          <li>Service members on active duty</li>
          <li>Reservists/Guard with 20+ qualifying years (or activated)</li>
          <li>Spouses, dependent children, and certain unmarried adult children — eligible to be buried with the veteran</li>
          <li>WWII Merchant Marines, certain civilian groups recognized for military service</li>
        </ul>

        <h2>State veteran cemeteries</h2>
        <p>Many states operate their own veteran cemeteries (often with similar benefits and easier proximity). Check your <a href="/states">state's veterans department page</a> for locations.</p>

        <h2>Cremation and inurnment</h2>
        <p>Cremated remains are eligible for inurnment at national cemeteries — same benefits as casket burial. Increasingly common as space pressures grow at older cemeteries.</p>

        <h2>Headstones, markers, and medallions</h2>
        <p>Upright marble headstone, flat granite, or flat bronze — your choice. The VA also provides a <strong>medallion</strong> (bronze, brass, or graphite) you can affix to a privately-purchased headstone if the veteran is buried in a private cemetery.</p>
        <p>The medallion is free, even decades after burial. <a href="https://www.va.gov/burials-memorials/headstones-markers-medallions/" target="_blank" rel="noopener">Order a medallion or headstone</a>.</p>

        <h2>Gold Star Family designations</h2>
        <p>If your service member died in active service, the family is entitled to:</p>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li>Gold Star Lapel Button (DoD)</li>
          <li>Gold Star Family License Plates in many states</li>
          <li>Gold Star Family Memorial Monuments at major military installations</li>
          <li>Surviving Spouse benefits like DIC and Fry Scholarship — see <a href="/survivor-benefits">survivor benefits</a></li>
        </ul>

        <h2>If the family is in financial hardship</h2>
        <p>Funeral costs are real. Resources for help:</p>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li><strong>TAPS</strong> — Tragedy Assistance Program for Survivors. 1-800-959-TAPS. Walks families through every benefit.</li>
          <li><strong>Branch Aid Societies</strong> — Army Emergency Relief, Navy-Marine Corps Relief, etc.</li>
          <li><strong>Warriors Fund</strong> — direct emergency assistance for families.</li>
          <li><strong>VA Burial Allowance</strong> — partial reimbursement (above)</li>
        </ul>

        <h2>Get help</h2>
        <div class="resource-grid">
          <a href="tel:18005354025" class="resource-card featured">
            <h3>National Cemetery Scheduling</h3>
            <p>1-800-535-1117. 24/7. They schedule burial, headstone, and coordinate honors.</p>
            <span class="resource-card-cta">Call →</span>
          </a>
          <a href="https://www.cem.va.gov/" target="_blank" rel="noopener" class="resource-card">
            <h3>VA National Cemetery</h3>
            <p>Find a cemetery, eligibility, headstones, and presidential memorial certificates.</p>
            <span class="resource-card-cta">cem.va.gov →</span>
          </a>
          <a href="tel:18009598277" class="resource-card">
            <h3>TAPS</h3>
            <p>1-800-959-TAPS (8277). 24/7. Free. The first call families should make.</p>
            <span class="resource-card-cta">Call →</span>
          </a>
          <a href="/survivor-benefits" class="resource-card">
            <h3>Survivor Benefits</h3>
            <p>DIC, CHAMPVA, Fry Scholarship, Survivor Benefit Plan — every benefit families are owed.</p>
            <span class="resource-card-cta">/survivor-benefits →</span>
          </a>
        </div>
      </article>
    </div>`;

  const faqLd = {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'What are military funeral honors?', acceptedAnswer: { '@type': 'Answer', text: 'Every eligible veteran is entitled at no cost to a minimum two-person military honor detail (with at least one from the veteran\u2019s branch), the playing of Taps (live or recorded), and the folding and presentation of the U.S. burial flag to next of kin. A three-volley rifle salute is provided when an armed honor guard is available.' } },
      { '@type': 'Question', name: 'Is burial in a VA national cemetery really free?', acceptedAnswer: { '@type': 'Answer', text: 'Yes. The gravesite, opening and closing, vault, headstone or marker, perpetual care, burial flag, and a Presidential Memorial Certificate are all free at any of the 155+ VA national cemeteries — for honorably discharged veterans, active-duty service members, and most reservists and Guard members with 20+ qualifying years.' } },
      { '@type': 'Question', name: 'Who do I call when a veteran dies?', acceptedAnswer: { '@type': 'Answer', text: 'Call the National Cemetery Scheduling Office at 1-800-535-1117 — open 24/7. They schedule the burial, request the headstone, and coordinate honors. Your funeral director can call on your behalf. Also call TAPS at 1-800-959-TAPS for end-to-end family support.' } },
      { '@type': 'Question', name: 'Can a veteran be buried in a private cemetery and still get a VA marker?', acceptedAnswer: { '@type': 'Answer', text: 'Yes. The VA provides a free government-furnished headstone or marker — or a bronze, brass, or graphite medallion to affix to a privately purchased headstone — for veterans buried in a private cemetery. There is no time limit; even decades-old graves can receive one.' } },
      { '@type': 'Question', name: 'How much will the VA pay toward private burial costs?', acceptedAnswer: { '@type': 'Answer', text: 'For service-connected deaths: up to about $2,000 burial allowance plus plot allowance and transportation. For non-service-connected deaths in a VA hospital: ~$916 burial allowance plus plot allowance. For other non-service-connected deaths of low-income veterans: ~$916 burial allowance plus ~$916 plot allowance. Claim within 2 years of burial for non-service-connected; no time limit for service-connected.' } },
      { '@type': 'Question', name: 'Can a veteran\u2019s spouse and children be buried with them?', acceptedAnswer: { '@type': 'Answer', text: 'Yes. Spouses, minor children, and certain unmarried adult children who became disabled before age 21 are eligible to be buried with the veteran in a national cemetery — at no cost to the family.' } }
    ]
  };
  const breadcrumbLd = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `https://${CONFIG.publication.domain}/` },
      { '@type': 'ListItem', position: 2, name: 'For Survivors', item: `https://${CONFIG.publication.domain}/survivor-benefits` },
      { '@type': 'ListItem', position: 3, name: 'Funeral Honors & Burial', item: `https://${CONFIG.publication.domain}/military-funeral-honors` }
    ]
  };

  return new Response(shellPage({
    title: 'Military Funeral Honors & Burial Benefits — Veteran News',
    description: 'Free national cemetery burial, military funeral honors, headstones, burial allowances. The full process families should know — calmly, in order.',
    canonicalPath: '/military-funeral-honors',
    navActive: '',
    contentHtml: content,
    extraHead: `<script type="application/ld+json">${JSON.stringify([faqLd, breadcrumbLd])}</script>`
  }), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}

// ── Military ID Cards (VHIC, VIC, state designations, REAL ID) ───────────
async function serveMilitaryIdPage(env, url, request) {
  const content = `
    <section class="page-hero">
      <div class="container-narrow">
        <div class="eyebrow">Veteran &amp; Military IDs</div>
        <h1 class="page-title">The IDs you've earned, explained.</h1>
        <p class="page-lede">Three different cards, two different agencies, dozens of different uses. Here's exactly which ID gets you what — and how to apply for the ones you don't have yet.</p>
      </div>
    </section>
    <div class="container-narrow">
      <article class="story-body">
        <h2>The three main veteran IDs</h2>

        <h3>1. Veteran Health Identification Card (VHIC)</h3>
        <p>For veterans <strong>enrolled in VA healthcare</strong>. Used at any VA medical center to verify your benefits.</p>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li>Use case: VA appointments, prescription pickups, VA pharmacy, building access</li>
          <li>Many retailers accept it for veteran discounts (Home Depot, Lowe's, Cabela's, etc.)</li>
          <li>Free. Issued at any VA medical facility — bring your DD-214</li>
          <li>Photo on the card</li>
        </ul>
        <p>Apply at any VA medical center, or call 1-877-222-VETS (8387). <a href="https://www.va.gov/health-care/get-id-card/" target="_blank" rel="noopener">va.gov/get-id-card</a></p>

        <h3>2. Veteran Identification Card (VIC)</h3>
        <p>For honorably discharged veterans <strong>not enrolled</strong> in VA healthcare. Use it for retail discounts and proof-of-service in civilian settings.</p>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li>Free. Apply online at VA.gov</li>
          <li>Mailed to you in a few weeks</li>
          <li>Photo on the card</li>
          <li>Most major retailers accept it for veteran discounts</li>
          <li><strong>Not valid as federal ID</strong> — you can't use it to enter federal buildings or fly</li>
        </ul>
        <p><a href="https://www.va.gov/records/get-veteran-id-cards/vic/" target="_blank" rel="noopener">Apply for VIC at va.gov</a></p>

        <h3>3. Common Access Card (CAC) / DoD ID</h3>
        <p>For active duty, retirees, and dependents. The official DoD identification.</p>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li>Active duty, Reserves, Guard get a CAC</li>
          <li>Retirees and dependents get a DoD ID Card (USID)</li>
          <li>Issued at RAPIDS sites — most installation ID card offices</li>
          <li>Required for installation access, commissary, exchange, TRICARE</li>
        </ul>

        <h2>State driver's license veteran designation</h2>
        <p><strong>All 50 states + DC</strong> now offer a "Veteran" or "VET" designation on driver's licenses or state IDs. Free in most states; small fee in a few. Bring your DD-214 to the DMV and ask for the veteran designation when you renew or apply.</p>
        <p>Some states (e.g., Texas, Florida, Tennessee) require a VHIC or VIC plus DD-214. Others accept DD-214 alone.</p>

        <h2>REAL ID and your veteran status</h2>
        <p>By May 7, 2025 (with extensions in some cases), you need a <strong>REAL ID-compliant driver's license</strong>, passport, or other approved federal ID to fly domestically or enter most federal buildings. Veteran-designation marks on a REAL ID don't change its REAL ID status. CAC, USID, and active VA medical IDs are all REAL ID-equivalent for federal building access.</p>
        <p>Plan to renew at the DMV with the documents required (typically: birth certificate or passport, two proofs of address, Social Security card or W-2). Add the veteran designation while you're there.</p>

        <h2>Specialty plates and license plates</h2>
        <p>Most states offer dedicated veteran license plates (combat veteran, Purple Heart, Bronze Star, branch-specific, Gold Star Family, etc.). Many include free or discounted parking, free toll passage at certain bridges, and special parking spots at government buildings.</p>
        <p>Application typically requires DD-214 and the appropriate award proof. Fees vary by state. Check your <a href="/states">state veterans department</a> for specifics.</p>

        <h2>Replacing a lost ID</h2>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li><strong>Lost VHIC:</strong> Visit VA medical center; reissued same day in many cases</li>
          <li><strong>Lost VIC:</strong> Reapply online at va.gov</li>
          <li><strong>Lost DD-214:</strong> Request from <a href="https://www.archives.gov/veterans" target="_blank" rel="noopener">archives.gov/veterans</a> (eVetRecs system) or via SF-180 form. Spouses and next-of-kin can request veterans' DD-214s</li>
          <li><strong>Lost CAC / USID:</strong> Contact your S-1 or RAPIDS site</li>
          <li><strong>State ID with veteran designation:</strong> DMV; bring DD-214</li>
        </ul>

        <h2>If your discharge is OTH or worse</h2>
        <p>VHIC eligibility hinges on VA healthcare enrollment, which can include some OTH veterans for service-connected care. VIC requires honorable or general discharge. State veteran designations vary — most states accept any service except dishonorable.</p>

        <h2>Get help</h2>
        <div class="resource-grid">
          <a href="https://www.va.gov/records/get-veteran-id-cards/vic/" target="_blank" rel="noopener" class="resource-card featured">
            <h3>Apply for VIC</h3>
            <p>Free Veteran Identification Card for honorably discharged vets. Online application.</p>
            <span class="resource-card-cta">va.gov/vic →</span>
          </a>
          <a href="https://www.va.gov/health-care/get-id-card/" target="_blank" rel="noopener" class="resource-card">
            <h3>VHIC at any VA</h3>
            <p>For VA-healthcare enrolled veterans. Issued at any VA medical center.</p>
            <span class="resource-card-cta">va.gov/get-id-card →</span>
          </a>
          <a href="https://www.archives.gov/veterans" target="_blank" rel="noopener" class="resource-card">
            <h3>Replace your DD-214</h3>
            <p>National Archives eVetRecs system. Free. Family members can request veterans' records.</p>
            <span class="resource-card-cta">archives.gov →</span>
          </a>
          <a href="/military-discounts" class="resource-card">
            <h3>Use your ID for discounts</h3>
            <p>Major retailers that accept VHIC and VIC for veteran discounts.</p>
            <span class="resource-card-cta">/military-discounts →</span>
          </a>
        </div>
      </article>
    </div>`;

  const faqLd = {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'What is the difference between VHIC and VIC?', acceptedAnswer: { '@type': 'Answer', text: 'The Veteran Health Identification Card (VHIC) is for veterans enrolled in VA healthcare and is used at VA medical facilities. The Veteran Identification Card (VIC) is for honorably discharged veterans not enrolled in VA healthcare and is used primarily for retail discounts and proof of service. Neither card is valid as federal ID for entering federal buildings or flying.' } },
      { '@type': 'Question', name: 'How do I add a "Veteran" designation to my driver\u2019s license?', acceptedAnswer: { '@type': 'Answer', text: 'All 50 states and DC offer a "Veteran" or "VET" designation. Bring your DD-214 to the DMV when you renew or apply. Some states also require a VHIC or VIC. Most states issue the designation free; a few charge a small fee.' } },
      { '@type': 'Question', name: 'Can I fly with my VHIC or VIC?', acceptedAnswer: { '@type': 'Answer', text: 'No. Neither VHIC nor VIC is valid as TSA-approved REAL ID. To fly domestically you need a REAL ID-compliant driver\u2019s license, passport, CAC, USID, or other approved federal ID. As of May 2025, REAL ID enforcement begins at airports — plan ahead.' } },
      { '@type': 'Question', name: 'How do I get a replacement DD-214?', acceptedAnswer: { '@type': 'Answer', text: 'Request from the National Archives at archives.gov/veterans using the eVetRecs system, or by submitting Standard Form 180 by mail. The service is free. Spouses, surviving family members, and next of kin may request a veteran\u2019s DD-214.' } },
      { '@type': 'Question', name: 'Can I get a VIC with an Other Than Honorable discharge?', acceptedAnswer: { '@type': 'Answer', text: 'No. The VIC requires an honorable or general (under honorable conditions) discharge. OTH veterans can pursue a discharge upgrade or use the state veteran designation, which most states grant for any service other than dishonorable. See our discharge upgrade guide.' } }
    ]
  };
  const breadcrumbLd = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `https://${CONFIG.publication.domain}/` },
      { '@type': 'ListItem', position: 2, name: 'Tools', item: `https://${CONFIG.publication.domain}/tools` },
      { '@type': 'ListItem', position: 3, name: 'Veteran IDs', item: `https://${CONFIG.publication.domain}/military-id` }
    ]
  };

  return new Response(shellPage({
    title: 'Veteran ID Cards — VHIC, VIC, State Designations Explained — Veteran News',
    description: 'Three veteran IDs, two agencies, dozens of uses. VHIC for VA care, VIC for retail discounts, state driver\u2019s license veteran designation, REAL ID, and how to replace a lost DD-214.',
    canonicalPath: '/military-id',
    navActive: '',
    contentHtml: content,
    extraHead: `<script type="application/ld+json">${JSON.stringify([faqLd, breadcrumbLd])}</script>`
  }), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}

// ── Veteran Tax Benefits ────────────────────────────────────────────────
async function serveTaxBenefitsPage(env, url, request) {
  const content = `
    <section class="page-hero">
      <div class="container-narrow">
        <div class="eyebrow">Tax Benefits</div>
        <h1 class="page-title">Veteran tax breaks, in plain English.</h1>
        <p class="page-lede">VA disability is tax-free. Most state retirement is tax-free. There's free filing software for active duty and veterans. And there's a CRSC/CRDP rule book that recovers thousands for medically retired vets. Here's the map.</p>
      </div>
    </section>
    <div class="container-narrow">
      <article class="story-body">
        <h2>Federal tax — what's tax-free vs. taxable</h2>

        <h3>Tax-FREE for federal income tax</h3>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li><strong>VA disability compensation</strong> — never taxed</li>
          <li><strong>VA pension</strong> — never taxed</li>
          <li><strong>DIC (Dependency &amp; Indemnity Compensation)</strong> — never taxed</li>
          <li><strong>Disability severance pay</strong> for combat-related injuries — refundable if originally taxed (see below)</li>
          <li><strong>Combat pay (Combat Zone Tax Exclusion)</strong> — for time in a designated combat zone</li>
          <li><strong>Death gratuity</strong> ($100,000 to surviving family) — not taxed</li>
          <li><strong>Adoption assistance</strong> through DoD</li>
          <li><strong>Housing allowances (BAH)</strong> — non-taxable</li>
          <li><strong>Subsistence allowance (BAS)</strong> — non-taxable</li>
        </ul>

        <h3>TAXABLE</h3>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li><strong>Military retirement pay</strong> (federal income tax)</li>
          <li><strong>SBP annuity</strong> (Survivor Benefit Plan)</li>
          <li><strong>Active duty base pay</strong> outside combat zone</li>
          <li><strong>Civilian wages and self-employment income</strong></li>
          <li><strong>Rental income, investment income</strong></li>
        </ul>

        <h2>State tax — varies dramatically</h2>

        <h3>9 states with no state income tax (military retirement effectively untaxed)</h3>
        <p>Alaska, Florida, Nevada, New Hampshire (no wage tax), South Dakota, Tennessee, Texas, Washington, Wyoming.</p>

        <h3>States that fully exempt military retirement</h3>
        <p>~30 states, including Alabama, Arkansas, Connecticut, Hawaii, Indiana, Iowa, Kansas, Kentucky, Louisiana, Massachusetts, Michigan, Minnesota, Mississippi, Missouri, Montana, Nebraska, North Carolina, North Dakota, Ohio, Oklahoma, Pennsylvania, South Carolina, Utah, West Virginia, Wisconsin (full or near-full).</p>
        <p>Always check your <a href="/states">state veterans page</a> — laws change yearly.</p>

        <h3>Disabled veteran property tax exemptions</h3>
        <p>Most states offer significant property tax exemptions for disabled veterans, ranging from <strong>$3,000 in assessed-value reductions</strong> to <strong>full homestead exemption</strong>. Texas, Florida, Maryland, Michigan, Mississippi, New Jersey, Oklahoma, South Carolina offer full exemption for 100% disabled veterans on primary residence. Many states extend the exemption to surviving spouses.</p>
        <p>Application is at the county level. Bring your VA disability award letter, DD-214, and proof of residence to the county assessor.</p>

        <h2>CRSC and CRDP — recovering withheld retirement</h2>
        <p>Until 2003, military retirees with VA disability had to <strong>waive an equal amount of retirement pay</strong> to receive VA disability — meaning they got the same total dollar amount, but the disability portion was tax-free. Two programs now restore concurrent receipt:</p>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li style="margin-bottom:.5em;"><strong>CRDP (Concurrent Retirement and Disability Pay)</strong> — for military retirees with 20+ years and VA disability rated 50%+. Restores full retirement pay alongside VA disability. Phased in fully by 2014.</li>
          <li style="margin-bottom:.5em;"><strong>CRSC (Combat-Related Special Compensation)</strong> — for retirees with combat-related disabilities. Tax-free supplement that restores the offset. Available for any rating including under 50%.</li>
        </ul>
        <p>If you're medically retired or have combat-related disabilities, <strong>CRSC vs. CRDP can mean thousands per year</strong>. You can switch annually based on which is better. <a href="https://militarypay.defense.gov/Pay/Retirement/cncrnt/" target="_blank" rel="noopener">DFAS CRSC/CRDP info</a>.</p>

        <h2>Disability Severance Pay — taxable refund</h2>
        <p>Veterans medically separated <strong>between 1991 and 2016</strong> who had federal taxes withheld from disability severance pay can claim a refund of those taxes. The 2017 Combat-Injured Veterans Tax Fairness Act allowed this retroactively. Many veterans missed the original deadline; check with a tax professional or VSO.</p>

        <h2>Free tax filing</h2>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li><strong>MilTax (Military OneSource)</strong> — Free Federal + State for active duty, retirees, and family. <a href="https://www.militaryonesource.mil/financial-legal/tax-resource-center/miltax-military-tax-services/" target="_blank" rel="noopener">militaryonesource.mil/miltax</a></li>
          <li><strong>VITA (Volunteer Income Tax Assistance)</strong> — Free for low-income, including most veterans. IRS-certified volunteers.</li>
          <li><strong>Free File</strong> — IRS partner program. Most veterans qualify.</li>
          <li><strong>TurboTax</strong> — Free Federal + State for active duty. Various discounts for veterans.</li>
          <li><strong>H&amp;R Block</strong> — discounts for active duty.</li>
        </ul>

        <h2>Common mistakes</h2>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li>Reporting VA disability as taxable income on Form 1040 — <strong>never report it</strong></li>
          <li>Missing CRSC/CRDP eligibility for medical retirees</li>
          <li>Not claiming property-tax exemption after a rating increase</li>
          <li>Not filing for the disability severance pay tax refund (1991-2016 medical separations)</li>
          <li>Paying for tax software that's free for active duty (MilTax)</li>
        </ul>

        <h2>Get help</h2>
        <div class="resource-grid">
          <a href="https://www.militaryonesource.mil/financial-legal/tax-resource-center/" target="_blank" rel="noopener" class="resource-card featured">
            <h3>MilTax — free filing</h3>
            <p>Free Federal + State filing for active duty, retirees, and family through Military OneSource.</p>
            <span class="resource-card-cta">militaryonesource.mil →</span>
          </a>
          <a href="https://militarypay.defense.gov/Pay/Retirement/cncrnt/" target="_blank" rel="noopener" class="resource-card">
            <h3>CRSC / CRDP at DFAS</h3>
            <p>Concurrent receipt rules for military retirees with VA disability. Apply via DFAS.</p>
            <span class="resource-card-cta">defense.gov →</span>
          </a>
          <a href="https://irs.treasury.gov/freetaxprep/" target="_blank" rel="noopener" class="resource-card">
            <h3>VITA Locator</h3>
            <p>Free, IRS-certified volunteer tax help. Most veterans qualify.</p>
            <span class="resource-card-cta">IRS VITA →</span>
          </a>
          <a href="/states" class="resource-card">
            <h3>State tax exemptions</h3>
            <p>Property tax, military retirement, and other state-level veteran tax breaks.</p>
            <span class="resource-card-cta">/states →</span>
          </a>
        </div>
      </article>
    </div>`;

  const faqLd = {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'Is VA disability compensation taxed?', acceptedAnswer: { '@type': 'Answer', text: 'No. VA disability compensation is never federally taxed and is not taxed by any state. It does not count as income for federal tax purposes and you should not report it on your Form 1040. The same applies to VA Pension and DIC.' } },
      { '@type': 'Question', name: 'Is military retirement pay taxed?', acceptedAnswer: { '@type': 'Answer', text: 'Yes federally — military retirement pay is taxable as ordinary income. State taxation varies dramatically: 9 states have no state income tax at all, and roughly 30 states fully exempt military retirement pay. Always check your state veterans department for current rules.' } },
      { '@type': 'Question', name: 'What is CRDP vs. CRSC?', acceptedAnswer: { '@type': 'Answer', text: 'CRDP (Concurrent Retirement and Disability Pay) restores full retirement pay alongside VA disability for retirees with 20+ years of service and a VA rating of 50% or more. CRSC (Combat-Related Special Compensation) is a tax-free supplement available for combat-related disabilities at any rating. Eligible retirees can switch annually between CRSC and CRDP based on which pays more.' } },
      { '@type': 'Question', name: 'Can I get a refund for taxes withheld from my disability severance pay?', acceptedAnswer: { '@type': 'Answer', text: 'Yes, if you were medically separated between 1991 and 2016 and had federal taxes withheld from disability severance pay. The 2017 Combat-Injured Veterans Tax Fairness Act allows retroactive refunds. The original IRS deadline has passed for some, but consult a tax professional — exceptions exist.' } },
      { '@type': 'Question', name: 'Where can I file taxes for free as a veteran or service member?', acceptedAnswer: { '@type': 'Answer', text: 'MilTax through Military OneSource is free for active duty, retirees, and their families and includes Federal and State filing. VITA (Volunteer Income Tax Assistance) provides free, IRS-certified volunteer tax help for low- and moderate-income filers including most veterans. The IRS Free File program is also a strong option.' } },
      { '@type': 'Question', name: 'Are veterans exempt from property tax?', acceptedAnswer: { '@type': 'Answer', text: 'Most states offer property tax exemptions for disabled veterans, ranging from $3,000 of assessed value reductions to full homestead exemption. Texas, Florida, Maryland, Michigan, Mississippi, New Jersey, Oklahoma, and South Carolina offer full exemption for 100% disabled veterans on a primary residence. Many states extend the exemption to surviving spouses. Apply at the county assessor with your VA award letter and DD-214.' } }
    ]
  };
  const breadcrumbLd = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `https://${CONFIG.publication.domain}/` },
      { '@type': 'ListItem', position: 2, name: 'Tools', item: `https://${CONFIG.publication.domain}/tools` },
      { '@type': 'ListItem', position: 3, name: 'Veteran Tax Benefits', item: `https://${CONFIG.publication.domain}/veteran-tax-benefits` }
    ]
  };

  return new Response(shellPage({
    title: 'Veteran Tax Benefits Guide — VA Disability, CRSC/CRDP, State Exemptions — Veteran News',
    description: 'VA disability is tax-free. Most state retirement is tax-free. CRSC/CRDP can recover thousands. Free filing through MilTax. The full veteran tax map.',
    canonicalPath: '/veteran-tax-benefits',
    navActive: '',
    contentHtml: content,
    extraHead: `<script type="application/ld+json">${JSON.stringify([faqLd, breadcrumbLd])}</script>`
  }), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}

// ── Military Retirement Pay ──────────────────────────────────────────────
async function serveRetirementPayPage(env, url, request) {
  const content = `
    <section class="page-hero">
      <div class="container-narrow">
        <div class="eyebrow">Military Retirement</div>
        <h1 class="page-title">Military retirement pay, in plain English.</h1>
        <p class="page-lede">If you served 20+ years (or were medically retired), you've earned a pension for life. Here's how the math works under each retirement system, what to do at separation, and how CRSC/CRDP, SBP, and TSP fit in.</p>
      </div>
    </section>
    <div class="container-narrow">
      <article class="story-body">
        <h2>Three retirement systems — which is yours?</h2>

        <h3>1. Final Pay (entered before Sep 8, 1980)</h3>
        <p>Pension = <strong>2.5% × years of service × final base pay</strong>. 20 years = 50% of final base pay; 30 years = 75% (max 75%).</p>

        <h3>2. High-3 (entered Sep 8, 1980 – Jul 31, 1986, or chose at 15-year mark)</h3>
        <p>Pension = <strong>2.5% × years × average of highest 36 months base pay</strong>. Same percentage as Final Pay but averaged over the highest three years.</p>

        <h3>3. REDUX (Career Status Bonus / CSB-REDUX, Aug 1986 – Dec 2017)</h3>
        <p>Receive a $30,000 Career Status Bonus at year 15 + reduced pension formula (2% × years for first 20, 3.5% × years thereafter, plus age-62 catch-up). Most who chose REDUX regretted it; CSB ended in 2017.</p>

        <h3>4. Blended Retirement System (BRS) — entered Jan 1, 2018+</h3>
        <p>Combines a smaller pension with a TSP match:</p>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li><strong>Pension:</strong> 2.0% × years × High-3 base pay (so 20 years = 40% instead of 50%)</li>
          <li><strong>TSP:</strong> Auto-enroll, with DoD matching up to 5%</li>
          <li><strong>Continuation Pay</strong> at year 12 (~2.5–13× monthly basic pay)</li>
          <li><strong>Lump sum option at retirement:</strong> trade up to 50% of pension for cash; pension restores at age 67</li>
        </ul>
        <p>BRS makes <strong>some retirement available even if you serve fewer than 20 years</strong>, via TSP. Pre-BRS systems give nothing if you separate before 20.</p>

        <h2>Reserves and Guard retirement</h2>
        <p>Reservists and Guard members earn retirement based on <strong>retirement points</strong> (one per drill, more for active duty). Need 20 "good" years, but pension begins at age 60 (or earlier for activations after 9/11/2008 — 90 days reduces age by 90 days, with limits).</p>

        <h2>Medical retirement</h2>
        <p>If you're medically retired with a DoD disability rating of 30%+, your pension is the higher of:</p>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li><strong>Disability percentage × High-3 base pay</strong> (max 75%), OR</li>
          <li><strong>Years × 2.5% × High-3 base pay</strong> (regular calculation if you have enough years)</li>
        </ul>
        <p>Medical retirement also opens VA disability without a waiver if eligible for CRSC/CRDP. <a href="/va-appeals">If your DoD or VA rating is too low, appeal.</a></p>

        <h2>VA disability and retirement — the offset rule</h2>
        <p>Pre-2003 retirees had to <strong>waive an equal amount of retirement pay</strong> to receive VA disability. Two programs now restore concurrent receipt:</p>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li style="margin-bottom:.5em;"><strong>CRDP</strong> — full restoration for retirees with 20+ years and 50%+ VA rating</li>
          <li style="margin-bottom:.5em;"><strong>CRSC</strong> — combat-related disabilities only, available at any rating including under 50%</li>
        </ul>
        <p>You can switch annually between CRSC and CRDP based on which pays more. <a href="/veteran-tax-benefits">See full tax-benefits guide.</a></p>

        <h2>Survivor Benefit Plan (SBP) — irrevocable election</h2>
        <p>SBP is a pension-annuity insurance for your surviving spouse. Pays 55% of your retirement pay for life if you predecease. Premium is ~6.5% of retirement pay. Several rules:</p>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li>Default-enrolled at retirement; you must opt out actively (with spouse's notarized consent)</li>
          <li><strong>Paid up at age 70</strong> if you've paid 360+ months — no more premium, but spouse still gets the benefit</li>
          <li>If your spouse predeceases you, you can suspend</li>
          <li>If you remarry, you can re-elect SBP for the new spouse</li>
        </ul>

        <h2>TSP at retirement</h2>
        <p>Your Thrift Savings Plan stays with you when you separate. Options:</p>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li>Leave it in TSP — lowest fees, limited withdrawal flexibility</li>
          <li>Roll into a Traditional or Roth IRA — more options, possibly higher fees</li>
          <li>Cash out — taxes + 10% penalty if under 59½ (avoid except for true emergency)</li>
        </ul>
        <p>If you rolled out and changed your mind, the <strong>TSP "rehire roll-in"</strong> lets you bring outside IRA money back into TSP.</p>

        <h2>Get help</h2>
        <div class="resource-grid">
          <a href="https://militarypay.defense.gov/Pay/Retirement/" target="_blank" rel="noopener" class="resource-card featured">
            <h3>DoD Military Pay — Retirement</h3>
            <p>Official source for retirement systems, calculators, and current pay tables.</p>
            <span class="resource-card-cta">militarypay.defense.gov →</span>
          </a>
          <a href="https://militarypay.defense.gov/Calculators/" target="_blank" rel="noopener" class="resource-card">
            <h3>Retirement Calculators</h3>
            <p>Project your pension under each system. Includes BRS, High-3, Final Pay.</p>
            <span class="resource-card-cta">Run the math →</span>
          </a>
          <a href="https://www.tsp.gov/" target="_blank" rel="noopener" class="resource-card">
            <h3>TSP.gov</h3>
            <p>Manage your Thrift Savings Plan: contributions, allocations, withdrawal options.</p>
            <span class="resource-card-cta">tsp.gov →</span>
          </a>
          <a href="/veteran-tax-benefits" class="resource-card">
            <h3>Veteran Tax Benefits</h3>
            <p>State retirement tax exemptions, CRSC/CRDP rules, and how the VA disability offset works.</p>
            <span class="resource-card-cta">/veteran-tax-benefits →</span>
          </a>
        </div>
      </article>
    </div>`;

  const faqLd = {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'How is military retirement pay calculated?', acceptedAnswer: { '@type': 'Answer', text: 'It depends on your retirement system. Final Pay (pre-1980) and High-3 (1980-2017) use 2.5% × years × base pay (so 20 years = 50%). The Blended Retirement System (BRS, 2018+) uses 2.0% × years × High-3 (so 20 years = 40%) but adds DoD-matched TSP contributions. Reserve/Guard retirees calculate based on retirement points and typically receive their pension starting at age 60.' } },
      { '@type': 'Question', name: 'Do I need 20 years to get military retirement?', acceptedAnswer: { '@type': 'Answer', text: 'For traditional pension yes. The Blended Retirement System (BRS) for those who entered after January 2018 allows TSP contributions and DoD match to vest at 2 years, so you can leave with retirement assets even before 20. Medical retirement is also possible at fewer than 20 years if you receive a DoD disability rating of 30% or more.' } },
      { '@type': 'Question', name: 'What is the difference between CRSC and CRDP?', acceptedAnswer: { '@type': 'Answer', text: 'CRDP (Concurrent Retirement and Disability Pay) restores full retirement pay for retirees with 20+ years and a VA disability rating of 50% or more — eliminating the historical offset. CRSC (Combat-Related Special Compensation) is a tax-free supplement available for combat-related disabilities at any rating. Eligible retirees can switch between them annually based on which pays more.' } },
      { '@type': 'Question', name: 'What is SBP and should I take it?', acceptedAnswer: { '@type': 'Answer', text: 'The Survivor Benefit Plan (SBP) is an annuity that pays 55% of your retirement pay to a surviving spouse for life. It costs about 6.5% of retirement pay. SBP is the default election at retirement and requires your spouse\u2019s notarized consent to decline. After 360 months of payments, SBP becomes "paid up" — no more premium but the benefit continues. For most retirees with a spouse, SBP is the cheapest available life annuity.' } },
      { '@type': 'Question', name: 'When does Reserve/Guard retirement start?', acceptedAnswer: { '@type': 'Answer', text: 'Generally age 60. However, post-9/11/2008 active service can lower the eligibility age — every 90 days of qualifying activation reduces the start age by 90 days, down to a minimum of age 50. Reservists and Guard members must accumulate 20 "good" years (each year requires 50+ retirement points).' } },
      { '@type': 'Question', name: 'What happens to my TSP at retirement?', acceptedAnswer: { '@type': 'Answer', text: 'You can leave it in TSP (lowest fees, limited withdrawal flexibility), roll it into a Traditional or Roth IRA (more options, possibly higher fees), or take a lump-sum withdrawal (subject to taxes and a 10% penalty if under 59\u00bd). The "rehire roll-in" feature lets you move IRA money back into TSP later if you change your mind.' } }
    ]
  };
  const breadcrumbLd = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `https://${CONFIG.publication.domain}/` },
      { '@type': 'ListItem', position: 2, name: 'Tools', item: `https://${CONFIG.publication.domain}/tools` },
      { '@type': 'ListItem', position: 3, name: 'Military Retirement Pay', item: `https://${CONFIG.publication.domain}/military-retirement-pay` }
    ]
  };

  return new Response(shellPage({
    title: 'Military Retirement Pay Guide — Final Pay, High-3, BRS, Reserves — Veteran News',
    description: 'How military retirement pay is calculated under each system, plus medical retirement, CRSC/CRDP, SBP, TSP, and Reserve/Guard rules.',
    canonicalPath: '/military-retirement-pay',
    navActive: '',
    contentHtml: content,
    extraHead: `<script type="application/ld+json">${JSON.stringify([faqLd, breadcrumbLd])}</script>`
  }), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}

// ── TDIU (Total Disability Individual Unemployability) ──────────────────
async function serveTDIUPage(env, url, request) {
  const content = `
    <section class="page-hero">
      <div class="container-narrow">
        <div class="eyebrow">TDIU / IU</div>
        <h1 class="page-title">If you can't work because of service-connected disabilities — read this.</h1>
        <p class="page-lede">TDIU pays at the 100% disability rate even if your combined rating is below 100%. It's one of the most underused VA benefits — and one of the most life-changing for veterans whose injuries keep them from earning a living.</p>
      </div>
    </section>
    <div class="container-narrow">
      <article class="story-body">
        <h2>What TDIU is</h2>
        <p><strong>Total Disability based on Individual Unemployability (TDIU)</strong>, also called "IU," lets the VA pay you at the <strong>100% disability rate</strong> ($3,737.85/month base in 2025, plus dependents) even if your combined rating is lower — when service-connected disabilities prevent you from "substantially gainful employment."</p>

        <h2>Schedular eligibility</h2>
        <p>Two paths:</p>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li style="margin-bottom:.5em;"><strong>One disability at 60%+</strong> that prevents you from working, OR</li>
          <li style="margin-bottom:.5em;"><strong>Two or more disabilities</strong> with a combined rating of 70%+, AND at least one disability rated 40%+</li>
        </ul>
        <p>Disabilities from a single body system or a single event count as one disability for the purpose of meeting these thresholds. Bilateral lower-extremity disabilities also combine.</p>

        <h2>Extra-schedular consideration</h2>
        <p>If you don't meet the schedular thresholds but service-connected disabilities still prevent work, the VA can grant TDIU on an "extra-schedular" basis. This is rare but possible — request it explicitly when filing.</p>

        <h2>What "substantially gainful employment" means</h2>
        <p>Generally: earnings above the federal poverty threshold (about <strong>$15,060/year for one person in 2025</strong>). Lower earnings, sheltered work (such as protected family business jobs), and jobs heavily accommodated due to disability typically count as "marginal employment" — which is allowed under TDIU.</p>

        <h2>How to apply</h2>
        <ol style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li style="margin-bottom:.75em;"><strong>File VA Form 21-8940</strong> (Veteran's Application for Increased Compensation Based on Unemployability)</li>
          <li style="margin-bottom:.75em;"><strong>Submit VA Form 21-4192</strong> to your last employer (Request for Employment Information)</li>
          <li style="margin-bottom:.75em;"><strong>Strong evidence:</strong> records of work limitations, accommodation requests, attendance issues, terminations or being unable to keep jobs</li>
          <li style="margin-bottom:.75em;"><strong>Ideally include a vocational expert opinion</strong> stating you cannot work due to service-connected conditions. VSOs can sometimes get this; otherwise pay $1,000–$3,000 for a Vocational Rehabilitation Specialist letter — usually worth it.</li>
        </ol>

        <h2>What you keep with TDIU</h2>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li>100% compensation pay rate</li>
          <li>Healthcare in Priority Group 1</li>
          <li>CHAMPVA for dependents (after permanent ratings)</li>
          <li>Property tax exemptions in many states (often as if 100% rated)</li>
          <li>Free VA dental, audiology, vision (full coverage)</li>
          <li>Eligibility for Aid &amp; Attendance enhancement when applicable</li>
        </ul>

        <h2>What TDIU doesn't change</h2>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li>Your underlying combined rating (e.g., still rated 70%) — only the pay rate is bumped to 100%</li>
          <li>Some 100%-rated benefits (Chapter 35 DEA for dependents, full SBP coverage) follow your underlying rating, not TDIU pay rate. <strong>P&T</strong> status (Permanent &amp; Total) is what unlocks those — request P&amp;T explicitly when applying for TDIU.</li>
        </ul>

        <h2>Working with TDIU — the rules</h2>
        <p>TDIU recipients can earn up to the federal poverty threshold from substantially gainful employment without losing TDIU. Some exceptions:</p>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li><strong>Marginal employment</strong> (sheltered, family-protected, heavy accommodations) doesn't count</li>
          <li><strong>Year of "trial work"</strong>: if you start a job and can't sustain it, that's protected</li>
          <li><strong>Self-employment</strong> with low or no profit margin can also be marginal</li>
        </ul>
        <p>If your earnings exceed the threshold for 12+ consecutive months, the VA may propose to reduce TDIU. You'll get notice and the chance to respond.</p>

        <h2>If TDIU is denied</h2>
        <p>Appeal. Many TDIU denials are reversed on supplemental claims with vocational evidence. <a href="/va-appeals">See full appeals guide.</a></p>

        <h2>Common mistakes</h2>
        <ul style="padding-left:1.5em;margin:var(--s-4) 0;">
          <li>Not requesting TDIU explicitly — assuming the VA will grant it automatically</li>
          <li>Filing without VA Form 21-8940</li>
          <li>Missing the vocational expert opinion that ties symptoms to work-limitation</li>
          <li>Not requesting P&T at the same time</li>
          <li>Working too much during the application — undermines the "unemployable" claim</li>
        </ul>

        <h2>Get help</h2>
        <div class="resource-grid">
          <a href="https://www.va.gov/disability/eligibility/special-claims/unemployability/" target="_blank" rel="noopener" class="resource-card featured">
            <h3>VA.gov — TDIU</h3>
            <p>Official eligibility, forms, and application guidance for Individual Unemployability.</p>
            <span class="resource-card-cta">va.gov/tdiu →</span>
          </a>
          <a href="https://www.dav.org/find-your-local-office/" target="_blank" rel="noopener" class="resource-card">
            <h3>DAV — File TDIU free</h3>
            <p>Disabled American Veterans handles TDIU claims and appeals at no cost.</p>
            <span class="resource-card-cta">DAV office →</span>
          </a>
          <a href="/va-appeals" class="resource-card">
            <h3>VA Appeals Guide</h3>
            <p>If TDIU is denied, the appeal lanes that win cases.</p>
            <span class="resource-card-cta">/va-appeals →</span>
          </a>
          <a href="/va-disability" class="resource-card">
            <h3>VA Disability Ratings</h3>
            <p>Foundation rating math and the C&amp;P exam — important for TDIU claims.</p>
            <span class="resource-card-cta">/va-disability →</span>
          </a>
        </div>
      </article>
    </div>`;

  const faqLd = {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'What is TDIU and how is it different from a 100% rating?', acceptedAnswer: { '@type': 'Answer', text: 'Total Disability based on Individual Unemployability (TDIU) pays at the 100% VA disability rate even when your combined rating is below 100%, if service-connected disabilities prevent you from holding substantially gainful employment. Your underlying rating (e.g., 70%) doesn\u2019t change — only the pay rate is bumped to 100%. A schedular 100% rating applies a wider range of automatic benefits like Chapter 35 DEA for dependents and full SBP, while TDIU benefits depend on whether the VA also grants Permanent and Total (P&T) status.' } },
      { '@type': 'Question', name: 'Who qualifies for TDIU?', acceptedAnswer: { '@type': 'Answer', text: 'Schedular eligibility requires either one service-connected disability rated 60% or higher, or two or more service-connected disabilities with a combined rating of 70%+ where at least one is rated 40%+. Plus the veteran must be unable to maintain substantially gainful employment due to those disabilities. Extra-schedular TDIU is also possible without meeting the thresholds, but is granted rarely.' } },
      { '@type': 'Question', name: 'Can I work and still receive TDIU?', acceptedAnswer: { '@type': 'Answer', text: 'You can earn up to the federal poverty threshold (about $15,060/year for one person in 2025) without losing TDIU. Marginal employment — sheltered, family-protected, or heavily accommodated jobs — does not count against you. A 12-month "trial work period" is also protected if you try a job and cannot sustain it.' } },
      { '@type': 'Question', name: 'How do I apply for TDIU?', acceptedAnswer: { '@type': 'Answer', text: 'File VA Form 21-8940 (Veteran\u2019s Application for Increased Compensation Based on Unemployability) and have your last employer complete VA Form 21-4192. Strong applications include records of work limitations, accommodation requests, terminations, and ideally a vocational expert opinion tying your inability to work to service-connected conditions. A free VSO can help.' } },
      { '@type': 'Question', name: 'What should I do if my TDIU is denied?', acceptedAnswer: { '@type': 'Answer', text: 'Appeal. Many TDIU denials are reversed on Supplemental Claims with new vocational evidence — typically a vocational rehabilitation specialist letter that connects your symptoms to your inability to maintain substantially gainful employment. The 1-year filing deadline preserves your effective date for back pay.' } }
    ]
  };
  const breadcrumbLd = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `https://${CONFIG.publication.domain}/` },
      { '@type': 'ListItem', position: 2, name: 'Disability', item: `https://${CONFIG.publication.domain}/va-disability` },
      { '@type': 'ListItem', position: 3, name: 'TDIU', item: `https://${CONFIG.publication.domain}/tdiu` }
    ]
  };

  return new Response(shellPage({
    title: 'TDIU Guide — Individual Unemployability for Veterans Who Can\u2019t Work — Veteran News',
    description: 'TDIU pays at the 100% VA rate even if combined rating is lower. Eligibility, how to apply, working rules, and how to win on appeal.',
    canonicalPath: '/tdiu',
    navActive: '',
    contentHtml: content,
    extraHead: `<script type="application/ld+json">${JSON.stringify([faqLd, breadcrumbLd])}</script>`
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

  const baseUrl = `https://${CONFIG.publication.domain}`;
  const breadcrumbLd = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${baseUrl}/` },
      { '@type': 'ListItem', position: 2, name: 'States', item: `${baseUrl}/states` },
      { '@type': 'ListItem', position: 3, name, item: `${baseUrl}/state/${code.toLowerCase()}` }
    ]
  };
  // GovernmentOrganization for the state veterans department + Place anchor
  const govOrgLd = data?.deptName ? {
    '@context': 'https://schema.org', '@type': 'GovernmentOrganization',
    name: data.deptName,
    url: data.deptUrl || undefined,
    telephone: data.phone || undefined,
    areaServed: { '@type': 'State', name },
    parentOrganization: { '@type': 'GovernmentOrganization', name: `Government of ${name}` }
  } : null;
  const placeLd = {
    '@context': 'https://schema.org', '@type': 'WebPage',
    name: `${name} Veteran Resources`,
    url: `${baseUrl}/state/${code.toLowerCase()}`,
    about: { '@type': 'AdministrativeArea', name, identifier: code },
    isPartOf: { '@id': `${baseUrl}/#website` }
  };
  const ldArr = [breadcrumbLd, placeLd, ...(govOrgLd ? [govOrgLd] : [])];

  return new Response(shellPage({
    title: `${name} Veteran Resources — Veteran News`,
    description: `Veteran resources, state department, hotline, and standout state-specific benefits for ${name}.`,
    canonicalPath: `/state/${code.toLowerCase()}`,
    navActive: '',
    contentHtml: content,
    extraHead: `<script type="application/ld+json">${JSON.stringify(ldArr)}</script>`
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

// ════════════════════════════════════════════════════════════════════════════
// CRISIS CONTENT INTERCEPT — surfaced inline on stories about suicide,
// PTSD, MST, etc. This is research-backed: contextual surfacing beats
// always-on FAB blindness.
// ════════════════════════════════════════════════════════════════════════════
const CRISIS_KEYWORDS = [
  'suicide', 'suicidal', 'self-harm', 'self harm', 'self-injur',
  'overdose', 'crisis line', 'crisis hotline', '988',
  'sexual assault', 'sexual trauma', 'mst ', 'military sexual trauma',
  'depression', 'anxiety disorder', 'ptsd', 'post-traumatic stress',
  'tbi', 'traumatic brain', 'addiction', 'substance use', 'opioid'
];
function needsCrisisIntercept(article) {
  if (!article) return false;
  const hay = `${article.title || ''} ${article.excerpt || ''} ${article.category || ''}`.toLowerCase();
  return CRISIS_KEYWORDS.some(k => hay.includes(k));
}
function crisisInterceptHtml() {
  return `
    <aside class="crisis-intercept" role="complementary" aria-label="Crisis support">
      <div class="crisis-intercept-eyebrow">If this is hitting close to home</div>
      <h3>You don't have to read this alone.</h3>
      <p>Free, confidential support is available right now. Call 988 and press 1, text 838255, or chat online. Calling will not affect your clearance, benefits, job, or firearms.</p>
      <div class="crisis-intercept-actions">
        <a href="tel:988" class="btn btn-primary">Call 988 — Press 1</a>
        <a href="sms:838255" class="btn btn-secondary">Text 838255</a>
        <a href="/crisis" class="btn btn-secondary">Full support hub →</a>
      </div>
    </aside>`;
}

// Surface contextually relevant pillar guides at the bottom of an article.
// Picks 3 best-matched pillars from category + keyword overlap so readers can
// jump from breaking news directly to evergreen how-to content.
const PILLAR_INDEX = [
  { path: '/pact-act', title: 'PACT Act Guide', desc: 'Plain-English presumptive conditions, eligibility, how to file.', kws: ['pact', 'burn pit', 'agent orange', 'toxic exposure', 'presumptive', 'radiation'] },
  { path: '/va-disability', title: 'VA Disability Ratings', desc: 'How ratings work, the C&P exam, 2025 rate table, and how to file.', kws: ['disability', 'rating', 'compensation', 'c&p', 'service-connect', 'va claim'] },
  { path: '/gi-bill', title: 'GI Bill Guide', desc: 'Post-9/11 vs. Montgomery, transfer to family, schools to avoid.', kws: ['gi bill', 'education benefit', 'tuition', 'post-9/11', 'yellow ribbon', 'student'] },
  { path: '/mental-health', title: 'Mental Health Navigator', desc: 'PTSD, MST, depression. Vet Centers, evidence-based therapy, free non-VA options.', kws: ['mental health', 'ptsd', 'depression', 'anxiety', 'mst ', 'sexual trauma', 'therapy', 'counseling', 'suicide', '988'] },
  { path: '/homeless-veterans', title: 'Homeless Veteran Help', desc: 'HUD-VASH, SSVF, the 24/7 1-877-4AID-VET line.', kws: ['homeless', 'housing', 'eviction', 'hud-vash', 'ssvf', 'shelter', 'unsheltered'] },
  { path: '/caregivers', title: 'Caregiver Guide', desc: 'PCAFC stipend, PGCSS, respite care, mental-health support.', kws: ['caregiver', 'pcafc', 'family caregiver', 'respite', 'champva'] },
  { path: '/transition-guide', title: 'Transition Playbook', desc: 'BDD claim, SkillBridge, GI Bill transfer, the 9-step separation list.', kws: ['transition', 'separating', 'skillbridge', 'tap', 'separation', 'leaving service', 'discharge'] },
  { path: '/discharge-upgrade', title: 'Discharge Upgrade', desc: 'OTH to honorable, Hagel/Kurta/Wilkie memos, free legal help.', kws: ['discharge upgrade', 'oth', 'other than honorable', 'bad paper', 'character of discharge', 'drb'] },
  { path: '/tbi', title: 'TBI Guide', desc: 'Severity, blast exposure, polytrauma care, and the PTSD overlap.', kws: ['tbi', 'traumatic brain', 'concussion', 'blast', 'polytrauma'] },
  { path: '/women-veterans', title: 'Women Veterans', desc: 'VA women\u2019s health, MST for life, the 1-855-VA-WOMEN line.', kws: ['women veteran', 'female veteran', 'maternity', 'reproductive', 'gynecolog', 'mst '] },
  { path: '/survivor-benefits', title: 'Survivor Benefits', desc: 'DIC, CHAMPVA, Fry Scholarship, and TAPS.', kws: ['survivor', 'dic', 'champva', 'fry scholarship', 'taps', 'gold star', 'widow', 'bereav'] },
  { path: '/buddy-check', title: 'Buddy Check', desc: '5-minute reach-out guide for friends and family.', kws: ['buddy check', 'reach out', 'check on', 'wellness check'] },
  { path: '/scam-alerts', title: 'Scam Alerts', desc: '12 frauds targeting veterans. Red flags and where to report.', kws: ['scam', 'fraud', 'claim shark', 'pension poaching', 'phishing', 'identity theft'] },
  { path: '/claim-help', title: 'Claim Help Walkthrough', desc: '2-minute eligibility check that surfaces VA benefits you may have missed.', kws: ['file a claim', 'eligibility', 'vso'] },
  { path: '/va-appeals', title: 'VA Appeals Guide', desc: 'HLR, Supplemental Claim, Board Appeal. Pick the right lane and the 1-year deadline.', kws: ['appeal', 'denied', 'denial', 'higher-level review', 'supplemental claim', 'board of veterans', 'cavc', 'decision review'] },
  { path: '/va-home-loan', title: 'VA Home Loan Guide', desc: '$0 down, no PMI, COE, IRRRL refinance, funding fee waivers.', kws: ['va loan', 'va home loan', 'home loan', 'mortgage', 'irrrl', 'refinance', 'funding fee', 'coe'] },
  { path: '/va-healthcare', title: 'VA Healthcare Enrollment', desc: 'Eligibility, the 8 priority groups, Community Care, the 5-year combat window.', kws: ['va healthcare', 'va health care', 'enrollment', 'priority group', 'community care', 'champva', 'tricare'] },
  { path: '/veteran-jobs', title: 'Veteran Jobs Guide', desc: 'Vet preference, VR&E, USERRA, MOS translation, vetted job boards.', kws: ['job', 'employment', 'hiring', 'vet preference', 'userra', 'vr&e', 'voc rehab', 'skillbridge', 'usajobs', 'career'] },
  { path: '/military-spouses', title: 'Military Spouse Navigator', desc: 'MyCAA, MSEP jobs, USAJOBS spouse preference, free Vet Center counseling, CHAMPVA.', kws: ['military spouse', 'spouses', 'mycaa', 'msep', 'champva', 'pcs', 'tricare'] },
  { path: '/va-pension', title: 'VA Pension & Aid \u0026 Attendance', desc: 'Tax-free pension for low-income wartime vets 65+ or disabled, plus Aid \u0026 Attendance enhancement.', kws: ['pension', 'aid and attendance', 'aid & attendance', 'wartime', 'older veteran', 'elderly', 'long-term care', 'assisted living', 'nursing home'] },
  { path: '/military-discounts', title: 'Veteran Discounts', desc: 'Verified discounts by category: travel, home, auto, tech, food, education.', kws: ['discount', 'discounts', 'savings', 'military discount', 'veteran day deals', 'free meal'] },
  { path: '/tricare', title: 'TRICARE Guide', desc: 'Prime, Select, TFL, TRS \u2014 the right plan, separation transitions, denials and appeals.', kws: ['tricare', 'tricare prime', 'tricare select', 'tricare for life', 'chcbp', 'tamp', 'deers'] },
  { path: '/military-funeral-honors', title: 'Funeral Honors & Burial', desc: 'Free national cemetery burial, military funeral honors, headstones, and burial allowances.', kws: ['burial', 'funeral', 'cemetery', 'taps', 'headstone', 'memorial', 'gold star', 'died', 'death'] },
  { path: '/military-id', title: 'Veteran IDs Guide', desc: 'VHIC, VIC, state designations, REAL ID, and how to replace a lost DD-214.', kws: ['veteran id', 'vhic', 'vic', 'cac', 'usid', 'dd-214', 'real id', 'driver\u2019s license', 'license plate'] },
  { path: '/veteran-tax-benefits', title: 'Veteran Tax Benefits', desc: 'VA disability tax-free, military retirement state exemptions, CRSC/CRDP recovery, free filing.', kws: ['tax', 'taxes', 'taxable', 'crsc', 'crdp', 'miltax', 'property tax', 'severance pay'] },
  { path: '/military-retirement-pay', title: 'Military Retirement Pay', desc: 'Final Pay, High-3, BRS, Reserves, medical retirement, SBP, TSP, and CRSC/CRDP rules.', kws: ['retirement pay', 'pension', 'high-3', 'high three', 'brs', 'sbp', 'tsp', 'reserve retirement', '20 years'] },
  { path: '/tdiu', title: 'TDIU / Individual Unemployability', desc: 'How to get the 100% pay rate when service-connected disabilities prevent work.', kws: ['tdiu', 'unemployability', 'iu ', 'cannot work', 'unable to work', 'sustained employment'] }
];

function relatedPillarsHtml(article) {
  if (!article) return '';
  const hay = `${article.title || ''} ${article.excerpt || ''} ${article.category || ''}`.toLowerCase();
  const cat = (article.category || '').toLowerCase();
  // Score each pillar by keyword hits
  const scored = PILLAR_INDEX.map(p => {
    let score = 0;
    for (const kw of p.kws) if (hay.includes(kw)) score += 2;
    // Category-based bonus
    if (cat === 'health' && ['/mental-health', '/tbi', '/women-veterans', '/caregivers'].includes(p.path)) score += 1;
    if (cat === 'benefits' && ['/pact-act', '/va-disability', '/gi-bill', '/claim-help'].includes(p.path)) score += 1;
    if (cat === 'transition' && ['/transition-guide', '/gi-bill', '/discharge-upgrade'].includes(p.path)) score += 1;
    if (cat === 'family' && ['/caregivers', '/survivor-benefits'].includes(p.path)) score += 1;
    return { ...p, score };
  }).filter(p => p.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);

  if (!scored.length) return '';
  return `
    <aside class="pillar-promo" aria-label="Related guides">
      <div class="pillar-promo-eyebrow">Plain-English guides on this topic</div>
      <div class="pillar-promo-grid">
        ${scored.map(p => `
          <a href="${p.path}" class="pillar-promo-card">
            <h4>${escapeHtml(p.title)}</h4>
            <p>${escapeHtml(p.desc)}</p>
            <span class="pillar-promo-cta">Open guide →</span>
          </a>`).join('')}
      </div>
    </aside>`;
}

// ════════════════════════════════════════════════════════════════════════════
// DAILY BRIEF PERMALINK — /briefing/YYYY-MM-DD
// Citable archive of any past day's curated picks. Strong Google News
// "PublicationIssue" signal.
// ════════════════════════════════════════════════════════════════════════════
async function serveDailyBrief(env, url, request, year, month, day) {
  const dateStr = `${year}-${month}-${day}`;
  const baseUrl = `https://${CONFIG.publication.domain}`;
  let articles = [];
  if (env.DB) {
    try {
      const rs = await env.DB.prepare(`
        SELECT id, slug, title, excerpt, category, author, publish_date, image,
               source, source_slug, source_url, service_branch, quality_score
        FROM articles
        WHERE substr(publish_date, 1, 10) = ? AND link_status != 'broken' AND low_quality = 0
        ORDER BY quality_score DESC, publish_date DESC LIMIT 12
      `).bind(dateStr).all();
      articles = (rs.results || []).map(articleRowToObj);
    } catch {}
  }
  if (!articles.length) {
    return new Response(shellPage({
      title: `Daily Brief: ${dateStr} — Veteran News`,
      description: `No archived briefing for ${dateStr}.`,
      canonicalPath: `/briefing/${year}/${month}/${day}`,
      navActive: '',
      contentHtml: `<div class="container"><div class="loading" style="padding:var(--s-9);text-align:center;">No briefing archived for ${dateStr}. <a href="/archive">Browse the archive</a>.</div></div>`,
      extraHead: '<meta name="robots" content="noindex">'
    }), { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }

  const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const dateLabel = `${monthNames[parseInt(month, 10)] || month} ${parseInt(day, 10)}, ${year}`;
  const lead = articles[0];
  const rest = articles.slice(1);

  const issueLd = {
    '@context': 'https://schema.org',
    '@type': 'PublicationIssue',
    issueNumber: dateStr,
    datePublished: dateStr,
    name: `Veteran News Daily Brief: ${dateLabel}`,
    isPartOf: { '@id': `${baseUrl}/#website` },
    inLanguage: 'en-US',
    hasPart: articles.slice(0, 10).map(a => ({
      '@type': 'NewsArticle',
      headline: a.title,
      url: `${baseUrl}/news/${a.slug}`,
      datePublished: a.publishDate,
      author: { '@type': 'Organization', name: a.source }
    }))
  };

  const briefingHtml = rest.map((s, i) => `
    <li class="briefing-item">
      <a href="/news/${escapeHtml(s.slug)}" style="display:block;">
        <span class="tag">${escapeHtml(formatCat(s.category))}</span>
        <h3>${escapeHtml(s.title)}</h3>
        <div class="byline">
          <span class="byline-source">${escapeHtml(s.source || 'Veteran News')}</span>
        </div>
      </a>
    </li>`).join('');

  const content = `
    <section class="page-hero">
      <div class="container">
        <a href="/archive/${year}/${month}" class="back-link">← ${monthNames[parseInt(month, 10)]} ${year}</a>
        <div class="eyebrow">Daily Brief · Issue ${escapeHtml(dateStr)}</div>
        <h1 class="page-title">${escapeHtml(dateLabel)}</h1>
        <p class="page-lede">${articles.length} curated stories — the briefing as it ran on ${dateLabel}.</p>
      </div>
    </section>
    <div class="container">
      <section class="section">
        <div class="briefing-grid">
          <a href="/news/${escapeHtml(lead.slug)}" class="lead-story">
            ${img(lead, 'lead', 'eager')}
            <div class="lead-story-body">
              <span class="tag">${escapeHtml(formatCat(lead.category))}</span>
              <h2>${escapeHtml(lead.title)}</h2>
              ${lead.excerpt ? `<p>${escapeHtml(truncateText(lead.excerpt, 220))}</p>` : ''}
              <div class="byline">
                <span class="byline-source">${escapeHtml(lead.source || 'Veteran News')}</span>
              </div>
            </div>
          </a>
          <ol class="briefing-list">${briefingHtml}</ol>
        </div>
      </section>
    </div>`;

  return new Response(shellPage({
    title: `Daily Brief: ${dateLabel} — Veteran News`,
    description: `${articles.length} curated stories from the Veteran News briefing on ${dateLabel}.`,
    canonicalPath: `/briefing/${year}/${month}/${day}`,
    navActive: 'home',
    contentHtml: content,
    extraHead: `<script type="application/ld+json">${JSON.stringify(issueLd)}</script>`
  }), {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'Last-Modified': new Date(`${dateStr}T23:59:59Z`).toUTCString()
    }
  });
}

// ════════════════════════════════════════════════════════════════════════════
// JSON Feed (https://www.jsonfeed.org/) — modern syndication alongside RSS
// ════════════════════════════════════════════════════════════════════════════
async function handleJsonFeed(env) {
  const baseUrl = `https://${CONFIG.publication.domain}`;
  let articles = [];
  if (env.DB) {
    try {
      const rs = await env.DB.prepare(`
        SELECT id, slug, title, excerpt, category, author, publish_date, image,
               source, source_url
        FROM articles WHERE link_status != 'broken' AND low_quality = 0
        ORDER BY publish_date DESC LIMIT 50
      `).all();
      articles = (rs.results || []).map(articleRowToObj);
    } catch {}
  }
  if (!articles.length) {
    try {
      const data = await env.ARTICLES_KV.get('articles', { type: 'json' });
      articles = deduplicateArticles(data?.articles || []).slice(0, 50);
    } catch {}
  }

  const feed = {
    version: 'https://jsonfeed.org/version/1.1',
    title: 'Veteran News',
    home_page_url: baseUrl,
    feed_url: `${baseUrl}/feed.json`,
    description: 'The trusted daily intelligence briefing for U.S. veterans. A Warriors Fund initiative.',
    icon: `${baseUrl}/og-image.png`,
    favicon: `${baseUrl}/favicon.svg`,
    language: 'en-US',
    authors: [{ name: 'Veteran News', url: baseUrl }],
    items: articles.map(a => ({
      id: `${baseUrl}/news/${a.slug || generateSlug(a.title)}`,
      url: `${baseUrl}/news/${a.slug || generateSlug(a.title)}`,
      title: a.title,
      summary: cleanExcerpt(a.excerpt || '').slice(0, 500),
      content_text: cleanExcerpt(a.excerpt || ''),
      image: a.image || undefined,
      banner_image: a.image || undefined,
      date_published: a.publishDate || a.publish_date,
      tags: a.category ? [a.category] : [],
      authors: [{ name: a.source || 'Veteran News' }],
      external_url: a.sourceUrl || a.source_url || undefined
    }))
  };

  return new Response(JSON.stringify(feed, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/feed+json; charset=utf-8',
      'Cache-Control': 'public, max-age=900',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

// ════════════════════════════════════════════════════════════════════════════
// EVENTS PAGE — SSR with Event schema
// Each upcoming event becomes a schema.org/Event eligible for Google Events
// rich result on SERP.
// ════════════════════════════════════════════════════════════════════════════
async function serveEventsPage(env, url, request) {
  const baseUrl = `https://${CONFIG.publication.domain}`;
  let events = [];
  try {
    const data = await env.ARTICLES_KV.get('articles', { type: 'json' });
    events = data?.events || [];
  } catch {}

  const now = new Date();
  const upcoming = events
    .filter(e => e.startDate && new Date(e.startDate) > now)
    .sort((a, b) => new Date(a.startDate) - new Date(b.startDate))
    .slice(0, 50);

  // ItemList schema wrapping individual Event objects
  const itemListLd = upcoming.length ? {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Upcoming Veteran Events',
    itemListElement: upcoming.slice(0, 30).map((e, i) => {
      const ev = {
        '@type': 'Event',
        name: e.title,
        startDate: e.startDate,
        endDate: e.endDate || e.startDate,
        eventStatus: 'https://schema.org/EventScheduled',
        eventAttendanceMode: e.isVirtual
          ? 'https://schema.org/OnlineEventAttendanceMode'
          : 'https://schema.org/OfflineEventAttendanceMode',
        url: e.url || baseUrl + '/events',
        description: (e.description || '').slice(0, 500) || `Veteran event: ${e.title}`,
        organizer: {
          '@type': 'Organization',
          name: e.organization || 'Veteran Community',
          url: e.url || baseUrl
        },
        offers: {
          '@type': 'Offer',
          url: e.url || baseUrl + '/events',
          price: '0',
          priceCurrency: 'USD',
          availability: 'https://schema.org/InStock',
          validFrom: new Date().toISOString()
        }
      };
      if (e.isVirtual) {
        ev.location = {
          '@type': 'VirtualLocation',
          url: e.url || baseUrl + '/events'
        };
      } else {
        const locStr = (e.location && typeof e.location === 'object')
          ? [e.location.city, e.location.state].filter(Boolean).join(', ')
          : (typeof e.location === 'string' ? e.location : 'United States');
        ev.location = {
          '@type': 'Place',
          name: locStr || 'United States',
          address: {
            '@type': 'PostalAddress',
            addressLocality: (e.location && e.location.city) || undefined,
            addressRegion: (e.location && e.location.state) || undefined,
            addressCountry: 'US'
          }
        };
      }
      return { '@type': 'ListItem', position: i + 1, item: ev };
    })
  } : null;

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${baseUrl}/` },
      { '@type': 'ListItem', position: 2, name: 'Events', item: `${baseUrl}/events` }
    ]
  };

  // Fall back to template — inject schema before </head>
  let resp = await env.ASSETS.fetch(new Request(new URL('/events.html', url.origin), { method: 'GET', redirect: 'follow' }));
  if ([301, 302, 307].includes(resp.status)) {
    const loc = resp.headers.get('Location');
    if (loc) resp = await env.ASSETS.fetch(new Request(new URL(loc, url.origin), { method: 'GET' }));
  }
  let html = await resp.text();
  const ldArr = itemListLd ? [breadcrumbLd, itemListLd] : [breadcrumbLd];
  const ldScript = `<script type="application/ld+json">${JSON.stringify(ldArr)}</script>`;
  html = html.replace('</head>', ldScript + '\n</head>');

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=600',
      'X-SSR': 'events'
    }
  });
}

// ════════════════════════════════════════════════════════════════════════════
// /topic/[slug] — fine-grained tag pages (PACT Act, GI Bill, PTSD, etc.)
// Strong SEO: each maps to a high-volume veteran search term and consolidates
// all related articles into one anchor URL.
// ════════════════════════════════════════════════════════════════════════════
async function serveTopicPage(env, url, request, topicSlug) {
  if (!env.DB) return new Response('D1 unavailable', { status: 503 });
  const baseUrl = `https://${CONFIG.publication.domain}`;

  let topic;
  try {
    topic = await env.DB.prepare('SELECT slug, name, description, article_count FROM topics WHERE slug = ?').bind(topicSlug).first();
  } catch {}
  if (!topic) {
    return new Response(shellPage({
      title: 'Topic not found — Veteran News',
      description: 'No topic found at this URL.',
      canonicalPath: `/topic/${topicSlug}`,
      navActive: '',
      contentHtml: `<div class="container"><div class="loading" style="padding:var(--s-9);text-align:center;">Topic not found. <a href="/topics">Browse all topics →</a></div></div>`,
      extraHead: '<meta name="robots" content="noindex">'
    }), { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }

  let articles = [];
  try {
    const rs = await env.DB.prepare(`
      SELECT a.id, a.slug, a.title, a.excerpt, a.category, a.publish_date, a.image, a.source
      FROM article_topics t
      JOIN articles a ON a.slug = t.article_id
      WHERE t.topic_slug = ? AND a.link_status != 'broken' AND a.low_quality = 0
      ORDER BY a.publish_date DESC LIMIT 50
    `).bind(topicSlug).all();
    articles = (rs.results || []).map(articleRowToObj);
  } catch {}

  const list = articles.length ? articles.map(s => `
    <li class="row">
      <a href="/news/${escapeHtml(s.slug)}" class="row-content" style="display:flex;flex-direction:column;gap:var(--s-2);">
        <span class="tag">${escapeHtml((s.category || 'news').toUpperCase())}</span>
        <h3 class="row-title">${escapeHtml(s.title)}</h3>
        ${s.excerpt ? `<p class="row-excerpt">${escapeHtml((s.excerpt || '').slice(0, 200))}</p>` : ''}
        <div class="byline">
          ${sourceAvatar(s.source)}
          <span class="byline-source">${escapeHtml(s.source || '')}</span>
          <span class="byline-divider">·</span>
          <span>${formatRelTime(s.publishDate)}</span>
        </div>
      </a>
      <a href="/news/${escapeHtml(s.slug)}">${img(s, 'row')}</a>
    </li>`).join('') : '<li class="loading">No coverage yet for this topic — check back soon.</li>';

  // Schema.org markup: CollectionPage + ItemList + DefinedTerm
  const definedTermLd = {
    '@context': 'https://schema.org',
    '@type': 'DefinedTerm',
    '@id': `${baseUrl}/topic/${topicSlug}#term`,
    name: topic.name,
    description: topic.description,
    inDefinedTermSet: { '@type': 'DefinedTermSet', name: 'Veteran News topics', url: `${baseUrl}/topics` },
    url: `${baseUrl}/topic/${topicSlug}`
  };
  const collectionLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    url: `${baseUrl}/topic/${topicSlug}`,
    name: `${topic.name} — Veteran News`,
    description: topic.description,
    isPartOf: { '@id': `${baseUrl}/#website` },
    about: { '@id': `${baseUrl}/topic/${topicSlug}#term` },
    numberOfItems: articles.length,
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: articles.slice(0, 30).map((a, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: `${baseUrl}/news/${a.slug}`,
        name: a.title
      }))
    }
  };
  const breadcrumbLd = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${baseUrl}/` },
      { '@type': 'ListItem', position: 2, name: 'Topics', item: `${baseUrl}/topics` },
      { '@type': 'ListItem', position: 3, name: topic.name, item: `${baseUrl}/topic/${topicSlug}` }
    ]
  };

  const content = `
    <section class="page-hero">
      <div class="container">
        <a href="/topics" class="back-link">← All topics</a>
        <div class="eyebrow">Topic</div>
        <h1 class="page-title">${escapeHtml(topic.name)}</h1>
        <p class="page-lede">${escapeHtml(topic.description || '')} <span style="color:var(--ink-soft);">${articles.length} ${articles.length === 1 ? 'story' : 'stories'} on this topic.</span></p>
      </div>
    </section>
    <div class="container">
      <section class="section">
        <ul class="row-list">${list}</ul>
      </section>
    </div>`;

  return new Response(shellPage({
    title: `${topic.name} — Veteran News`,
    description: `${articles.length} stories about ${topic.name} for U.S. veterans. ${topic.description || ''}`.slice(0, 160),
    canonicalPath: `/topic/${topicSlug}`,
    navActive: '',
    contentHtml: content,
    extraHead: `<script type="application/ld+json">${JSON.stringify([definedTermLd, collectionLd, breadcrumbLd])}</script>`
  }), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=600' } });
}

// Topics sitemap — every topic + section + branch + state aggregation page
async function handleTopicsSitemap(env) {
  const baseUrl = `https://${CONFIG.publication.domain}`;
  let topics = [];
  let authors = [];
  let sources = [];
  if (env.DB) {
    try {
      const tRs = await env.DB.prepare(`SELECT slug FROM topics WHERE article_count > 0`).all();
      topics = tRs.results || [];
      // Authors with at least 2 stories
      const aRs = await env.DB.prepare(`
        SELECT LOWER(REPLACE(REPLACE(author, ' ', '-'), '.', '')) AS slug, COUNT(*) AS c
        FROM articles WHERE author IS NOT NULL AND author != '' AND author != 'Veteran News'
          AND link_status != 'broken' AND low_quality = 0
        GROUP BY slug HAVING c >= 2 LIMIT 200
      `).all();
      authors = aRs.results || [];
      // All distinct sources
      const sRs = await env.DB.prepare(`SELECT DISTINCT source_slug FROM articles WHERE source_slug IS NOT NULL AND link_status != 'broken'`).all();
      sources = sRs.results || [];
    } catch {}
  }
  const SECTIONS = ['benefits', 'health', 'service', 'transition', 'advocacy', 'legacy', 'community', 'family'];
  const BRANCHES = ['army', 'navy', 'air-force', 'marines', 'coast-guard', 'space-force'];
  const STATES = Object.keys(STATE_NAMES);
  const now = new Date().toISOString();
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;
  for (const t of topics) {
    xml += `\n  <url><loc>${baseUrl}/topic/${escapeHtml(t.slug)}</loc><lastmod>${now}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>`;
  }
  for (const s of SECTIONS) {
    xml += `\n  <url><loc>${baseUrl}/${s}</loc><lastmod>${now}</lastmod><changefreq>hourly</changefreq><priority>0.85</priority></url>`;
  }
  for (const b of BRANCHES) {
    xml += `\n  <url><loc>${baseUrl}/branch/${b}</loc><lastmod>${now}</lastmod><changefreq>daily</changefreq><priority>0.7</priority></url>`;
  }
  for (const st of STATES) {
    xml += `\n  <url><loc>${baseUrl}/state/${st.toLowerCase()}</loc><lastmod>${now}</lastmod><changefreq>weekly</changefreq><priority>0.6</priority></url>`;
  }
  for (const a of authors) {
    if (a.slug && a.slug.length > 1) {
      xml += `\n  <url><loc>${baseUrl}/author/${escapeHtml(a.slug)}</loc><lastmod>${now}</lastmod><changefreq>weekly</changefreq><priority>0.5</priority></url>`;
    }
  }
  for (const s of sources) {
    if (s.source_slug) {
      xml += `\n  <url><loc>${baseUrl}/source/${escapeHtml(s.source_slug)}</loc><lastmod>${now}</lastmod><changefreq>daily</changefreq><priority>0.6</priority></url>`;
    }
  }
  xml += '\n</urlset>';
  return new Response(xml, { status: 200, headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}
