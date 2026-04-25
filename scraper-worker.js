/**
 * Veteran News — Scraper Worker
 *
 * Ground truth for those who served.
 * Autonomous content ingestion from trusted veteran news sources.
 *
 * Runs every 6 hours via cron trigger.
 */

// =============================================================================
// NEWS SOURCES CONFIGURATION
// =============================================================================

const NEWS_SOURCES = [
  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 1: PRIMARY INTELLIGENCE SOURCES
  // High-trust, high-quality journalism essential for veteran situational awareness
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: 'The War Horse',
    type: 'rss',
    url: 'https://thewarhorse.org/feed/',
    priority: 1,
    categoryMap: { default: 'health' },
    description: 'Award-winning nonprofit investigative journalism on military service impact'
  },
  {
    name: 'VA News',
    type: 'rss',
    url: 'https://news.va.gov/feed/',
    priority: 1,
    categoryMap: { default: 'benefits' },
    description: 'Official VA announcements, policy updates, and veteran resources'
  },
  {
    name: 'Military Times - Veterans',
    type: 'rss',
    url: 'https://www.militarytimes.com/arc/outboundfeeds/rss/category/veterans/?outputType=xml',
    priority: 1,
    categoryMap: { default: 'benefits' },
    description: 'Comprehensive veteran news coverage'
  },
  {
    name: 'Task & Purpose',
    type: 'rss',
    url: 'https://taskandpurpose.com/feed/',
    priority: 1,
    categoryMap: { default: 'service' },
    description: 'Military culture, analysis, and investigative reporting'
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 2: PRACTICAL RESOURCES & COMMUNITY
  // Benefits guidance, job resources, and advocacy
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: 'Military.com - Benefits',
    type: 'rss',
    url: 'https://www.military.com/rss-feeds/content?channel=benefits',
    priority: 2,
    categoryMap: { default: 'benefits' },
    description: 'VA benefits news, calculators, and practical guidance'
  },
  {
    name: 'Military.com - Veteran Jobs',
    type: 'rss',
    url: 'https://www.military.com/rss-feeds/content?channel=veteran-jobs',
    priority: 2,
    categoryMap: { default: 'transition' },
    description: 'Career transition, job opportunities, and employment resources'
  },
  {
    name: 'We Are The Mighty',
    type: 'rss',
    url: 'https://www.wearethemighty.com/feed/',
    priority: 2,
    categoryMap: { default: 'legacy' },
    description: 'Military entertainment, culture, and history'
  },
  {
    name: 'DAV',
    type: 'rss',
    url: 'https://www.dav.org/feed/',
    priority: 2,
    categoryMap: { default: 'advocacy' },
    description: 'Disabled American Veterans advocacy and news'
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 3: SERVICE BRANCH COVERAGE
  // Branch-specific news for targeted relevance
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: 'Army Times - Veterans',
    type: 'rss',
    url: 'https://www.armytimes.com/arc/outboundfeeds/rss/category/veterans/?outputType=xml',
    priority: 3,
    serviceBranch: 'Army',
    categoryMap: { default: 'service' }
  },
  {
    name: 'Navy Times - Veterans',
    type: 'rss',
    url: 'https://www.navytimes.com/arc/outboundfeeds/rss/category/veterans/?outputType=xml',
    priority: 3,
    serviceBranch: 'Navy',
    categoryMap: { default: 'service' }
  },
  {
    name: 'Air Force Times - Veterans',
    type: 'rss',
    url: 'https://www.airforcetimes.com/arc/outboundfeeds/rss/category/veterans/?outputType=xml',
    priority: 3,
    serviceBranch: 'Air Force',
    categoryMap: { default: 'service' }
  },
  {
    name: 'Marine Corps Times - Veterans',
    type: 'rss',
    url: 'https://www.marinecorpstimes.com/arc/outboundfeeds/rss/category/veterans/?outputType=xml',
    priority: 3,
    serviceBranch: 'Marines',
    categoryMap: { default: 'service' }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 4: SPECIALIZED SOURCES
  // Niche but valuable for specific veteran needs
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: 'Military.com - Family',
    type: 'rss',
    url: 'https://www.military.com/rss-feeds/content?channel=spouse+and+family&type=evergreen,news',
    priority: 4,
    categoryMap: { default: 'family' },
    description: 'Military family news, spouse resources, and caregiver support'
  },
  {
    name: 'Rep For Vets',
    type: 'rss',
    url: 'https://www.repforvets.com/feed/',
    priority: 4,
    categoryMap: { default: 'benefits' },
    description: 'VA disability claims expertise and guidance'
  }
];

// =============================================================================
// CATEGORY CONFIGURATION
// =============================================================================

const CATEGORIES = {
  transition: {
    keywords: ['transition', 'employment', 'job', 'career', 'resume', 'hire',
               'civilian', 'TAP', 'skillbridge', 'workforce', 'unemployment',
               'interview', 'salary', 'remote work', 'linkedin']
  },
  benefits: {
    keywords: ['benefit', 'disability', 'claim', 'VA rating', 'compensation',
               'pension', 'GI Bill', 'education benefit', 'home loan', 'insurance',
               'PACT Act', 'toxic exposure', 'presumptive', 'appeal', 'back pay',
               'disability rating', 'service-connected']
  },
  health: {
    keywords: ['health', 'mental health', 'PTSD', 'TBI', 'suicide', 'therapy',
               'counseling', 'VA hospital', 'clinic', 'medical', 'treatment',
               'depression', 'anxiety', 'substance', 'wellness', 'telehealth',
               'crisis', 'healthcare']
  },
  community: {
    keywords: ['community', 'veteran group', 'brotherhood', 'sisterhood',
               'reunion', 'VFW', 'American Legion', 'DAV', 'volunteer',
               'mentor', 'peer support', 'network', 'social', 'camaraderie']
  },
  advocacy: {
    keywords: ['advocacy', 'legislation', 'congress', 'policy', 'law', 'bill',
               'senator', 'representative', 'testimony', 'reform', 'vote',
               'lobbying', 'rights', 'justice', 'accountability']
  },
  family: {
    keywords: ['family', 'spouse', 'military spouse', 'dependent', 'child',
               'caregiver', 'gold star', 'survivor', 'widow', 'parent',
               'marriage', 'relationship', 'DIC', 'champva']
  },
  service: {
    keywords: ['active duty', 'deployment', 'military', 'Pentagon', 'DoD',
               'defense', 'Army', 'Navy', 'Air Force', 'Marines', 'Marine Corps',
               'Space Force', 'Coast Guard', 'National Guard', 'Reserve']
  },
  legacy: {
    keywords: ['legacy', 'memorial', 'honor', 'tribute', 'hero', 'story',
               'history', 'ceremony', 'Arlington', 'fallen', 'remembrance',
               'Medal of Honor', 'valor', 'sacrifice', 'veteran story', 'WWII',
               'Vietnam', 'Korea']
  }
};

