-- История раундов анкеты клиента — до сих пор round в questionnaire_answers был
-- просто числом без собственных метаданных (1 = первичная, 2 = расширение).
-- Теперь клиент может проходить анкету заново сколько угодно раз (/newsurvey,
-- round 3+), и у каждого раунда своя запись: какая стратегия, когда начат/закончен.
-- Сами ответы по-прежнему в questionnaire_answers, связь — через (client_id, round).

CREATE TABLE IF NOT EXISTS client_surveys (
  id INT NOT NULL AUTO_INCREMENT,
  client_id INT NOT NULL,
  round INT NOT NULL,
  kind ENUM('full', 'extend') NOT NULL DEFAULT 'full',
  strategy_code VARCHAR(32) NULL,
  status ENUM('in_progress', 'completed') NOT NULL DEFAULT 'in_progress',
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  UNIQUE KEY idx_client_surveys_round (client_id, round),
  CONSTRAINT fk_client_surveys_client FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Бэкфилл истории для уже существующих ответов (round 1 = обычная анкета,
-- round 2 = расширение через /extend, оба зарезервированы под эти смыслы).
INSERT INTO client_surveys (client_id, round, kind, strategy_code, status, completed_at)
SELECT
  qa.client_id,
  qa.round,
  IF(qa.round = 1, 'full', 'extend'),
  IF(qa.round = 1, c.survey_strategy, 'long'),
  'completed',
  MAX(qa.answered_at)
FROM questionnaire_answers qa
JOIN clients c ON c.id = qa.client_id
GROUP BY qa.client_id, qa.round
ON DUPLICATE KEY UPDATE
  strategy_code = VALUES(strategy_code),
  status = VALUES(status),
  completed_at = VALUES(completed_at);
