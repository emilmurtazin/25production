import 'dotenv/config';
import { createApp } from './app';

const port = Number(process.env.PORT) || 3000;

async function bootstrap() {
  // На простых PaaS (в т.ч. Timeweb Cloud Apps) может не быть удобного shell-доступа к контейнеру,
  // поэтому миграции можно применять автоматически при старте — включается переменной окружения.
  // Для более контролируемого продакшен-процесса лучше гонять `node dist/db/migrate.js` отдельным шагом деплоя.
  if (process.env.AUTO_MIGRATE === 'true') {
    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    const { db } = await import('./db/client');
    console.log('AUTO_MIGRATE=true — применяю миграции перед стартом...');
    await migrate(db, { migrationsFolder: './drizzle' });
    console.log('Миграции применены.');
  }

const app = createApp();
app.listen(port, '0.0.0.0', () => {
  console.log(`✅ API запущено на порту ${port}`);
  console.log(`✅ Healthcheck доступен: http://localhost:${port}/health`);
 });
}

bootstrap().catch((err) => {
  console.error('Не удалось запустить сервер:', err);
  process.exit(1);
});
