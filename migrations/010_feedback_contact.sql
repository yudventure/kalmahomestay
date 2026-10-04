-- The "We hear you" form asks for email and WhatsApp separately (both required).
ALTER TABLE feedback ADD COLUMN email VARCHAR(190) NULL AFTER contact, ADD COLUMN phone VARCHAR(32) NULL AFTER email;
