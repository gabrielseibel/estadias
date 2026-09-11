import { Router } from 'express';
import { z } from 'zod';
import { Plan } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { conflict, unauthorized } from '../../lib/errors.js';
import { hashPassword, requireAuth, signToken, verifyPassword, auth } from '../auth.js';
import { wrap } from '../middleware.js';
import { slugKey } from '../../parsers/text.js';

export const authRoutes = Router();

const registerSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email().max(200),
  password: z.string().min(8, 'A senha precisa ter ao menos 8 caracteres.').max(200),
  organizationName: z.string().min(2).max(120),
});

authRoutes.post(
  '/register',
  wrap(async (req, res) => {
    const input = registerSchema.parse(req.body);
    const email = input.email.toLowerCase().trim();

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw conflict('Já existe uma conta com este e-mail.');

    const baseSlug = slugKey(input.organizationName).replace(/\s+/g, '-').slice(0, 40) || 'organizacao';
    let slug = baseSlug;
    for (let i = 2; await prisma.organization.findUnique({ where: { slug } }); i++) slug = `${baseSlug}-${i}`;

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { name: input.name.trim(), email, passwordHash: await hashPassword(input.password) },
      });
      const org = await tx.organization.create({ data: { name: input.organizationName.trim(), slug, plan: Plan.FREE } });
      await tx.membership.create({ data: { userId: created.id, organizationId: org.id, role: 'OWNER' } });
      return { created, org };
    });

    const token = signToken({ userId: user.created.id, organizationId: user.org.id, role: 'OWNER', email });
    res.status(201).json({
      token,
      user: { id: user.created.id, name: user.created.name, email },
      organization: { id: user.org.id, name: user.org.name, slug: user.org.slug, plan: user.org.plan, isDemo: false },
    });
  }),
);

authRoutes.post(
  '/login',
  wrap(async (req, res) => {
    const input = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
    const user = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase().trim() },
      include: { memberships: { include: { organization: true }, orderBy: { createdAt: 'asc' } } },
    });
    // Mensagem idêntica para e-mail inexistente e senha errada (não revela cadastro).
    if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
      throw unauthorized('E-mail ou senha inválidos.');
    }
    const membership = user.memberships[0];
    if (!membership) throw unauthorized('Usuário sem organização vinculada.');

    const token = signToken({ userId: user.id, organizationId: membership.organizationId, role: membership.role, email: user.email });
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email },
      organization: {
        id: membership.organization.id,
        name: membership.organization.name,
        slug: membership.organization.slug,
        plan: membership.organization.plan,
        isDemo: membership.organization.isDemo,
      },
      organizations: user.memberships.map((m) => ({ id: m.organization.id, name: m.organization.name, role: m.role, isDemo: m.organization.isDemo })),
    });
  }),
);

authRoutes.get(
  '/me',
  requireAuth,
  wrap(async (req, res) => {
    const ctx = auth(req);
    const [user, organization, memberships] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: ctx.userId }, select: { id: true, name: true, email: true, createdAt: true } }),
      prisma.organization.findUniqueOrThrow({ where: { id: ctx.organizationId } }),
      prisma.membership.findMany({ where: { userId: ctx.userId }, include: { organization: true } }),
    ]);
    res.json({
      user,
      organization: { id: organization.id, name: organization.name, slug: organization.slug, plan: organization.plan, isDemo: organization.isDemo },
      role: ctx.role,
      organizations: memberships.map((m) => ({ id: m.organization.id, name: m.organization.name, role: m.role, isDemo: m.organization.isDemo })),
    });
  }),
);

/** Troca a organização ativa (o token carrega o tenant). */
authRoutes.post(
  '/switch-organization',
  requireAuth,
  wrap(async (req, res) => {
    const ctx = auth(req);
    const { organizationId } = z.object({ organizationId: z.string().uuid() }).parse(req.body);
    const membership = await prisma.membership.findFirst({
      where: { userId: ctx.userId, organizationId },
      include: { organization: true },
    });
    if (!membership) throw unauthorized('Você não pertence a esta organização.');
    const token = signToken({ userId: ctx.userId, organizationId, role: membership.role, email: ctx.email });
    res.json({
      token,
      organization: {
        id: membership.organization.id,
        name: membership.organization.name,
        slug: membership.organization.slug,
        plan: membership.organization.plan,
        isDemo: membership.organization.isDemo,
      },
    });
  }),
);
