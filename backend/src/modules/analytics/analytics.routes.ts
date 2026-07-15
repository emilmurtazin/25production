import { Router } from 'express';
import { and, gte, lte } from 'drizzle-orm';
import { db } from '../../db/client';
import { orderOperations, workOrders } from '../../db/schema';
import { requireAuth } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import { isWorkingHour, ResourceInput } from '../schedule/scheduling.service';
import { loadScheduleContext } from '../schedule/loadSchedule';

export const analyticsRouter = Router();
analyticsRouter.use(requireAuth);

const WINDOW_HOURS = 168; // неделя — то же окно, что используется для отображения графика

function availableHoursInWindow(resource: ResourceInput): number {
  if (resource.alwaysOn) return WINDOW_HOURS;
  let n = 0;
  for (let h = 0; h < WINDOW_HOURS; h += 1) if (isWorkingHour(h, resource)) n += 1;
  return n;
}

analyticsRouter.get('/overview', asyncHandler(async (_req, res) => {
  const [{ scheduled, resourcesById, shopRows }, orderRows, allOps] = await Promise.all([
    loadScheduleContext(),
    db.query.orders.findMany(),
    db.select().from(orderOperations),
  ]);

  // ---------- Заказы: прогноз срыва срока ----------
  // Прогнозируемое завершение заказа = самая поздняя точка окончания среди ещё не выполненных
  // операций заказа в текущем графике. Если операций не осталось — заказ уже полностью выполнен.
  const orders = orderRows.map((o) => {
    const ops = scheduled.filter((s) => s.orderId === o.id);
    const projectedCompletionHours = ops.length ? Math.max(...ops.map((s) => s.end)) : null;
    const atRisk = projectedCompletionHours !== null && projectedCompletionHours > (ops[0]?.deadlineHours ?? 0);
    const overdueByHours = atRisk ? +(projectedCompletionHours! - ops[0].deadlineHours).toFixed(1) : 0;
    return {
      id: o.id,
      name: o.name,
      client: o.client,
      deadlineDate: o.deadlineDate,
      projectedCompletionHours: projectedCompletionHours !== null ? +projectedCompletionHours.toFixed(1) : null,
      atRisk,
      overdueByHours,
      remainingOperations: ops.length,
      remainingHours: +ops.reduce((s, op) => s + op.remainingHours, 0).toFixed(1),
    };
  });

  // ---------- Ресурсы и цеха: загрузка относительно фонда рабочего времени за неделю ----------
  const resourceStats = Array.from(resourcesById.values()).map((r) => {
    const busy = scheduled.filter((o) => o.effectiveResourceId === r.id).reduce((s, o) => s + o.remainingHours, 0);
    const avail = availableHoursInWindow(r);
    const utilizationPercent = avail > 0 ? Math.round((busy / avail) * 100) : 0;
    return {
      id: r.id, name: r.name, shopId: r.shopId, shopName: r.shopName,
      remainingHours: +busy.toFixed(1), availableHours: avail,
      utilizationPercent, overloaded: busy > avail * 0.85,
    };
  });

  const shops = shopRows.map((s) => {
    const own = resourceStats.filter((r) => r.shopId === s.id);
    const totalBusy = own.reduce((s2, r) => s2 + r.remainingHours, 0);
    const totalAvail = own.reduce((s2, r) => s2 + r.availableHours, 0);
    return {
      id: s.id, name: s.name,
      utilizationPercent: totalAvail > 0 ? Math.round((totalBusy / totalAvail) * 100) : 0,
      overloadedResources: own.filter((r) => r.overloaded).length,
      totalResources: own.length,
      totalRemainingHours: +totalBusy.toFixed(1),
    };
  });

  // ---------- Работники: план vs факт за последние 7 календарных дней ----------
  const today = new Date();
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const dateFrom = weekAgo.toISOString().slice(0, 10);
  const dateTo = today.toISOString().slice(0, 10);

  const recentWorkOrders = await db.query.workOrders.findMany({
    where: and(gte(workOrders.date, dateFrom), lte(workOrders.date, dateTo)),
    with: { worker: true, items: true },
  });

  interface WorkerAgg { workerId: string; name: string; grade: number; planned: number; actual: number; reportedItems: number; totalItems: number; }
  const workerAgg = new Map<string, WorkerAgg>();
  recentWorkOrders.forEach((wo) => {
    const agg = workerAgg.get(wo.workerId) ?? {
      workerId: wo.workerId, name: wo.worker.name, grade: wo.worker.grade,
      planned: 0, actual: 0, reportedItems: 0, totalItems: 0,
    };
    wo.items.forEach((it) => {
      agg.planned += it.hoursPlanned;
      agg.totalItems += 1;
      if (it.hoursActual != null) { agg.actual += it.hoursActual; agg.reportedItems += 1; }
    });
    workerAgg.set(wo.workerId, agg);
  });

  const workers = Array.from(workerAgg.values()).map((w) => ({
    workerId: w.workerId, name: w.name, grade: w.grade,
    plannedHours: +w.planned.toFixed(1), actualHours: +w.actual.toFixed(1),
    efficiencyPercent: w.planned > 0 ? Math.round((w.actual / w.planned) * 100) : null,
    reportRatePercent: w.totalItems > 0 ? Math.round((w.reportedItems / w.totalItems) * 100) : null,
  }));

  // ---------- Общие итоги ----------
  const totalDuration = allOps.reduce((s, o) => s + o.durationHours, 0);
  const totalCompleted = allOps.reduce((s, o) => s + Math.min(o.completedHours, o.durationHours), 0);

  const totals = {
    activeOrders: orders.length,
    atRiskOrders: orders.filter((o) => o.atRisk).length,
    totalRemainingHours: +scheduled.reduce((s, o) => s + o.remainingHours, 0).toFixed(1),
    overallCompletionPercent: totalDuration > 0 ? Math.round((totalCompleted / totalDuration) * 100) : 0,
  };

  res.json({
    generatedAt: new Date().toISOString(),
    windowHours: WINDOW_HOURS,
    reportPeriod: { from: dateFrom, to: dateTo },
    totals, orders, shops, resources: resourceStats, workers,
  });
}));
