import { Router } from 'express';
import { z } from 'zod';
import { eq, and, inArray } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  shops, resources, orders, workers, workOrders, workOrderItems, catalogOperations, orderOperations,
} from '../../db/schema';
import { asyncHandler, ApiError } from '../../middleware/errorHandler';
import { requireAuth, requireRole } from '../../middleware/auth';
import { computeSchedule, OrderOperationInput, ResourceInput, ScheduledOperation } from '../schedule/scheduling.service';

export const workOrdersRouter = Router();
workOrdersRouter.use(requireAuth);

// ===================== Загрузка данных графика (тот же набор, что и GET /api/schedule) =====================
async function loadScheduledOperations(): Promise<{ scheduled: ScheduledOperation[]; resourcesById: Map<string, ResourceInput> }> {
  const [shopRows, resourceRows, orderRows, catalogRows] = await Promise.all([
    db.query.shops.findMany(),
    db.query.resources.findMany(),
    db.query.orders.findMany({ with: { operations: true, project: true } }),
    db.query.catalogOperations.findMany(),
  ]);

  const shopById = new Map(shopRows.map((s) => [s.id, s]));
  const catalogById = new Map(catalogRows.map((c) => [c.id, c]));

  const resourcesById = new Map<string, ResourceInput>();
  resourceRows.forEach((r) => {
    const shop = shopById.get(r.shopId);
    if (!shop) return;
    resourcesById.set(r.id, {
      id: r.id, name: r.name, type: r.type, alwaysOn: r.alwaysOn,
      shopId: shop.id, shopName: shop.name,
      calendar: { workStart: shop.workStart, workEnd: shop.workEnd, workDays: shop.workDays },
    });
  });

  const operations: OrderOperationInput[] = [];
  orderRows.forEach((order) => {
    order.operations.forEach((op) => {
      const catalogOp = op.catalogOperationId ? catalogById.get(op.catalogOperationId) : undefined;
      operations.push({
        id: op.id, orderId: order.id, orderName: order.name,
        projectId: order.project.id, projectName: order.project.name, client: order.project.client,
        priority: order.priority, deadlineHours: order.project.deadlineHours,
        orderCreatedAt: order.createdAt.getTime(),
        name: op.name, durationHours: op.durationHours, completedHours: op.completedHours,
        catalogOperationId: op.catalogOperationId, requiredGrade: catalogOp?.requiredGrade ?? 1,
        sequence: op.sequence, resourceId: op.resourceId,
        pinnedStart: op.pinnedStart, pinnedResourceId: op.pinnedResourceId,
      });
    });
  });

  return { scheduled: computeSchedule(operations, resourcesById), resourcesById };
}

// Пересечение отрезков операции с окном дня [dayStart, dayEnd) — сумма часов, приходящихся на этот день.
function hoursInDayWindow(op: ScheduledOperation, dayStart: number, dayEnd: number): number {
  return op.segments.reduce((sum, seg) => {
    const overlapStart = Math.max(seg.start, dayStart);
    const overlapEnd = Math.min(seg.end, dayEnd);
    return sum + Math.max(0, overlapEnd - overlapStart);
  }, 0);
}

