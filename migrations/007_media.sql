-- Files uploaded in the admin: website photos/videos (public), employee documents and receipts (private).
CREATE TABLE IF NOT EXISTS media (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  kind          VARCHAR(10)  NOT NULL,              -- image, video, document
  file          VARCHAR(80)  NOT NULL,              -- stored name in UPLOAD_DIR
  original_name VARCHAR(200) NULL,
  mime          VARCHAR(120) NULL,
  size          INT UNSIGNED NULL,
  slot          VARCHAR(40)  NULL,                  -- website place, e.g. hero-1
  owner_type    VARCHAR(20)  NOT NULL,              -- website, employee, transaction
  owner_id      INT UNSIGNED NULL,
  label         VARCHAR(120) NULL,
  public        TINYINT(1)   NOT NULL DEFAULT 0,
  uploaded_by   VARCHAR(60)  NULL,
  created_at    DATETIME     NOT NULL,
  updated_at    DATETIME     NOT NULL,
  UNIQUE KEY uq_media_file (file),
  KEY idx_media_owner (owner_type, owner_id),
  KEY idx_media_slot (slot)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
