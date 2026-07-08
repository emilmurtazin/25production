import { Router } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { modifications, modificationItems } from '../../db/schema';
import { asyncHandler, ApiError } from '../../middleware/errorHandler';
import { requireAuth, requireRole } from '../../middleware/auth';

export const modificationsRouter = Router();
modificationsRouter.use(requireAuth);

modificationsRouter.get('/', asyncHandler(async (_req, res) => {
  const rows = await db.query.modifications.findMany({
    with: { items: { with: { catalogOperation: true } } },
  });
  res.json(rows.map((m) => ({
    ...m,
    totalHours: +m.items.reduce((s, it) => s + (it.catalogOperation.normMinutes / 60) * it.qty, 0).toFixed(2),
  })));
}));

const itemSchema = z.object({ catalogOperationId: z.string().uuid(), qty: z.number().int().positive() });
const createSchema = z.object({ name: z.string().min(1), items: z.array(itemSchema).min(1) });

modificationsRouter.post('/', requireRole('ADMIN', 'NORMIROVSHIK'), asyncHandler(async (req, res) => {
  const data = createSchema.parse(req.body);
  const [mod] = await db.insert(modifications).values({ name: data.name }).returning();
  await db.insert(modificationItems).values(
    data.items.map((it) => ({ modificationId: mod.id, catalogOperationId: it.catalogOperationId, qty: it.qty })),
  );
  res.status(201).json(mod);
}));

modificationsRouter.delete('/:id', requireRole('ADMIN', 'NORMIROVSHIK'), asyncHandler(async (req, res) => {
  const [deleted] = await db.delete(modifications).where(eq(modifications.id, req.params.id)).returning();
  if (!deleted) throw new ApiError(404, 'Модификация не найдена');
  res.status(204).send();
}));
