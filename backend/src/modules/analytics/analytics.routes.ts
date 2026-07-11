import { Router } from 'express';
import { and, gte, lte } from 'drizzle-orm';
import { db } from '../../db/client';
import { orderOperations, workOrders } from '../../db/schema';
import { requireAuth } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import {
  computeSchedule, isWorkingHour, OrderOperationInput, ResourceInput,
} from '../schedule/scheduling.service';

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
  const [shopRows, resourceRows, orderRows, catalogRows, projectRows, allOps] = await Promise.all([
    db.query.shops.findMany(),
    db.query.resources.findMany(),
    db.query.orders.findMany({ with: { operations: true, project: true } }),
    db.query.catalogOperations.findMany(),
    db.query.projects.findMany(),
    db.select().from(orderOperations),
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

  const scheduled = computeSchedule(operations, resourcesById);

  // ---------- Проекты: прогноз срыва срока ----------
  // Прогнозируемое завершение проекта = самая поздняя точка окончания среди ещё не выполненных
  // операций его заказов в текущем графике. Если операций не осталось — проект уже полностью
  // выполнен (или у него ещё нет заказов), считать "срыв" не имеет смысла.
  const projects = projectRows.map((p) => {
    const ops = scheduled.filter((o) => o.projectId === p.id);
    const projectedCompletionHours = ops.length ? Math.max(...ops.map((o) => o.end)) : null;
    const atRisk = projectedCompletionHours !== null && projectedCompletionHours > p.deadlineHours;
    return {
      id: p.id,
      name: p.name,
      client: p.client,
      deadlineHours: p.deadlineHours,
      projectedCompletionHours: projectedCompletionHours !== null ? +projectedCompletionHours.toFixed(1) : null,
      atRisk,
      overdueByHours: atRisk ? +(projectedCompletionHours! - p.deadlineHours).toFixed(1) : 0,
      remainingOperations: ops.length,
      remainingHours: +ops.reduce((s, o) => s + o.remainingHours, 0).toFixed(1),
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
    activeProjects: projects.length,
    atRiskProjects: projects.filter((p) => p.atRisk).length,
    totalOrders: orderRows.length,
    totalRemainingHours: +scheduled.reduce((s, o) => s + o.remainingHours, 0).toFixed(1),
    overallCompletionPercent: totalDuration > 0 ? Math.round((totalCompleted / totalDuration) * 100) : 0,
  };

  res.json({
    generatedAt: new Date().toISOString(),
    windowHours: WINDOW_HOURS,
    reportPeriod: { from: dateFrom, to: dateTo },
    totals, projects, shops, resources: resourceStats, workers,
  });
}));
