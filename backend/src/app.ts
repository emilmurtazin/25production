import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { errorHandler } from './middleware/errorHandler';
import { authRouter } from './modules/auth/auth.routes';
import { shopsRouter } from './modules/shops/shops.routes';
import { resourcesRouter } from './modules/resources/resources.routes';
import { catalogRouter } from './modules/catalog/catalog.routes';
import { measurementsRouter } from './modules/measurements/measurements.routes';
import { modificationsRouter } from './modules/modifications/modifications.routes';
import { projectsRouter } from './modules/projects/projects.routes';
import { ordersRouter } from './modules/orders/orders.routes';
import { scheduleRouter } from './modules/schedule/schedule.routes';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  if (process.env.NODE_ENV !== 'test') {
    app.use(morgan('tiny'));
  }

  // Путь проверки состояния — используется App Platform Timeweb Cloud для health-check
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  app.use('/api/auth', authRouter);
  app.use('/api/shops', shopsRouter);
  app.use('/api/resources', resourcesRouter);
  app.use('/api/catalog', catalogRouter);
  app.use('/api/measurements', measurementsRouter);
  app.use('/api/modifications', modificationsRouter);
  app.use('/api/projects', projectsRouter);
  app.use('/api/orders', ordersRouter);
  app.use('/api/schedule', scheduleRouter);

  app.use((_req, res) => res.status(404).json({ error: 'Маршрут не найден' }));
  app.use(errorHandler);

  return app;
}
