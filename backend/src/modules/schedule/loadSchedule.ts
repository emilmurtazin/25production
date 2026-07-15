import { db } from '../../db/client';
import {
  computeSchedule, OrderOperationInput, ResourceInput, ScheduledOperation,
} from './scheduling.service';

// Срок заказа хранится как реальная календарная дата (deadlineDate), а алгоритм расчёта
// оперирует часами от текущего момента — переводим здесь, в одном месте.
function deadlineDateToHours(deadlineDate: string): number {
  const deadline = new Date(`${deadlineDate}T23:59:59`).getTime();
  return (deadline - Date.now()) / (1000 * 60 * 60);
}

export async function loadScheduleContext(): Promise<{
  scheduled: ScheduledOperation[];
  resourcesById: Map<string, ResourceInput>;
  shopRows: Awaited<ReturnType<typeof db.query.shops.findMany>>;
}> {
  const [shopRows, resourceRows, orderRows, catalogRows] = await Promise.all([
    db.query.shops.findMany(),
    db.query.resources.findMany(),
    db.query.orders.findMany({ with: { operations: true } }),
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
    const deadlineHours = deadlineDateToHours(order.deadlineDate);
    order.operations.forEach((op) => {
      const catalogOp = op.catalogOperationId ? catalogById.get(op.catalogOperationId) : undefined;
      operations.push({
        id: op.id, orderId: order.id, orderName: order.name, client: order.client,
        priority: order.priority, deadlineHours,
        orderCreatedAt: order.createdAt.getTime(),
        name: op.name, durationHours: op.durationHours, completedHours: op.completedHours,
        catalogOperationId: op.catalogOperationId, requiredGrade: catalogOp?.requiredGrade ?? 1,
        sequence: op.sequence, resourceId: op.resourceId,
        pinnedStart: op.pinnedStart, pinnedResourceId: op.pinnedResourceId,
      });
    });
  });

  return { scheduled: computeSchedule(operations, resourcesById), resourcesById, shopRows };
}
