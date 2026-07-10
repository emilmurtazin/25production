import { Router } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { workers, resources, workOrders } from '../../db/schema';
import { asyncHandler, ApiError } from '../../middleware/errorHandler';
import { requireAuth, requireRole } from '../../middleware/auth';

export const workersRouter = Router();
workersRouter.use(requireAuth);

// Мастер цеха управляет работниками своего цеха, ADMIN — любого.
function assertCanManageResource(userRole: string, userShopId: string | null, resourceShopId: string) {
  if (userRole === 'ADMIN') return;
  if (userRole === 'SHOP_MASTER' && userShopId === resourceShopId) return;
  throw new ApiError(403, 'Управлять работниками этого участка может только мастер этого цеха или администратор');
}

workersRouter.get('/', asyncHandler(async (req, res) => {
  const resourceId = req.query.resourceId as string | undefined;
  const rows = resourceId
    ? await db.select().from(workers).where(eq(workers.resourceId, resourceId))
    : await db.select().from(workers);
  res.json(rows);
}));

const createSchema = z.object({
  name: z.string().min(1),
  grade: z.number().int().min(1).max(8),
  resourceId: z.string().uuid(),
});

workersRouter.post('/', requireRole('ADMIN', 'SHOP_MASTER'), asyncHandler(async (req, res) => {
  const data = createSchema.parse(req.body);
  const [resource] = await db.select().from(resources).where(eq(resources.id, data.resourceId));
  if (!resource) throw new ApiError(404, 'Участок не найден');
  assertCanManageResource(req.user!.role, req.user!.shopId, resource.shopId);

  const [created] = await db.insert(workers).values(data).returning();
  res.status(201).json(created);
}));

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  grade: z.number().int().min(1).max(8).optional(),
  active: z.boolean().optional(),
});

workersRouter.patch('/:id', requireRole('ADMIN', 'SHOP_MASTER'), asyncHandler(async (req, res) => {
  const data = updateSchema.parse(req.body);
  const [worker] = await db.select().from(workers).where(eq(workers.id, req.params.id));
  if (!worker) throw new ApiError(404, 'Работник не найден');
  const [resource] = await db.select().from(resources).where(eq(resources.id, worker.resourceId));
  assertCanManageResource(req.user!.role, req.user!.shopId, resource!.shopId);

  const [updated] = await db.update(workers).set(data).where(eq(workers.id, req.params.id)).returning();
  res.json(updated);
}));

workersRouter.delete('/:id', requireRole('ADMIN', 'SHOP_MASTER'), asyncHandler(async (req, res) => {
  const [worker] = await db.select().from(workers).where(eq(workers.id, req.params.id));
  if (!worker) throw new ApiError(404, 'Работник не найден');
  const [resource] = await db.select().from(resources).where(eq(resources.id, worker.resourceId));
  assertCanManageResource(req.user!.role, req.user!.shopId, resource!.shopId);

  const existingOrders = await db.select().from(workOrders).where(eq(workOrders.workerId, req.params.id));
  if (existingOrders.length) {
    throw new ApiError(409, 'У работника есть наряды — деактивируйте его вместо удаления (active:false)');
  }
  await db.delete(workers).where(eq(workers.id, req.params.id));
  res.status(204).send();
}));
