import { Router } from 'express';
import { z } from 'zod';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  orders, orderOperations, catalogOperations, modifications, modificationItems, resources, projects,
} from '../../db/schema';
import { asyncHandler, ApiError } from '../../middleware/errorHandler';
import { requireAuth, requireRole } from '../../middleware/auth';

export const ordersRouter = Router();
ordersRouter.use(requireAuth);

ordersRouter.get('/', asyncHandler(async (_req, res) => {
  const rows = await db.query.orders.findMany({ with: { operations: true, project: true } });
  res.json(rows);
}));

// ---------- Создание заказа: либо явным списком операций (catalogOperationId+qty), либо из модификации ----------
const opInputSchema = z.object({ catalogOperationId: z.string().uuid(), qty: z.number().int().positive() });
const createOrderSchema = z.object({
  name: z.string().min(1).optional(),
  projectId: z.string().uuid(),
  priority: z.enum(['NORMAL', 'URGENT']).default('NORMAL'),
  modificationId: z.string().uuid().optional(),
  items: z.array(opInputSchema).optional(),
}).refine((d) => d.modificationId || (d.items && d.items.length > 0), {
  message: 'Укажите modificationId или непустой список items',
});

ordersRouter.post('/', requireRole('ADMIN', 'DISPATCHER'), asyncHandler(async (req, res) => {
  const data = createOrderSchema.parse(req.body);

  const [project] = await db.select().from(projects).where(eq(projects.id, data.projectId));
  if (!project) throw new ApiError(404, 'Проект не найден');

  let items: { catalogOperationId: string; qty: number }[];
  if (data.modificationId) {
    const rows = await db.select().from(modificationItems).where(eq(modificationItems.modificationId, data.modificationId));
    if (!rows.length) throw new ApiError(404, 'Модификация не найдена или пуста');
    items = rows.map((r) => ({ catalogOperationId: r.catalogOperationId, qty: r.qty }));
  } else {
    items = data.items!;
  }

  const catalogIds = items.map((i) => i.catalogOperationId);
  const catalogRows = await db.select().from(catalogOperations)
    .where(inArray(catalogOperations.id, catalogIds));
  const catalogMap = new Map(catalogRows.map((c) => [c.id, c]));

  const [order] = await db.insert(orders).values({
    name: data.name || `Заказ ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
    projectId: data.projectId,
    priority: data.priority,
    createdById: req.user!.id,
  }).returning();

  const opsToInsert = items.map((it, idx) => {
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

// ---------- Быстрый срочный заказ: случайные операции из справочника (как кнопка "авто" в прототипе) ----------
ordersRouter.post('/urgent-quick', requireRole('ADMIN', 'DISPATCHER'), asyncHandler(async (req, res) => {
  const urgentProjectName = 'Внеплановые/срочные работы';
  let [urgentProject] = await db.select().from(projects).where(eq(projects.name, urgentProjectName));
  if (!urgentProject) {
    [urgentProject] = await db.insert(projects).values({
      name: urgentProjectName, client: 'Разные клиенты', object: '—', deadlineHours: 20,
    }).returning();
  }

  const allCatalog = await db.select().from(catalogOperations);
  if (allCatalog.length < 1) throw new ApiError(400, 'Справочник операций пуст');
  const picked = [...allCatalog].sort(() => Math.random() - 0.5).slice(0, 3);

  const [order] = await db.insert(orders).values({
    name: `СРОЧНО — аварийная партия`,
    projectId: urgentProject.id,
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

ordersRouter.delete('/:id', requireRole('ADMIN', 'DISPATCHER'), asyncHandler(async (req, res) => {
  await db.delete(orders).where(eq(orders.id, req.params.id));
  res.status(204).send();
}));

// ---------- Ручное закрепление операции (аналог drag-and-drop в прототипе) ----------
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

  // Мастер цеха может закреплять только в пределах своего цеха — и текущий, и целевой ресурс.
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
