import { Router } from 'express';
import { z } from 'zod';
import { AiRunKind, AlertStatus, JobType } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { notFound } from '../../lib/errors.js';
import { assertCompanyAccess, assertProjectAccess, auth, requireAuth } from '../auth.js';
import { wrap } from '../middleware.js';
import { loadCompanyView, loadProjectViews } from '../../analytics/company-view.js';
import { buildBenchmarks, buildMatrix, computeScores } from '../../analytics/competitive.js';
import { analyzeOfferGap } from '../../analytics/gap.js';
import { computeDataQuality } from '../../analytics/data-quality.js';
import { buildReport, persistReport } from '../../analytics/report.js';
import { runAnalyst, persistRun } from '../../ai/analyst.js';
import { aiAvailable, AI_UNAVAILABLE_MESSAGE } from '../../ai/client.js';
import { enqueueJob } from '../../jobs/queue.js';
import { renderReportHtml } from '../../analytics/report-html.js';

/**
 * Rotas de leitura analítica. Todas escopadas ao projeto, que por sua vez é
 * validado contra a organização do token.
 */

export const analysisRoutes = Router();
analysisRoutes.use(requireAuth);

/** Dashboard principal do projeto. */
analysisRoutes.get(
  '/projects/:id/dashboard',
  wrap(async (req, res) => {
    const project = await assertProjectAccess(req, req.params.id);
    const views = await loadProjectViews(project.id);
    const scores = computeScores(views);
    const self = views.find((v) => v.role === 'SELF');
    const selfScore = scores.find((s) => s.role === 'SELF');
    const competitors = scores.filter((s) => s.role === 'COMPETITOR');

    const ranked = scores.filter((s) => s.composite.score !== null).sort((a, b) => b.composite.score! - a.composite.score!);
    const [newAlerts, opportunities, threats, recommendations, recentChanges, lastJob] = await Promise.all([
      prisma.alert.count({ where: { projectId: project.id, status: AlertStatus.NEW } }),
      prisma.insight.count({ where: { projectId: project.id, kind: 'OPPORTUNITY' } }),
      prisma.insight.count({ where: { projectId: project.id, kind: 'THREAT' } }),
      prisma.recommendation.count({ where: { projectId: project.id, status: 'OPEN' } }),
      prisma.companyChange.count({
        where: { company: { projectId: project.id }, observedAt: { gte: new Date(Date.now() - 30 * 86_400_000) } },
      }),
      prisma.crawlJob.findFirst({ where: { projectId: project.id }, orderBy: { createdAt: 'desc' } }),
    ]);

    const bestRated = views
      .filter((v) => v.reputation.rating !== null)
      .sort((a, b) => (b.reputation.rating ?? 0) - (a.reputation.rating ?? 0))[0] ?? null;
    const bestPresence = [...scores]
      .filter((s) => s.dimensions.presence.value !== null)
      .sort((a, b) => (b.dimensions.presence.value ?? 0) - (a.dimensions.presence.value ?? 0))[0] ?? null;
    const mostActive = [...competitors]
      .filter((s) => s.threat.score !== null)
      .sort((a, b) => (b.threat.score ?? 0) - (a.threat.score ?? 0))[0] ?? null;
    const fastestGrowth = [...scores]
      .filter((s) => s.dimensions.growth.value !== null)
      .sort((a, b) => (b.dimensions.growth.value ?? 0) - (a.dimensions.growth.value ?? 0))[0] ?? null;

    res.json({
      project: { id: project.id, name: project.name, segment: project.segment, city: project.city, state: project.state, lastAnalyzedAt: project.lastAnalyzedAt, frequency: project.frequency },
      marketScore: selfScore
        ? { value: selfScore.composite.score, coverage: selfScore.composite.coverage, methodology: selfScore.composite.methodology, components: selfScore.composite.components }
        : null,
      position: self && ranked.length ? { rank: ranked.findIndex((s) => s.companyId === self.id) + 1, total: ranked.length } : null,
      counts: { competitors: competitors.length, newAlerts, opportunities, threats, recommendations, recentChanges },
      highlights: {
        bestRated: bestRated ? { companyId: bestRated.id, name: bestRated.name, rating: bestRated.reputation.rating, reviewCount: bestRated.reputation.reviewCount, source: bestRated.reputation.sources[0]?.sourceLabel ?? null } : null,
        bestPresence: bestPresence ? { companyId: bestPresence.companyId, name: bestPresence.name, detail: bestPresence.dimensions.presence.detail } : null,
        mostActive: mostActive ? { companyId: mostActive.companyId, name: mostActive.name, threatScore: mostActive.threat.score, factors: mostActive.threat.factors } : null,
        fastestGrowth: fastestGrowth ? { companyId: fastestGrowth.companyId, name: fastestGrowth.name, detail: fastestGrowth.dimensions.growth.detail } : null,
      },
      dataQuality: views.map((v) => ({ companyId: v.id, name: v.name, ...computeDataQuality(v) })),
      lastJob,
      isDemo: views.some((v) => v.isDemo),
    });
  }),
);

