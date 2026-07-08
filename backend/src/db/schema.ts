// ============================================================
// Схема БД сервиса планирования производства (Drizzle ORM).
// Цеха -> Ресурсы -> Справочник операций -> Модификации -> Проекты -> Заказы -> Операции заказа.
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

// ---------- Модификации изделия (шаблоны наборов операций) ----------
export const modifications = pgTable('modifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const modificationItems = pgTable('modification_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  modificationId: uuid('modification_id').notNull()
    .references(() => modifications.id, { onDelete: 'cascade' }),
  catalogOperationId: uuid('catalog_operation_id').notNull().references(() => catalogOperations.id),
  qty: integer('qty').notNull().default(1),
});

// ---------- Проекты ----------
export const projects = pgTable('projects', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  client: text('client').notNull(),
  object: text('object').notNull(),
  deadlineHours: doublePrecision('deadline_hours').notNull(), // срок в часах — единица сортировки приоритета
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ---------- Заказы ----------
export const orders = pgTable('orders', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
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
  // Ручное закрепление диспетчером/мастером цеха — если задано, авторасчёт эту операцию не трогает.
  pinnedStart: doublePrecision('pinned_start'),
  pinnedResourceId: uuid('pinned_resource_id').references(() => resources.id),
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

export const modificationsRelations = relations(modifications, ({ many }) => ({
  items: many(modificationItems),
}));

export const modificationItemsRelations = relations(modificationItems, ({ one }) => ({
  modification: one(modifications, { fields: [modificationItems.modificationId], references: [modifications.id] }),
  catalogOperation: one(catalogOperations, { fields: [modificationItems.catalogOperationId], references: [catalogOperations.id] }),
}));

export const projectsRelations = relations(projects, ({ many }) => ({
  orders: many(orders),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  project: one(projects, { fields: [orders.projectId], references: [projects.id] }),
  operations: many(orderOperations),
}));

export const orderOperationsRelations = relations(orderOperations, ({ one }) => ({
  order: one(orders, { fields: [orderOperations.orderId], references: [orders.id] }),
  resource: one(resources, { fields: [orderOperations.resourceId], references: [resources.id] }),
}));
