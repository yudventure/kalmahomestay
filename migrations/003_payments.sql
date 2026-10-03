-- Online payments (Midtrans): an inquiry paid on the website carries its order and payment state.
ALTER TABLE inquiries
  ADD COLUMN order_id       VARCHAR(64)  NULL AFTER status,
  ADD COLUMN amount         INT UNSIGNED NULL AFTER order_id,         -- IDR charged online
  ADD COLUMN total          INT UNSIGNED NULL AFTER amount,           -- full stay price in IDR
  ADD COLUMN payment_status ENUM('pending','paid','failed','expired','refunded') NULL AFTER total,
  ADD COLUMN payment_type   VARCHAR(40)  NULL AFTER payment_status,   -- e.g. bank_transfer, qris, gopay, credit_card
  ADD COLUMN paid_at        DATETIME     NULL AFTER payment_type,
  ADD UNIQUE KEY uq_inquiries_order (order_id);
