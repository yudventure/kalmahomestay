-- Public relations: social media content planner (calendar, scripts, captions) in Admin > Sosial media.
CREATE TABLE IF NOT EXISTS content_posts (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  title         VARCHAR(160) NOT NULL,
  platforms     VARCHAR(120) NULL,                   -- comma list: instagram, tiktok, facebook, youtube, google
  format        VARCHAR(20)  NULL,                   -- reels, foto, carousel, story, video, live
  pillar        VARCHAR(20)  NULL,
  status        VARCHAR(12)  NOT NULL DEFAULT 'ide', -- ide, naskah, produksi, siap, tayang
  publish_date  DATE         NULL,
  publish_time  VARCHAR(5)   NULL,
  assignee      VARCHAR(60)  NULL,                   -- staff username
  hook          TEXT         NULL,
  script        TEXT         NULL,
  caption       TEXT         NULL,
  hashtags      TEXT         NULL,
  cta           VARCHAR(190) NULL,
  link          VARCHAR(300) NULL,
  notes         TEXT         NULL,
  created_by    VARCHAR(60)  NULL,
  created_at    DATETIME     NOT NULL,
  updated_at    DATETIME     NOT NULL,
  KEY idx_content_date (publish_date),
  KEY idx_content_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
