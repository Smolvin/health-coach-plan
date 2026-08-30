-- Каталожный импорт (scripts/import_catalog.js) даёт больше данных на единицу
-- оборудования, чем было в схеме: описание и количество замеченных экземпляров.
-- Оба поля необязательны — для оборудования, добавленного через бота/старый
-- import_media.js, их просто не будет.

ALTER TABLE gym_equipment ADD COLUMN description TEXT NULL AFTER name;
ALTER TABLE gym_equipment ADD COLUMN quantity_seen INT NULL AFTER description;
