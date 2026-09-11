import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { assertProjectAccess, requireAuth } from '../auth.js';
import { wrap } from '../middleware.js';
import { discoverCompetitors } from '../../crawler/discovery.js';

export const discoveryRoutes = Router();
discoveryRoutes.use(requireAuth);

/**
 * Pesquisa automática de concorrentes. Devolve candidatos para confirmação
 * humana — o sistema nunca adiciona concorrente sozinho.
 */
discoveryRoutes.post(
  '/projects/:id/discover',
  wrap(async (req, res) => {
    const project = await assertProjectAccess(req, req.params.id);
    const input = z
      .object({ segment: z.string().min(2).max(120), city: z.string().max(120).optional(), state: z.string().max(60).optional() })
      .parse({ segment: req.body.segment ?? project.segment, city: req.body.city ?? project.city, state: req.body.state ?? project.state });

    const existing = await prisma.company.findMany({ where: { projectId: project.id }, select: { domain: true } });
    const result = await discoverCompetitors({
      ...input,
      exclude: existing.map((c) => c.domain).filter((d): d is string => Boolean(d)),
    });
    res.json(result);
  }),
);
