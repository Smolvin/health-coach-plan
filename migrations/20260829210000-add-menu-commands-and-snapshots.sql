-- Меню бота (кнопка со списком команд) настраивается из БД вместо жёстко
-- зашитых в src/menu.js списков. tier — та же трёхуровневая модель, что уже
-- была: 'client' видят все, 'admin' — админы и владелец, 'owner' — только
-- владелец (owner получает client+admin+owner, admin — client+admin).
-- Сид ниже — текущие хардкод-списки один в один, чтобы миграция не поменяла
-- поведение бота, только сделала его редактируемым.

CREATE TABLE IF NOT EXISTS bot_menu_commands (
  id INT NOT NULL AUTO_INCREMENT,
  tier ENUM('client', 'admin', 'owner') NOT NULL,
  command VARCHAR(32) NOT NULL,
  description VARCHAR(256) NOT NULL,
  position INT NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY idx_bot_menu_commands_tier_command (tier, command)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO bot_menu_commands (tier, command, description, position) VALUES
  ('client', 'start', 'Начать анкету', 1),
  ('client', 'continue', 'Продолжить незаконченную анкету', 2),
  ('client', 'extend', 'Пройти расширенную анкету', 3),
  ('client', 'help', 'Справка', 4),
  ('client', 'whoami', 'Мой Telegram ID', 5),
  ('client', 'gyms', 'Список залов', 6),
  ('client', 'gym', 'Инфо и оборудование зала', 7),
  ('client', 'creategym', 'Завести новый зал', 8),
  ('client', 'addequipment', 'Добавить фото оборудования в зал', 9),
  ('client', 'showequipment', 'Показать фото оборудования', 10),
  ('client', 'classes', 'Список классов оборудования', 11),
  ('client', 'classifyequipment', 'Указать класс оборудования', 12),
  ('admin', 'stats', 'Статистика по клиентам', 1),
  ('admin', 'clients', 'Список клиентов', 2),
  ('admin', 'editanswer', 'Изменить ответ клиента', 3),
  ('admin', 'logs', 'Журнал правок ответов', 4),
  ('admin', 'admins', 'Список админов', 5),
  ('admin', 'addadmin', 'Добавить админа', 6),
  ('admin', 'groups', 'Список групп клиентов', 7),
  ('admin', 'setclientgroup', 'Назначить клиенту группу', 8),
  ('admin', 'createclass', 'Создать класс оборудования', 9),
  ('owner', 'removeadmin', 'Удалить админа', 1),
  ('owner', 'creategroup', 'Создать группу клиентов', 2),
  ('owner', 'setadmingroup', 'Задать область видимости админу', 3)
ON DUPLICATE KEY UPDATE description = VALUES(description), position = VALUES(position);

-- Снимки состояния клиента (профиль + ответы анкеты) — снимаются автоматически
-- перед копированием данных другого клиента поверх, чтобы можно было откатить.
CREATE TABLE IF NOT EXISTS client_snapshots (
  id INT NOT NULL AUTO_INCREMENT,
  client_id INT NOT NULL,
  snapshot_data JSON NOT NULL,
  reason VARCHAR(255) NULL,
  created_by BIGINT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  restored_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_client_snapshots_client FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
