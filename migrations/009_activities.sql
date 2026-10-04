-- Diving, snorkeling and trips shown on the service pages, managed in the admin (Website > Aktivitas & trip).
CREATE TABLE IF NOT EXISTS activities (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  category     VARCHAR(12)  NOT NULL,                -- diving, trip
  slug         VARCHAR(80)  NOT NULL,
  sort         INT          NOT NULL DEFAULT 0,
  active       TINYINT(1)   NOT NULL DEFAULT 1,
  price        INT UNSIGNED NULL,                    -- IDR per person, empty = price on request
  min_people   INT          NULL,
  max_people   INT          NULL,
  level        VARCHAR(12)  NULL,                    -- mudah, sedang, mahir
  duration     VARCHAR(40)  NULL,                    -- e.g. "3 jam" / "3 hours"
  start_time   VARCHAR(40)  NULL,
  title_id     VARCHAR(160) NOT NULL,
  title_en     VARCHAR(160) NULL,
  summary_id   TEXT         NULL,
  summary_en   TEXT         NULL,
  body_id      TEXT         NULL,
  body_en      TEXT         NULL,
  includes_id  TEXT         NULL,
  includes_en  TEXT         NULL,
  bring_id     TEXT         NULL,
  bring_en     TEXT         NULL,
  notes_id     TEXT         NULL,
  notes_en     TEXT         NULL,
  duration_en  VARCHAR(40)  NULL,
  created_at   DATETIME     NOT NULL,
  updated_at   DATETIME     NOT NULL,
  UNIQUE KEY uq_activities_slug (slug),
  KEY idx_activities_cat (category, active, sort)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A website booking can be a room stay or an activity (then room is empty and item names the activity).
ALTER TABLE inquiries ADD COLUMN item VARCHAR(160) NULL AFTER room;
