-- Guest suggestions, complaints and compliments from the "We hear you" form.
CREATE TABLE IF NOT EXISTS feedback (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  kind        VARCHAR(12)  NOT NULL,                 -- saran, keluhan, pujian, pertanyaan
  topic       VARCHAR(20)  NULL,                     -- kamar, makanan, layanan, trip, kebersihan, pemesanan, lainnya
  rating      TINYINT      NULL,                     -- 1..5, optional
  message     TEXT         NOT NULL,
  name        VARCHAR(120) NULL,
  contact     VARCHAR(120) NULL,
  stay_date   DATE         NULL,
  lang        CHAR(2)      NOT NULL DEFAULT 'id',
  status      VARCHAR(12)  NOT NULL DEFAULT 'baru',  -- baru, diproses, selesai
  admin_note  TEXT         NULL,
  handled_by  VARCHAR(60)  NULL,
  created_at  DATETIME     NOT NULL,
  updated_at  DATETIME     NOT NULL,
  KEY idx_feedback_status (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
