import { Router } from 'express';
import { z } from 'zod';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  orders, orderOperations, catalogOperations, products, productItems, resources,
} from '../../db/schema';
import { asyncHandler, ApiError } from '../../middleware/errorHandler';
import { requireAuth, requireRole } from '../../middleware/auth';

export const ordersRouter = Router();
ordersRouter.use(requireAuth);

ordersRouter.get('/', asyncHandler(async (_req, res) => {
  const rows = await db.query.orders.findMany({ with: { operations: true } });
  res.json(rows);
}));

// ---------- Создание заказа: изделия+количество (основной путь) и/или отдельные операции вручную ----------
const itemInputSchema = z.object({ catalogOperationId: z.string().uuid(), qty: z.number().int().positive() });
const productInputSchema = z.object({ productId: z.string().uuid(), qty: z.number().int().positive() });

const createOrderSchema = z.object({
  name: z.string().min(1).optional(),
  client: z.string().min(1),
  deadlineDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ожидается дата в формате YYYY-MM-DD'),
  priority: z.enum(['NORMAL', 'URGENT']).default('NORMAL'),
  products: z.array(productInputSchema).optional(),
  items: z.array(itemInputSchema).optional(),
}).refine((d) => (d.products && d.products.length > 0) || (d.items && d.items.length > 0), {
  message: 'Укажите хотя бы одно изделие (products) или отдельную операцию (items)',
});

