import 'dotenv/config';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from './client';

async function run() {
  console.log('Применяю миграции из ./drizzle ...');
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('Миграции применены.');
  await pool.end();
}

run().catch((err) => {
  console.error('Ошибка миграции:', err);
  process.exit(1);
});
