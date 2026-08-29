-- Группы клиентов (владелец распределяет админов по группам — какие клиенты
-- им видны) и журнал правок ответов админами (кто/что/когда поменял).

CREATE TABLE IF NOT EXISTS client_groups (
  id INT NOT NULL AUTO_INCREMENT,
  code VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY idx_client_groups_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

ALTER TABLE clients ADD COLUMN group_id INT NULL AFTER survey_strategy;
ALTER TABLE clients ADD CONSTRAINT fk_clients_group FOREIGN KEY (group_id) REFERENCES client_groups (id) ON DELETE SET NULL;

-- group_id = NULL у админа значит «видит всех клиентов» (по умолчанию для всех,
-- владелец сужает конкретным админам через /setadmingroup).
ALTER TABLE admins ADD COLUMN group_id INT NULL AFTER role;
ALTER TABLE admins ADD CONSTRAINT fk_admins_group FOREIGN KEY (group_id) REFERENCES client_groups (id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS answer_edit_log (
  id INT NOT NULL AUTO_INCREMENT,
  client_id INT NOT NULL,
  round INT NOT NULL DEFAULT 1,
  question_number SMALLINT NOT NULL,
  question_text TEXT NOT NULL,
  old_answer TEXT NULL,
  new_answer TEXT NULL,
  edited_by BIGINT NOT NULL,
  edited_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_answer_edit_log_client FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
