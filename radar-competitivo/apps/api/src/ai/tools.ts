import { prisma } from '../lib/prisma.js';
import { loadCompanyView, loadProjectViews } from '../analytics/company-view.js';
import { buildBenchmarks, buildMatrix, computeScores } from '../analytics/competitive.js';
import { analyzeOfferGap } from '../analytics/gap.js';
import { computeDataQuality } from '../analytics/data-quality.js';

/**
 * FERRAMENTAS DO ANALISTA COMPETITIVO.
 *
 * A IA não recebe HTML nem texto bruto de páginas: recebe apenas o que estas
 * ferramentas devolvem — estruturas já normalizadas, com fonte e nível de
 * confiança. Isso reduz a superfície de alucinação (o modelo não tem de onde
 * inventar números) e torna cada resposta auditável pelo rastro de chamadas.
 *
 * Todas as ferramentas são escopadas por projeto: nenhuma consegue alcançar
 * dados de outra organização.
 */

export type ToolContext = { organizationId: string; projectId: string };

export type ToolResult = { ok: true; data: unknown } | { ok: false; error: string };

async function assertProject(ctx: ToolContext) {
  const project = await prisma.project.findFirst({ where: { id: ctx.projectId, organizationId: ctx.organizationId } });
  if (!project) throw new Error('Projeto não encontrado nesta organização.');
  return project;
}

async function resolveCompany(ctx: ToolContext, nameOrId: string) {
  const byId = await prisma.company.findFirst({ where: { id: nameOrId, projectId: ctx.projectId, organizationId: ctx.organizationId } });
  if (byId) return byId;
  const byName = await prisma.company.findFirst({
    where: { projectId: ctx.projectId, organizationId: ctx.organizationId, name: { contains: nameOrId, mode: 'insensitive' } },
  });
  return byName;
}