// =============================================================================
// WORKER ENTRY POINTS
// =============================================================================

export default {
  // Scheduled scraping — multiple crons routed by pattern
  async scheduled(event, env, ctx) {
    // Backfill images cron (every 2h) — separate, lighter
    if (event.cron === '30 */2 * * *') {
      console.log('🖼️  Image backfill cron starting...');
      ctx.waitUntil(backfillImages(env));
      return;
    }
    // Dead-link sweep (daily 04:00 UTC)
    if (event.cron === '0 4 * * *') {
      console.log('🔗 Dead-link sweep starting...');
      ctx.waitUntil(deadLinkSweep(env));
      return;
    }
    // Default: full scrape (every 6h)
    console.log('🎖️ Veteran News Scraper: Starting scheduled scrape...');
    ctx.waitUntil(scrapeAllSources(env));
  },

  // HTTP interface for manual triggers and status
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/scrape' && request.method === 'POST') {
      ctx.waitUntil(scrapeAllSources(env));
      return jsonResponse({ status: 'Scrape initiated', timestamp: new Date().toISOString() });
    }

    if (url.pathname === '/scrape-events' && request.method === 'POST') {
      ctx.waitUntil(scrapeAllEvents(env));
      return jsonResponse({ status: 'Event scrape initiated', timestamp: new Date().toISOString() });
    }

    if (url.pathname === '/clear-events' && request.method === 'POST') {
      const data = await env.ARTICLES_KV.get('articles', { type: 'json' }) || {};
      data.events = [];
      await env.ARTICLES_KV.put('articles', JSON.stringify(data));
      ctx.waitUntil(scrapeAllEvents(env));
      return jsonResponse({ status: 'Events cleared and re-scrape initiated', timestamp: new Date().toISOString() });
    }

    // Manual image backfill
    if (url.pathname === '/backfill-images' && request.method === 'POST') {
      ctx.waitUntil(backfillImages(env));
      return jsonResponse({ status: 'Image backfill initiated', timestamp: new Date().toISOString() });
    }

    // Manual dead-link sweep
    if (url.pathname === '/dead-link-sweep' && request.method === 'POST') {
      ctx.waitUntil(deadLinkSweep(env));
      return jsonResponse({ status: 'Dead link sweep initiated', timestamp: new Date().toISOString() });
    }

    // Source health
    if (url.pathname === '/health') {
      return handleSourceHealth(env);
    }

    if (url.pathname === '/status') {
      return handleStatus(env);
    }

    if (url.pathname === '/articles') {
      const data = await env.ARTICLES_KV.get('articles', { type: 'json' });
      return jsonResponse(data || { articles: [] });
    }

    if (url.pathname === '/events') {
      const data = await env.ARTICLES_KV.get('articles', { type: 'json' });
      return jsonResponse({ events: data?.events || [] });
    }

    return new Response('Veteran News Scraper\n\nPOST /scrape - full scrape\nPOST /scrape-events\nPOST /backfill-images\nPOST /dead-link-sweep\nGET /status\nGET /health', {
      headers: { 'Content-Type': 'text/plain' }
    });
  }
};

// =============================================================================
// MAIN SCRAPING LOGIC
// =============================================================================

async function scrapeAllSources(env) {
  console.log('📰 Starting news scrape...');
  const startTime = Date.now();

  // Get existing data
  const existingData = await env.ARTICLES_KV.get('articles', { type: 'json' }) || {
    articles: [],
    events: [],
    resources: getDefaultResources(),
    organizations: getDefaultOrganizations(),
    categories: Object.keys(CATEGORIES),
    lastUpdate: null
  };

  const existingArticles = existingData.articles || [];
  const existingIds = new Set(existingArticles.map(a => a.id));
  const existingSlugs = new Set(existingArticles.map(a => a.slug));
  const existingUrls = new Set(existingArticles.map(a => a.sourceUrl));
  // Title-based dedup to catch same article from multiple Military Times feeds
  const existingTitles = new Set(existingArticles.map(a => normalizeTitle(a.title)));

  let allNewArticles = [];
  const newTitles = new Set();
  const sourceResults = [];

  // Scrape in batches of 3 to avoid overwhelming sources
  const batches = [];
  for (let i = 0; i < NEWS_SOURCES.length; i += 3) {
    batches.push(NEWS_SOURCES.slice(i, i + 3));
  }

  // Skip suspended sources unless cooled-off (24h since last error)
  const isSuspendedHealthCheck = async (source) => {
    const h = await getSourceHealth(env, source.name);
    if (!h?.suspended) return false;
    const lastErrAt = h.lastErrorAt ? new Date(h.lastErrorAt).getTime() : 0;
    return (Date.now() - lastErrAt) < 24 * 3600 * 1000;
  };

  for (const batch of batches) {
    // Filter suspended sources upfront
    const activeBatch = [];
    for (const source of batch) {
      if (await isSuspendedHealthCheck(source)) {
        sourceResults.push({ name: source.name, status: 'suspended' });
        console.log(`⏸️  ${source.name}: suspended (low health score)`);
        continue;
      }
      activeBatch.push(source);
    }

    const results = await Promise.allSettled(
      activeBatch.map(source => scrapeSource(source, env))
    );

    for (let i = 0; i < results.length; i++) {
      const source = activeBatch[i];
      const result = results[i];

      if (result.status === 'fulfilled') {
        const articles = result.value;
        const newArticles = articles.filter(article => {
          const normTitle = normalizeTitle(article.title);
          if (existingIds.has(article.id) ||
              existingSlugs.has(article.slug) ||
              existingUrls.has(article.sourceUrl) ||
              existingTitles.has(normTitle) ||
              newTitles.has(normTitle)) {
            return false;
          }
          newTitles.add(normTitle);
          return true;
        });

        allNewArticles = allNewArticles.concat(newArticles);
        const imageFillRate = articles.length ? articles.filter(a => a.image).length / articles.length : 0;
        sourceResults.push({
          name: source.name,
          status: 'success',
          fetched: articles.length,
          new: newArticles.length,
          imageFillRate: Math.round(imageFillRate * 100)
        });
        await updateSourceHealth(env, source.name, true, newArticles.length);
        console.log(`✅ ${source.name}: ${newArticles.length} new / ${articles.length} total · ${Math.round(imageFillRate * 100)}% images`);
      } else {
        const errMsg = result.reason?.message || 'Unknown error';
        sourceResults.push({ name: source.name, status: 'error', error: errMsg });
        await updateSourceHealth(env, source.name, false, 0, errMsg);
        console.error(`❌ ${source.name}: ${errMsg}`);
      }
    }
  }

  // Merge and deduplicate
  const mergedArticles = [...allNewArticles, ...existingArticles]
    .sort((a, b) => new Date(b.publishDate) - new Date(a.publishDate))
    .slice(0, 2000); // Keep most recent 2000

  // Also scrape events
  const events = await scrapeAllEvents(env, true);

  // Save to KV
  const updatedData = {
    ...existingData,
    articles: mergedArticles,
    events: events || existingData.events || [],
    lastUpdate: new Date().toISOString(),
    lastScrape: {
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime,
      newArticles: allNewArticles.length,
      totalArticles: mergedArticles.length,
      sources: sourceResults
    },
    publication: 'veterannews'
  };

  await env.ARTICLES_KV.put('articles', JSON.stringify(updatedData));

  console.log(`🎖️ Scrape complete: ${allNewArticles.length} new articles, ${mergedArticles.length} total`);
  return updatedData;
}

