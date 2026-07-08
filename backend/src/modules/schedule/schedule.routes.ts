import { Router } from 'express';
import { db } from '../../db/client';
import { requireAuth } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import { computeSchedule, OrderOperationInput, ResourceInput } from './scheduling.service';

export const scheduleRouter = Router();
scheduleRouter.use(requireAuth);

scheduleRouter.get('/', asyncHandler(async (_req, res) => {
  const [shopRows, resourceRows, orderRows] = await Promise.all([
    db.query.shops.findMany(),
    db.query.resources.findMany(),
    db.query.orders.findMany({ with: { operations: true, project: true } }),
  ]);

  const shopById = new Map(shopRows.map((s) => [s.id, s]));

  const resourcesById = new Map<string, ResourceInput>();
  resourceRows.forEach((r) => {
    const shop = shopById.get(r.shopId);
    if (!shop) return;
    resourcesById.set(r.id, {
      id: r.id,
      name: r.name,
      type: r.type,
      alwaysOn: r.alwaysOn,
      shopId: shop.id,
      shopName: shop.name,
      calendar: { workStart: shop.workStart, workEnd: shop.workEnd, workDays: shop.workDays },
    });
  });

  const operations: OrderOperationInput[] = [];
  orderRows.forEach((order) => {
    order.operations.forEach((op) => {
      operations.push({
        id: op.id,
        orderId: order.id,
        orderName: order.name,
        projectId: order.project.id,
        projectName: order.project.name,
        client: order.project.client,
        priority: order.priority,
        deadlineHours: order.project.deadlineHours,
        orderCreatedAt: order.createdAt.getTime(),
        name: op.name,
        durationHours: op.durationHours,
        sequence: op.sequence,
        resourceId: op.resourceId,
        pinnedStart: op.pinnedStart,
        pinnedResourceId: op.pinnedResourceId,
      });
    });
  });

  const scheduled = computeSchedule(operations, resourcesById);

  res.json({
    resources: Array.from(resourcesById.values()),
    shops: shopRows,
    operations: scheduled,
  });
}));
