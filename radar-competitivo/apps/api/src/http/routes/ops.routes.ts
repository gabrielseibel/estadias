import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { auth, requireAuth } from '../auth.js';
import { wrap } from '../middleware.js';
import { workerStatus } from '../../jobs/worker.js';
import { aiAvailable } from '../../ai/client.js';
import { config } from '../../config.js';
import { circuitState } from '../../lib/rate-limiter.js';

/**
 * Observabilidade: painel operacional da própria organização (páginas
 * coletadas, jobs, erros, tempo médio, fontes). Escopado ao tenant.
 */
export const opsRoutes = Router();

opsRoutes.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptimeSeconds: Math.round(process.uptime()), worker: workerStatus() });
});

opsRoutes.get(
  '/ops/overview',
  requireAuth,
  wrap(async (req, res) => {
    const { organizationId } = auth(req);
    const since = new Date(Date.now() - 30 * 86_400_000);

    const [jobs, pages, errors, avg, sources, evidenceCount, aiRuns] = await Promise.all([
      prisma.crawlJob.groupBy({ by: ['status'], where: { organizationId }, _count: true }),
      prisma.crawlPage.groupBy({ by: ['status'], where: { company: { organizationId }, collectedAt: { gte: since } }, _count: true }),
      prisma.jobLog.findMany({
        where: { level: 'error', job: { organizationId }, createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: { message: true, createdAt: true, jobId: true },
      }),
      prisma.crawlPage.aggregate({ where: { company: { organizationId }, status: 'FETCHED', collectedAt: { gte: since } }, _avg: { fetchMs: true }, _count: true }),
      prisma.source.groupBy({ by: ['kind'], where: { company: { organizationId } }, _count: true }),
      prisma.evidence.count({ where: { organizationId } }),
      prisma.aiAnalysis.groupBy({ by: ['status'], where: { organizationId }, _count: true }),
    ]);

    const domains = await prisma.company.findMany({ where: { organizationId }, select: { domain: true } });

    res.json({
      window: '30 dias',
      jobs: Object.fromEntries(jobs.map((j) => [j.status, j._count])),
      pages: Object.fromEntries(pages.map((p) => [p.status, p._count])),
      avgFetchMs: avg._avg.fetchMs ? Math.round(avg._avg.fetchMs) : null,
      pagesFetched: avg._count,
      sources: Object.fromEntries(sources.map((s) => [s.kind, s._count])),
      evidenceCount,
      aiRuns: Object.fromEntries(aiRuns.map((r) => [r.status, r._count])),
      recentErrors: errors,
      crawler: {
        userAgent: config.crawler.userAgent,
        respectRobots: config.crawler.respectRobots,
        maxPagesPerSite: config.crawler.maxPagesPerSite,
        domainDelayMs: config.crawler.domainDelayMs,
        concurrency: config.crawler.concurrency,
        circuits: domains
          .map((d) => d.domain)
          .filter((d): d is string => Boolean(d))
          .map((domain) => ({ domain, ...circuitState(domain) }))
          .filter((c) => c.open || c.failures > 0),
      },
      ai: { available: aiAvailable(), model: aiAvailable() ? config.ai.model : null },
      search: { provider: config.search.provider },
    });
  }),
);
