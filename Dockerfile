FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY src ./src
COPY scripts ./scripts
# scripts/migrate.js читает ./migrations относительно __dirname — раньше
# миграции всегда гоняли с хоста напрямую (npm run migrate, не в
# контейнере), поэтому это отсутствие не всплывало. На проде миграция
# идёт из контейнера (docker compose run --rm bot node scripts/migrate.js)
# — без этой строки падает ENOENT: no such file or directory, scandir
# '/app/migrations'. Найдено на реальном деплое, 2026-09-05.
COPY migrations ./migrations

CMD ["node", "src/bot.js"]
