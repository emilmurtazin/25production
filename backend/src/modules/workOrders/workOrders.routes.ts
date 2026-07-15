import { Router } from 'express';
import { z } from 'zod';
import { eq, and, inArray } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  resources, workers, workOrders, workOrderItems, orderOperations,
} from '../../db/schema';
import { asyncHandler, ApiError } from '../../middleware/errorHandler';
import { requireAuth, requireRole } from '../../middleware/auth';
import { ScheduledOperation, ResourceInput } from '../schedule/scheduling.service';
import { loadScheduleContext } from '../schedule/loadSchedule';

export const workOrdersRouter = Router();
workOrdersRouter.use(requireAuth);

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

// ===================== Формирование нарядов на один день (переиспользуется для одного дня и для диапазона) =====================
// Равномерное распределение: для каждой операции дня перебираем часы и на каждом шаге отдаём их
// наименее загруженному сегодня работнику, который по разряду допущен к этой операции.
async function generateForDay(
  dayOffset: number,
  targetResourceIds: string[],
  scheduled: ScheduledOperation[],
  resourcesById: Map<string, ResourceInput>,
): Promise<Record<string, { workerCount: number; assignedHours: number; unassignedHours: number }>> {
  const dayStart = dayOffset * 24;
  const dayEnd = dayStart + 24;
  const date = dateStringFor(dayOffset);
  const allWorkers = await db.select().from(workers).where(eq(workers.active, true));
  const summary: Record<string, { workerCount: number; assignedHours: number; unassignedHours: number }> = {};

  for (const resId of targetResourceIds) {
    const resource = resourcesById.get(resId);
    if (!resource) continue;

    // Пересоздаём наряды этого участка на этот день — так вызов идемпотентен и поддерживает пересчёт.
    // Ручные переназначения мастером (см. PATCH /items/:id) при этом теряются для этого дня —
    // это ожидаемо: пересчёт означает "забудь прошлое распределение, посчитай заново".
    const existing = await db.select().from(workOrders)
      .where(and(eq(workOrders.resourceId, resId), eq(workOrders.dayOffset, dayOffset)));
    if (existing.length) {
      await db.delete(workOrders).where(inArray(workOrders.id, existing.map((w) => w.id)));
    }

    const resourceWorkers = allWorkers.filter((w) => w.resourceId === resId);
    const dailyCapacity = resource.alwaysOn ? 24 : Math.max(1, resource.calendar.workEnd - resource.calendar.workStart);
    const assignedToday: Record<string, number> = {};
    resourceWorkers.forEach((w) => { assignedToday[w.id] = 0; });

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

  return summary;
}

function resolveTargetResourceIds(
  resourcesById: Map<string, ResourceInput>,
  resourceId: string | undefined,
  userRole: string,
  userShopId: string | null,
): string[] {
  let ids = Array.from(resourcesById.keys());
  if (resourceId) ids = [resourceId];
  if (userRole === 'SHOP_MASTER') ids = ids.filter((id) => resourcesById.get(id)?.shopId === userShopId);
  return ids;
}

const generateSchema = z.object({
  dayOffset: z.number().int().min(0).max(60),
  resourceId: z.string().uuid().optional(),
});

workOrdersRouter.post('/generate', requireRole('ADMIN', 'DISPATCHER', 'SHOP_MASTER'), asyncHandler(async (req, res) => {
  const { dayOffset, resourceId } = generateSchema.parse(req.body);
  const { scheduled, resourcesById } = await loadScheduleContext();
  const targetResourceIds = resolveTargetResourceIds(resourcesById, resourceId, req.user!.role, req.user!.shopId);
  if (!targetResourceIds.length) throw new ApiError(400, 'Нет доступных участков для формирования нарядов');

  const summary = await generateForDay(dayOffset, targetResourceIds, scheduled, resourcesById);
  res.json({ dayOffset, date: dateStringFor(dayOffset), resources: summary });
}));

// ===================== Формирование нарядов на диапазон дней (например, на всю неделю разом) =====================
const generateRangeSchema = z.object({
  fromDayOffset: z.number().int().min(0).max(60),
  toDayOffset: z.number().int().min(0).max(60),
  resourceId: z.string().uuid().optional(),
});

workOrdersRouter.post('/generate-range', requireRole('ADMIN', 'DISPATCHER', 'SHOP_MASTER'), asyncHandler(async (req, res) => {
  const { fromDayOffset, toDayOffset, resourceId } = generateRangeSchema.parse(req.body);
  if (toDayOffset < fromDayOffset) throw new ApiError(400, 'toDayOffset должен быть не меньше fromDayOffset');
  if (toDayOffset - fromDayOffset > 30) throw new ApiError(400, 'Слишком большой диапазон — не более 31 дня за раз');

  // Загружаем график один раз — но пересчитываем его на каждой итерации дня, т.к. факт выполнения
  // (completedHours) операций дня N зависит от того, что уже "спланировано" в днях до него —
  // на самом деле для авторасчёта график не меняется между днями (он не хранит состояние по дням),
  // поэтому одного расчёта достаточно для всего диапазона.
  const { scheduled, resourcesById } = await loadScheduleContext();
  const targetResourceIds = resolveTargetResourceIds(resourcesById, resourceId, req.user!.role, req.user!.shopId);
  if (!targetResourceIds.length) throw new ApiError(400, 'Нет доступных участков для формирования нарядов');

  const byDay: Record<number, Record<string, { workerCount: number; assignedHours: number; unassignedHours: number }>> = {};
  for (let day = fromDayOffset; day <= toDayOffset; day += 1) {
    byDay[day] = await generateForDay(day, targetResourceIds, scheduled, resourcesById);
  }

  res.json({ fromDayOffset, toDayOffset, days: byDay });
}));

// ===================== Просмотр нарядов =====================
workOrdersRouter.get('/', asyncHandler(async (req, res) => {
  const dayOffset = req.query.dayOffset !== undefined ? Number(req.query.dayOffset) : undefined;
  const workerId = req.query.workerId as string | undefined;
  const resourceId = req.query.resourceId as string | undefined;
  const fromDayOffset = req.query.fromDayOffset !== undefined ? Number(req.query.fromDayOffset) : undefined;
  const toDayOffset = req.query.toDayOffset !== undefined ? Number(req.query.toDayOffset) : undefined;

  const conditions = [];
  if (dayOffset !== undefined) conditions.push(eq(workOrders.dayOffset, dayOffset));
  if (workerId) conditions.push(eq(workOrders.workerId, workerId));
  if (resourceId) conditions.push(eq(workOrders.resourceId, resourceId));

  if (req.user!.role === 'SHOP_MASTER') {
    const shopResources = await db.select().from(resources).where(eq(resources.shopId, req.user!.shopId!));
    conditions.push(inArray(workOrders.resourceId, shopResources.map((r) => r.id)));
  }

  const rows = await db.query.workOrders.findMany({
    where: conditions.length ? and(...conditions) : undefined,
    with: {
      worker: true,
      resource: true,
      items: { with: { orderOperation: { with: { order: true } } } },
    },
  });

  const filtered = (fromDayOffset !== undefined || toDayOffset !== undefined)
    ? rows.filter((r) => (fromDayOffset === undefined || r.dayOffset >= fromDayOffset)
      && (toDayOffset === undefined || r.dayOffset <= toDayOffset))
    : rows;

  res.json(filtered);
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

// ===================== Ручное переназначение позиции наряда мастером =====================
// Мастер может перекинуть операцию на другого работника своего участка/цеха и/или поправить
// запланированные часы — например, если система распределила неудачно, а мастер знает ситуацию лучше.
const reassignSchema = z.object({
  workerId: z.string().uuid().optional(),
  hoursPlanned: z.number().positive().optional(),
}).refine((d) => d.workerId !== undefined || d.hoursPlanned !== undefined, {
  message: 'Укажите workerId и/или hoursPlanned',
});

workOrdersRouter.patch('/items/:id', requireRole('ADMIN', 'SHOP_MASTER'), asyncHandler(async (req, res) => {
  const data = reassignSchema.parse(req.body);

  const item = await db.query.workOrderItems.findFirst({
    where: eq(workOrderItems.id, req.params.id),
    with: { workOrder: { with: { resource: true } }, orderOperation: { with: { catalogOperation: true } } },
  });
  if (!item) throw new ApiError(404, 'Позиция наряда не найдена');

  if (req.user!.role === 'SHOP_MASTER' && item.workOrder.resource.shopId !== req.user!.shopId) {
    throw new ApiError(403, 'Мастер может редактировать наряды только своего цеха');
  }

  let warning: string | null = null;

  if (data.workerId && data.workerId !== item.workOrder.workerId) {
    const [targetWorker] = await db.select().from(workers).where(eq(workers.id, data.workerId));
    if (!targetWorker) throw new ApiError(404, 'Работник не найден');
    if (targetWorker.resourceId !== item.workOrder.resourceId) {
      throw new ApiError(400, 'Работник должен относиться к тому же участку, что и операция');
    }
    if (req.user!.role === 'SHOP_MASTER') {
      const [targetResource] = await db.select().from(resources).where(eq(resources.id, targetWorker.resourceId));
      if (targetResource?.shopId !== req.user!.shopId) {
        throw new ApiError(403, 'Мастер может назначать только работников своего цеха');
      }
    }

    // Разряд не блокирует ручное назначение — мастер может знать ситуацию лучше системы
    // (например, работник уже обучен, а справочник ещё не обновили) — но предупреждаем.
    const requiredGrade = item.orderOperation.catalogOperation?.requiredGrade ?? 1;
    if (targetWorker.grade < requiredGrade) {
      warning = `У операции требуется разряд не ниже ${requiredGrade}, у работника — ${targetWorker.grade}`;
    }

    // Находим (или создаём) наряд целевого работника на тот же день+участок, переносим позицию туда.
    let [targetWorkOrder] = await db.select().from(workOrders).where(and(
      eq(workOrders.workerId, data.workerId),
      eq(workOrders.resourceId, item.workOrder.resourceId),
      eq(workOrders.dayOffset, item.workOrder.dayOffset),
    ));
    if (!targetWorkOrder) {
      [targetWorkOrder] = await db.insert(workOrders).values({
        workerId: data.workerId,
        resourceId: item.workOrder.resourceId,
        dayOffset: item.workOrder.dayOffset,
        date: item.workOrder.date,
      }).returning();
    }

    const oldWorkOrderId = item.workOrderId;
    await db.update(workOrderItems).set({ workOrderId: targetWorkOrder.id }).where(eq(workOrderItems.id, item.id));

    // Если у старого наряда после переноса не осталось позиций — убираем пустой наряд.
    const remainingInOld = await db.select().from(workOrderItems).where(eq(workOrderItems.workOrderId, oldWorkOrderId));
    if (!remainingInOld.length) await db.delete(workOrders).where(eq(workOrders.id, oldWorkOrderId));
  }

  if (data.hoursPlanned !== undefined) {
    await db.update(workOrderItems).set({ hoursPlanned: data.hoursPlanned }).where(eq(workOrderItems.id, item.id));
  }

  const updated = await db.query.workOrderItems.findFirst({
    where: eq(workOrderItems.id, item.id),
    with: { workOrder: { with: { worker: true } }, orderOperation: true },
  });

  res.json({ ...updated, warning });
}));
