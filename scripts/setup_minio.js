// Настройка MinIO под этот проект: bucket health-coach-plan, префикс "gym/",
// и по одной "папке" (префиксу-маркеру) на каждый уже существующий зал.
// Нужна докер-сеть, где виден MinIO (endpoint из .env) — со своего хоста
// напрямую не запустится, см. .env.example. Использование:
//   docker compose exec bot npm run setup:minio
//   (или: docker compose run --rm bot npm run setup:minio)
require('dotenv').config();
const { client, bucket } = require('../src/minio-client');
const { ensureBucket, ensureGymFolder, gymFolderPrefix } = require('../src/media');
const { listGyms } = require('../src/gyms');

async function main() {
  console.log(`Проверяю bucket "${bucket}"...`);
  await ensureBucket();
  console.log('Bucket готов.');

  console.log('Создаю базовый префикс gym/...');
  await client.putObject(bucket, 'gym/.keep', Buffer.from(''));

  const gyms = await listGyms();
  console.log(`Залов в БД: ${gyms.length} — создаю префикс на каждый...`);
  for (const gym of gyms) {
    await ensureGymFolder(gym.id);
    console.log(`  ${gymFolderPrefix(gym.id)} (зал #${gym.id} — ${gym.name})`);
  }

  console.log('Готово.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Настройка MinIO не удалась:', err);
    process.exit(1);
  });
