-- Замеры клиента — гибкий справочник параметров (вес, талия, ...) плюс сами
-- записи. Клиент сам решает, что замерить в этот раз (/addmeasurement).
-- last_measurement_reminder_at на clients — чтобы не слать напоминание каждый
-- день, пока клиент тянет с замерами (шлём не чаще раза в 2 недели).

CREATE TABLE IF NOT EXISTS measurement_types (
  id INT NOT NULL AUTO_INCREMENT,
  code VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  unit VARCHAR(32) NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  position INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY idx_measurement_types_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO measurement_types (code, name, unit, position) VALUES
  ('weight', 'Вес', 'кг', 1),
  ('waist', 'Талия', 'см', 2),
  ('chest', 'Грудь', 'см', 3),
  ('hips', 'Бёдра', 'см', 4),
  ('arm', 'Обхват руки', 'см', 5),
  ('body_fat', 'Процент жира', '%', 6)
ON DUPLICATE KEY UPDATE name = VALUES(name), unit = VALUES(unit), position = VALUES(position);

CREATE TABLE IF NOT EXISTS client_measurements (
  id INT NOT NULL AUTO_INCREMENT,
  client_id INT NOT NULL,
  measurement_type_id INT NOT NULL,
  value DECIMAL(6, 2) NOT NULL,
  recorded_at DATE NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_client_measurements_client FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE CASCADE,
  CONSTRAINT fk_client_measurements_type FOREIGN KEY (measurement_type_id) REFERENCES measurement_types (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

ALTER TABLE clients ADD COLUMN last_measurement_reminder_at TIMESTAMP NULL AFTER deleted_at;

INSERT INTO bot_menu_commands (tier, command, description, position) VALUES
  ('client', 'addmeasurement', 'Записать замеры', 13),
  ('client', 'measurements', 'Мои замеры', 14),
  ('client', 'newsurvey', 'Пройти анкету заново', 15)
ON DUPLICATE KEY UPDATE description = VALUES(description), position = VALUES(position);
