-- Admin CMS: staff logins, booking calendar & OTA channels, HR, finance.

CREATE TABLE IF NOT EXISTS staff_users (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(120) NOT NULL,
  username      VARCHAR(60)  NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(20)  NOT NULL,                -- owner, manager, reservation, hrd, finance
  active        TINYINT(1)   NOT NULL DEFAULT 1,
  last_login_at DATETIME     NULL,
  created_at    DATETIME     NOT NULL,
  updated_at    DATETIME     NOT NULL,
  UNIQUE KEY uq_staff_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- OTAs (Airbnb, Booking.com, Agoda, Traveloka, Tiket.com, …) and travel agents, one row per room they sell.
CREATE TABLE IF NOT EXISTS channels (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name             VARCHAR(80)  NOT NULL,
  kind             VARCHAR(10)  NOT NULL DEFAULT 'ota',  -- ota or agent
  room             VARCHAR(20)  NOT NULL,
  ical_url         TEXT         NULL,                    -- the channel's calendar (import)
  export_token     VARCHAR(40)  NOT NULL,                -- secret part of Kalma's calendar link for this channel (export)
  commission_pct   INT          NULL,
  contact          VARCHAR(160) NULL,
  active           TINYINT(1)   NOT NULL DEFAULT 1,
  last_sync_at     DATETIME     NULL,
  last_sync_status VARCHAR(255) NULL,
  created_at       DATETIME     NOT NULL,
  updated_at       DATETIME     NOT NULL,
  UNIQUE KEY uq_channels_token (export_token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Nights a room is taken outside website bookings: OTA/agent bookings, walk-ins and manual blocks.
CREATE TABLE IF NOT EXISTS calendar_blocks (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  room         VARCHAR(20)  NOT NULL,
  start_date   DATE         NOT NULL,                 -- first night
  end_date     DATE         NOT NULL,                 -- check-out day (not a night)
  source       VARCHAR(20)  NOT NULL,                 -- channel, walkin, block
  channel_id   INT UNSIGNED NULL,
  external_uid VARCHAR(255) NULL,
  guest_name   VARCHAR(120) NULL,
  guests       INT          NULL,
  amount       INT UNSIGNED NULL,
  note         TEXT         NULL,
  created_by   VARCHAR(60)  NULL,
  created_at   DATETIME     NOT NULL,
  updated_at   DATETIME     NOT NULL,
  KEY idx_blocks_room (room, start_date),
  UNIQUE KEY uq_blocks_uid (channel_id, external_uid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS employees (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(120) NOT NULL,
  position   VARCHAR(80)  NULL,
  department VARCHAR(40)  NULL,
  phone      VARCHAR(32)  NULL,
  email      VARCHAR(190) NULL,
  join_date  DATE         NULL,
  salary     INT UNSIGNED NULL,                       -- monthly base salary (IDR)
  allowance  INT UNSIGNED NULL,                       -- fixed monthly allowance (IDR)
  status     VARCHAR(10)  NOT NULL DEFAULT 'active',  -- active, inactive
  notes      TEXT         NULL,
  created_at DATETIME     NOT NULL,
  updated_at DATETIME     NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS attendance (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  employee_id INT UNSIGNED NOT NULL,
  date        DATE         NOT NULL,
  status      VARCHAR(10)  NOT NULL,                  -- hadir, izin, sakit, cuti, alpa, libur
  check_in    VARCHAR(5)   NULL,
  check_out   VARCHAR(5)   NULL,
  note        VARCHAR(255) NULL,
  created_at  DATETIME     NOT NULL,
  updated_at  DATETIME     NOT NULL,
  UNIQUE KEY uq_attendance_day (employee_id, date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS leave_requests (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  employee_id INT UNSIGNED NOT NULL,
  kind        VARCHAR(10)  NOT NULL,                  -- cuti, sakit, izin
  start_date  DATE         NOT NULL,
  end_date    DATE         NOT NULL,                  -- last day off (inclusive)
  reason      TEXT         NULL,
  status      VARCHAR(10)  NOT NULL DEFAULT 'pending', -- pending, approved, rejected
  decided_by  VARCHAR(60)  NULL,
  created_at  DATETIME     NOT NULL,
  updated_at  DATETIME     NOT NULL,
  KEY idx_leave_employee (employee_id, start_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payroll (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  period         CHAR(7)      NOT NULL,               -- YYYY-MM
  employee_id    INT UNSIGNED NOT NULL,
  base           INT UNSIGNED NOT NULL DEFAULT 0,
  allowance      INT UNSIGNED NOT NULL DEFAULT 0,
  bonus          INT UNSIGNED NOT NULL DEFAULT 0,
  deduction      INT UNSIGNED NOT NULL DEFAULT 0,
  net            INT          NOT NULL DEFAULT 0,
  status         VARCHAR(10)  NOT NULL DEFAULT 'draft', -- draft, paid
  paid_at        DATETIME     NULL,
  transaction_id INT UNSIGNED NULL,
  note           VARCHAR(255) NULL,
  created_at     DATETIME     NOT NULL,
  updated_at     DATETIME     NOT NULL,
  UNIQUE KEY uq_payroll_month (period, employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS transactions (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  date        DATE         NOT NULL,
  kind        VARCHAR(10)  NOT NULL,                  -- income, expense
  category    VARCHAR(40)  NOT NULL,
  amount      INT UNSIGNED NOT NULL,
  method      VARCHAR(20)  NULL,                      -- cash, transfer, midtrans, ota, …
  description TEXT         NULL,
  ref_type    VARCHAR(20)  NULL,                      -- inquiry, payroll, block
  ref_id      INT UNSIGNED NULL,
  created_by  VARCHAR(60)  NULL,
  created_at  DATETIME     NOT NULL,
  updated_at  DATETIME     NOT NULL,
  KEY idx_transactions_date (date),
  KEY idx_transactions_ref (ref_type, ref_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
