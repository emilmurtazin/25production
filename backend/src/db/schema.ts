// ============================================================
// Схема БД сервиса планирования производства (Drizzle ORM).
// Цеха -> Ресурсы -> Справочник операций -> Изделия -> Заказы -> Операции заказа.
// Расписание НЕ хранится в таблицах — оно вычисляется на лету в scheduling.service.ts
// из заказов + календаря цехов, точно так же, как в HTML-прототипе. Единственный источник правды — заказы.
// ============================================================

import {
  pgTable, text, integer, doublePrecision, boolean, timestamp, pgEnum, uuid, primaryKey,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const roleEnum = pgEnum('role', ['ADMIN', 'DISPATCHER', 'NORMIROVSHIK', 'SHOP_MASTER']);
export const priorityEnum = pgEnum('priority', ['NORMAL', 'URGENT']);

// ---------- Цеха ----------
export const shops = pgTable('shops', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  workStart: integer('work_start').notNull().default(8),
  workEnd: integer('work_end').notNull().default(20),
  // Postgres integer array: дни недели 0=Вс..6=Сб
  workDays: integer('work_days').array().notNull().default([1, 2, 3, 4, 5]),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ---------- Пользователи ----------
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  role: roleEnum('role').notNull(),
  // Для SHOP_MASTER — цех, за который отвечает. Для остальных ролей — null (доступ ко всем цехам).
  shopId: uuid('shop_id').references(() => shops.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ---------- Ресурсы (участки/бригады внутри цеха) ----------
export const resources = pgTable('resources', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull(), // "участок" | "бригада" — свободный текст для отображения
  alwaysOn: boolean('always_on').notNull().default(false), // игнорирует календарь цеха
  shopId: uuid('shop_id').notNull().references(() => shops.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ---------- Справочник технологических операций ----------
export const catalogOperations = pgTable('catalog_operations', {
  id: uuid('id').defaultRandom().primaryKey(),
  node: text('node').notNull(),         // "узел сборки" из карты нормирования
  name: text('name').notNull(),          // вид работ
  normMinutes: doublePrecision('norm_minutes').notNull(),
  requiredGrade: integer('required_grade').notNull().default(1), // минимальный разряд рабочего, способного делать операцию
  resourceId: uuid('resource_id').notNull().references(() => resources.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ---------- Замеры времени нормировщиком (секундомер) ----------
export const measurements = pgTable('measurements', {
  id: uuid('id').defaultRandom().primaryKey(),
  catalogOperationId: uuid('catalog_operation_id').notNull()
    .references(() => catalogOperations.id, { onDelete: 'cascade' }),
  minutes: doublePrecision('minutes').notNull(),
  measuredById: uuid('measured_by_id').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ---------- Изделия (шаблоны наборов операций) ----------
export const products = pgTable('products', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const productItems = pgTable('product_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  productId: uuid('product_id').notNull()
    .references(() => products.id, { onDelete: 'cascade' }),
  catalogOperationId: uuid('catalog_operation_id').notNull().references(() => catalogOperations.id),
  qty: integer('qty').notNull().default(1),
});

// ---------- Заказы ----------
// Клиент и срок сдачи (реальная календарная дата) хранятся прямо на заказе — раньше это было
// вынесено в отдельную сущность "Проект", но на практике проект и заказ почти всегда совпадали
// один-к-одному и только запутывали интерфейс. Один заказ = один клиент = один срок.
export const orders = pgTable('orders', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  client: text('client').notNull(),
  deadlineDate: text('deadline_date').notNull(), // 'YYYY-MM-DD' — конечная дата сдачи заказа
  priority: priorityEnum('priority').notNull().default('NORMAL'),
  createdById: uuid('created_by_id').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ---------- Операции заказа ----------
export const orderOperations = pgTable('order_operations', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  durationHours: doublePrecision('duration_hours').notNull(),
  sequence: integer('sequence').notNull(), // порядок внутри заказа — резка раньше сварки
  resourceId: uuid('resource_id').notNull().references(() => resources.id),
  // Ссылка на операцию справочника — нужна, чтобы знать требуемый разряд при формировании нарядов.
  // Может быть null для очень старых/ручных операций, созданных до этого поля.
  catalogOperationId: uuid('catalog_operation_id').references(() => catalogOperations.id),
  // Сколько часов уже реально отработано по этой операции (из отчётов по нарядам).
  // Остаток для планирования = durationHours - completedHours. Так «невыполненное» само
  // остаётся в расчёте на завтра — не нужен отдельный код переноса.
  completedHours: doublePrecision('completed_hours').notNull().default(0),
  // Ручное закрепление диспетчером/мастером цеха — если задано, авторасчёт эту операцию не трогает.
  pinnedStart: doublePrecision('pinned_start'),
  pinnedResourceId: uuid('pinned_resource_id').references(() => resources.id),
});

// ---------- Работники участка ----------
export const workers = pgTable('workers', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  grade: integer('grade').notNull(), // разряд — чем выше, тем к более сложным операциям допущен
  resourceId: uuid('resource_id').notNull().references(() => resources.id),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ---------- Наряд: набор операций, назначенных конкретному работнику на конкретный день ----------
// dayOffset — целое число дней от "сейчас" (0 = сегодня, 1 = завтра, ...), в той же условной
// шкале времени, что и весь график (час 0 = текущий момент). date — реальная календарная дата
// для отображения человеку, определяется на момент формирования наряда.
export const workOrders = pgTable('work_orders', {
  id: uuid('id').defaultRandom().primaryKey(),
  workerId: uuid('worker_id').notNull().references(() => workers.id, { onDelete: 'cascade' }),
  resourceId: uuid('resource_id').notNull().references(() => resources.id),
  dayOffset: integer('day_offset').notNull(),
  date: text('date').notNull(), // 'YYYY-MM-DD', для отображения
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const workOrderItems = pgTable('work_order_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  workOrderId: uuid('work_order_id').notNull().references(() => workOrders.id, { onDelete: 'cascade' }),
  orderOperationId: uuid('order_operation_id').notNull().references(() => orderOperations.id, { onDelete: 'cascade' }),
  hoursPlanned: doublePrecision('hours_planned').notNull(),
  hoursActual: doublePrecision('hours_actual'), // null = ещё не отчитались
  reportedById: uuid('reported_by_id').references(() => users.id),
  reportedAt: timestamp('reported_at'),
});

// ================= RELATIONS (для удобных вложенных выборок) =================

export const shopsRelations = relations(shops, ({ many }) => ({
  resources: many(resources),
  users: many(users),
}));

export const resourcesRelations = relations(resources, ({ one, many }) => ({
  shop: one(shops, { fields: [resources.shopId], references: [shops.id] }),
  catalogOperations: many(catalogOperations),
}));

export const catalogOperationsRelations = relations(catalogOperations, ({ one, many }) => ({
  resource: one(resources, { fields: [catalogOperations.resourceId], references: [resources.id] }),
  measurements: many(measurements),
}));

export const measurementsRelations = relations(measurements, ({ one }) => ({
  catalogOperation: one(catalogOperations, { fields: [measurements.catalogOperationId], references: [catalogOperations.id] }),
  measuredBy: one(users, { fields: [measurements.measuredById], references: [users.id] }),
}));

export const productsRelations = relations(products, ({ many }) => ({
  items: many(productItems),
}));

export const productItemsRelations = relations(productItems, ({ one }) => ({
  product: one(products, { fields: [productItems.productId], references: [products.id] }),
  catalogOperation: one(catalogOperations, { fields: [productItems.catalogOperationId], references: [catalogOperations.id] }),
}));

export const ordersRelations = relations(orders, ({ many }) => ({
  operations: many(orderOperations),
}));

export const orderOperationsRelations = relations(orderOperations, ({ one, many }) => ({
  order: one(orders, { fields: [orderOperations.orderId], references: [orders.id] }),
  resource: one(resources, { fields: [orderOperations.resourceId], references: [resources.id] }),
  catalogOperation: one(catalogOperations, { fields: [orderOperations.catalogOperationId], references: [catalogOperations.id] }),
  workOrderItems: many(workOrderItems),
}));

export const workersRelations = relations(workers, ({ one, many }) => ({
  resource: one(resources, { fields: [workers.resourceId], references: [resources.id] }),
  workOrders: many(workOrders),
}));

export const workOrdersRelations = relations(workOrders, ({ one, many }) => ({
  worker: one(workers, { fields: [workOrders.workerId], references: [workers.id] }),
  resource: one(resources, { fields: [workOrders.resourceId], references: [resources.id] }),
  items: many(workOrderItems),
}));

export const workOrderItemsRelations = relations(workOrderItems, ({ one }) => ({
  workOrder: one(workOrders, { fields: [workOrderItems.workOrderId], references: [workOrders.id] }),
  orderOperation: one(orderOperations, { fields: [workOrderItems.orderOperationId], references: [orderOperations.id] }),
  reportedBy: one(users, { fields: [workOrderItems.reportedById], references: [users.id] }),
}));
