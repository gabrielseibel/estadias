import { Router } from 'express';
import { z } from 'zod';
import { CompanyRole, CrawlFrequency, JobType, Plan } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { assertProjectAccess, auth, requireAuth } from '../auth.js';
import { wrap } from '../middleware.js';
import { canonicalDomain, validateUrlSyntax } from '../../lib/url-security.js';
import { enqueueJob } from '../../jobs/queue.js';
import { compareEntities } from '../../analytics/entity-resolution.js';

export const projectRoutes = Router();
projectRoutes.use(requireAuth);

/** Limites por plano — a cobrança não existe no MVP, a arquitetura já suporta. */
const PLAN_LIMITS: Record<Plan, { projects: number; competitorsPerProject: number }> = {
  FREE: { projects: 1, competitorsPerProject: 3 },
  PRO: { projects: 5, competitorsPerProject: 20 },
  BUSINESS: { projects: Number.POSITIVE_INFINITY, competitorsPerProject: 60 },
  AGENCY: { projects: Number.POSITIVE_INFINITY, competitorsPerProject: 200 },
};

const projectSchema = z.object({
  name: z.string().min(2).max(140),
  segment: z.string().max(120).optional(),
  city: z.string().max(120).optional(),
  state: z.string().max(60).optional(),
  country: z.string().max(60).default('BR'),
  description: z.string().max(2000).optional(),
  frequency: z.nativeEnum(CrawlFrequency).default(CrawlFrequency.MANUAL),
});

projectRoutes.get(
  '/',
  wrap(async (req, res) => {
    const { organizationId } = auth(req);
    const projects = await prisma.project.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { companies: true, alerts: true, insights: true, recommendations: true } },
        companies: { select: { id: true, name: true, role: true, lastCollectedAt: true } },
      },
    });
    res.json(
      projects.map((p) => ({
        id: p.id,
        name: p.name,
        segment: p.segment,
        city: p.city,
        state: p.state,
        frequency: p.frequency,
        lastAnalyzedAt: p.lastAnalyzedAt,
        createdAt: p.createdAt,
        counts: {
          companies: p._count.companies,
          competitors: p.companies.filter((c) => c.role === 'COMPETITOR').length,
          alerts: p._count.alerts,
          insights: p._count.insights,
          recommendations: p._count.recommendations,
        },
        self: p.companies.find((c) => c.role === 'SELF') ?? null,
      })),
    );
  }),
);

projectRoutes.post(
  '/',
  wrap(async (req, res) => {
    const { organizationId } = auth(req);
    const input = projectSchema.parse(req.body);

    const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
    const count = await prisma.project.count({ where: { organizationId } });
    const limit = PLAN_LIMITS[org.plan].projects;
    if (count >= limit) {
      throw conflict(`O plano ${org.plan} permite ${limit} projeto(s). Remova um projeto ou altere o plano para criar outro.`);
    }

    const project = await prisma.project.create({ data: { ...input, organizationId } });
    res.status(201).json(project);
  }),
);

