import { Router } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { products, productItems } from '../../db/schema';
import { asyncHandler, ApiError } from '../../middleware/errorHandler';
import { requireAuth, requireRole } from '../../middleware/auth';

// Изделие — именованный набор операций справочника с количеством (бывшая "модификация").
// Используется как строительный блок при формировании заказа: диспетчер выбирает изделие + сколько штук.
export const productsRouter = Router();
productsRouter.use(requireAuth);

productsRouter.get('/', asyncHandler(async (_req, res) => {
  const rows = await db.query.products.findMany({
    with: { items: { with: { catalogOperation: true } } },
  });
  res.json(rows.map((p) => ({
    ...p,
    totalHours: +p.items.reduce((s, it) => s + (it.catalogOperation.normMinutes / 60) * it.qty, 0).toFixed(2),
  })));
}));

const itemSchema = z.object({ catalogOperationId: z.string().uuid(), qty: z.number().int().positive() });
const createSchema = z.object({ name: z.string().min(1), items: z.array(itemSchema).min(1) });

productsRouter.post('/', requireRole('ADMIN', 'NORMIROVSHIK'), asyncHandler(async (req, res) => {
  const data = createSchema.parse(req.body);
  const [product] = await db.insert(products).values({ name: data.name }).returning();
  await db.insert(productItems).values(
    data.items.map((it) => ({ productId: product.id, catalogOperationId: it.catalogOperationId, qty: it.qty })),
  );
  res.status(201).json(product);
}));

productsRouter.delete('/:id', requireRole('ADMIN', 'NORMIROVSHIK'), asyncHandler(async (req, res) => {
  const [deleted] = await db.delete(products).where(eq(products.id, req.params.id)).returning();
  if (!deleted) throw new ApiError(404, 'Изделие не найдено');
  res.status(204).send();
}));
