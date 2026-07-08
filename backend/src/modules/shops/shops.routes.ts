import { Router } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { shops, resources } from '../../db/schema';
import { asyncHandler, ApiError } from '../../middleware/errorHandler';
import { requireAuth, requireRole } from '../../middleware/auth';

export const shopsRouter = Router();
shopsRouter.use(requireAuth);

shopsRouter.get('/', asyncHandler(async (_req, res) => {
  const rows = await db.query.shops.findMany({ with: { resources: true } });
  res.json(rows);
}));

const createShopSchema = z.object({
  name: z.string().min(1),
  workStart: z.number().int().min(0).max(23).optional(),
  workEnd: z.number().int().min(1).max(24).optional(),
  workDays: z.array(z.number().int().min(0).max(6)).optional(),
});

shopsRouter.post('/', requireRole('ADMIN', 'DISPATCHER'), asyncHandler(async (req, res) => {
  const data = createShopSchema.parse(req.body);
  const [created] = await db.insert(shops).values(data).returning();
  res.status(201).json(created);
}));

const updateShopSchema = createShopSchema.partial();

shopsRouter.patch('/:id', requireRole('ADMIN', 'DISPATCHER'), asyncHandler(async (req, res) => {
  const data = updateShopSchema.parse(req.body);
  if (data.workStart !== undefined && data.workEnd !== undefined && data.workStart >= data.workEnd) {
    throw new ApiError(400, 'Начало смены должно быть раньше конца');
  }
  const [updated] = await db.update(shops).set(data).where(eq(shops.id, req.params.id)).returning();
  if (!updated) throw new ApiError(404, 'Цех не найден');
  res.json(updated);
}));

shopsRouter.delete('/:id', requireRole('ADMIN', 'DISPATCHER'), asyncHandler(async (req, res) => {
  const remaining = await db.select().from(resources).where(eq(resources.shopId, req.params.id));
  if (remaining.length > 0) {
    throw new ApiError(409, 'В цехе есть участки — сначала перенесите их в другой цех');
  }
  const totalShops = await db.select().from(shops);
  if (totalShops.length <= 1) throw new ApiError(409, 'Должен остаться хотя бы один цех');

  await db.delete(shops).where(eq(shops.id, req.params.id));
  res.status(204).send();
}));
