import jwt from 'jsonwebtoken';

export type Role = 'ADMIN' | 'DISPATCHER' | 'NORMIROVSHIK' | 'SHOP_MASTER';

export interface JwtPayload {
  sub: string;   // userId
  role: Role;
  shopId: string | null;
}

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET не задан в переменных окружения');
  return secret;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, getSecret(), {
    expiresIn: (process.env.JWT_EXPIRES_IN || '12h') as jwt.SignOptions['expiresIn'],
  });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, getSecret()) as JwtPayload;
}
