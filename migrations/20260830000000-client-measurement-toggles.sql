-- Админ может выключить замеры и/или напоминания о них для конкретного
-- клиента (веб-админка, карточка клиента) — раздельно: можно оставить
-- возможность вносить замеры самому, но не дёргать напоминаниями, или
-- выключить обе функции целиком.

ALTER TABLE clients ADD COLUMN measurements_enabled TINYINT(1) NOT NULL DEFAULT 1 AFTER last_measurement_reminder_at;
ALTER TABLE clients ADD COLUMN measurement_reminders_enabled TINYINT(1) NOT NULL DEFAULT 1 AFTER measurements_enabled;