// =============================================================================
// RSS SCRAPING
// =============================================================================

async function scrapeSource(source, env) {
  if (source.type !== 'rss') return [];

  // Retry with exponential backoff: only on 5xx / network errors
  const delays = [0, 1500, 4000];
  let lastError;
  for (let attempt = 0; attempt < delays.length; attempt++) {
    if (delays[attempt]) await new Promise(r => setTimeout(r, delays[attempt]));
    try {
      const response = await fetch(source.url, {
        headers: {
          'User-Agent': 'VeteranNews/1.0 (+https://veteransnews.org/about)',
          'Accept': 'application/rss+xml, application/xml, text/xml, */*'
        },
        signal: AbortSignal.timeout(15000)
      });
      if (!response.ok) {
        if (response.status >= 500) {
          lastError = new Error(`HTTP ${response.status}`);
          continue; // retry
        }
        throw new Error(`HTTP ${response.status}`); // 4xx — no retry
      }
      const xml = await response.text();
      const items = parseRSS(xml);
      const articles = items.map(item => transformArticle(item, source)).filter(Boolean);

      // OG-image enrichment for items with no RSS image (parallel, throttled)
      if (env?.ARTICLES_KV) {
        const noImage = articles.filter(a => !a.image).slice(0, 6); // cap to 6 per source/run for budget
        if (noImage.length > 0) {
          const enriched = await Promise.allSettled(
            noImage.map(a => fetchOgImage(a.sourceUrl, env).then(img => { if (img) a.image = img; }))
          );
        }
      }
      return articles;
    } catch (e) {
      lastError = e;
      // Network errors (timeout/DNS) — retry
      if (e.name === 'TimeoutError' || /fetch|network|abort/i.test(e.message)) continue;
      throw e;
    }
  }
  throw lastError || new Error('scrape failed after retries');
}

// Update per-source health record after each scrape attempt
async function updateSourceHealth(env, sourceName, success, articlesIn = 0, error = null) {
  if (!env?.ARTICLES_KV) return;
  const key = `health:${sourceName}`;
  const cur = (await env.ARTICLES_KV.get(key, { type: 'json' })) || {
    score: 100, consecutiveFailures: 0, lastSuccess: null, lastError: null,
    runs: 0, totalArticles: 0
  };
  cur.runs = (cur.runs || 0) + 1;
  if (success) {
    cur.score = Math.min(100, (cur.score || 100) + 5);
    cur.consecutiveFailures = 0;
    cur.lastSuccess = new Date().toISOString();
    cur.totalArticles = (cur.totalArticles || 0) + articlesIn;
  } else {
    cur.score = Math.max(0, (cur.score || 100) - 20);
    cur.consecutiveFailures = (cur.consecutiveFailures || 0) + 1;
    cur.lastError = error ? String(error).slice(0, 200) : 'unknown';
    cur.lastErrorAt = new Date().toISOString();
  }
  cur.suspended = cur.score < 20 || cur.consecutiveFailures >= 5;
  await env.ARTICLES_KV.put(key, JSON.stringify(cur), { expirationTtl: 30 * 86400 });
}

async function getSourceHealth(env, sourceName) {
  if (!env?.ARTICLES_KV) return null;
  return env.ARTICLES_KV.get(`health:${sourceName}`, { type: 'json' });
}

function parseRSS(xml) {
  const items = [];

  // Extract channel-level fallback image (RSS 2.0 <image><url>)
  const channelImageMatch = xml.match(/<image[^>]*>[\s\S]*?<url>([\s\S]*?)<\/url>[\s\S]*?<\/image>/i);
  const channelImage = channelImageMatch ? cleanText(channelImageMatch[1]) : null;

  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1];
    items.push({
      title: extractTag(itemXml, 'title'),
      link: extractTag(itemXml, 'link'),
      description: extractTag(itemXml, 'description'),
      content: extractTag(itemXml, 'content:encoded') || extractTag(itemXml, 'content'),
      pubDate: extractTag(itemXml, 'pubDate'),
      author: extractTag(itemXml, 'dc:creator') || extractTag(itemXml, 'author'),
      categories: extractAllTags(itemXml, 'category'),
      enclosure: extractEnclosure(itemXml),
      mediaContent: extractMediaContent(itemXml),
      mediaThumbnail: extractMediaThumbnail(itemXml),
      itunesImage: extractItunesImage(itemXml),
      channelImage
    });
  }

  // Atom support (in case feed uses <entry> instead of <item>)
  if (items.length === 0) {
    const entryRegex = /<entry[^>]*>([\s\S]*?)<\/entry>/gi;
    let amatch;
    while ((amatch = entryRegex.exec(xml)) !== null) {
      const ex = amatch[1];
      const linkMatch = ex.match(/<link[^>]+href=["']([^"']+)["']/i);
      items.push({
        title: extractTag(ex, 'title'),
        link: linkMatch ? linkMatch[1] : '',
        description: extractTag(ex, 'summary'),
        content: extractTag(ex, 'content'),
        pubDate: extractTag(ex, 'updated') || extractTag(ex, 'published'),
        author: extractTag(ex, 'name') || '',
        categories: extractAllTags(ex, 'category'),
        enclosure: extractAtomEnclosure(ex),
        mediaContent: extractMediaContent(ex),
        mediaThumbnail: extractMediaThumbnail(ex),
        itunesImage: extractItunesImage(ex),
        channelImage
      });
    }
  }

  return items;
}

function extractTag(xml, tagName) {
  // Handle namespaced tags
  const escapedTag = tagName.replace(':', '\\:');
  const patterns = [
    new RegExp(`<${escapedTag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${escapedTag}>`, 'i'),
    new RegExp(`<${escapedTag}[^>]*>([\\s\\S]*?)<\\/${escapedTag}>`, 'i')
  ];

  for (const pattern of patterns) {
    const match = xml.match(pattern);
    if (match) {
      return cleanText(match[1]);
    }
  }
  return '';
}

