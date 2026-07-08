import { Router } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { projects, orders } from '../../db/schema';
import { asyncHandler, ApiError } from '../../middleware/errorHandler';
import { requireAuth, requireRole } from '../../middleware/auth';

export const projectsRouter = Router();
projectsRouter.use(requireAuth);

projectsRouter.get('/', asyncHandler(async (_req, res) => {
  const rows = await db.query.projects.findMany({ with: { orders: true } });
  res.json(rows);
}));

const createSchema = z.object({
  name: z.string().min(1),
  client: z.string().min(1),
  object: z.string().min(1),
  deadlineHours: z.number().positive(),
});

projectsRouter.post('/', requireRole('ADMIN', 'DISPATCHER'), asyncHandler(async (req, res) => {
  const data = createSchema.parse(req.body);
  const [created] = await db.insert(projects).values(data).returning();
  res.status(201).json(created);
}));

const updateSchema = createSchema.partial();

projectsRouter.patch('/:id', requireRole('ADMIN', 'DISPATCHER'), asyncHandler(async (req, res) => {
  const data = updateSchema.parse(req.body);
  const [updated] = await db.update(projects).set(data).where(eq(projects.id, req.params.id)).returning();
  if (!updated) throw new ApiError(404, 'Проект не найден');
  res.json(updated);
}));

projectsRouter.delete('/:id', requireRole('ADMIN', 'DISPATCHER'), asyncHandler(async (req, res) => {
  const existingOrders = await db.select().from(orders).where(eq(orders.projectId, req.params.id));
  if (existingOrders.length) {
    throw new ApiError(409, 'В проекте есть заказы — сначала удалите или перенесите их');
  }
  await db.delete(projects).where(eq(projects.id, req.params.id));
  res.status(204).send();
}));
