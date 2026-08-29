-- Роли в Telegram-боте: владелец проекта (один) и администраторы (могут добавлять
-- других админов; удалять админов может только владелец — это проверяется в коде,
-- не в схеме). Обычные клиенты в этой таблице не появляются.

CREATE TABLE IF NOT EXISTS admins (
  id INT NOT NULL AUTO_INCREMENT,
  telegram_id BIGINT NOT NULL,
  telegram_username VARCHAR(255) NULL,
  role ENUM('owner', 'admin') NOT NULL DEFAULT 'admin',
  added_by BIGINT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY idx_admins_telegram_id (telegram_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
