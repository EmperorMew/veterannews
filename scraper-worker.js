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
  // Scheduled scraping (cron trigger)
  async scheduled(event, env, ctx) {
    console.log('🎖️ Veteran News Scraper: Starting scheduled scrape...');
    ctx.waitUntil(scrapeAllSources(env));
  },

  // HTTP interface for manual triggers and status
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Manual scrape trigger
    if (url.pathname === '/scrape' && request.method === 'POST') {
      ctx.waitUntil(scrapeAllSources(env));
      return jsonResponse({ status: 'Scrape initiated', timestamp: new Date().toISOString() });
    }

    // Scrape events only
    if (url.pathname === '/scrape-events' && request.method === 'POST') {
      ctx.waitUntil(scrapeAllEvents(env));
      return jsonResponse({ status: 'Event scrape initiated', timestamp: new Date().toISOString() });
    }

    // Clear events and re-scrape
    if (url.pathname === '/clear-events' && request.method === 'POST') {
      const data = await env.ARTICLES_KV.get('articles', { type: 'json' }) || {};
      data.events = [];
      await env.ARTICLES_KV.put('articles', JSON.stringify(data));
      ctx.waitUntil(scrapeAllEvents(env));
      return jsonResponse({ status: 'Events cleared and re-scrape initiated', timestamp: new Date().toISOString() });
    }

    // Status check
    if (url.pathname === '/status') {
      return handleStatus(env);
    }

    // Articles endpoint (for reading current data)
    if (url.pathname === '/articles') {
      const data = await env.ARTICLES_KV.get('articles', { type: 'json' });
      return jsonResponse(data || { articles: [] });
    }

    // Events endpoint
    if (url.pathname === '/events') {
      const data = await env.ARTICLES_KV.get('articles', { type: 'json' });
      return jsonResponse({ events: data?.events || [] });
    }

    return new Response('Veteran News Scraper\n\nPOST /scrape - Trigger full scrape\nPOST /scrape-events - Scrape events only\nGET /status - Check status', {
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

  for (const batch of batches) {
    const results = await Promise.allSettled(
      batch.map(source => scrapeSource(source))
    );

    for (let i = 0; i < results.length; i++) {
      const source = batch[i];
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
        sourceResults.push({
          name: source.name,
          status: 'success',
          fetched: articles.length,
          new: newArticles.length
        });
        console.log(`✅ ${source.name}: ${newArticles.length} new / ${articles.length} total`);
      } else {
        sourceResults.push({
          name: source.name,
          status: 'error',
          error: result.reason?.message || 'Unknown error'
        });
        console.error(`❌ ${source.name}: ${result.reason?.message}`);
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

async function scrapeSource(source) {
  if (source.type !== 'rss') {
    return [];
  }

  const response = await fetch(source.url, {
    headers: {
      'User-Agent': 'VeteranNews/1.0 (News Aggregator)',
      'Accept': 'application/rss+xml, application/xml, text/xml'
    },
    signal: AbortSignal.timeout(15000)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const xml = await response.text();
  const items = parseRSS(xml);

  return items.map(item => transformArticle(item, source)).filter(Boolean);
}

function parseRSS(xml) {
  const items = [];
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
      mediaContent: extractMediaContent(itemXml)
    });
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

function extractEnclosure(xml) {
  const match = xml.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]*>/i);
  return match ? match[1] : null;
}

function extractMediaContent(xml) {
  const match = xml.match(/<media:content[^>]+url=["']([^"']+)["'][^>]*>/i);
  return match ? match[1] : null;
}

// =============================================================================
// ARTICLE TRANSFORMATION
// =============================================================================

function transformArticle(item, source) {
  if (!item.title || !item.link) return null;

  const title = cleanText(item.title);
  const slug = generateSlug(title);
  // Use content:encoded first, fall back to description. Both may be empty string from extractTag.
  const rawContent = (item.content && item.content.length > 10) ? item.content : (item.description || '');
  const excerpt = generateExcerpt(rawContent);

  // Extract image
  let image = item.enclosure || item.mediaContent || extractImageFromContent(rawContent);

  // Detect category
  const category = detectCategory(item, source);

  // Parse date
  let publishDate;
  try {
    publishDate = item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString();
  } catch {
    publishDate = new Date().toISOString();
  }

  return {
    id: generateId(item.link),
    slug,
    title,
    excerpt,
    content: htmlToText(rawContent),
    category,
    author: cleanAuthor(item.author),
    publishDate,
    image,
    source: source.name,
    sourceUrl: item.link,
    serviceBranch: source.serviceBranch || null,
    priority: source.priority,
    scraped: true,
    scrapedAt: new Date().toISOString()
  };
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

  // Look for img src
  const imgMatch = content.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (imgMatch) {
    const src = imgMatch[1];
    // Skip tiny images (likely icons/trackers)
    if (!src.includes('1x1') && !src.includes('pixel') && !src.includes('tracking')) {
      return src;
    }
  }

  return null;
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
