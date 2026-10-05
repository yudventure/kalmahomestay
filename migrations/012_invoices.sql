-- Invoices for guests and agents (Admin > Invoice). Line items are stored as JSON text.
-- Payments are rows in `transactions` with ref_type 'invoice', so they also show in Keuangan.
CREATE TABLE IF NOT EXISTS invoices (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  number            VARCHAR(30)  NOT NULL,
  inquiry_id        INT UNSIGNED NULL,
  customer_name     VARCHAR(120) NOT NULL,
  customer_email    VARCHAR(160) NULL,
  customer_phone    VARCHAR(40)  NULL,
  customer_address  TEXT         NULL,
  issue_date        DATE         NOT NULL,
  due_date          DATE         NULL,
  items             TEXT         NULL,
  subtotal          BIGINT       NOT NULL DEFAULT 0,
  discount          BIGINT       NOT NULL DEFAULT 0,
  tax_pct           INT          NOT NULL DEFAULT 0,
  tax               BIGINT       NOT NULL DEFAULT 0,
  total             BIGINT       NOT NULL DEFAULT 0,
  status            VARCHAR(12)  NOT NULL DEFAULT 'draft', -- draft, sent, cancelled (paid is worked out from payments)
  lang              VARCHAR(2)   NOT NULL DEFAULT 'en',
  notes             TEXT         NULL,
  created_by        VARCHAR(60)  NULL,
  created_at        DATETIME     NOT NULL,
  updated_at        DATETIME     NOT NULL,
  UNIQUE KEY uq_invoice_number (number),
  KEY idx_invoice_inquiry (inquiry_id),
  KEY idx_invoice_issue (issue_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
