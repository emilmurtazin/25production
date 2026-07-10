import 'dotenv/config';
import { db, pool } from './client';
import {
  shops, resources, catalogOperations, modifications, modificationItems, projects, orders, orderOperations, users,
  measurements, workers,
} from './schema';
import { hashPassword } from '../utils/password';

async function main() {
  console.log('Очищаю таблицы...');
  await db.delete(measurements);
  await db.delete(workers);
  await db.delete(orderOperations);
  await db.delete(orders);
  await db.delete(modificationItems);
  await db.delete(modifications);
  await db.delete(catalogOperations);
  await db.delete(projects);
  await db.delete(users);
  await db.delete(resources);
  await db.delete(shops);

  console.log('Создаю цеха...');
  const [shop1] = await db.insert(shops).values({
    name: 'Цех 1 — Металлообработка', workStart: 8, workEnd: 20, workDays: [1, 2, 3, 4, 5],
  }).returning();
  const [shop2] = await db.insert(shops).values({
    name: 'Цех 2 — Сборка и монтаж', workStart: 9, workEnd: 21, workDays: [1, 2, 3, 4, 5, 6],
  }).returning();

  console.log('Создаю ресурсы...');
  const resourceDefs = [
    { name: 'Лазерная резка', type: 'участок', shopId: shop1.id },
    { name: 'Гибка', type: 'участок', shopId: shop1.id },
    { name: 'Сварка', type: 'бригада', shopId: shop1.id },
    { name: 'Покраска', type: 'участок', shopId: shop1.id },
    { name: 'Сборка', type: 'бригада', shopId: shop2.id },
    { name: 'Механосборка', type: 'участок', shopId: shop2.id },
    { name: 'Электромонтаж', type: 'участок', shopId: shop2.id },
    { name: 'Финальный контроль', type: 'участок', shopId: shop2.id },
  ];
  const insertedResources = await db.insert(resources).values(resourceDefs).returning();
  const r = (name: string) => insertedResources.find((x) => x.name === name)!;

  console.log('Создаю работников участков...');
  await db.insert(workers).values([
    { name: 'Иванов И.И.', grade: 4, resourceId: r('Механосборка').id },
    { name: 'Петров П.П.', grade: 2, resourceId: r('Механосборка').id },
    { name: 'Сидоров С.С.', grade: 1, resourceId: r('Механосборка').id },
    { name: 'Кузнецов К.К.', grade: 5, resourceId: r('Электромонтаж').id },
    { name: 'Смирнов С.А.', grade: 3, resourceId: r('Электромонтаж').id },
    { name: 'Волков В.В.', grade: 2, resourceId: r('Электромонтаж').id },
    { name: 'Фёдоров Ф.Ф.', grade: 3, resourceId: r('Финальный контроль').id },
  ]);

  console.log('Наполняю справочник операций...');
  const catalogDefs = [
    { node: 'Сборка стойки турникета', name: 'Установка перемычки + латунных стоек + зенковка', normMinutes: 18, requiredGrade: 2, resourceId: r('Механосборка').id },
    { node: 'Сборка стойки турникета', name: 'Установка проводов заземления + кабель-канала + кронштейна', normMinutes: 30, requiredGrade: 2, resourceId: r('Механосборка').id },
    { node: 'Сборка стойки турникета', name: 'Установка кронштейнов + двигателей + магнита кожуха', normMinutes: 30, requiredGrade: 3, resourceId: r('Механосборка').id },
    { node: 'Сборка стойки турникета', name: 'Установка автомата с розеткой + проводка 220В', normMinutes: 21, requiredGrade: 4, resourceId: r('Электромонтаж').id },
    { node: 'Сборка стойки турникета', name: 'Установка центрального стекла', normMinutes: 15, requiredGrade: 1, resourceId: r('Механосборка').id },
    { node: 'Сборка стойки турникета', name: 'Склейка подшипников (2 шт.)', normMinutes: 15, requiredGrade: 1, resourceId: r('Механосборка').id },
    { node: 'Сборка стойки турникета', name: 'Установка валов + подшипников', normMinutes: 30, requiredGrade: 3, resourceId: r('Механосборка').id },
    { node: 'Слесарные работы', name: 'Отрезать и зачистить детали корпуса', normMinutes: 30, requiredGrade: 2, resourceId: r('Механосборка').id },
    { node: 'Сборка драйверов ДВ', name: 'Сборка корпуса драйверов + прикручивание', normMinutes: 15, requiredGrade: 2, resourceId: r('Электромонтаж').id },
    { node: 'Сборка контроллера CTL и ПК', name: 'Сборка контроллера CTL и ПК + магнит', normMinutes: 18, requiredGrade: 3, resourceId: r('Электромонтаж').id },
    { node: 'Сборка контроллера CTL и ПК', name: 'Установка PC + M2030CTL + обвязка коробки', normMinutes: 45, requiredGrade: 4, resourceId: r('Электромонтаж').id },
    { node: 'Сборка трубы с камерой', name: 'Вклеивание трубы (рассеиватели + вставки)', normMinutes: 30, requiredGrade: 1, resourceId: r('Механосборка').id },
    { node: 'Сборка трубы с камерой', name: 'Сборка модуля камеры', normMinutes: 15, requiredGrade: 3, resourceId: r('Электромонтаж').id },
    { node: 'Сборка силового блока', name: 'Подготовка БП (пайка проводов, 4 шт.)', normMinutes: 21, requiredGrade: 4, resourceId: r('Электромонтаж').id },
    { node: 'Сборка силового блока', name: 'Установка БП на кронштейны', normMinutes: 18, requiredGrade: 2, resourceId: r('Электромонтаж').id },
    { node: 'Сборка кожухов', name: 'Склейка боковых кожухов (4 шт.)', normMinutes: 72, requiredGrade: 1, resourceId: r('Механосборка').id },
    { node: 'Сборка кожухов', name: 'Сборка боковых кожухов (4 шт.)', normMinutes: 30, requiredGrade: 1, resourceId: r('Механосборка').id },
    { node: 'Завершающие работы', name: 'Обвязка турникета проводами', normMinutes: 150, requiredGrade: 3, resourceId: r('Финальный контроль').id },
    { node: 'Завершающие работы', name: 'Установка и настройка кожухов', normMinutes: 90, requiredGrade: 3, resourceId: r('Финальный контроль').id },
    { node: 'Провода питания', name: 'Разводка проводов питания (комплект)', normMinutes: 31, requiredGrade: 2, resourceId: r('Электромонтаж').id },
    { node: 'Патч-корды', name: 'Изготовление комплекта патч-кордов', normMinutes: 16, requiredGrade: 1, resourceId: r('Электромонтаж').id },
    { node: 'Сборка модуля КЗП', name: 'Сборка шайбы КЗП', normMinutes: 48, requiredGrade: 3, resourceId: r('Электромонтаж').id },
    { node: 'Сборка модуля КЗП', name: 'Установка дисплея + сканера ШК', normMinutes: 27, requiredGrade: 4, resourceId: r('Электромонтаж').id },
  ];
  const insertedCatalog = await db.insert(catalogOperations).values(catalogDefs).returning();
  const c = (name: string) => insertedCatalog.find((x) => x.name === name)!;

  console.log('Создаю модификации изделия...');
  const baseNames = catalogDefs.slice(0, 21).map((d) => d.name);
  const [modBase] = await db.insert(modifications).values({ name: 'Турникет базовый (без КЗП)' }).returning();
  await db.insert(modificationItems).values(baseNames.map((name) => ({ modificationId: modBase.id, catalogOperationId: c(name).id, qty: 1 })));

  const withKzpNames = catalogDefs.map((d) => d.name);
  const [modKzp] = await db.insert(modifications).values({ name: 'Турникет с модулем КЗП' }).returning();
  await db.insert(modificationItems).values(withKzpNames.map((name) => ({ modificationId: modKzp.id, catalogOperationId: c(name).id, qty: 1 })));

  console.log('Создаю проекты и заказы...');
  const [p1] = await db.insert(projects).values({ name: 'Реконструкция склада №4', client: 'ООО Склад-Сервис', object: 'Складской комплекс, корп. 4', deadlineHours: 60 }).returning();
  const [p2] = await db.insert(projects).values({ name: 'Ограждение промзоны', client: 'СтройГрупп', object: 'Промзона Юг', deadlineHours: 110 }).returning();
  const [p3] = await db.insert(projects).values({ name: 'Меблировка офиса', client: 'МебельПро', object: 'Бизнес-центр «Атлант»', deadlineHours: 80 }).returning();
  const [p4] = await db.insert(projects).values({ name: 'Благоустройство ЖК Northside', client: 'ЖК Northside', object: 'Секция 2, паркинг', deadlineHours: 100 }).returning();
  await db.insert(projects).values({ name: 'Внеплановые/срочные работы', client: 'Разные клиенты', object: '—', deadlineHours: 20 });

  const [o1] = await db.insert(orders).values({ name: 'Заказ №214 — стеллажи', projectId: p1.id, priority: 'NORMAL' }).returning();
  await db.insert(orderOperations).values([
    { orderId: o1.id, name: 'Резка листа', durationHours: 5, sequence: 1, resourceId: r('Лазерная резка').id },
    { orderId: o1.id, name: 'Гибка полок', durationHours: 4, sequence: 2, resourceId: r('Гибка').id },
    { orderId: o1.id, name: 'Покраска', durationHours: 6, sequence: 3, resourceId: r('Покраска').id },
    { orderId: o1.id, name: 'Сборка', durationHours: 3, sequence: 4, resourceId: r('Сборка').id },
  ]);

  const [o2] = await db.insert(orders).values({ name: 'Заказ №215 — ограждения', projectId: p2.id, priority: 'NORMAL' }).returning();
  await db.insert(orderOperations).values([
    { orderId: o2.id, name: 'Резка', durationHours: 6, sequence: 1, resourceId: r('Лазерная резка').id },
    { orderId: o2.id, name: 'Сварка каркаса', durationHours: 8, sequence: 2, resourceId: r('Сварка').id },
    { orderId: o2.id, name: 'Покраска', durationHours: 5, sequence: 3, resourceId: r('Покраска').id },
  ]);

  const [o3] = await db.insert(orders).values({ name: 'Заказ №216 — шкафы', projectId: p3.id, priority: 'NORMAL' }).returning();
  await db.insert(orderOperations).values([
    { orderId: o3.id, name: 'Резка', durationHours: 4, sequence: 1, resourceId: r('Лазерная резка').id },
    { orderId: o3.id, name: 'Гибка', durationHours: 3, sequence: 2, resourceId: r('Гибка').id },
    { orderId: o3.id, name: 'Сборка', durationHours: 5, sequence: 3, resourceId: r('Сборка').id },
  ]);

  const [o4] = await db.insert(orders).values({ name: 'Заказ №217 — навесы', projectId: p2.id, priority: 'NORMAL' }).returning();
  await db.insert(orderOperations).values([
    { orderId: o4.id, name: 'Резка', durationHours: 5, sequence: 1, resourceId: r('Лазерная резка').id },
    { orderId: o4.id, name: 'Сварка', durationHours: 7, sequence: 2, resourceId: r('Сварка').id },
    { orderId: o4.id, name: 'Покраска', durationHours: 4, sequence: 3, resourceId: r('Покраска').id },
    { orderId: o4.id, name: 'Сборка', durationHours: 4, sequence: 4, resourceId: r('Сборка').id },
  ]);

  const [o5] = await db.insert(orders).values({ name: 'Заказ №218 — перила', projectId: p4.id, priority: 'NORMAL' }).returning();
  await db.insert(orderOperations).values([
    { orderId: o5.id, name: 'Гибка', durationHours: 5, sequence: 1, resourceId: r('Гибка').id },
    { orderId: o5.id, name: 'Сварка', durationHours: 6, sequence: 2, resourceId: r('Сварка').id },
    { orderId: o5.id, name: 'Покраска', durationHours: 5, sequence: 3, resourceId: r('Покраска').id },
  ]);

  console.log('Создаю пользователей (пароли — из .env / значения по умолчанию ниже)...');
  const demoPassword = process.env.SEED_ADMIN_PASSWORD || 'change-me-admin-password';
  const passwordHash = await hashPassword(demoPassword);
  await db.insert(users).values([
    { email: process.env.SEED_ADMIN_EMAIL || 'admin@example.com', passwordHash, name: 'Администратор', role: 'ADMIN' },
    { email: 'dispatcher@example.com', passwordHash, name: 'Диспетчер', role: 'DISPATCHER' },
    { email: 'normirovshik@example.com', passwordHash, name: 'Нормировщик', role: 'NORMIROVSHIK' },
    { email: 'master1@example.com', passwordHash, name: 'Мастер цеха 1', role: 'SHOP_MASTER', shopId: shop1.id },
    { email: 'master2@example.com', passwordHash, name: 'Мастер цеха 2', role: 'SHOP_MASTER', shopId: shop2.id },
  ]);

  console.log(`Готово. Пароль у всех демо-пользователей одинаковый: "${demoPassword}" (см. SEED_ADMIN_PASSWORD в .env)`);
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(async () => { await pool.end(); });