/** Matriz competitiva + benchmarking. */
analysisRoutes.get(
  '/projects/:id/matrix',
  wrap(async (req, res) => {
    const project = await assertProjectAccess(req, req.params.id);
    const views = await loadProjectViews(project.id);
    const scores = computeScores(views);
    res.json({
      matrix: buildMatrix(scores),
      benchmarks: buildBenchmarks(scores),
      scores: scores.map((s) => ({
        companyId: s.companyId, name: s.name, role: s.role,
        composite: s.composite.score, coverage: s.composite.coverage,
        components: s.composite.components, methodology: s.composite.methodology,
        threat: s.threat,
      })),
    });
  }),
);

analysisRoutes.get(
  '/projects/:id/companies',
  wrap(async (req, res) => {
    const project = await assertProjectAccess(req, req.params.id);
    res.json(await loadProjectViews(project.id));
  }),
);

analysisRoutes.get(
  '/companies/:id',
  wrap(async (req, res) => {
    const company = await assertCompanyAccess(req, req.params.id);
    const view = await loadCompanyView(company.id);
    res.json({ ...view, dataQuality: computeDataQuality(view) });
  }),
);

analysisRoutes.post(
  '/companies/:id/analyze',
  wrap(async (req, res) => {
    const company = await assertCompanyAccess(req, req.params.id);
    const job = await enqueueJob({
      organizationId: company.organizationId,
      projectId: company.projectId,
      companyId: company.id,
      type: JobType.COMPANY_CRAWL,
      progressTotal: 3,
    });
    res.status(202).json({ job });
  }),
);

analysisRoutes.delete(
  '/companies/:id',
  wrap(async (req, res) => {
    const company = await assertCompanyAccess(req, req.params.id);
    await prisma.company.delete({ where: { id: company.id } });
    res.status(204).end();
  }),
);

analysisRoutes.get(
  '/projects/:id/gap',
  wrap(async (req, res) => {
    const project = await assertProjectAccess(req, req.params.id);
    res.json(analyzeOfferGap(await loadProjectViews(project.id)));
  }),
);

analysisRoutes.get(
  '/projects/:id/changes',
  wrap(async (req, res) => {
    const project = await assertProjectAccess(req, req.params.id);
    const changes = await prisma.companyChange.findMany({
      where: { company: { projectId: project.id } },
      orderBy: { observedAt: 'desc' },
      take: 200,
      include: { company: { select: { id: true, name: true, role: true } }, evidence: { select: { id: true, url: true, excerpt: true, collectedAt: true, sourceLabel: true } } },
    });
    res.json(changes);
  }),
);

analysisRoutes.get(
  '/projects/:id/alerts',
  wrap(async (req, res) => {
    const project = await assertProjectAccess(req, req.params.id);
    const status = req.query.status as AlertStatus | undefined;
    const alerts = await prisma.alert.findMany({
      where: { projectId: project.id, ...(status ? { status } : {}) },
      orderBy: [{ createdAt: 'desc' }],
      take: 200,
      include: { company: { select: { id: true, name: true } }, evidence: { select: { id: true, url: true, excerpt: true, collectedAt: true } } },
    });
    res.json(alerts);
  }),
);

analysisRoutes.patch(
  '/alerts/:id',
  wrap(async (req, res) => {
    const { organizationId } = auth(req);
    const { status } = z.object({ status: z.nativeEnum(AlertStatus) }).parse(req.body);
    const alert = await prisma.alert.findFirst({ where: { id: req.params.id, organizationId } });
    if (!alert) throw notFound('Alerta não encontrado.');
    res.json(await prisma.alert.update({ where: { id: alert.id }, data: { status } }));
  }),
);

analysisRoutes.get(
  '/projects/:id/insights',
  wrap(async (req, res) => {
    const project = await assertProjectAccess(req, req.params.id);
    const kind = req.query.kind as string | undefined;
    const insights = await prisma.insight.findMany({
      where: { projectId: project.id, ...(kind ? { kind: kind as never } : {}) },
      orderBy: { score: 'desc' },
      include: { company: { select: { id: true, name: true } } },
    });
    res.json(insights);
  }),
);

analysisRoutes.get(
  '/projects/:id/recommendations',
  wrap(async (req, res) => {
    const project = await assertProjectAccess(req, req.params.id);
    const recommendations = await prisma.recommendation.findMany({
      where: { projectId: project.id },
      orderBy: [{ impactValue: 'desc' }, { effortValue: 'asc' }],
      include: { company: { select: { id: true, name: true } } },
    });
    const byHorizon = {
      D7: recommendations.filter((r) => r.horizon === 'D7').slice(0, 3),
      D30: recommendations.filter((r) => r.horizon === 'D30').slice(0, 5),
      D90: recommendations.filter((r) => r.horizon === 'D90').slice(0, 10),
    };
    res.json({ recommendations, actionPlan: byHorizon });
  }),
);

