import { Request, Response, NextFunction } from 'express';
import { verifyToken, Role } from '../utils/jwt';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { id: string; role: Role; shopId: string | null };
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Требуется авторизация (заголовок Authorization: Bearer <token>)' });
  }
  const token = header.slice('Bearer '.length);
  try {
    const payload = verifyToken(token);
    req.user = { id: payload.sub, role: payload.role, shopId: payload.shopId };
    next();
  } catch {
    return res.status(401).json({ error: 'Токен недействителен или истёк' });
  }
}

// requireRole('DISPATCHER', 'ADMIN') — доступ только перечисленным ролям.
export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Требуется авторизация' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Недостаточно прав. Требуется одна из ролей: ${roles.join(', ')}` });
    }
    next();
  };
}

// Для SHOP_MASTER ограничивает доступ его собственным цехом (по параметру :shopId в пути или query.shopId).
// ADMIN/DISPATCHER/NORMIROVSHIK видят все цеха.
export function scopeToOwnShop(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'Требуется авторизация' });
  if (req.user.role !== 'SHOP_MASTER') return next();

  const requestedShopId = req.params.shopId || (req.query.shopId as string | undefined);
  if (requestedShopId && requestedShopId !== req.user.shopId) {
    return res.status(403).json({ error: 'Мастер цеха может работать только со своим цехом' });
  }
  next();
}
