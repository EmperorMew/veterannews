-- Veteran News — D1 schema
-- Permanent canonical store for articles, sources, and engagement signals.
-- KV remains the hot cache for the live feed; D1 holds the full archive.

CREATE TABLE IF NOT EXISTS articles (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  excerpt TEXT,
  content TEXT,
  category TEXT,
  author TEXT,
  publish_date TEXT NOT NULL,            -- ISO 8601 UTC
  modified_date TEXT,                    -- ISO 8601 UTC, defaults to publish_date
  image TEXT,
  source TEXT NOT NULL,
  source_slug TEXT NOT NULL,             -- normalized for URL: /source/[slug]
  source_url TEXT,
  service_branch TEXT,
  priority INTEGER DEFAULT 3,
  quality_score INTEGER DEFAULT 0,
  low_quality INTEGER DEFAULT 0,
  link_status TEXT DEFAULT 'unknown',
  link_status_code INTEGER,
  last_link_check TEXT,
  word_count INTEGER DEFAULT 0,
  scraped_at TEXT NOT NULL,
  indexed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_articles_publish_date ON articles(publish_date DESC);
CREATE INDEX IF NOT EXISTS idx_articles_category ON articles(category, publish_date DESC);
CREATE INDEX IF NOT EXISTS idx_articles_source ON articles(source_slug, publish_date DESC);
CREATE INDEX IF NOT EXISTS idx_articles_branch ON articles(service_branch, publish_date DESC);
CREATE INDEX IF NOT EXISTS idx_articles_author ON articles(author);
CREATE INDEX IF NOT EXISTS idx_articles_quality ON articles(low_quality, link_status, publish_date DESC);
CREATE INDEX IF NOT EXISTS idx_articles_modified ON articles(modified_date DESC);

-- Sources catalog (denormalized + queryable)
CREATE TABLE IF NOT EXISTS sources (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT,
  feed_url TEXT,
  description TEXT,
  priority INTEGER DEFAULT 3,
  category_default TEXT,
  service_branch TEXT,
  added_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Source health snapshots (latest only — append-only could come later)
CREATE TABLE IF NOT EXISTS source_health (
  source_slug TEXT PRIMARY KEY,
  score INTEGER DEFAULT 100,
  consecutive_failures INTEGER DEFAULT 0,
  suspended INTEGER DEFAULT 0,
  last_success TEXT,
  last_error TEXT,
  last_error_at TEXT,
  runs INTEGER DEFAULT 0,
  total_articles INTEGER DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Newsletter subscriptions (replaces the per-email KV keys)
CREATE TABLE IF NOT EXISTS newsletter_subs (
  email TEXT NOT NULL,
  list TEXT NOT NULL DEFAULT 'daily',     -- daily | weekly | benefits | breaking
  subscribed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source TEXT,                            -- where they signed up
  unsubscribed_at TEXT,
  PRIMARY KEY (email, list)
);

-- Article view counter for "Most Read" by day
CREATE TABLE IF NOT EXISTS article_views (
  article_id TEXT NOT NULL,
  date TEXT NOT NULL,                     -- YYYY-MM-DD
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (article_id, date)
);
CREATE INDEX IF NOT EXISTS idx_views_date ON article_views(date, count DESC);

-- Daily archive — pre-computed counts per day for fast /archive/YYYY/MM browsing
CREATE TABLE IF NOT EXISTS archive_days (
  date TEXT PRIMARY KEY,                  -- YYYY-MM-DD
  article_count INTEGER NOT NULL DEFAULT 0,
  top_categories TEXT,                    -- JSON array
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ─── Round 1 enhancements ───────────────────────────────────────────────

-- Total article view counts (rolled up across all dates) for fast Most Read
CREATE TABLE IF NOT EXISTS article_view_totals (
  article_id TEXT PRIMARY KEY,
  total_views INTEGER NOT NULL DEFAULT 0,
  views_24h INTEGER NOT NULL DEFAULT 0,
  views_7d INTEGER NOT NULL DEFAULT 0,
  last_viewed TEXT,
  last_24h_reset TEXT,
  last_7d_reset TEXT
);
CREATE INDEX IF NOT EXISTS idx_view_24h ON article_view_totals(views_24h DESC);
CREATE INDEX IF NOT EXISTS idx_view_7d ON article_view_totals(views_7d DESC);
CREATE INDEX IF NOT EXISTS idx_view_total ON article_view_totals(total_views DESC);

-- Article-to-article relationships for "More like this" recommendations.
-- Populated by a cron that scans recent articles and clusters by category +
-- shared significant tokens.
CREATE TABLE IF NOT EXISTS article_relations (
  article_id TEXT NOT NULL,
  related_id TEXT NOT NULL,
  score REAL NOT NULL DEFAULT 0,
  reason TEXT,                            -- 'category', 'tokens', 'source', etc.
  computed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (article_id, related_id)
);
CREATE INDEX IF NOT EXISTS idx_rel_article ON article_relations(article_id, score DESC);

-- Topic / tag table for granular keyword pages beyond categories.
-- e.g., 'pact-act', 'gi-bill', 'ptsd', 'agent-orange'.
CREATE TABLE IF NOT EXISTS topics (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  article_count INTEGER NOT NULL DEFAULT 0,
  parent_category TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS article_topics (
  article_id TEXT NOT NULL,
  topic_slug TEXT NOT NULL,
  PRIMARY KEY (article_id, topic_slug)
);
CREATE INDEX IF NOT EXISTS idx_topic_lookup ON article_topics(topic_slug);

-- Search query log — for understanding what veterans actually look for.
-- Lets us identify content gaps and prioritize new sources/sections.
CREATE TABLE IF NOT EXISTS search_queries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  query TEXT NOT NULL,
  result_count INTEGER NOT NULL DEFAULT 0,
  searched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_search_query ON search_queries(query);
CREATE INDEX IF NOT EXISTS idx_search_date ON search_queries(searched_at DESC);