ordersRouter.post('/', requireRole('ADMIN', 'DISPATCHER'), asyncHandler(async (req, res) => {
  const data = createOrderSchema.parse(req.body);

  // Собираем плоский список (операция, количество) — из изделий (каждое разворачивается в свой
  // набор операций, умноженный на количество изделий) и из отдельных операций, добавленных вручную.
  const flatItems: { catalogOperationId: string; qty: number }[] = [];

  if (data.products?.length) {
    const productIds = data.products.map((p) => p.productId);
    const rows = await db.select().from(productItems).where(inArray(productItems.productId, productIds));
    if (!rows.length) throw new ApiError(404, 'Изделия не найдены или пусты');
    data.products.forEach((p) => {
      const productRows = rows.filter((r) => r.productId === p.productId);
      productRows.forEach((r) => flatItems.push({ catalogOperationId: r.catalogOperationId, qty: r.qty * p.qty }));
    });
  }
  if (data.items?.length) {
    data.items.forEach((it) => flatItems.push(it));
  }

  const catalogIds = flatItems.map((i) => i.catalogOperationId);
  const catalogRows = await db.select().from(catalogOperations).where(inArray(catalogOperations.id, catalogIds));
  const catalogMap = new Map(catalogRows.map((c) => [c.id, c]));

  const [order] = await db.insert(orders).values({
    name: data.name || `Заказ ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
    client: data.client,
    deadlineDate: data.deadlineDate,
    priority: data.priority,
    createdById: req.user!.id,
  }).returning();

  const opsToInsert = flatItems.map((it, idx) => {
    const cat = catalogMap.get(it.catalogOperationId);
    if (!cat) throw new ApiError(400, `Операция справочника ${it.catalogOperationId} не найдена`);
    return {
      orderId: order.id,
      name: `${cat.name} ×${it.qty}`,
      durationHours: +((cat.normMinutes / 60) * it.qty).toFixed(2),
      sequence: idx + 1,
      resourceId: cat.resourceId,
      catalogOperationId: cat.id,
    };
  });
  const insertedOps = await db.insert(orderOperations).values(opsToInsert).returning();

  res.status(201).json({ ...order, operations: insertedOps });
}));

// ---------- Быстрый срочный заказ: случайные операции из справочника ----------
ordersRouter.post('/urgent-quick', requireRole('ADMIN', 'DISPATCHER'), asyncHandler(async (req, res) => {
  const allCatalog = await db.select().from(catalogOperations);
  if (allCatalog.length < 1) throw new ApiError(400, 'Справочник операций пуст');
  const picked = [...allCatalog].sort(() => Math.random() - 0.5).slice(0, 3);

  const deadline = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10); // через 2 дня

  const [order] = await db.insert(orders).values({
    name: 'СРОЧНО — аварийная партия',
    client: 'Приоритетный клиент',
    deadlineDate: deadline,
    priority: 'URGENT',
    createdById: req.user!.id,
  }).returning();

  const insertedOps = await db.insert(orderOperations).values(
    picked.map((cat, idx) => ({
      orderId: order.id,
      name: `${cat.name} (срочно)`,
      durationHours: +(cat.normMinutes / 60).toFixed(2),
      sequence: idx + 1,
      resourceId: cat.resourceId,
      catalogOperationId: cat.id,
    })),
  ).returning();

  res.status(201).json({ ...order, operations: insertedOps });
}));

const updateOrderSchema = z.object({
  name: z.string().min(1).optional(),
  client: z.string().min(1).optional(),
  deadlineDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  priority: z.enum(['NORMAL', 'URGENT']).optional(),
});

ordersRouter.patch('/:id', requireRole('ADMIN', 'DISPATCHER'), asyncHandler(async (req, res) => {
  const data = updateOrderSchema.parse(req.body);
  const [updated] = await db.update(orders).set(data).where(eq(orders.id, req.params.id)).returning();
  if (!updated) throw new ApiError(404, 'Заказ не найден');
  res.json(updated);
}));

ordersRouter.delete('/:id', requireRole('ADMIN', 'DISPATCHER'), asyncHandler(async (req, res) => {
  await db.delete(orders).where(eq(orders.id, req.params.id));
  res.status(204).send();
}));

// ---------- Ручное закрепление операции на графике участка ----------
const pinSchema = z.object({
  pinnedStart: z.number().min(0),
  pinnedResourceId: z.string().uuid().optional(),
});

ordersRouter.patch('/operations/:opId/pin', requireRole('ADMIN', 'DISPATCHER', 'SHOP_MASTER'), asyncHandler(async (req, res) => {
  const data = pinSchema.parse(req.body);
  const [op] = await db.select().from(orderOperations).where(eq(orderOperations.id, req.params.opId));
  if (!op) throw new ApiError(404, 'Операция не найдена');

  const targetResourceId = data.pinnedResourceId || op.resourceId;
  const [targetResource] = await db.select().from(resources).where(eq(resources.id, targetResourceId));
  if (!targetResource) throw new ApiError(404, 'Целевой ресурс не найден');

  if (req.user!.role === 'SHOP_MASTER') {
    const [currentResource] = await db.select().from(resources).where(eq(resources.id, op.resourceId));
    if (currentResource?.shopId !== req.user!.shopId || targetResource.shopId !== req.user!.shopId) {
      throw new ApiError(403, 'Мастер цеха может закреплять операции только в пределах своего цеха');
    }
  }

  const [updated] = await db.update(orderOperations).set({
    pinnedStart: data.pinnedStart,
    pinnedResourceId: data.pinnedResourceId || null,
  }).where(eq(orderOperations.id, req.params.opId)).returning();

  res.json(updated);
}));

ordersRouter.delete('/operations/:opId/pin', requireRole('ADMIN', 'DISPATCHER', 'SHOP_MASTER'), asyncHandler(async (req, res) => {
  const [op] = await db.select().from(orderOperations).where(eq(orderOperations.id, req.params.opId));
  if (!op) throw new ApiError(404, 'Операция не найдена');

  if (req.user!.role === 'SHOP_MASTER') {
    const [currentResource] = await db.select().from(resources).where(eq(resources.id, op.resourceId));
    if (currentResource?.shopId !== req.user!.shopId) {
      throw new ApiError(403, 'Мастер цеха может снимать закрепление только в пределах своего цеха');
    }
  }

  const [updated] = await db.update(orderOperations)
    .set({ pinnedStart: null, pinnedResourceId: null })
    .where(eq(orderOperations.id, req.params.opId))
    .returning();
  res.json(updated);
}));
