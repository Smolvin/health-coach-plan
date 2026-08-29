-- Принцип "один вопрос за подход": вопрос "Пол, рост и текущий вес?" бил его
-- сразу на три под-ответа в одном сообщении — разбиваем на 3 отдельных вопроса.

UPDATE survey_questions SET active = 0 WHERE code = 'body_stats';

INSERT INTO survey_questions (code, question_text, question_type, options) VALUES
  ('gender', 'Какой у тебя пол?', 'choice', '["Мужской","Женский"]'),
  ('height', 'Какой у тебя рост, в см?', 'text', NULL),
  ('weight', 'Какой у тебя текущий вес, в кг?', 'text', NULL)
ON DUPLICATE KEY UPDATE
  question_text = VALUES(question_text),
  question_type = VALUES(question_type),
  options = VALUES(options),
  active = 1;

-- Порядок вопросов пересобирается целиком (безопасно: эта таблица — только
-- конфигурация анкеты, ответы клиентов лежат в questionnaire_answers и не трогаются).
DELETE FROM survey_strategy_questions;

INSERT INTO survey_strategy_questions (strategy_id, question_id, position)
SELECT s.id, q.id, pos.position
FROM survey_strategies s
JOIN (
  SELECT 'goal' AS code, 1 AS position UNION ALL
  SELECT 'gender', 2 UNION ALL
  SELECT 'height', 3 UNION ALL
  SELECT 'weight', 4 UNION ALL
  SELECT 'health_restrictions', 5 UNION ALL
  SELECT 'medications', 6 UNION ALL
  SELECT 'training_experience', 7 UNION ALL
  SELECT 'training_location', 8 UNION ALL
  SELECT 'days_time', 9 UNION ALL
  SELECT 'training_preferences', 10 UNION ALL
  SELECT 'activity_level', 11 UNION ALL
  SELECT 'allergies', 12 UNION ALL
  SELECT 'current_diet', 13 UNION ALL
  SELECT 'sleep_stress', 14 UNION ALL
  SELECT 'past_experience', 15 UNION ALL
  SELECT 'deadline', 16 UNION ALL
  SELECT 'tracking_consent', 17
) pos
JOIN survey_questions q ON q.code = pos.code
WHERE s.code = 'long'
ON DUPLICATE KEY UPDATE position = VALUES(position);

INSERT INTO survey_strategy_questions (strategy_id, question_id, position)
SELECT s.id, q.id, pos.position
FROM survey_strategies s
JOIN (
  SELECT 'goal' AS code, 1 AS position UNION ALL
  SELECT 'gender', 2 UNION ALL
  SELECT 'height', 3 UNION ALL
  SELECT 'weight', 4 UNION ALL
  SELECT 'health_restrictions', 5 UNION ALL
  SELECT 'training_location', 6 UNION ALL
  SELECT 'days_time', 7 UNION ALL
  SELECT 'allergies', 8 UNION ALL
  SELECT 'tracking_consent', 9
) pos
JOIN survey_questions q ON q.code = pos.code
WHERE s.code = 'short'
ON DUPLICATE KEY UPDATE position = VALUES(position);