projectRoutes.get(
  '/:id',
  wrap(async (req, res) => {
    const project = await assertProjectAccess(req, req.params.id);
    const [companies, lastJob, counts] = await Promise.all([
      prisma.company.findMany({
        where: { projectId: project.id },
        orderBy: [{ role: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true, role: true, website: true, domain: true, city: true, lastCollectedAt: true, isDemo: true },
      }),
      prisma.crawlJob.findFirst({ where: { projectId: project.id }, orderBy: { createdAt: 'desc' } }),
      prisma.$transaction([
        prisma.alert.count({ where: { projectId: project.id, status: 'NEW' } }),
        prisma.insight.count({ where: { projectId: project.id, kind: 'OPPORTUNITY' } }),
        prisma.insight.count({ where: { projectId: project.id, kind: 'THREAT' } }),
        prisma.recommendation.count({ where: { projectId: project.id, status: 'OPEN' } }),
      ]),
    ]);
    res.json({
      ...project,
      companies,
      lastJob,
      counts: { newAlerts: counts[0], opportunities: counts[1], threats: counts[2], recommendations: counts[3] },
    });
  }),
);

projectRoutes.patch(
  '/:id',
  wrap(async (req, res) => {
    const project = await assertProjectAccess(req, req.params.id);
    const input = projectSchema.partial().parse(req.body);
    res.json(await prisma.project.update({ where: { id: project.id }, data: input }));
  }),
);

projectRoutes.delete(
  '/:id',
  wrap(async (req, res) => {
    const project = await assertProjectAccess(req, req.params.id);
    await prisma.project.delete({ where: { id: project.id } });
    res.status(204).end();
  }),
);

// ── Empresas do projeto ──────────────────────────────────────────────────────

const companySchema = z.object({
  name: z.string().min(2).max(180),
  role: z.nativeEnum(CompanyRole).default(CompanyRole.COMPETITOR),
  website: z.string().max(500).optional(),
  segment: z.string().max(120).optional(),
  city: z.string().max(120).optional(),
  state: z.string().max(60).optional(),
  phone: z.string().max(60).optional(),
  description: z.string().max(2000).optional(),
});

projectRoutes.post(
  '/:id/companies',
  wrap(async (req, res) => {
    const project = await assertProjectAccess(req, req.params.id);
    const { organizationId } = auth(req);
    const input = companySchema.parse(req.body);

    let website: string | undefined;
    let domain: string | null = null;
    if (input.website) {
      const typed = input.website.trim();
      // "empresa.com.br" ganha https://; "ftp://..." é erro do usuário, não algo
      // a completar — prefixar cegamente produziria um host sem sentido.
      const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(typed);
      if (hasScheme && !/^https?:\/\//i.test(typed)) {
        throw badRequest('Website inválido: informe um endereço iniciado por http:// ou https://.');
      }
      const raw = hasScheme ? typed : `https://${typed}`;
      const check = validateUrlSyntax(raw);
      if (!check.ok) throw badRequest(`Website inválido: ${check.reason}`);
      website = check.url.toString();
      domain = canonicalDomain(website);
    }

    if (input.role === CompanyRole.SELF) {
      const existingSelf = await prisma.company.findFirst({ where: { projectId: project.id, role: CompanyRole.SELF } });
      if (existingSelf) throw conflict(`O projeto já tem uma empresa própria cadastrada ("${existingSelf.name}").`);
    } else {
      const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
      const competitors = await prisma.company.count({ where: { projectId: project.id, role: CompanyRole.COMPETITOR } });
      const limit = PLAN_LIMITS[org.plan].competitorsPerProject;
      if (competitors >= limit) throw conflict(`O plano ${org.plan} permite ${limit} concorrentes por projeto.`);
    }

    // Resolução de entidades: evita cadastrar a mesma empresa duas vezes.
    const existing = await prisma.company.findMany({ where: { projectId: project.id } });
    const duplicate = existing.find((c) => compareEntities({ name: c.name, domain: c.domain, city: c.city, phone: c.phone, aliases: c.aliases }, { name: input.name, domain, city: input.city, phone: input.phone }).match);
    if (duplicate) {
      throw conflict(`Esta empresa parece já estar cadastrada como "${duplicate.name}". ${compareEntities({ name: duplicate.name, domain: duplicate.domain, city: duplicate.city }, { name: input.name, domain, city: input.city }).reason}`);
    }

    const company = await prisma.company.create({
      data: {
        organizationId,
        projectId: project.id,
        role: input.role,
        name: input.name.trim(),
        website,
        domain,
        segment: input.segment ?? project.segment,
        city: input.city ?? project.city,
        state: input.state ?? project.state,
        country: project.country,
        phone: input.phone,
        description: input.description,
      },
    });
    res.status(201).json(company);
  }),
);

/** 🔎 ANALISAR AGORA — enfileira a coleta; o progresso é acompanhado pelo job. */
projectRoutes.post(
  '/:id/analyze',
  wrap(async (req, res) => {
    const project = await assertProjectAccess(req, req.params.id);
    const { organizationId } = auth(req);

    const companies = await prisma.company.count({ where: { projectId: project.id } });
    if (companies === 0) throw badRequest('Cadastre ao menos a sua empresa antes de executar a análise.');

    const running = await prisma.crawlJob.findFirst({
      where: { projectId: project.id, status: { in: ['QUEUED', 'RUNNING', 'PROCESSING'] } },
    });
    if (running) return res.status(202).json({ job: running, message: 'Já existe uma análise em andamento para este projeto.' });

    const job = await enqueueJob({
      organizationId,
      projectId: project.id,
      type: JobType.FULL_ANALYSIS,
      progressTotal: companies + 2,
      currentStep: 'Na fila',
    });
    res.status(202).json({ job });
  }),
);

/** Recalcula a análise sem nova coleta (determinístico sobre os mesmos dados). */
projectRoutes.post(
  '/:id/reanalyze',
  wrap(async (req, res) => {
    const project = await assertProjectAccess(req, req.params.id);
    const { organizationId } = auth(req);
    const job = await enqueueJob({ organizationId, projectId: project.id, type: JobType.AI_ANALYSIS, progressTotal: 2, currentStep: 'Na fila' });
    res.status(202).json({ job });
  }),
);

projectRoutes.get(
  '/:id/jobs',
  wrap(async (req, res) => {
    const project = await assertProjectAccess(req, req.params.id);
    const jobs = await prisma.crawlJob.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { _count: { select: { logs: true } } },
    });
    res.json(jobs);
  }),
);

projectRoutes.get(
  '/:id/jobs/:jobId',
  wrap(async (req, res) => {
    const project = await assertProjectAccess(req, req.params.id);
    const job = await prisma.crawlJob.findFirst({ where: { id: req.params.jobId, projectId: project.id } });
    if (!job) throw notFound('Job não encontrado.');
    const logs = await prisma.jobLog.findMany({ where: { jobId: job.id }, orderBy: { createdAt: 'asc' }, take: 500 });
    res.json({ job, logs });
  }),
);
