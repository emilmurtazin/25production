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

  // Как и AUTO_MIGRATE — для окружений без удобного доступа к консоли контейнера.
  // Безопасно для повторных рестартов: сеет демо-данные, ТОЛЬКО если таблица пользователей
  // пуста — не тронет ничего, если в базе уже есть реальные данные.
  if (process.env.AUTO_SEED === 'true') {
    const { db } = await import('./db/client');
    const { users } = await import('./db/schema');
    const existing = await db.select().from(users).limit(1);
    if (existing.length === 0) {
      console.log('AUTO_SEED=true — база пуста, засеиваю демо-данными...');
      const { runSeed } = await import('./db/seed');
      await runSeed();
      console.log('Демо-данные созданы.');
    } else {
      console.log('AUTO_SEED=true, но в базе уже есть пользователи — пропускаю (не хочу затирать данные).');
    }
  }

  const app = createApp();
  app.listen(port, () => {
    console.log(`API запущено на порту ${port}`);
  });
}

bootstrap().catch((err) => {
  console.error('Не удалось запустить сервер:', err);
  process.exit(1);
});
