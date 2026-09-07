import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import { MemberRole } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { config } from '../config.js';
import { forbidden, unauthorized } from '../lib/errors.js';

/**
 * Autenticação e isolamento multi-tenant.
 *
 * O `organizationId` NUNCA vem do corpo da requisição: é derivado do token e
 * confirmado contra a tabela de membros. Toda consulta a dados de projeto usa
 * esse valor, de modo que não existe caminho em que uma organização alcance
 * dados de outra.
 */

export type AuthContext = { userId: string; organizationId: string; role: MemberRole; email: string };

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function signToken(ctx: AuthContext): string {
  return jwt.sign(ctx, config.jwt.secret, { expiresIn: config.jwt.expiresIn as never });
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw unauthorized();
    const token = header.slice(7);

    let payload: AuthContext;
    try {
      payload = jwt.verify(token, config.jwt.secret) as AuthContext;
    } catch {
      throw unauthorized('Sessão inválida ou expirada.');
    }

    // O vínculo é revalidado a cada requisição: revogar acesso tem efeito imediato.
    const membership = await prisma.membership.findFirst({
      where: { userId: payload.userId, organizationId: payload.organizationId },
      include: { user: true },
    });
    if (!membership) throw forbidden('Vínculo com a organização não encontrado.');

    req.auth = {
      userId: membership.userId,
      organizationId: membership.organizationId,
      role: membership.role,
      email: membership.user.email,
    };
    next();
  } catch (err) {
    next(err);
  }
}

export function requireRole(...roles: MemberRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(unauthorized());
    if (!roles.includes(req.auth.role)) return next(forbidden('Seu perfil não permite esta operação.'));
    next();
  };
}

export function auth(req: Request): AuthContext {
  if (!req.auth) throw unauthorized();
  return req.auth;
}

/** Garante que o projeto pertence à organização do usuário autenticado. */
export async function assertProjectAccess(req: Request, projectId: string) {
  const { organizationId } = auth(req);
  const project = await prisma.project.findFirst({ where: { id: projectId, organizationId } });
  if (!project) throw forbidden('Projeto não encontrado nesta organização.');
  return project;
}

export async function assertCompanyAccess(req: Request, companyId: string) {
  const { organizationId } = auth(req);
  const company = await prisma.company.findFirst({ where: { id: companyId, organizationId } });
  if (!company) throw forbidden('Empresa não encontrada nesta organização.');
  return company;
}
