-- Залы, классы оборудования (переиспользуемый справочник — одно и то же
-- оборудование бывает в разных залах) и сами единицы оборудования с фото.
-- Фото хранится в Telegram (photo_file_id) — своего файлового хранилища нет,
-- бот/веб-админка перезапрашивают файл у Telegram по этому id по требованию.

CREATE TABLE IF NOT EXISTS gyms (
  id INT NOT NULL AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  type ENUM('location', 'template') NOT NULL DEFAULT 'location',
  location VARCHAR(255) NULL,
  created_by BIGINT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS equipment_classes (
  id INT NOT NULL AUTO_INCREMENT,
  code VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY idx_equipment_classes_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS gym_equipment (
  id INT NOT NULL AUTO_INCREMENT,
  gym_id INT NOT NULL,
  equipment_class_id INT NULL,
  name VARCHAR(255) NULL,
  photo_file_id VARCHAR(255) NOT NULL,
  added_by BIGINT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_gym_equipment_gym FOREIGN KEY (gym_id) REFERENCES gyms (id) ON DELETE CASCADE,
  CONSTRAINT fk_gym_equipment_class FOREIGN KEY (equipment_class_id) REFERENCES equipment_classes (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
