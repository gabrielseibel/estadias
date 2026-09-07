import { AiRunKind, AiRunStatus, ReportStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { loadProjectViews } from './company-view.js';
import { buildBenchmarks, buildMatrix, computeScores } from './competitive.js';
import { analyzeOfferGap } from './gap.js';
import { runInsightEngine } from './insight-engine.js';
import { computeDataQuality } from './data-quality.js';

/**
 * RELATÓRIO EXECUTIVO — 14 seções, conforme a especificação.
 *
 * O relatório é montado a partir dos dados já persistidos. A síntese narrativa
 * da IA, quando existir, entra como seção adicional identificada como tal; sem
 * IA configurada o relatório sai completo assim mesmo, com o texto do motor
 * determinístico.
 */

export type ReportSection = {
  id: string;
  title: string;
  kind: 'text' | 'list' | 'table' | 'timeline' | 'kv';
  body?: string;
  items?: string[];
  table?: { headers: string[]; rows: (string | number | null)[][] };
  kv?: { label: string; value: string; note?: string }[];
  note?: string;
};

export type ReportDocument = {
  title: string;
  projectName: string;
  generatedAt: string;
  isDemo: boolean;
  aiEnriched: boolean;
  disclaimer: string;
  sections: ReportSection[];
};

const DISCLAIMER =
  'Este relatório foi produzido a partir de dados públicos coletados automaticamente pelo Radar Competitivo. Dados marcados como CONFIRMADOS foram encontrados em fontes públicas verificáveis, com URL e data de coleta registradas. Estimativas estão explicitamente rotuladas e acompanhadas da metodologia. Scores são analíticos e não representam faturamento, participação de mercado ou qualidade intrínseca das empresas. Informações não encontradas aparecem como "não disponível publicamente" — nenhum valor foi presumido.';

const fmt = (n: number | null | undefined, suffix = '') => (n === null || n === undefined ? 'Não disponível' : `${typeof n === 'number' ? Number(n.toFixed(1)) : n}${suffix}`);

export async function buildReport(projectId: string): Promise<ReportDocument> {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, include: { organization: true } });
  const views = await loadProjectViews(projectId);
  const scores = computeScores(views);
  const matrix = buildMatrix(scores);
  const benchmarks = buildBenchmarks(scores);
  const gap = analyzeOfferGap(views);
  const engine = runInsightEngine({ views, scores, benchmarks, gap });

  const self = views.find((v) => v.role === 'SELF');
  const selfScore = scores.find((s) => s.role === 'SELF');
  const competitors = views.filter((v) => v.role === 'COMPETITOR');

  const synthesis = await prisma.aiAnalysis.findFirst({
    where: { projectId, kind: AiRunKind.EXECUTIVE_SYNTHESIS, status: AiRunStatus.SUCCEEDED },
    orderBy: { createdAt: 'desc' },
  });

  const sections: ReportSection[] = [];

  // 1. Resumo executivo
  const ranked = [...scores].filter((s) => s.composite.score !== null).sort((a, b) => b.composite.score! - a.composite.score!);
  const position = self ? ranked.findIndex((s) => s.companyId === self.id) + 1 : 0;
  sections.push({
    id: 'resumo',
    title: '1. Resumo executivo',
    kind: 'text',
    body: [
      `Projeto "${project.name}" com ${competitors.length} concorrente(s) monitorado(s)${project.city ? ` em ${project.city}${project.state ? `/${project.state}` : ''}` : ''}.`,
      self && position > 0
        ? `${self.name} ocupa a ${position}ª posição de ${ranked.length} no score competitivo analítico (${fmt(selfScore?.composite.score ?? null)}/100, cobertura de dados ${Math.round((selfScore?.composite.coverage ?? 0) * 100)}%).`
        : 'Ainda não há score competitivo calculável para a sua empresa — execute uma análise.',
      `A engine identificou ${engine.swot.opportunities.length} oportunidade(s), ${engine.swot.threats.length} ameaça(s) e produziu ${engine.recommendations.length} recomendação(ões) com evidência associada.`,
      engine.notes.length ? `Ressalvas: ${engine.notes.join(' ')}` : '',
    ].filter(Boolean).join(' '),
  });

  // 2. Cenário competitivo
  sections.push({
    id: 'cenario',
    title: '2. Cenário competitivo',
    kind: 'table',
    table: {
      headers: ['Empresa', 'Papel', 'Score competitivo', 'Cobertura', 'Threat Score', 'Última coleta'],
      rows: scores.map((s) => {
        const view = views.find((v) => v.id === s.companyId)!;
        return [
          s.name,
          s.role === 'SELF' ? 'Minha empresa' : 'Concorrente',
          s.composite.score === null ? 'Não calculável' : `${s.composite.score}/100`,
          `${Math.round(s.composite.coverage * 100)}%`,
          s.threat.score === null ? 'Não aplicável' : `${s.threat.score}/100`,
          view.lastCollectedAt ? view.lastCollectedAt.toISOString().slice(0, 10) : 'Nunca coletada',
        ];
      }),
    },
    note: 'Score analítico baseado nos dados públicos disponíveis. A cobertura indica quanto do score pôde ser calculado com dados efetivamente coletados.',
  });

  // 3. Principais concorrentes
  sections.push({
    id: 'concorrentes',
    title: '3. Principais concorrentes',
    kind: 'list',
    items: competitors.map((c) => {
      const score = scores.find((s) => s.companyId === c.id)!;
      return `${c.name}${c.website ? ` (${c.website})` : ''} — score ${fmt(score.composite.score)}/100; ${c.offerings.length} ofertas identificadas; reputação: ${c.reputation.rating !== null ? `${c.reputation.rating.toFixed(1)}${c.reputation.reviewCount ? ` com ${c.reputation.reviewCount} avaliações` : ''}` : 'não disponível publicamente'}.`;
    }),
    note: competitors.length === 0 ? 'Nenhum concorrente cadastrado.' : undefined,
  });

  // 4 e 5. Forças e fraquezas
  sections.push({
    id: 'forcas',
    title: '4. Pontos fortes',
    kind: 'list',
    items: engine.swot.strengths.map((s) => `${s.title} — ${s.body}`),
    note: engine.swot.strengths.length === 0 ? 'Nenhuma força identificada com os dados disponíveis.' : undefined,
  });
  sections.push({
    id: 'fraquezas',
    title: '5. Pontos fracos',
    kind: 'list',
    items: engine.swot.weaknesses.map((s) => `${s.title} — ${s.body}`),
    note: engine.swot.weaknesses.length === 0 ? 'Nenhuma fraqueza identificada com os dados disponíveis.' : undefined,
  });

  // 6. Reputação
  sections.push({
    id: 'reputacao',
    title: '6. Reputação',
    kind: 'table',
    table: {
      headers: ['Empresa', 'Nota', 'Avaliações', 'Elogios recorrentes', 'Reclamações recorrentes', 'Fonte'],
      rows: views.map((v) => [
        v.name,
        v.reputation.rating !== null ? v.reputation.rating.toFixed(1) : 'Não disponível',
        v.reputation.reviewCount ?? 'Não disponível',
        v.reputation.themes.filter((t) => t.polarity === 'POSITIVE').slice(0, 3).map((t) => t.theme).join(', ') || '—',
        v.reputation.themes.filter((t) => t.polarity === 'NEGATIVE').slice(0, 3).map((t) => t.theme).join(', ') || '—',
        v.reputation.sources[0]?.sourceLabel ?? 'Nenhuma fonte coletada',
      ]),
    },
    note: 'Portais de avaliação de terceiros exigem integração própria ou API oficial. Onde não houver fonte coletada, o campo permanece "não disponível" — nenhum valor foi estimado.',
  });

  // 7. Oferta (GAP)
  sections.push({
    id: 'oferta',
    title: '7. Oferta',
    kind: 'table',
    table: gap.available
      ? {
          headers: ['Oferta', self?.name ?? 'Minha empresa', ...competitors.map((c) => c.name)],
          rows: gap.rows.slice(0, 40).map((row) => [row.label, row.self ? '✓' : '✗', ...row.competitors.map((c) => (c.has ? '✓' : '✗'))]),
        }
      : { headers: ['Oferta'], rows: [] },
    note: gap.available
      ? `${gap.missingInSelf.length} oferta(s) presente(s) na maioria dos concorrentes e ausente(s) na sua empresa; ${gap.exclusiveToSelf.length} diferencial(is) exclusivo(s) seu(s).`
      : gap.note ?? undefined,
  });

  // 8. Marketing e comunicação
  sections.push({
    id: 'marketing',
    title: '8. Marketing',
    kind: 'table',
    table: {
      headers: ['Empresa', 'Canais sociais', 'Blog', 'Publicações observadas', 'Cadência', 'CTAs no site'],
      rows: views.map((v) => [
        v.name,
        v.social.map((s) => s.platform).join(', ') || 'Nenhum identificado',
        v.website_metrics?.hasBlog ? 'Sim' : 'Não identificado',
        v.website_metrics?.blogPostsSeen ?? 0,
        v.website_metrics?.publishIntervalDays ? `~${v.website_metrics.publishIntervalDays} dias` : 'Não verificável',
        v.website_metrics?.ctaCount ?? 0,
      ]),
    },
    note: 'Investimento em mídia paga, alcance e seguidores não são coletados: exigem APIs oficiais das plataformas.',
  });

  // 9. Presença digital
  sections.push({
    id: 'presenca',
    title: '9. Presença digital',
    kind: 'table',
    table: {
      headers: ['Empresa', 'Score do site', 'Score de SEO', 'Páginas conhecidas', 'HTTPS', 'Dados estruturados'],
      rows: views.map((v) => [
        v.name,
        fmt(v.website_metrics?.score ?? null),
        fmt(v.seo_metrics?.score ?? null),
        v.website_metrics?.pagesDiscovered ?? 0,
        v.website_metrics?.httpsOk ? 'Sim' : 'Não',
        v.seo_metrics?.structuredDataTypes.slice(0, 4).join(', ') || 'Nenhum',
      ]),
    },
  });

  // 10. Mudanças recentes
  const changes = views.flatMap((v) => v.changes.map((c) => ({ company: v.name, ...c }))).sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime()).slice(0, 30);
  sections.push({
    id: 'mudancas',
    title: '10. Mudanças recentes',
    kind: 'timeline',
    items: changes.map((c) => `${c.observedAt.toISOString().slice(0, 10)} — ${c.company}: ${c.summary}`),
    note: changes.length === 0 ? 'Nenhuma mudança detectada ainda. A detecção compara coletas sucessivas: execute a análise novamente ao longo do tempo.' : undefined,
  });

  // 11 e 12. Oportunidades e ameaças
  sections.push({
    id: 'oportunidades',
    title: '11. Oportunidades',
    kind: 'list',
    items: engine.swot.opportunities.map((o) => `[${o.score >= 70 ? 'ALTA' : o.score >= 45 ? 'MÉDIA' : 'BAIXA'}] ${o.title} — ${o.body}`),
    note: engine.swot.opportunities.length === 0 ? 'Nenhuma oportunidade identificada com os dados atuais.' : undefined,
  });
  sections.push({
    id: 'ameacas',
    title: '12. Ameaças',
    kind: 'list',
    items: engine.swot.threats.map((t) => `${t.title} — ${t.body}`),
    note: engine.swot.threats.length === 0 ? 'Nenhuma ameaça identificada com os dados atuais.' : undefined,
  });

  // 13. Recomendações
  sections.push({
    id: 'recomendacoes',
    title: '13. Recomendações',
    kind: 'table',
    table: {
      headers: ['Prioridade', 'Problema', 'Evidência', 'Ação', 'Impacto potencial', 'Esforço', 'Prazo', 'Métrica de sucesso'],
      rows: engine.recommendations.slice(0, 20).map((r) => [
        r.priority, r.problem, r.evidence, r.action, r.potentialImpact, r.effort,
        r.horizon === 'D7' ? '7 dias' : r.horizon === 'D30' ? '30 dias' : '90 dias',
        r.successMetric,
      ]),
    },
  });

  // 14. Plano de ação
  sections.push({
    id: 'plano',
    title: '14. Plano de ação',
    kind: 'list',
    items: engine.actionPlan.flatMap((block) => [
      `── Próximos ${block.horizon === 'D7' ? '7' : block.horizon === 'D30' ? '30' : '90'} dias ──`,
      ...block.items.map((r, i) => `${i + 1}. ${r.action} | Justificativa: ${r.problem} | Evidência: ${r.evidence} | Esforço: ${r.effort} | Prioridade: ${r.priority} | Métrica: ${r.successMetric}`),
      ...(block.items.length === 0 ? ['Nenhuma ação disponível para este horizonte com os dados atuais.'] : []),
    ]),
  });

  // Qualidade dos dados (transparência de método)
  sections.push({
    id: 'qualidade',
    title: 'Anexo A — Qualidade dos dados',
    kind: 'table',
    table: {
      headers: ['Empresa', 'Data Quality Score', 'Fontes', 'Última coleta (dias)', 'Observação'],
      rows: views.map((v) => {
        const dq = computeDataQuality(v);
        return [v.name, `${dq.score}/100`, dq.sourcesCount, dq.freshnessDays === null ? 'Nunca' : dq.freshnessDays.toFixed(1), dq.breakdown.find((b) => b.value < 0.5)?.detail ?? 'Sem restrições relevantes.'];
      }),
    },
  });

  // Fontes
  sections.push({
    id: 'fontes',
    title: 'Anexo B — Fontes consultadas',
    kind: 'list',
    items: views.flatMap((v) => v.sources.slice(0, 12).map((s) => `${v.name}: ${s.url}${s.lastSeenAt ? ` (coletado em ${s.lastSeenAt.toISOString().slice(0, 10)})` : ''}`)),
    note: 'Toda afirmação deste relatório pode ser rastreada até uma destas fontes na plataforma.',
  });

  if (synthesis?.answer) {
    sections.splice(1, 0, {
      id: 'sintese-ia',
      title: '1b. Síntese do Competitive Analyst (IA)',
      kind: 'text',
      body: synthesis.answer,
      note: `Gerada pelo modelo ${synthesis.model ?? 'configurado'} em ${synthesis.createdAt.toISOString().slice(0, 10)}, restrita aos dados retornados pelas ferramentas da plataforma e submetida ao verificador de fundamentação antes da publicação.`,
    });
  }

  return {
    title: `Relatório de Inteligência Competitiva — ${project.name}`,
    projectName: project.name,
    generatedAt: new Date().toISOString(),
    isDemo: project.organization.isDemo,
    aiEnriched: Boolean(synthesis?.answer),
    disclaimer: DISCLAIMER,
    sections,
  };
}

export async function persistReport(projectId: string, organizationId: string) {
  const doc = await buildReport(projectId);
  return prisma.report.create({
    data: {
      organizationId,
      projectId,
      title: doc.title,
      status: ReportStatus.READY,
      content: doc as never,
      aiEnriched: doc.aiEnriched,
    },
  });
}
