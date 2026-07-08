import { Router } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { resources, catalogOperations, orderOperations } from '../../db/schema';
import { asyncHandler, ApiError } from '../../middleware/errorHandler';
import { requireAuth, requireRole } from '../../middleware/auth';

export const resourcesRouter = Router();
resourcesRouter.use(requireAuth);

resourcesRouter.get('/', asyncHandler(async (req, res) => {
  const shopId = req.query.shopId as string | undefined;
  const rows = shopId
    ? await db.select().from(resources).where(eq(resources.shopId, shopId))
    : await db.select().from(resources);
  res.json(rows);
}));

const createResourceSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  shopId: z.string().uuid(),
  alwaysOn: z.boolean().optional(),
});

resourcesRouter.post('/', requireRole('ADMIN', 'DISPATCHER'), asyncHandler(async (req, res) => {
  const data = createResourceSchema.parse(req.body);
  const [created] = await db.insert(resources).values(data).returning();
  res.status(201).json(created);
}));

const updateResourceSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.string().min(1).optional(),
  shopId: z.string().uuid().optional(), // перенос ресурса в другой цех
  alwaysOn: z.boolean().optional(),
});

resourcesRouter.patch('/:id', requireRole('ADMIN', 'DISPATCHER'), asyncHandler(async (req, res) => {
  const data = updateResourceSchema.parse(req.body);
  const [updated] = await db.update(resources).set(data).where(eq(resources.id, req.params.id)).returning();
  if (!updated) throw new ApiError(404, 'Ресурс не найден');
  res.json(updated);
}));

resourcesRouter.delete('/:id', requireRole('ADMIN', 'DISPATCHER'), asyncHandler(async (req, res) => {
  const usedInCatalog = await db.select().from(catalogOperations).where(eq(catalogOperations.resourceId, req.params.id));
  const usedInOrders = await db.select().from(orderOperations).where(eq(orderOperations.resourceId, req.params.id));
  if (usedInCatalog.length || usedInOrders.length) {
    throw new ApiError(409, 'Ресурс используется в справочнике или в заказах — сначала переназначьте их');
  }
  await db.delete(resources).where(eq(resources.id, req.params.id));
  res.status(204).send();
}));
