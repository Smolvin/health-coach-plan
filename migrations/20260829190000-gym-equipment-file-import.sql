-- Поддержка массового импорта медиа из локальной папки (scripts/import_media.js),
-- а не только поштучной загрузки через бота: photo_file_id (Telegram) теперь
-- необязателен, добавлен source_file (исходное имя файла) для идемпотентности —
-- повторный запуск импорта на той же папке не плодит дубликаты.

ALTER TABLE gym_equipment MODIFY COLUMN photo_file_id VARCHAR(255) NULL;
ALTER TABLE gym_equipment ADD COLUMN source_file VARCHAR(255) NULL AFTER photo_file_id;
ALTER TABLE gym_equipment ADD UNIQUE KEY idx_gym_equipment_source (gym_id, source_file);
