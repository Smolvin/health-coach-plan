// Импорт зала из структурированного каталога (equipment_catalog.json + папка
// с уже обрезанными карточками-фото), а не из плоской папки со скриншотами —
// см. scripts/import_media.js для простого варианта. Каталог даёт категории
// (→ equipment_classes) и по каждой позиции название/бренд/описание/количество,
// так что оборудование приходит уже классифицированным, не «не классифицировано».
//
// Ожидаемый формат JSON:
//   { "gym_name": "...", "categories": [ { "id": "...", "name": "...",
//     "items": [ { "id", "name", "brand", "card_image" (путь относительно
//     папки с самим JSON), "description", "quantity_seen" }, ... ] } ] }
//
// Идемпотентно: dedup по card_image в рамках зала (gym_equipment.source_file),
// как и в import_media.js — повторный запуск не плодит дубликаты.
//
// Использование (путь — уже "изнутри" контейнера, см. docker-compose.yml,
// том IMPORT_ASSETS_DIR:/import:ro):
//   docker compose exec bot npm run import:catalog -- /import/gym_nw/equipment_catalog.json
// Второй (необязательный) аргумент — переопределить название зала вместо
// catalog.gym_name.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { findOrCreateGym } = require('../src/gyms');
const { getOrCreateClass, addPhoto, findBySourceFile } = require('../src/equipment');
const { ensureGymFolder, uploadEquipmentPhoto } = require('../src/media');
const { OWNER_TELEGRAM_ID } = require('../src/config');

const EXT_CONTENT_TYPE = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

const CLI_ACTOR_ID = OWNER_TELEGRAM_ID || 0;

async function main() {
  const [, , catalogPath, gymNameArg] = process.argv;
  if (!catalogPath) {
    console.error('Использование: node scripts/import_catalog.js <путь-к-equipment_catalog.json> [название-зала]');
    process.exit(1);
  }
  if (!fs.existsSync(catalogPath)) {
    console.error(`Файл не найден: ${catalogPath} (не примонтирован в контейнер? см. docker-compose.yml)`);
    process.exit(1);
  }

  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const baseDir = path.dirname(catalogPath);
  const gymName = gymNameArg || catalog.gym_name;
  if (!gymName) {
    console.error('Не указано название зала — ни вторым аргументом, ни в catalog.gym_name.');
    process.exit(1);
  }

  const gym = await findOrCreateGym({ name: gymName, type: 'location', location: null, createdBy: CLI_ACTOR_ID });
  await ensureGymFolder(gym.id);
  console.log(`Зал: #${gym.id} ${gym.name}`);
  if (catalog.source) console.log(`Источник каталога: ${catalog.source}`);

  let imported = 0;
  let skipped = 0;
  let failed = 0;

  for (const category of catalog.categories || []) {
    const equipmentClass = await getOrCreateClass(category.id, category.name);
    const items = category.items || [];
    console.log(`\nКатегория: ${category.name} (${category.id}) — ${items.length} поз.`);

    for (const item of items) {
      const sourceFile = item.card_image;
      if (!sourceFile) {
        console.error(`  пропуск «${item.name}»: в каталоге не указан card_image`);
        failed += 1;
        continue;
      }

      const existing = await findBySourceFile(gym.id, sourceFile);
      if (existing) {
        console.log(`  пропуск (уже импортирован как #${existing.id}): ${item.name}`);
        skipped += 1;
        continue;
      }

      const fullPath = path.join(baseDir, sourceFile);
      if (!fs.existsSync(fullPath)) {
        console.error(`  ошибка: файл карточки не найден — ${fullPath}`);
        failed += 1;
        continue;
      }

      try {
        const buffer = fs.readFileSync(fullPath);
        const contentType = EXT_CONTENT_TYPE[path.extname(fullPath).toLowerCase()] || 'image/jpeg';
        const displayName = item.brand && item.brand !== 'не определён' ? `${item.name} (${item.brand})` : item.name;

        const equipmentId = await addPhoto({
          gymId: gym.id,
          sourceFile,
          name: displayName,
          description: item.description || null,
          quantitySeen: typeof item.quantity_seen === 'number' ? item.quantity_seen : null,
          classId: equipmentClass.id,
          addedBy: CLI_ACTOR_ID,
        });

        await uploadEquipmentPhoto({
          gymId: gym.id,
          equipmentId,
          buffer,
          contentType,
          uploadedBy: CLI_ACTOR_ID,
        });

        console.log(`  импортировано: ${displayName} -> #${equipmentId} (класс: ${equipmentClass.name})`);
        imported += 1;
      } catch (err) {
        console.error(`  ошибка на «${item.name}»:`, err.message);
        failed += 1;
      }
    }
  }

  console.log(`\nГотово. Импортировано: ${imported}, пропущено (уже были): ${skipped}, ошибок: ${failed}.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Импорт каталога не удался:', err);
    process.exit(1);
  });
