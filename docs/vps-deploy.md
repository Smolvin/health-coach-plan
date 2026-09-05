# Деплой на прод-VPS

Реальный домен/хост/порты этого конкретного деплоя — в `docs/vps-deploy.notes.md`
(gitignored, не в этом файле — репозиторий публичный, эти детали намеренно
здесь не публикуются).

Инфраструктурные предпосылки (внешняя сеть для роутинга, внешняя сеть для
доступа к shared MySQL/MinIO, TLS, провижининг БД/bucket) живут в отдельном
приватном инфраструктурном репозитории — не дублируем эти детали здесь, за
конкретными путями/командами смотрите свои личные заметки
(`docs/vps-deploy.notes.md`).

Этот репозиторий отвечает только за свой `docker/prod/docker-compose.yml` —
два сервиса на общем образе рантайма (`node:20-alpine`, без своего
`Dockerfile`): `bot` (Telegram long polling, наружу не смотрит вообще) и
`admin` (веб-админка, единственный публичный компонент, уже закрыт HTTP
Basic Auth на уровне приложения — `ADMIN_WEB_USER`/`ADMIN_WEB_PASSWORD`,
см. `src/admin/server.js`; сама инфраструктура (nginx/TLS) поверх ничего не
добавляет). Код и `node_modules` — не в образе, монтируются с хоста
(`../..:/app`) — `git pull` + `restart` применяет новый код без пересборки
образа.

## 1. Клонирование

Путь/deploy key — см. личные заметки:

```bash
git clone <this-repo-url>
```

## 2. `.env` — заполняется скриптом со стороны инфраструктурного репозитория

Этот репозиторий сам не хранит и не генерирует shared-креды (MySQL/MinIO
этого VPS) — начальная настройка `.env` идёт из инфраструктурного
репозитория (у него креды root-уровня, он знает, как безопасно провижинить
БД/bucket только для этого проекта). Со стороны того репозитория (см. его
`docs/runbook.md#провижининг-shared-mysqlminio-для-внешнего-проекта`):

```bash
./scripts/init-project-env.sh /path/to/health-coach-plan health_coach_plan
```

Копирует `.env.example` → `.env` (если ещё нет) и сам подставляет
`DB_HOST`/`DB_PORT`/`DB_NAME`/`DB_USER`/`DB_PASSWORD` и
`MINIO_ENDPOINT`/`MINIO_PORT`/`MINIO_BUCKET`/`MINIO_ACCESS_KEY`/
`MINIO_SECRET_KEY`. Повторный запуск безопасен — не тронет уже
сгенерированные пароль/ключ.

Остаётся дозаполнить руками (скрипт этого не знает — специфично для
проекта):

- `BOT_TOKEN`, `OWNER_TELEGRAM_ID` — как в локальной разработке.
- `ADMIN_WEB_USER`/`ADMIN_WEB_PASSWORD` — реальный пароль для прод-админки
  (не оставлять пустым — приложение само откажется стартовать без пароля).
- `IMPORT_ASSETS_DIR` — не используется в проде (только ручной
  `scripts/import_media.js`), можно оставить пустым/дефолт.

## 3. Зависимости (`node_modules` — на хосте, не в образе)

Один раз, и заново при каждом изменении `package.json`/`package-lock.json`
(одноразовый контейнер — Node на хосте не нужен):

```bash
docker run --rm -v "$(pwd)":/app -w /app node:20-alpine npm ci --omit=dev
```

## 4. Миграции схемы БД

Нужно один раз на свежей БД и после каждой новой миграции:

```bash
docker compose -f docker/prod/docker-compose.yml run --rm bot node scripts/migrate.js
```

## 5. Деплой

Первый раз:

```bash
docker compose -f docker/prod/docker-compose.yml up -d
docker compose -f docker/prod/docker-compose.yml ps
docker compose -f docker/prod/docker-compose.yml logs bot --tail 30     # без ошибок подключения к БД/MinIO/Telegram
```

`bot` — без healthcheck (нет входящего порта); проверяется по логам и по
факту, что бот отвечает в Telegram. `admin` — `Up (healthy)`.

**Обновление кода** (после `git pull`, без изменений в зависимостях):

```bash
git pull
docker compose -f docker/prod/docker-compose.yml restart bot admin
```

Пересборка (`--build`) не нужна — код монтируется с хоста. Если менялся
`package.json` — сначала шаг 3 (переустановить `node_modules`), потом
`restart`.

## 6. Сертификат и проверка

Домен должен резолвиться на сервер (своя DNS-запись — см. личные заметки).
Дальше — выпуск сертификата и `docker compose restart nginx` со стороны
инфраструктурного репозитория (точные команды — свои личные заметки/
runbook того репозитория).

```bash
curl -u admin:<ADMIN_WEB_PASSWORD> -I https://<домен-из-заметок>/
```