function extractAllTags(xml, tagName) {
  const results = [];
  const regex = new RegExp(`<${tagName}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tagName}>`, 'gi');
  let match;
  while ((match = regex.exec(xml)) !== null) {
    results.push(cleanText(match[1]));
  }
  return results;
}

function isImageUrl(url) {
  if (!url) return false;
  // Accept obvious image extensions OR cdn paths that Cloudflare often produces without extensions.
  // Reject tracking pixels, audio, video.
  if (/\.(mp3|wav|m4a|mp4|mov|avi|webm|m3u8)(\?|$)/i.test(url)) return false;
  if (/(1x1|pixel|tracking|spacer|blank|transparent)\.(gif|png)/i.test(url)) return false;
  if (/\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(url)) return true;
  // Common image-host CDNs/paths without extensions
  if (/(images\.|img\.|cdn\.|wp-content\/uploads|media\.|imageapi)/i.test(url)) return true;
  return false;
}

function extractEnclosure(xml) {
  // Iterate all enclosures, prefer ones with type="image/*"
  const matches = [...xml.matchAll(/<enclosure[^>]+>/gi)];
  for (const m of matches) {
    const tag = m[0];
    const typeMatch = tag.match(/type=["']([^"']+)["']/i);
    const urlMatch = tag.match(/url=["']([^"']+)["']/i);
    if (!urlMatch) continue;
    const url = urlMatch[1];
    if (typeMatch && /^image\//i.test(typeMatch[1])) return url;
    if (!typeMatch && isImageUrl(url)) return url;
  }
  return null;
}

function extractAtomEnclosure(xml) {
  const matches = [...xml.matchAll(/<link[^>]+rel=["']enclosure["'][^>]*>/gi)];
  for (const m of matches) {
    const tag = m[0];
    const typeMatch = tag.match(/type=["']([^"']+)["']/i);
    const hrefMatch = tag.match(/href=["']([^"']+)["']/i);
    if (!hrefMatch) continue;
    if (!typeMatch || /^image\//i.test(typeMatch[1])) return hrefMatch[1];
  }
  return null;
}

function extractMediaContent(xml) {
  // Iterate all <media:content> — prefer ones with image medium and largest dimensions
  const matches = [...xml.matchAll(/<media:content[^>]+>/gi)];
  let best = null;
  let bestArea = 0;
  for (const m of matches) {
    const tag = m[0];
    const mediumMatch = tag.match(/medium=["']([^"']+)["']/i);
    const typeMatch = tag.match(/type=["']([^"']+)["']/i);
    const urlMatch = tag.match(/url=["']([^"']+)["']/i);
    if (!urlMatch) continue;
    const url = urlMatch[1];
    const isImage = (mediumMatch && /image/i.test(mediumMatch[1])) ||
                    (typeMatch && /^image\//i.test(typeMatch[1])) ||
                    isImageUrl(url);
    if (!isImage) continue;
    const w = parseInt(tag.match(/width=["'](\d+)["']/i)?.[1] || '0', 10);
    const h = parseInt(tag.match(/height=["'](\d+)["']/i)?.[1] || '0', 10);
    const area = w * h;
    if (area > bestArea) { bestArea = area; best = url; }
    if (!best) best = url;
  }
  return best;
}

function extractMediaThumbnail(xml) {
  // <media:thumbnail url="..." width=... height=.../> — used heavily by Sightline (Military Times family)
  const matches = [...xml.matchAll(/<media:thumbnail[^>]+>/gi)];
  let best = null;
  let bestArea = 0;
  for (const m of matches) {
    const urlMatch = m[0].match(/url=["']([^"']+)["']/i);
    if (!urlMatch) continue;
    const w = parseInt(m[0].match(/width=["'](\d+)["']/i)?.[1] || '0', 10);
    const h = parseInt(m[0].match(/height=["'](\d+)["']/i)?.[1] || '0', 10);
    const area = w * h;
    if (area > bestArea) { bestArea = area; best = urlMatch[1]; }
    if (!best) best = urlMatch[1];
  }
  return best;
}

function extractItunesImage(xml) {
  const m = xml.match(/<itunes:image[^>]+href=["']([^"']+)["']/i);
  return m ? m[1] : null;
}

// =============================================================================
// ARTICLE TRANSFORMATION
// =============================================================================

function transformArticle(item, source) {
  if (!item.title || !item.link) return null;

  const title = cleanText(item.title);
  const slug = generateSlug(title);
  const rawContent = (item.content && item.content.length > 10) ? item.content : (item.description || '');
  const excerpt = generateExcerpt(rawContent);

  // Image cascade: prefer high-quality RSS-supplied images.
  // Order matches https://www.google.com/schemas/sitemap-news/0.9 best practices.
  let image =
    item.enclosure ||
    item.mediaContent ||
    item.mediaThumbnail ||
    item.itunesImage ||
    extractImageFromContent(rawContent) ||
    item.channelImage ||
    null;

  // Strip Cloudflare/Fastly query-string sizing — let our renderer pick the dimensions
  if (image) image = normalizeImageUrl(image);

  const category = detectCategory(item, source);

  let publishDate;
  try {
    publishDate = item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString();
  } catch {
    publishDate = new Date().toISOString();
  }

  // Quality score for filtering low-value scrapes
  const cleanContentText = htmlToText(rawContent);
  const qualityScore =
    (excerpt && excerpt.length >= 80 ? 25 : 0) +
    (image ? 25 : 0) +
    (cleanContentText.length >= 500 ? 30 : cleanContentText.length >= 200 ? 15 : 0) +
    ((source.priority === 1) ? 20 : (source.priority === 2) ? 10 : 5) +
    (item.author && item.author !== 'Veteran News' ? 10 : 0);

  return {
    id: generateId(item.link),
    slug,
    title,
    excerpt,
    content: cleanContentText,
    category,
    author: cleanAuthor(item.author),
    publishDate,
    image,
    source: source.name,
    sourceUrl: item.link,
    serviceBranch: source.serviceBranch || null,
    priority: source.priority,
    qualityScore,
    lowQuality: qualityScore < 30,
    scraped: true,
    scrapedAt: new Date().toISOString()
  };
}

function normalizeImageUrl(url) {
  if (!url) return url;
  try {
    // Trim trailing whitespace/quotes from sloppy RSS
    url = url.trim().replace(/[\s'"]+$/, '');
    // Resolve protocol-relative URLs
    if (url.startsWith('//')) url = 'https:' + url;
    return url;
  } catch {
    return url;
  }
}

function detectCategory(item, source) {
  const text = `${item.title} ${item.description || ''} ${item.content || ''} ${item.categories?.join(' ') || ''}`.toLowerCase();

  const scores = {};
  for (const [category, config] of Object.entries(CATEGORIES)) {
    scores[category] = config.keywords.reduce((score, keyword) => {
      const keywordLower = keyword.toLowerCase();
      // Title matches weighted 3x
      const titleMatches = (item.title?.toLowerCase().match(new RegExp(keywordLower, 'g')) || []).length;
      const textMatches = (text.match(new RegExp(keywordLower, 'g')) || []).length;
      return score + (titleMatches * 3) + textMatches;
    }, 0);
  }

  // Find highest scoring
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (sorted[0][1] > 0) {
    return sorted[0][0];
  }

  // Fall back to source default
  return source.categoryMap?.default || 'service';
}

// =============================================================================
// EVENTS SCRAPING
// =============================================================================

async function scrapeAllEvents(env, returnOnly = false) {
  console.log('📅 Starting events scrape...');

  const existingData = await env.ARTICLES_KV.get('articles', { type: 'json' }) || {};
  const existingEvents = existingData.events || [];
  const existingEventIds = new Set(existingEvents.map(e => e.id));

  let allEvents = [];

  // Scrape Mobilize.us for veteran events
  try {
    const mobilizeEvents = await scrapeMobilizeEvents();
    const newMobilizeEvents = mobilizeEvents.filter(e => !existingEventIds.has(e.id));
    allEvents = allEvents.concat(newMobilizeEvents);
    console.log(`✅ Mobilize.us: ${newMobilizeEvents.length} new events`);
  } catch (error) {
    console.error('❌ Mobilize.us scrape failed:', error.message);
  }

  // Filter out past events and merge
  const now = new Date();
  const futureEvents = [...allEvents, ...existingEvents]
    .filter(e => {
      if (!e.startDate) return true;
      return new Date(e.startDate) >= now;
    })
    .sort((a, b) => new Date(a.startDate) - new Date(b.startDate))
    .slice(0, 500);

  if (!returnOnly) {
    const updatedData = {
      ...existingData,
      events: futureEvents,
      lastEventScrape: {
        timestamp: new Date().toISOString(),
        newEvents: allEvents.length,
        totalEvents: futureEvents.length
      }
    };
    await env.ARTICLES_KV.put('articles', JSON.stringify(updatedData));
  }

  console.log(`📅 Events scrape complete: ${allEvents.length} new, ${futureEvents.length} total`);
  return futureEvents;
}

async function scrapeMobilizeEvents() {
  const events = [];
  // Strong terms: must match at least one to be included
  const strongTerms = [
    'veteran', 'veterans', 'service member', 'servicemember',
    'disabled veteran', 'wounded warrior', 'gold star',
    'veterans affairs', 'VA benefits', 'GI Bill',
    'military family', 'military spouse', 'ptsd',
    'VFW', 'American Legion', 'DAV'
  ];
  // Weak terms: need 2+ matches to qualify
  const weakTerms = [
    'military', 'armed forces', 'troops', 'deployment',
    'soldier', 'sailor', 'airman', 'marine corps'
  ];

  // Fetch multiple pages
  for (let page = 1; page <= 5; page++) {
    try {
      const response = await fetch(
        `https://api.mobilize.us/v1/events?per_page=100&page=${page}&timeslot_start=gte_now`,
        {
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(10000)
        }
      );

      if (!response.ok) break;

      const data = await response.json();
      if (!data.data || data.data.length === 0) break;

      // Filter for veteran-related events with stricter matching
      const veteranEvents = data.data.filter(event => {
        const searchText = `${event.title} ${event.description || ''} ${event.sponsor?.name || ''}`.toLowerCase();
        // Strong match: any strong term present
        const hasStrongMatch = strongTerms.some(term => searchText.includes(term.toLowerCase()));
        if (hasStrongMatch) return true;
        // Weak match: need 2+ weak terms
        const weakMatches = weakTerms.filter(term => searchText.includes(term.toLowerCase()));
        return weakMatches.length >= 2;
      });

      for (const event of veteranEvents) {
        const timeslot = event.timeslots?.[0];
        events.push({
          id: `mobilize-${event.id}`,
          title: event.title,
          description: event.description || '',
          organization: event.sponsor?.name || 'Unknown',
          organizationLogo: event.sponsor?.logo_url || null,
          startDate: timeslot?.start_date ? new Date(timeslot.start_date * 1000).toISOString() : null,
          endDate: timeslot?.end_date ? new Date(timeslot.end_date * 1000).toISOString() : null,
          timezone: event.timezone || 'America/New_York',
          isVirtual: event.is_virtual || false,
          location: event.location ? {
            venue: event.location.venue || '',
            address: event.location.address_lines?.join(', ') || '',
            city: event.location.locality || '',
            state: event.location.region || '',
            zip: event.location.postal_code || '',
            country: event.location.country || 'US'
          } : null,
          virtualUrl: event.virtual_action_url || null,
          registrationUrl: event.browser_url || `https://www.mobilize.us/s/${event.id}`,
          image: event.featured_image_url || null,
          eventType: detectEventType(event),
          source: 'mobilize',
          sourceId: String(event.id),
          scrapedAt: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error(`Mobilize page ${page} error:`, error.message);
      break;
    }
  }

  return events;
}

function detectEventType(event) {
  const text = `${event.title} ${event.description || ''}`.toLowerCase();

  if (/job fair|career fair|hiring|employment/.test(text)) return 'job-fair';
  if (/benefits|claims|VA workshop|enrollment/.test(text)) return 'benefits-workshop';
  if (/health|screening|medical|mental health/.test(text)) return 'health-screening';
  if (/memorial|remembrance|honor|ceremony/.test(text)) return 'memorial';
  if (/volunteer|community service|give back/.test(text)) return 'volunteer';
  if (/webinar|online|virtual training/.test(text)) return 'webinar';
  if (/support group|peer support|PTSD|AA/.test(text)) return 'support-group';
  if (/legal|attorney|lawyer|claims help/.test(text)) return 'legal-clinic';
  if (/resume|interview|career/.test(text)) return 'career';
  if (/rally|march|protest/.test(text)) return 'rally';

  return 'community';
}

// =============================================================================
// UTILITIES
// =============================================================================

function normalizeTitle(title) {
  if (!title) return '';
  return title.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

function generateId(url) {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    const char = url.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return 'vn-' + Math.abs(hash).toString(36);
}

function generateSlug(title) {
  return title
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function cleanText(text) {
  if (!text) return '';
  return text
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&rsquo;/g, '\u2019')
    .replace(/&lsquo;/g, '\u2018')
    .replace(/&rdquo;/g, '\u201D')
    .replace(/&ldquo;/g, '\u201C')
    .replace(/&mdash;/g, '\u2014')
    .replace(/&ndash;/g, '\u2013')
    .replace(/&hellip;/g, '\u2026')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<img[^>]*>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s*data-[a-z-]+="[^"]*"/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Convert HTML content to clean text with paragraph structure preserved.
 * Used for article body content (not excerpts).
 * Returns text with \n\n between paragraphs.
 */
function htmlToText(html) {
  if (!html) return '';
  let text = html;
  // Remove scripts, styles, images
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<img[^>]*\/?>/gi, '');
  // Remove figure/figcaption entirely (photo credits etc)
  text = text.replace(/<figcaption[^>]*>[\s\S]*?<\/figcaption>/gi, '');
  // Convert block elements to paragraph breaks
  text = text.replace(/<\/(?:p|div|article|section|h[1-6]|blockquote|li|tr)>/gi, '\n\n');
  text = text.replace(/<(?:br)\s*\/?>/gi, '\n');
  text = text.replace(/<(?:hr)\s*\/?>/gi, '\n\n---\n\n');
  // Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');
  // Clean up leaked HTML attributes
  text = text.replace(/\s*"?\s*data-[a-z-]+="[^"]*"?/gi, '');
  text = text.replace(/\s*"?\s*src="[^"]*"?/gi, '');
  // Decode entities
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
  text = text.replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  text = text.replace(/&rsquo;/g, '\u2019');
  text = text.replace(/&lsquo;/g, '\u2018');
  text = text.replace(/&rdquo;/g, '\u201D');
  text = text.replace(/&ldquo;/g, '\u201C');
  text = text.replace(/&mdash;/g, '\u2014');
  text = text.replace(/&ndash;/g, '\u2013');
  text = text.replace(/&hellip;/g, '\u2026');
  // Clean up whitespace within lines
  text = text.replace(/[ \t]+/g, ' ');
  // Normalize paragraph breaks (multiple newlines -> double newline)
  text = text.replace(/\n\s*\n/g, '\n\n');
  // Split into paragraphs for filtering
  let paragraphs = text.split('\n\n')
    .map(p => p.trim())
    .filter(p => p.length > 0);

  // Strip RSS boilerplate from end of content
  paragraphs = paragraphs.filter(p => {
    const lower = p.toLowerCase();
    // "The post X appeared first on Y"
    if (/^the post .+ appeared first on /i.test(p)) return false;
    // "Continue reading" / "Read more" / "Click here" CTAs
    if (/^(?:continue reading|read more|click here|read the full|view the full|see the full)/i.test(p)) return false;
    // "Also Read:" / "Related:" / "Read Next:" link lists
    if (/^(?:also read|related|read next|recommended|more from|you might also|see also)[:\s]/i.test(p)) return false;
    // Standalone category labels (1-3 words, no punctuation, title case)
    if (p.split(/\s+/).length <= 3 && /^[A-Z][a-z]+(?: [A-Z&][a-z]*)*$/.test(p) && !p.includes('.')) return false;
    // Standalone bylines at end ("By [Name]")
    if (/^By [A-Z][a-z]+ [A-Z][a-z]+$/.test(p)) return false;
    return true;
  });

  return paragraphs.join('\n\n').trim();
}

function generateExcerpt(content, maxLength = 200) {
  let text = stripHtml(content);
  // Skip photo credits/captions at the start
  text = text.replace(/^(?:Photo (?:courtesy|by|credit|via)[^.]*\.\s*)/i, '');
  text = text.replace(/^(?:Image[: ][^.]*\.\s*)/i, '');
  // Skip "Editor's Note" prefixes for excerpts
  text = text.replace(/^(?:Editor['']?s?\s*(?:Note|note)[^.]*\.\s*)/i, '');
  text = text.trim();
  if (!text) return stripHtml(content).slice(0, maxLength);
  if (text.length <= maxLength) return text;

  // Try to cut at sentence boundary
  const truncated = text.slice(0, maxLength);
  const lastPeriod = truncated.lastIndexOf('.');
  const lastQuestion = truncated.lastIndexOf('?');
  const lastExclaim = truncated.lastIndexOf('!');
  const lastSentence = Math.max(lastPeriod, lastQuestion, lastExclaim);

  if (lastSentence > maxLength * 0.6) {
    return truncated.slice(0, lastSentence + 1);
  }

  // Fall back to word boundary
  const lastSpace = truncated.lastIndexOf(' ');
  return truncated.slice(0, lastSpace) + '...';
}

function cleanAuthor(author) {
  if (!author) return 'Veteran News';
  return author
    .replace(/^by\s+/i, '')
    .replace(/<[^>]+>/g, '')
    .trim() || 'Veteran News';
}

function extractImageFromContent(content) {
  if (!content) return null;

  // Find all <img> tags, pick the largest non-junk
  const imgs = [...content.matchAll(/<img[^>]+>/gi)];
  let best = null;
  let bestArea = 0;

  for (const m of imgs) {
    const tag = m[0];
    // Try src, data-src, data-lazy-src, data-original
    let src = (tag.match(/\bsrc=["']([^"']+)["']/i) || [])[1] ||
              (tag.match(/\bdata-src=["']([^"']+)["']/i) || [])[1] ||
              (tag.match(/\bdata-lazy-src=["']([^"']+)["']/i) || [])[1] ||
              (tag.match(/\bdata-original=["']([^"']+)["']/i) || [])[1];

    // srcset — pick the largest URL
    const srcset = (tag.match(/\bsrcset=["']([^"']+)["']/i) || [])[1];
    if (srcset) {
      const candidates = srcset.split(',').map(s => s.trim().split(/\s+/));
      candidates.sort((a, b) => {
        const aw = parseInt(a[1] || '0', 10);
        const bw = parseInt(b[1] || '0', 10);
        return bw - aw;
      });
      if (candidates[0]?.[0]) src = candidates[0][0];
    }

    if (!src) continue;
    if (!isImageUrl(src) && !/^https?:/i.test(src)) continue;
    if (/(1x1|pixel|spacer|blank|transparent|tracking|beacon)\b/i.test(src)) continue;
    if (/\.gif(\?|$)/i.test(src) && /(spacer|blank|transparent|1x1)/i.test(src)) continue;

    const w = parseInt(tag.match(/\bwidth=["'](\d+)/i)?.[1] || '0', 10);
    const h = parseInt(tag.match(/\bheight=["'](\d+)/i)?.[1] || '0', 10);
    const area = w * h;
    if (!best || area > bestArea) { best = src; bestArea = area; }
  }
  return best;
}

// Try to fetch the OG image from the article page itself.
// Used as a last-resort fallback when RSS provides no image.
// Cached per URL in KV with 30-day TTL to avoid re-hammering.
async function fetchOgImage(url, env) {
  if (!url || !env?.ARTICLES_KV) return null;
  const cacheKey = `og:${await hashStr(url)}`;
  try {
    const cached = await env.ARTICLES_KV.get(cacheKey);
    if (cached) {
      const v = cached === '__null__' ? null : cached;
      return v;
    }
  } catch {}

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; VeteranNews/1.0; +https://veteransnews.org/about)',
        'Accept': 'text/html,application/xhtml+xml'
      },
      signal: AbortSignal.timeout(5000),
      cf: { cacheTtl: 86400, cacheEverything: true }
    });
    if (!res.ok) {
      await env.ARTICLES_KV.put(cacheKey, '__null__', { expirationTtl: 86400 });
      return null;
    }
    // Read just the first ~64 KB — enough for <head>
    const reader = res.body.getReader();
    let html = '';
    let bytes = 0;
    const decoder = new TextDecoder();
    while (bytes < 65536) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      html += decoder.decode(value, { stream: true });
      if (html.includes('</head>') || html.includes('</HEAD>')) break;
    }
    try { await reader.cancel(); } catch {}

    // Find candidates in priority order
    const candidates = [
      /<meta\s+property=["']og:image:secure_url["']\s+content=["']([^"']+)["']/i,
      /<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i,
      /<meta\s+name=["']twitter:image["']\s+content=["']([^"']+)["']/i,
      /<meta\s+name=["']twitter:image:src["']\s+content=["']([^"']+)["']/i,
      /<link\s+rel=["']image_src["']\s+href=["']([^"']+)["']/i,
      /<meta\s+content=["']([^"']+)["']\s+property=["']og:image["']/i // reversed attr order
    ];
    for (const re of candidates) {
      const m = html.match(re);
      if (m && m[1]) {
        const og = decodeHtmlEntities(m[1]);
        await env.ARTICLES_KV.put(cacheKey, og, { expirationTtl: 30 * 86400 });
        return og;
      }
    }
    await env.ARTICLES_KV.put(cacheKey, '__null__', { expirationTtl: 7 * 86400 });
    return null;
  } catch (e) {
    return null;
  }
}

async function hashStr(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const buf = await crypto.subtle.digest('SHA-1', data);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

function decodeHtmlEntities(s) {
  if (!s) return s;
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/g, '/');
}

async function handleStatus(env) {
  const data = await env.ARTICLES_KV.get('articles', { type: 'json' });

  return jsonResponse({
    status: data?.articles?.length > 0 ? 'healthy' : 'empty',
    service: 'Veteran News Scraper',
    articles: data?.articles?.length || 0,
    events: data?.events?.length || 0,
    lastScrape: data?.lastScrape || null,
    lastEventScrape: data?.lastEventScrape || null,
    sources: NEWS_SOURCES.map(s => s.name),
    checkedAt: new Date().toISOString()
  });
}

function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      ...headers
    }
  });
}

// =============================================================================
// DEFAULT RESOURCES & ORGANIZATIONS
// =============================================================================

function getDefaultResources() {
  return [
    {
      slug: 'veterans-crisis-line',
      title: 'Veterans Crisis Line',
      description: 'Free, confidential support for veterans in crisis and their families and friends.',
      url: 'https://www.veteranscrisisline.net/',
      phone: '988 (Press 1)',
      text: '838255',
      available24x7: true,
      priority: 1,
      resourceType: 'hotline'
    },
    {
      slug: 'va-benefits',
      title: 'VA Benefits',
      description: 'Apply for and manage your VA benefits including disability compensation, pension, education, and healthcare.',
      url: 'https://www.va.gov/benefits/',
      resourceType: 'guide'
    },
    {
      slug: 'gi-bill',
      title: 'GI Bill Benefits',
      description: 'Education and training benefits for veterans, service members, and their families.',
      url: 'https://www.va.gov/education/',
      resourceType: 'guide'
    },
    {
      slug: 'va-healthcare',
      title: 'VA Healthcare',
      description: 'Health care benefits for veterans including medical, mental health, and pharmacy services.',
      url: 'https://www.va.gov/health-care/',
      resourceType: 'guide'
    },
    {
      slug: 'ebenefits',
      title: 'eBenefits',
      description: 'Online portal for veterans to apply for benefits, check claim status, and access records.',
      url: 'https://www.ebenefits.va.gov/',
      resourceType: 'tool'
    },
    {
      slug: 'military-onesource',
      title: 'Military OneSource',
      description: 'Free counseling, financial help, and support services for military families.',
      url: 'https://www.militaryonesource.mil/',
      phone: '1-800-342-9647',
      available24x7: true,
      resourceType: 'hotline'
    }
  ];
}

function getDefaultOrganizations() {
  return [
    {
      slug: 'dav',
      name: 'Disabled American Veterans (DAV)',
      description: 'Nonprofit charity providing free assistance to disabled veterans with benefits, employment, and transportation.',
      url: 'https://www.dav.org/',
      category: 'advocacy'
    },
    {
      slug: 'vfw',
      name: 'Veterans of Foreign Wars (VFW)',
      description: 'Nonprofit veterans service organization advocating for veterans rights.',
      url: 'https://www.vfw.org/',
      category: 'advocacy'
    },
    {
      slug: 'american-legion',
      name: 'American Legion',
      description: 'Veteran service organization for those who served in the US armed forces.',
      url: 'https://www.legion.org/',
      category: 'community'
    },
    {
      slug: 'wounded-warrior-project',
      name: 'Wounded Warrior Project',
      description: 'Programs and services for wounded veterans and their families.',
      url: 'https://www.woundedwarriorproject.org/',
      phone: '1-888-997-2586',
      category: 'support'
    },
    {
      slug: 'team-rubicon',
      name: 'Team Rubicon',
      description: 'Disaster response organization leveraging veteran skills to help communities.',
      url: 'https://teamrubiconusa.org/',
      category: 'volunteer'
    },
    {
      slug: 'iava',
      name: 'Iraq and Afghanistan Veterans of America (IAVA)',
      description: 'Advocacy organization for post-9/11 veterans.',
      url: 'https://iava.org/',
      category: 'advocacy'
    }
  ];
}

// =============================================================================
// SELF-HEALING: IMAGE BACKFILL + DEAD-LINK SWEEP + HEALTH
// =============================================================================

/**
 * Backfill cron — re-attempt image enrichment for articles that came in with
 * `image: null`. Caps to 60 articles per run to stay under CPU/subrequest budget.
 * Skips articles older than 30 days (low ROI). Marks `imageBackfillAttempts`
 * on the article so we stop retrying after 3 misses.
 */
async function backfillImages(env) {
  if (!env?.ARTICLES_KV) return { error: 'no KV' };
  const data = await env.ARTICLES_KV.get('articles', { type: 'json' });
  if (!data?.articles) return { error: 'no articles' };

  const cutoff = Date.now() - 30 * 86400 * 1000;
  const candidates = data.articles
    .map((a, idx) => ({ a, idx }))
    .filter(({ a }) => {
      if (a.image && a.image.length > 0) return false;
      if ((a.imageBackfillAttempts || 0) >= 3) return false;
      const t = a.publishDate ? new Date(a.publishDate).getTime() : 0;
      if (t < cutoff) return false;
      return !!a.sourceUrl;
    })
    .slice(0, 60);

  if (candidates.length === 0) {
    console.log('🖼️  Backfill: no candidates');
    return { backfilled: 0, attempted: 0 };
  }

  // Throttle by host: max 3 per host concurrently
  const byHost = {};
  for (const c of candidates) {
    try {
      const h = new URL(c.a.sourceUrl).hostname;
      (byHost[h] = byHost[h] || []).push(c);
    } catch { /* skip malformed */ }
  }

  let backfilled = 0;
  let attempted = 0;

  for (const host of Object.keys(byHost)) {
    const hostCandidates = byHost[host];
    // Process in batches of 3 per host
    for (let i = 0; i < hostCandidates.length; i += 3) {
      const batch = hostCandidates.slice(i, i + 3);
      const results = await Promise.allSettled(
        batch.map(({ a }) => fetchOgImage(a.sourceUrl, env))
      );
      for (let j = 0; j < batch.length; j++) {
        attempted++;
        const { idx } = batch[j];
        const result = results[j];
        if (result.status === 'fulfilled' && result.value) {
          data.articles[idx].image = result.value;
          data.articles[idx].imageBackfilledAt = new Date().toISOString();
          // Recompute quality score
          data.articles[idx].qualityScore = (data.articles[idx].qualityScore || 0) + 25;
          data.articles[idx].lowQuality = data.articles[idx].qualityScore < 30;
          backfilled++;
        } else {
          data.articles[idx].imageBackfillAttempts = (data.articles[idx].imageBackfillAttempts || 0) + 1;
          data.articles[idx].lastImageBackfillAt = new Date().toISOString();
        }
      }
      // Polite throttle between batches per host
      if (i + 3 < hostCandidates.length) await new Promise(r => setTimeout(r, 300));
    }
  }

  data.lastImageBackfill = {
    timestamp: new Date().toISOString(),
    attempted,
    backfilled
  };

  await env.ARTICLES_KV.put('articles', JSON.stringify(data));
  console.log(`🖼️  Backfill complete: ${backfilled}/${attempted} images recovered`);
  return { backfilled, attempted };
}

/**
 * Dead-link sweep — daily HEAD-check sample of articles to detect broken
 * source URLs. Marks `linkStatus: 'broken'` to filter out of the feed.
 */
async function deadLinkSweep(env) {
  if (!env?.ARTICLES_KV) return { error: 'no KV' };
  const data = await env.ARTICLES_KV.get('articles', { type: 'json' });
  if (!data?.articles) return { error: 'no articles' };

  // Sample: 80 articles whose lastLinkCheck is oldest (or never checked)
  const sorted = [...data.articles]
    .map((a, idx) => ({ a, idx }))
    .filter(({ a }) => a.sourceUrl && a.linkStatus !== 'broken')
    .sort((x, y) => {
      const xt = x.a.lastLinkCheck ? new Date(x.a.lastLinkCheck).getTime() : 0;
      const yt = y.a.lastLinkCheck ? new Date(y.a.lastLinkCheck).getTime() : 0;
      return xt - yt;
    })
    .slice(0, 80);

  let broken = 0;
  let checked = 0;

  // Check 5 at a time
  for (let i = 0; i < sorted.length; i += 5) {
    const batch = sorted.slice(i, i + 5);
    const results = await Promise.allSettled(batch.map(async ({ a }) => {
      const res = await fetch(a.sourceUrl, {
        method: 'HEAD',
        signal: AbortSignal.timeout(8000),
        redirect: 'follow'
      });
      return res.status;
    }));
    for (let j = 0; j < batch.length; j++) {
      const { idx } = batch[j];
      checked++;
      data.articles[idx].lastLinkCheck = new Date().toISOString();
      const r = results[j];
      if (r.status === 'fulfilled') {
        const code = r.value;
        if (code === 404 || code === 410 || code === 451) {
          data.articles[idx].linkStatus = 'broken';
          data.articles[idx].linkStatusCode = code;
          broken++;
        } else {
          data.articles[idx].linkStatus = 'ok';
        }
      } else {
        // Network errors don't immediately mark broken — could be transient
        data.articles[idx].linkStatusError = String(r.reason).slice(0, 100);
      }
    }
  }

  data.lastDeadLinkSweep = {
    timestamp: new Date().toISOString(),
    checked,
    broken
  };

  await env.ARTICLES_KV.put('articles', JSON.stringify(data));
  console.log(`🔗 Dead-link sweep: ${broken}/${checked} broken`);
  return { checked, broken };
}

/**
 * Source health endpoint — returns per-source health scores for monitoring.
 */
async function handleSourceHealth(env) {
  const sources = NEWS_SOURCES.map(s => s.name);
  const results = await Promise.all(sources.map(async (name) => {
    const h = await getSourceHealth(env, name);
    return {
      name,
      score: h?.score ?? 100,
      consecutiveFailures: h?.consecutiveFailures ?? 0,
      suspended: h?.suspended ?? false,
      lastSuccess: h?.lastSuccess ?? null,
      lastError: h?.lastError ?? null,
      lastErrorAt: h?.lastErrorAt ?? null,
      runs: h?.runs ?? 0,
      totalArticles: h?.totalArticles ?? 0
    };
  }));

  // Aggregate: image fill rate from latest scrape
  const data = await env.ARTICLES_KV.get('articles', { type: 'json' });
  const totalArticles = data?.articles?.length || 0;
  const articlesWithImages = data?.articles?.filter(a => a.image).length || 0;
  const imageFillRate = totalArticles ? Math.round((articlesWithImages / totalArticles) * 100) : 0;

  return jsonResponse({
    overall: {
      sources: results.length,
      activeSources: results.filter(r => !r.suspended).length,
      suspendedSources: results.filter(r => r.suspended).length,
      averageScore: Math.round(results.reduce((s, r) => s + r.score, 0) / results.length),
      totalArticles,
      articlesWithImages,
      imageFillRate
    },
    sources: results,
    lastScrape: data?.lastScrape ?? null,
    lastImageBackfill: data?.lastImageBackfill ?? null,
    lastDeadLinkSweep: data?.lastDeadLinkSweep ?? null,
    checkedAt: new Date().toISOString()
  }, 200, { 'Cache-Control': 'public, max-age=60' });
}
