-- Маппинг медиафайлов зала на объекты в MinIO. Фото по-прежнему приходят через
-- Telegram (photo_file_id в gym_equipment) — эта таблица фиксирует постоянную
-- копию в object storage: bucket/ключ, куда именно легли байты.
-- Ключи вида gym/<gym_id>/equipment/<equipment_id>.jpg — своя "папка" на зал.

CREATE TABLE IF NOT EXISTS gym_media (
  id INT NOT NULL AUTO_INCREMENT,
  gym_id INT NOT NULL,
  gym_equipment_id INT NULL,
  minio_bucket VARCHAR(128) NOT NULL,
  minio_key VARCHAR(500) NOT NULL,
  content_type VARCHAR(100) NULL,
  size_bytes INT NULL,
  source_telegram_file_id VARCHAR(255) NULL,
  uploaded_by BIGINT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY idx_gym_media_key (minio_bucket, minio_key(191)),
  CONSTRAINT fk_gym_media_gym FOREIGN KEY (gym_id) REFERENCES gyms (id) ON DELETE CASCADE,
  CONSTRAINT fk_gym_media_equipment FOREIGN KEY (gym_equipment_id) REFERENCES gym_equipment (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
