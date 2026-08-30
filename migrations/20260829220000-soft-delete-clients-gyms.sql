-- Удаление клиентов/залов из админки — теперь мягкое: помечаем deleted_at,
-- запись и всё, что на неё ссылается (ответы, логи, снимки, оборудование,
-- медиа), физически не удаляется и восстановима.

ALTER TABLE clients ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL AFTER updated_at;
ALTER TABLE gyms ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL AFTER created_by;
