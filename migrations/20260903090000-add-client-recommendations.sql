-- Рекомендация (программа тренировок + план питания) по итогам конкретного
-- раунда анкеты. Одна запись на (client_id, round) — тренер готовит её вручную
-- на основе ответов раунда и правит прямо в веб-админке (textarea), без
-- отдельного файла/markdown. Не привязано к questionnaire_answers напрямую —
-- при повторном раунде (/newsurvey) старая рекомендация не трогается, новая
-- заводится отдельной строкой под новый round.

CREATE TABLE IF NOT EXISTS client_recommendations (
  id INT NOT NULL AUTO_INCREMENT,
  client_id INT NOT NULL,
  round INT NOT NULL,
  training_plan MEDIUMTEXT NULL,
  nutrition_plan MEDIUMTEXT NULL,
  notes MEDIUMTEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY idx_client_recommendations_round (client_id, round),
  CONSTRAINT fk_client_recommendations_client FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
