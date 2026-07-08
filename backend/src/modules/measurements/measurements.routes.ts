import { Router } from 'express';
import { z } from 'zod';
import { eq, desc } from 'drizzle-orm';
import { db } from '../../db/client';
import { measurements, catalogOperations } from '../../db/schema';
import { asyncHandler, ApiError } from '../../middleware/errorHandler';
import { requireAuth, requireRole } from '../../middleware/auth';

export const measurementsRouter = Router();
measurementsRouter.use(requireAuth);

// Фронтенд сам ведёт секундомер (Date.now() на старте/стопе) и присылает сюда готовый результат замера в минутах —
// так секундомер работает даже при кратковременных обрывах связи, а на сервер попадает только итог.
const createSchema = z.object({
  catalogOperationId: z.string().uuid(),
  minutes: z.number().positive(),
});

measurementsRouter.post('/', requireRole('ADMIN', 'NORMIROVSHIK'), asyncHandler(async (req, res) => {
  const data = createSchema.parse(req.body);
  const [op] = await db.select().from(catalogOperations).where(eq(catalogOperations.id, data.catalogOperationId));
  if (!op) throw new ApiError(404, 'Операция справочника не найдена');

  const [created] = await db.insert(measurements).values({
    catalogOperationId: data.catalogOperationId,
    minutes: data.minutes,
    measuredById: req.user!.id,
  }).returning();
  res.status(201).json(created);
}));

measurementsRouter.get('/by-operation/:catalogOperationId', asyncHandler(async (req, res) => {
  const rows = await db.select().from(measurements)
    .where(eq(measurements.catalogOperationId, req.params.catalogOperationId))
    .orderBy(desc(measurements.createdAt));
  res.json(rows);
}));

measurementsRouter.delete('/:id', requireRole('ADMIN', 'NORMIROVSHIK'), asyncHandler(async (req, res) => {
  await db.delete(measurements).where(eq(measurements.id, req.params.id));
  res.status(204).send();
}));

// Применить среднее из всех замеров операции как новую норму — один клик вместо ручного пересчёта.
measurementsRouter.post('/by-operation/:catalogOperationId/apply-average', requireRole('ADMIN', 'NORMIROVSHIK'), asyncHandler(async (req, res) => {
  const rows = await db.select().from(measurements).where(eq(measurements.catalogOperationId, req.params.catalogOperationId));
  if (!rows.length) throw new ApiError(400, 'Ещё нет ни одного замера для этой операции');

  const avg = rows.reduce((s, m) => s + m.minutes, 0) / rows.length;
  const [updated] = await db.update(catalogOperations)
    .set({ normMinutes: +avg.toFixed(2), updatedAt: new Date() })
    .where(eq(catalogOperations.id, req.params.catalogOperationId))
    .returning();
  if (!updated) throw new ApiError(404, 'Операция справочника не найдена');
  res.json(updated);
}));