analysisRoutes.get(
  '/projects/:id/timeline',
  wrap(async (req, res) => {
    const project = await assertProjectAccess(req, req.params.id);
    const companyId = req.query.companyId as string | undefined;
    const changes = await prisma.companyChange.findMany({
      where: { company: { projectId: project.id }, ...(companyId ? { companyId } : {}) },
      orderBy: { observedAt: 'desc' },
      take: 300,
      include: { company: { select: { id: true, name: true } }, evidence: true },
    });
    res.json(changes);
  }),
);

analysisRoutes.get(
  '/projects/:id/history',
  wrap(async (req, res) => {
    const project = await assertProjectAccess(req, req.params.id);
    const [metrics, companies] = await Promise.all([
      prisma.competitiveMetric.findMany({ where: { projectId: project.id }, orderBy: { computedAt: 'asc' }, take: 1000 }),
      prisma.company.findMany({ where: { projectId: project.id }, select: { id: true, name: true, role: true } }),
    ]);
    res.json({ metrics, companies });
  }),
);

analysisRoutes.get(
  '/evidence/:id',
  wrap(async (req, res) => {
    const { organizationId } = auth(req);
    const evidence = await prisma.evidence.findFirst({ where: { id: req.params.id, organizationId } });
    if (!evidence) throw notFound('Evidência não encontrada.');
    res.json(evidence);
  }),
);

analysisRoutes.get(
  '/companies/:id/evidence',
  wrap(async (req, res) => {
    const company = await assertCompanyAccess(req, req.params.id);
    const evidence = await prisma.evidence.findMany({ where: { companyId: company.id }, orderBy: { collectedAt: 'desc' }, take: 200 });
    res.json(evidence);
  }),
);

// ── Relatórios ───────────────────────────────────────────────────────────────

analysisRoutes.get(
  '/projects/:id/reports',
  wrap(async (req, res) => {
    const project = await assertProjectAccess(req, req.params.id);
    res.json(await prisma.report.findMany({ where: { projectId: project.id }, orderBy: { createdAt: 'desc' }, select: { id: true, title: true, status: true, aiEnriched: true, createdAt: true } }));
  }),
);

analysisRoutes.post(
  '/projects/:id/reports',
  wrap(async (req, res) => {
    const project = await assertProjectAccess(req, req.params.id);
    const report = await persistReport(project.id, project.organizationId);
    res.status(201).json(report);
  }),
);

analysisRoutes.get(
  '/projects/:id/reports/preview',
  wrap(async (req, res) => {
    const project = await assertProjectAccess(req, req.params.id);
    res.json(await buildReport(project.id));
  }),
);

analysisRoutes.get(
  '/reports/:id',
  wrap(async (req, res) => {
    const { organizationId } = auth(req);
    const report = await prisma.report.findFirst({ where: { id: req.params.id, organizationId } });
    if (!report) throw notFound('Relatório não encontrado.');
    res.json(report);
  }),
);

/** Exportação: HTML pronto para impressão/PDF pelo navegador. */
analysisRoutes.get(
  '/reports/:id/export.html',
  wrap(async (req, res) => {
    const { organizationId } = auth(req);
    const report = await prisma.report.findFirst({ where: { id: req.params.id, organizationId } });
    if (!report) throw notFound('Relatório não encontrado.');
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.send(renderReportHtml(report.content as never));
  }),
);

// ── IA ───────────────────────────────────────────────────────────────────────

analysisRoutes.get(
  '/ai/status',
  wrap(async (_req, res) => {
    res.json({
      available: aiAvailable(),
      message: aiAvailable() ? 'Camada de IA ativa.' : AI_UNAVAILABLE_MESSAGE,
    });
  }),
);

analysisRoutes.post(
  '/projects/:id/ask',
  wrap(async (req, res) => {
    const project = await assertProjectAccess(req, req.params.id);
    const ctx = auth(req);
    const { question } = z.object({ question: z.string().min(3).max(2000) }).parse(req.body);

    const run = await runAnalyst(question, { organizationId: ctx.organizationId, projectId: project.id });
    await persistRun({ organizationId: ctx.organizationId, projectId: project.id, userId: ctx.userId, kind: AiRunKind.CHAT, question, run });

    res.json({
      status: run.status,
      answer: run.answer,
      grounding: run.grounding,
      toolsUsed: run.toolTrace.map((t) => ({ tool: t.tool, input: t.input, ok: t.ok })),
      model: run.model,
      latencyMs: run.latencyMs,
    });
  }),
);

analysisRoutes.get(
  '/projects/:id/ai-runs',
  wrap(async (req, res) => {
    const project = await assertProjectAccess(req, req.params.id);
    const runs = await prisma.aiAnalysis.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, kind: true, status: true, question: true, answer: true, model: true, latencyMs: true, groundingReport: true, createdAt: true },
    });
    res.json(runs);
  }),
);