export const TOOL_DEFINITIONS = [
  {
    name: 'get_company_profile',
    description: 'Perfil completo da empresa do próprio usuário no projeto (dados coletados, reputação, oferta, métricas de site e SEO).',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_competitor_profile',
    description: 'Perfil completo de um concorrente do projeto. Use o nome exato retornado por list_companies.',
    input_schema: { type: 'object' as const, properties: { company: { type: 'string', description: 'Nome ou id do concorrente' } }, required: ['company'] },
  },
  {
    name: 'list_companies',
    description: 'Lista as empresas do projeto (a própria e os concorrentes) com id, nome e data da última coleta.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_reviews',
    description: 'Reputação de uma empresa: nota, volume, temas recorrentes (elogios e reclamações) e sentimento agregado das avaliações coletadas.',
    input_schema: { type: 'object' as const, properties: { company: { type: 'string' } }, required: ['company'] },
  },
  {
    name: 'get_price_history',
    description: 'Histórico de preços públicos observados de uma empresa, por item.',
    input_schema: { type: 'object' as const, properties: { company: { type: 'string' } }, required: ['company'] },
  },
  {
    name: 'get_company_changes',
    description: 'Mudanças detectadas entre coletas de uma empresa (novas páginas, ofertas, preços, avaliações, canais).',
    input_schema: { type: 'object' as const, properties: { company: { type: 'string' }, days: { type: 'number', description: 'Janela em dias (padrão 90)' } }, required: ['company'] },
  },
  {
    name: 'get_social_metrics',
    description: 'Canais sociais públicos identificados de uma empresa e o que é ou não verificável sobre eles.',
    input_schema: { type: 'object' as const, properties: { company: { type: 'string' } }, required: ['company'] },
  },
  {
    name: 'get_website_metrics',
    description: 'Métricas do site de uma empresa (páginas, conteúdo, conversão, SEO) com a composição de cada score.',
    input_schema: { type: 'object' as const, properties: { company: { type: 'string' } }, required: ['company'] },
  },
  {
    name: 'get_competitive_matrix',
    description: 'Matriz competitiva do projeto: todas as dimensões para todas as empresas, com benchmarks contra a média dos concorrentes.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_offer_gap',
    description: 'GAP de oferta: quais produtos/serviços os concorrentes divulgam e a empresa do usuário não, e vice-versa.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_market_opportunities',
    description: 'Oportunidades já identificadas pela engine analítica do projeto, com evidências.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_market_threats',
    description: 'Ameaças identificadas pela engine analítica, incluindo Threat Score por concorrente e seus fatores.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_recommendations',
    description: 'Recomendações já geradas para o projeto, com problema, evidência, ação, prioridade e métrica de sucesso.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_evidence',
    description: 'Evidências registradas (URL, trecho, data da coleta, confiança) de uma empresa, para citar fonte.',
    input_schema: { type: 'object' as const, properties: { company: { type: 'string' }, limit: { type: 'number' } }, required: ['company'] },
  },
  {
    name: 'get_historical_data',
    description: 'Memória analítica: evolução dos scores competitivos do projeto ao longo do tempo.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_data_quality',
    description: 'Qualidade dos dados por empresa (completude, fontes, frescor, consistência) — use para calibrar o quanto afirmar.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
] as const;

export type ToolName = (typeof TOOL_DEFINITIONS)[number]['name'];

export async function executeTool(name: string, input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  try {
    await assertProject(ctx);
    switch (name) {
      case 'list_companies': {
        const companies = await prisma.company.findMany({
          where: { projectId: ctx.projectId },
          select: { id: true, name: true, role: true, website: true, city: true, lastCollectedAt: true },
          orderBy: [{ role: 'asc' }, { name: 'asc' }],
        });
        return { ok: true, data: companies };
      }
      case 'get_company_profile': {
        const self = await prisma.company.findFirst({ where: { projectId: ctx.projectId, role: 'SELF' } });
        if (!self) return { ok: false, error: 'Este projeto não tem uma empresa marcada como "minha empresa".' };
        return { ok: true, data: await loadCompanyView(self.id) };
      }
      case 'get_competitor_profile': {
        const company = await resolveCompany(ctx, String(input.company ?? ''));
        if (!company) return { ok: false, error: `Empresa "${input.company}" não encontrada neste projeto.` };
        return { ok: true, data: await loadCompanyView(company.id) };
      }
      case 'get_reviews': {
        const company = await resolveCompany(ctx, String(input.company ?? ''));
        if (!company) return { ok: false, error: `Empresa "${input.company}" não encontrada neste projeto.` };
        const view = await loadCompanyView(company.id);
        return { ok: true, data: { company: view.name, ...view.reputation } };
      }
      case 'get_price_history': {
        const company = await resolveCompany(ctx, String(input.company ?? ''));
        if (!company) return { ok: false, error: `Empresa "${input.company}" não encontrada neste projeto.` };
        const view = await loadCompanyView(company.id);
        return {
          ok: true,
          data: {
            company: view.name,
            available: Object.keys(view.priceHistory).length > 0,
            note: Object.keys(view.priceHistory).length === 0 ? 'Nenhum preço público foi encontrado nas páginas coletadas desta empresa.' : null,
            history: view.priceHistory,
          },
        };
      }
      case 'get_company_changes': {
        const company = await resolveCompany(ctx, String(input.company ?? ''));
        if (!company) return { ok: false, error: `Empresa "${input.company}" não encontrada neste projeto.` };
        const days = Number(input.days ?? 90);
        const since = new Date(Date.now() - days * 86_400_000);
        const changes = await prisma.companyChange.findMany({
          where: { companyId: company.id, observedAt: { gte: since } },
          orderBy: { observedAt: 'desc' },
          take: 100,
          select: { kind: true, impact: true, summary: true, previousValue: true, currentValue: true, observedAt: true, evidenceId: true },
        });
        const snapshots = await prisma.companySnapshot.count({ where: { companyId: company.id } });
        return {
          ok: true,
          data: {
            company: company.name,
            windowDays: days,
            snapshots,
            note: snapshots < 2 ? 'Só existe uma coleta desta empresa: ainda não há histórico para comparar.' : null,
            changes,
          },
        };
      }
      case 'get_social_metrics': {
        const company = await resolveCompany(ctx, String(input.company ?? ''));
        if (!company) return { ok: false, error: `Empresa "${input.company}" não encontrada neste projeto.` };
        const view = await loadCompanyView(company.id);
        return {
          ok: true,
          data: {
            company: view.name,
            profiles: view.social,
            note: 'Contagem de seguidores e frequência de publicação exigem APIs oficiais das plataformas e não são coletadas. Trate-as como não verificáveis.',
          },
        };
      }
      case 'get_website_metrics': {
        const company = await resolveCompany(ctx, String(input.company ?? ''));
        if (!company) return { ok: false, error: `Empresa "${input.company}" não encontrada neste projeto.` };
        const view = await loadCompanyView(company.id);
        return { ok: true, data: { company: view.name, website: view.website_metrics, seo: view.seo_metrics } };
      }
      case 'get_competitive_matrix': {
        const views = await loadProjectViews(ctx.projectId);
        const scores = computeScores(views);
        return {
          ok: true,
          data: {
            matrix: buildMatrix(scores),
            benchmarks: buildBenchmarks(scores),
            scores: scores.map((s) => ({ company: s.name, role: s.role, composite: s.composite.score, coverage: s.composite.coverage, threat: s.threat.score })),
          },
        };
      }
      case 'get_offer_gap': {
        const views = await loadProjectViews(ctx.projectId);
        return { ok: true, data: analyzeOfferGap(views) };
      }
      case 'get_market_opportunities': {
        const insights = await prisma.insight.findMany({
          where: { projectId: ctx.projectId, kind: 'OPPORTUNITY' },
          orderBy: { score: 'desc' },
          take: 30,
          select: { title: true, body: true, score: true, confidence: true, evidenceRefs: true },
        });
        return { ok: true, data: { count: insights.length, opportunities: insights } };
      }
      case 'get_market_threats': {
        const [insights, views] = await Promise.all([
          prisma.insight.findMany({ where: { projectId: ctx.projectId, kind: 'THREAT' }, orderBy: { score: 'desc' }, take: 30, select: { title: true, body: true, score: true, evidenceRefs: true } }),
          loadProjectViews(ctx.projectId),
        ]);
        const scores = computeScores(views);
        return {
          ok: true,
          data: {
            threats: insights,
            threatScores: scores.filter((s) => s.role === 'COMPETITOR').map((s) => ({ company: s.name, score: s.threat.score, factors: s.threat.factors, methodology: s.threat.methodology })),
          },
        };
      }
      case 'get_recommendations': {
        const recs = await prisma.recommendation.findMany({
          where: { projectId: ctx.projectId },
          orderBy: [{ impactValue: 'desc' }],
          take: 30,
          select: { problem: true, evidence: true, potentialImpact: true, action: true, successMetric: true, priority: true, effort: true, horizon: true },
        });
        return { ok: true, data: { count: recs.length, recommendations: recs } };
      }
      case 'get_evidence': {
        const company = await resolveCompany(ctx, String(input.company ?? ''));
        if (!company) return { ok: false, error: `Empresa "${input.company}" não encontrada neste projeto.` };
        const limit = Math.min(50, Number(input.limit ?? 20));
        const evidence = await prisma.evidence.findMany({
          where: { companyId: company.id },
          orderBy: { collectedAt: 'desc' },
          take: limit,
          select: { id: true, url: true, sourceKind: true, sourceLabel: true, excerpt: true, confidence: true, collectedAt: true },
        });
        return { ok: true, data: { company: company.name, evidence } };
      }
      case 'get_historical_data': {
        const metrics = await prisma.competitiveMetric.findMany({
          where: { projectId: ctx.projectId },
          orderBy: { computedAt: 'asc' },
          take: 400,
          select: { companyId: true, compositeScore: true, reputationScore: true, seoScore: true, presenceScore: true, threatScore: true, coverage: true, computedAt: true },
        });
        const companies = await prisma.company.findMany({ where: { projectId: ctx.projectId }, select: { id: true, name: true } });
        const byName = new Map(companies.map((c) => [c.id, c.name]));
        return {
          ok: true,
          data: {
            note: metrics.length < 2 ? 'Ainda não há histórico suficiente para comparar evolução: execute a análise novamente ao longo do tempo.' : null,
            series: metrics.map((m) => ({ company: byName.get(m.companyId) ?? m.companyId, ...m })),
          },
        };
      }
      case 'get_data_quality': {
        const views = await loadProjectViews(ctx.projectId);
        return { ok: true, data: views.map((v) => ({ company: v.name, ...computeDataQuality(v) })) };
      }
      default:
        return { ok: false, error: `Ferramenta desconhecida: ${name}` };
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
