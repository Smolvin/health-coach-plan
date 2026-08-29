// Массовая загрузка медиа зала из локальной папки — альтернатива поштучной
// загрузке через бота (/addequipment), когда фото уже лежат на диске.
// Идемпотентно: повторный запуск на той же папке пропускает файлы, которые уже
// были импортированы (gym_equipment.source_file — по имени файла в рамках зала).
//
// Папка на хосте монтируется в контейнер только по пути /import (см.
// docker-compose.yml, том IMPORT_ASSETS_DIR:/import:ro) — скрипту нужен путь
// уже "изнутри" контейнера. Использование:
//   docker compose exec bot npm run import:media -- /import/gym_nw "arena gym ncw"
// Второй аргумент — название существующего зала, его код id, либо название
// нового зала (если такого ещё нет — будет создан, тип "location", без адреса).
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { getGym, createGym, listGyms } = require('../src/gyms');
const { addPhoto, findBySourceFile } = require('../src/equipment');
const { ensureGymFolder, uploadEquipmentPhoto } = require('../src/media');
const { OWNER_TELEGRAM_ID } = require('../src/config');

const EXT_CONTENT_TYPE = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

// Служебный telegram_id для операций из CLI, если владелец ещё не назначен —
// 0 не пройдёт по FK/логике ролей, но added_by/uploaded_by это просто BIGINT-метка.
const CLI_ACTOR_ID = OWNER_TELEGRAM_ID || 0;

function humanizeName(filename) {
  return path
    .basename(filename, path.extname(filename))
    .replace(/[_-]+/g, ' ')
    .trim();
}

async function resolveGym(nameOrId) {
  if (/^\d+$/.test(nameOrId)) {
    const gym = await getGym(nameOrId);
    if (!gym) throw new Error(`Зал с id=${nameOrId} не найден.`);
    return gym;
  }

  const gyms = await listGyms();
  const existing = gyms.find((g) => g.name.toLowerCase() === nameOrId.toLowerCase());
  if (existing) return existing;

  console.log(`Зала «${nameOrId}» нет — создаю новый (тип: location, без адреса)...`);
  const gymId = await createGym({ name: nameOrId, type: 'location', location: null, createdBy: CLI_ACTOR_ID });
  await ensureGymFolder(gymId);
  return getGym(gymId);
}

async function main() {
  const [, , importPath, gymArg] = process.argv;
  if (!importPath || !gymArg) {
    console.error('Использование: node scripts/import_media.js <путь-к-папке> <название-или-id-зала>');
    process.exit(1);
  }
  if (!fs.existsSync(importPath)) {
    console.error(`Папка не найдена: ${importPath} (не примонтирована в контейнер? см. docker-compose.yml)`);
    process.exit(1);
  }

  const gym = await resolveGym(gymArg);
  console.log(`Зал: #${gym.id} ${gym.name}`);

  const files = fs
    .readdirSync(importPath)
    .filter((f) => EXT_CONTENT_TYPE[path.extname(f).toLowerCase()])
    .sort();
  console.log(`Файлов-изображений в папке: ${files.length}`);

  let imported = 0;
  let skipped = 0;
  let failed = 0;

  for (const file of files) {
    const existing = await findBySourceFile(gym.id, file);
    if (existing) {
      console.log(`  пропуск (уже импортирован как #${existing.id}): ${file}`);
      skipped += 1;
      continue;
    }

    try {
      const buffer = fs.readFileSync(path.join(importPath, file));
      const contentType = EXT_CONTENT_TYPE[path.extname(file).toLowerCase()];

      const equipmentId = await addPhoto({
        gymId: gym.id,
        sourceFile: file,
        name: humanizeName(file),
        addedBy: CLI_ACTOR_ID,
      });

      await uploadEquipmentPhoto({
        gymId: gym.id,
        equipmentId,
        buffer,
        contentType,
        uploadedBy: CLI_ACTOR_ID,
      });

      console.log(`  импортировано: ${file} -> #${equipmentId}`);
      imported += 1;
    } catch (err) {
      console.error(`  ошибка на файле "${file}":`, err.message);
      failed += 1;
    }
  }

  console.log(`\nГотово. Импортировано: ${imported}, пропущено (уже были): ${skipped}, ошибок: ${failed}.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Импорт не удался:', err);
    process.exit(1);
  });
