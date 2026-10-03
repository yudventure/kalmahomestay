-- Kalma Raja Ampat: customers and booking inquiries
-- One customer can have many inquiries. Customers are matched by phone or email.

CREATE TABLE customers (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name          VARCHAR(120) NOT NULL,
  phone         VARCHAR(32)  NULL,          -- digits only, international format (62812...)
  email         VARCHAR(190) NULL,          -- lowercase
  other_contact VARCHAR(100) NULL,          -- contact that is neither phone nor email (e.g. Instagram)
  country       VARCHAR(80)  NULL,
  lang          CHAR(2)      NOT NULL DEFAULT 'id',
  notes         TEXT         NULL,          -- internal notes by Kalma staff
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_customers_phone (phone),
  UNIQUE KEY uq_customers_email (email),
  KEY idx_customers_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE inquiries (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  customer_id INT UNSIGNED NOT NULL,
  checkin     DATE         NOT NULL,
  checkout    DATE         NOT NULL,
  guests      VARCHAR(4)   NOT NULL,
  room        VARCHAR(20)  NULL,
  message     TEXT         NULL,
  lang        CHAR(2)      NOT NULL DEFAULT 'id',
  status      ENUM('new','contacted','confirmed','cancelled','completed') NOT NULL DEFAULT 'new',
  admin_note  TEXT         NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_inquiries_status (status, created_at),
  KEY idx_inquiries_checkin (checkin),
  KEY idx_inquiries_customer (customer_id),
  CONSTRAINT fk_inquiries_customer FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
