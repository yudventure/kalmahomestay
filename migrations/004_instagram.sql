-- Instagram comments shown under "Guest stories", synced daily through the Instagram API.
CREATE TABLE IF NOT EXISTS ig_comments (
  id            VARCHAR(40)  NOT NULL PRIMARY KEY,  -- Instagram comment id
  media_id      VARCHAR(40)  NOT NULL,
  permalink     VARCHAR(255) NULL,
  username      VARCHAR(64)  NOT NULL,
  text          TEXT         NOT NULL,
  like_count    INT UNSIGNED NOT NULL DEFAULT 0,
  commented_at  DATETIME     NOT NULL,
  hidden        TINYINT(1)   NOT NULL DEFAULT 0,      -- hidden by the admin; kept so a resync does not bring it back
  fetched_at    DATETIME     NOT NULL,
  KEY idx_ig_comments_media (media_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Small key/value store for app state (e.g. the refreshed Instagram token and the last sync).
CREATE TABLE IF NOT EXISTS app_settings (
  k          VARCHAR(64) NOT NULL PRIMARY KEY,
  v          TEXT        NOT NULL,
  updated_at DATETIME    NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