function dateStringFor(dayOffset: number): string {
  const d = new Date(Date.now() + dayOffset * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

// ===================== Формирование нарядов на день =====================
// Равномерное распределение: для каждой операции дня перебираем часы и на каждом шаге отдаём их
// наименее загруженному сегодня работнику, который по разряду допущен к этой операции.
const generateSchema = z.object({
  dayOffset: z.number().int().min(0).max(60),
  resourceId: z.string().uuid().optional(),
});

workOrdersRouter.post('/generate', requireRole('ADMIN', 'DISPATCHER', 'SHOP_MASTER'), asyncHandler(async (req, res) => {
  const { dayOffset, resourceId } = generateSchema.parse(req.body);
  const dayStart = dayOffset * 24;
  const dayEnd = dayStart + 24;
  const date = dateStringFor(dayOffset);

  const { scheduled, resourcesById } = await loadScheduledOperations();

  let targetResourceIds = Array.from(resourcesById.keys());
  if (resourceId) targetResourceIds = [resourceId];
  if (req.user!.role === 'SHOP_MASTER') {
    targetResourceIds = targetResourceIds.filter((id) => resourcesById.get(id)?.shopId === req.user!.shopId);
  }
  if (!targetResourceIds.length) throw new ApiError(400, 'Нет доступных участков для формирования нарядов');

  const allWorkers = await db.select().from(workers).where(eq(workers.active, true));

  const summary: Record<string, { workerCount: number; assignedHours: number; unassignedHours: number }> = {};

  for (const resId of targetResourceIds) {
    const resource = resourcesById.get(resId);
    if (!resource) continue;

    // Пересоздаём наряды этого участка на этот день — так вызов идемпотентен и поддерживает пересчёт.
    const existing = await db.select().from(workOrders)
      .where(and(eq(workOrders.resourceId, resId), eq(workOrders.dayOffset, dayOffset)));
    if (existing.length) {
      await db.delete(workOrders).where(inArray(workOrders.id, existing.map((w) => w.id)));
    }

    const resourceWorkers = allWorkers.filter((w) => w.resourceId === resId);
    const dailyCapacity = resource.alwaysOn ? 24 : Math.max(1, resource.calendar.workEnd - resource.calendar.workStart);
    const assignedToday: Record<string, number> = {};
    resourceWorkers.forEach((w) => { assignedToday[w.id] = 0; });

    // Операции этого участка, отсортированные так же, как в графике (по старту) — сохраняем приоритет.
    const dayOps = scheduled
      .filter((op) => op.effectiveResourceId === resId)
      .map((op) => ({ op, hoursToday: hoursInDayWindow(op, dayStart, dayEnd) }))
      .filter((x) => x.hoursToday > 1e-9);

    const items: { workerId: string; orderOperationId: string; hoursPlanned: number }[] = [];
    let unassignedHours = 0;

    dayOps.forEach(({ op, hoursToday }) => {
      let remaining = hoursToday;
      const qualified = resourceWorkers.filter((w) => w.grade >= op.requiredGrade);
      if (!qualified.length) { unassignedHours += remaining; return; }

      let guard = 0;
      while (remaining > 1e-9 && guard < 200) {
        guard += 1;
        const candidates = qualified.filter((w) => assignedToday[w.id] < dailyCapacity - 1e-9);
        if (!candidates.length) { unassignedHours += remaining; break; }
        candidates.sort((a, b) => assignedToday[a.id] - assignedToday[b.id]);
        const worker = candidates[0];
        const give = Math.min(remaining, dailyCapacity - assignedToday[worker.id]);
        assignedToday[worker.id] += give;
        remaining -= give;
        items.push({ workerId: worker.id, orderOperationId: op.id, hoursPlanned: +give.toFixed(2) });
      }
    });

    // Наряд на воркера создаём, только если ему реально что-то досталось.
    const workerIdsWithWork = Object.keys(assignedToday).filter((id) => assignedToday[id] > 1e-9);
    for (const workerId of workerIdsWithWork) {
      const [wo] = await db.insert(workOrders).values({ workerId, resourceId: resId, dayOffset, date }).returning();
      const workerItems = items.filter((it) => it.workerId === workerId)
        .map((it) => ({ workOrderId: wo.id, orderOperationId: it.orderOperationId, hoursPlanned: it.hoursPlanned }));
      if (workerItems.length) await db.insert(workOrderItems).values(workerItems);
    }

    summary[resId] = {
      workerCount: workerIdsWithWork.length,
      assignedHours: +Object.values(assignedToday).reduce((s, v) => s + v, 0).toFixed(2),
      unassignedHours: +unassignedHours.toFixed(2),
    };
  }

  res.json({ dayOffset, date, resources: summary });
}));

// ===================== Просмотр нарядов =====================
workOrdersRouter.get('/', asyncHandler(async (req, res) => {
  const dayOffset = req.query.dayOffset !== undefined ? Number(req.query.dayOffset) : undefined;
  const workerId = req.query.workerId as string | undefined;
  const resourceId = req.query.resourceId as string | undefined;

  const conditions = [];
  if (dayOffset !== undefined) conditions.push(eq(workOrders.dayOffset, dayOffset));
  if (workerId) conditions.push(eq(workOrders.workerId, workerId));
  if (resourceId) conditions.push(eq(workOrders.resourceId, resourceId));

  let scopedResourceIds: string[] | null = null;
  if (req.user!.role === 'SHOP_MASTER') {
    const shopResources = await db.select().from(resources).where(eq(resources.shopId, req.user!.shopId!));
    scopedResourceIds = shopResources.map((r) => r.id);
    conditions.push(inArray(workOrders.resourceId, scopedResourceIds));
  }

  const rows = await db.query.workOrders.findMany({
    where: conditions.length ? and(...conditions) : undefined,
    with: {
      worker: true,
      resource: true,
      items: { with: { orderOperation: { with: { order: true } } } },
    },
  });
  res.json(rows);
}));

// ===================== Отчёт по факту выполнения =====================
const reportSchema = z.object({ hoursActual: z.number().min(0) });

workOrdersRouter.post('/items/:id/report', requireRole('ADMIN', 'SHOP_MASTER'), asyncHandler(async (req, res) => {
  const { hoursActual } = reportSchema.parse(req.body);

  const item = await db.query.workOrderItems.findFirst({
    where: eq(workOrderItems.id, req.params.id),
    with: { workOrder: { with: { resource: true } }, orderOperation: true },
  });
  if (!item) throw new ApiError(404, 'Позиция наряда не найдена');

  if (req.user!.role === 'SHOP_MASTER' && item.workOrder.resource.shopId !== req.user!.shopId) {
    throw new ApiError(403, 'Мастер может отчитываться только по нарядам своего цеха');
  }

  const oldActual = item.hoursActual ?? 0;
  const delta = hoursActual - oldActual;
  const newCompleted = Math.min(
    item.orderOperation.durationHours,
    Math.max(0, item.orderOperation.completedHours + delta),
  );

  await db.update(orderOperations).set({ completedHours: newCompleted }).where(eq(orderOperations.id, item.orderOperationId));

  const [updated] = await db.update(workOrderItems).set({
    hoursActual, reportedById: req.user!.id, reportedAt: new Date(),
  }).where(eq(workOrderItems.id, req.params.id)).returning();

  res.json(updated);
}));
