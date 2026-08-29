-- Конфигурация анкеты в БД: банк вопросов + стратегии (короткая/длинная), чтобы
-- состав и порядок вопросов менялся без правок кода.

CREATE TABLE IF NOT EXISTS survey_strategies (
  id INT NOT NULL AUTO_INCREMENT,
  code VARCHAR(32) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY idx_survey_strategies_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS survey_questions (
  id INT NOT NULL AUTO_INCREMENT,
  code VARCHAR(64) NOT NULL,
  question_text TEXT NOT NULL,
  question_type ENUM('text','choice','yesno') NOT NULL DEFAULT 'text',
  options JSON NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY idx_survey_questions_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS survey_strategy_questions (
  id INT NOT NULL AUTO_INCREMENT,
  strategy_id INT NOT NULL,
  question_id INT NOT NULL,
  position INT NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY idx_strategy_question (strategy_id, question_id),
  UNIQUE KEY idx_strategy_position (strategy_id, position),
  CONSTRAINT fk_ssq_strategy FOREIGN KEY (strategy_id) REFERENCES survey_strategies (id) ON DELETE CASCADE,
  CONSTRAINT fk_ssq_question FOREIGN KEY (question_id) REFERENCES survey_questions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

ALTER TABLE clients ADD COLUMN survey_strategy VARCHAR(32) NULL AFTER wants_plan;

INSERT INTO survey_strategies (code, name, description) VALUES
  ('short', 'Короткая анкета', 'Быстрый старт — только самое необходимое для первой программы'),
  ('long', 'Полная анкета', 'Все вопросы — максимально точная программа и план питания')
ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description);

INSERT INTO survey_questions (code, question_text, question_type, options) VALUES
  ('goal', 'Какая у тебя главная цель: снижение веса, набор мышечной массы, рекомпозиция (жир вниз, мышцы вверх), общая выносливость/здоровье или что-то другое?', 'choice', '["Снижение веса","Набор мышечной массы","Рекомпозиция (жир вниз, мышцы вверх)","Общая выносливость/здоровье"]'),
  ('body_stats', 'Пол, рост и текущий вес? (возраст не спрашиваю — он уже известен по дате рождения)', 'text', NULL),
  ('health_restrictions', 'Есть ли хронические заболевания, травмы, операции или ограничения от врача (спина, суставы, сердце, давление и т.п.)?', 'choice', '["Нет, ограничений нет"]'),
  ('medications', 'Принимаешь ли какие-то лекарства или добавки на постоянной основе?', 'choice', '["Не принимаю"]'),
  ('training_experience', 'Какой у тебя опыт тренировок: новичок, был перерыв, тренируешься регулярно? Сколько лет стажа?', 'choice', '["Новичок","Был перерыв","Тренируюсь регулярно"]'),
  ('training_location', 'Где будешь тренироваться: зал с полным оборудованием, дома с минимальным инвентарём, вообще без инвентаря?', 'choice', '["Зал с полным оборудованием","Дома с минимальным инвентарём","Без инвентаря"]'),
  ('days_time', 'Сколько дней в неделю и сколько времени на тренировку готов выделять?', 'text', NULL),
  ('training_preferences', 'Есть ли предпочтения по типу тренировок (силовые, кроссфит, бег, плавание, единоборства и т.п.) или то, что категорически не нравится?', 'choice', '["Силовые","Кроссфит","Бег","Без предпочтений"]'),
  ('activity_level', 'Как оцениваешь текущий уровень активности вне тренировок (сидячая работа / на ногах весь день / физический труд)?', 'choice', '["Сидячая работа","На ногах весь день","Физический труд"]'),
  ('allergies', 'Есть ли пищевые аллергии, непереносимости или продукты, которые категорически не ешь (в т.ч. по религиозным/этическим причинам — веган, халяль и т.п.)?', 'choice', '["Нет ограничений"]'),
  ('current_diet', 'Как питаешься сейчас: сколько приёмов пищи в день, готовишь сам или заказываешь, есть ли конкретные вредные привычки (сладкое, алкоголь, фастфуд)?', 'text', NULL),
  ('sleep_stress', 'Сколько в среднем спишь и как оцениваешь уровень стресса за последний месяц?', 'text', NULL),
  ('past_experience', 'Был ли раньше опыт с диетами/программами тренировок — что сработало, а что нет?', 'choice', '["Опыта не было"]'),
  ('deadline', 'Есть ли конкретный дедлайн или событие, к которому нужно прийти в форму?', 'choice', '["Нет, конкретного дедлайна нет"]'),
  ('tracking_consent', 'Готов(а) присылать замеры/фото прогресса и взвешиваться регулярно для отслеживания результата?', 'yesno', NULL)
ON DUPLICATE KEY UPDATE
  question_text = VALUES(question_text),
  question_type = VALUES(question_type),
  options = VALUES(options);

-- Полная анкета — все вопросы по порядку
INSERT INTO survey_strategy_questions (strategy_id, question_id, position)
SELECT s.id, q.id, pos.position
FROM survey_strategies s
JOIN (
  SELECT 'goal' AS code, 1 AS position UNION ALL
  SELECT 'body_stats', 2 UNION ALL
  SELECT 'health_restrictions', 3 UNION ALL
  SELECT 'medications', 4 UNION ALL
  SELECT 'training_experience', 5 UNION ALL
  SELECT 'training_location', 6 UNION ALL
  SELECT 'days_time', 7 UNION ALL
  SELECT 'training_preferences', 8 UNION ALL
  SELECT 'activity_level', 9 UNION ALL
  SELECT 'allergies', 10 UNION ALL
  SELECT 'current_diet', 11 UNION ALL
  SELECT 'sleep_stress', 12 UNION ALL
  SELECT 'past_experience', 13 UNION ALL
  SELECT 'deadline', 14 UNION ALL
  SELECT 'tracking_consent', 15
) pos
JOIN survey_questions q ON q.code = pos.code
WHERE s.code = 'long'
ON DUPLICATE KEY UPDATE position = VALUES(position);

-- Короткая анкета — ключевые вопросы для быстрого старта
INSERT INTO survey_strategy_questions (strategy_id, question_id, position)
SELECT s.id, q.id, pos.position
FROM survey_strategies s
JOIN (
  SELECT 'goal' AS code, 1 AS position UNION ALL
  SELECT 'body_stats', 2 UNION ALL
  SELECT 'health_restrictions', 3 UNION ALL
  SELECT 'training_location', 4 UNION ALL
  SELECT 'days_time', 5 UNION ALL
  SELECT 'allergies', 6 UNION ALL
  SELECT 'tracking_consent', 7
) pos
JOIN survey_questions q ON q.code = pos.code
WHERE s.code = 'short'
ON DUPLICATE KEY UPDATE position = VALUES(position);
