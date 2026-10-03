-- Traveler survey responses. Answers are a JSON object { questionId: value } (see src/survey.js).

CREATE TABLE survey_responses (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  lang        CHAR(2)      NOT NULL DEFAULT 'en',
  answers     LONGTEXT     NOT NULL,
  contact     VARCHAR(190) NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_survey_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
