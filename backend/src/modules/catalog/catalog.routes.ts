import { Router } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { catalogOperations, productItems } from '../../db/schema';
import { asyncHandler, ApiError } from '../../middleware/errorHandler';
import { requireAuth, requireRole } from '../../middleware/auth';

export const catalogRouter = Router();
catalogRouter.use(requireAuth);

catalogRouter.get('/', asyncHandler(async (_req, res) => {
  const rows = await db.query.catalogOperations.findMany({
    with: { measurements: { orderBy: (m, { desc }) => desc(m.createdAt) } },
  });
  res.json(rows.map((r) => ({ ...r, normHours: +(r.normMinutes / 60).toFixed(2) })));
}));

const createSchema = z.object({
  node: z.string().min(1),
  name: z.string().min(1),
  normMinutes: z.number().positive(),
  requiredGrade: z.number().int().min(1).max(8).default(1),
  resourceId: z.string().uuid(),
});

catalogRouter.post('/', requireRole('ADMIN', 'NORMIROVSHIK'), asyncHandler(async (req, res) => {
  const data = createSchema.parse(req.body);
  const [created] = await db.insert(catalogOperations).values(data).returning();
  res.status(201).json(created);
}));

const updateSchema = createSchema.partial();

catalogRouter.patch('/:id', requireRole('ADMIN', 'NORMIROVSHIK'), asyncHandler(async (req, res) => {
  const data = updateSchema.parse(req.body);
  const [updated] = await db.update(catalogOperations)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(catalogOperations.id, req.params.id))
    .returning();
  if (!updated) throw new ApiError(404, 'Операция не найдена');
  res.json(updated);
}));

catalogRouter.delete('/:id', requireRole('ADMIN', 'NORMIROVSHIK'), asyncHandler(async (req, res) => {
  const usedInProducts = await db.select().from(productItems).where(eq(productItems.catalogOperationId, req.params.id));
  if (usedInProducts.length) {
    throw new ApiError(409, 'Операция используется в изделиях — сначала уберите её оттуда');
  }
  await db.delete(catalogOperations).where(eq(catalogOperations.id, req.params.id));
  res.status(204).send();
}));
