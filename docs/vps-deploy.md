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
два сервиса из одного и того же образа (`Dockerfile` в корне репозитория):
`bot` (Telegram long polling, наружу не смотрит вообще) и `admin` (веб-
админка, единственный публичный компонент, уже закрыт HTTP Basic Auth на
уровне приложения — `ADMIN_WEB_USER`/`ADMIN_WEB_PASSWORD`, см.
`src/admin/server.js`; сама инфраструктура (nginx/TLS) поверх ничего не
добавляет).

## 1. Провижининг shared MySQL/MinIO (один раз)

Делается со стороны инфраструктурного репозитория — см. свои личные
заметки за точной командой. Результат — `DB_NAME`/`DB_USER`/`DB_PASSWORD` и
`MINIO_BUCKET`/`MINIO_ACCESS_KEY`/`MINIO_SECRET_KEY`, сохранить сразу
(повторно не показывается).

## 2. Клонирование и `.env`

Клонировать репозиторий на сервер (путь/deploy key — см. личные заметки):

```bash
git clone <this-repo-url>
cd health-coach-plan
cp .env.example .env
```

Заполнить `.env` (корневой, НЕ `docker/prod/.env` — `docker-compose.yml`
здесь ссылается на `../../.env`):

- `BOT_TOKEN`, `OWNER_TELEGRAM_ID` — как в локальной разработке.
- `ADMIN_WEB_USER`/`ADMIN_WEB_PASSWORD` — реальный пароль для прод-админки
  (не оставлять пустым — приложение само откажется стартовать без пароля).
- `DB_HOST=mysql`, `DB_PORT=3306`, `DB_NAME`/`DB_USER`/`DB_PASSWORD` — из
  шага 1.
- `MINIO_ENDPOINT=minio`, `MINIO_PORT=9000`, `MINIO_USE_SSL=false`,
  `MINIO_BUCKET`/`MINIO_ACCESS_KEY`/`MINIO_SECRET_KEY` — из шага 1 (если
  провижининг вывел `MINIO_ENDPOINT=host:port` одной строкой — этому
  проекту нужно раздельно `MINIO_ENDPOINT`/`MINIO_PORT`, разбить руками).
- `IMPORT_ASSETS_DIR` — не используется в проде (только ручной
  `scripts/import_media.js`), можно оставить пустым/дефолт.

## 3. Деплой

```bash
docker compose -f docker/prod/docker-compose.yml up --build -d
docker compose -f docker/prod/docker-compose.yml ps
docker compose -f docker/prod/docker-compose.yml logs bot --tail 30     # без ошибок подключения к БД/MinIO/Telegram
```

`bot` — без healthcheck (нет входящего порта); проверяется по логам и по
факту, что бот отвечает в Telegram. `admin` — `Up (healthy)`.

## 4. Сертификат и проверка

Домен должен резолвиться на сервер (своя DNS-запись — см. личные заметки).
Дальше — выпуск сертификата и `docker compose restart nginx` со стороны
инфраструктурного репозитория (точные команды — свои личные заметки/
runbook того репозитория).

```bash
curl -u admin:<ADMIN_WEB_PASSWORD> -I https://<домен-из-заметок>/
```
