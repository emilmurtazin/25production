import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL не задан. Проверьте .env / переменные окружения приложения.');
}

export const pool = new Pool({
  connectionString,
  // Timeweb Cloud Managed PostgreSQL по умолчанию отдаёт self-signed сертификат на защищённом порту —
  // если подключение идёт по TLS, включите rejectUnauthorized:false через DATABASE_SSL=true.
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

export const db = drizzle(pool, { schema });
