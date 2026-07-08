import { Router } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { users } from '../../db/schema';
import { hashPassword, verifyPassword } from '../../utils/password';
import { signToken } from '../../utils/jwt';
import { asyncHandler, ApiError } from '../../middleware/errorHandler';
import { requireAuth, requireRole } from '../../middleware/auth';

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);

  const [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user) throw new ApiError(401, 'Неверный email или пароль');

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) throw new ApiError(401, 'Неверный email или пароль');

  const token = signToken({ sub: user.id, role: user.role, shopId: user.shopId });
  res.json({
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role, shopId: user.shopId },
  });
}));

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Пароль должен быть не короче 8 символов'),
  name: z.string().min(1),
  role: z.enum(['ADMIN', 'DISPATCHER', 'NORMIROVSHIK', 'SHOP_MASTER']),
  shopId: z.string().uuid().nullable().optional(),
});

// Создание пользователей — только ADMIN. Так роли выдаются осознанно, а не через открытую регистрацию.
authRouter.post('/users', requireAuth, requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const data = createUserSchema.parse(req.body);
  if (data.role === 'SHOP_MASTER' && !data.shopId) {
    throw new ApiError(400, 'Для роли SHOP_MASTER нужно указать shopId');
  }
  const passwordHash = await hashPassword(data.password);
  const [created] = await db.insert(users).values({
    email: data.email,
    passwordHash,
    name: data.name,
    role: data.role,
    shopId: data.role === 'SHOP_MASTER' ? data.shopId : null,
  }).returning();

  res.status(201).json({
    id: created.id, email: created.email, name: created.name, role: created.role, shopId: created.shopId,
  });
}));

authRouter.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const [user] = await db.select().from(users).where(eq(users.id, req.user!.id));
  if (!user) throw new ApiError(404, 'Пользователь не найден');
  res.json({ id: user.id, email: user.email, name: user.name, role: user.role, shopId: user.shopId });
}));
