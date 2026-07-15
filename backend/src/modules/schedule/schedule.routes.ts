import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import { loadScheduleContext } from './loadSchedule';

export const scheduleRouter = Router();
scheduleRouter.use(requireAuth);

scheduleRouter.get('/', asyncHandler(async (_req, res) => {
  const { scheduled, resourcesById, shopRows } = await loadScheduleContext();
  res.json({
    resources: Array.from(resourcesById.values()),
    shops: shopRows,
    operations: scheduled,
  });
}));
