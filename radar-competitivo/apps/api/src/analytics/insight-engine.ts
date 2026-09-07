import { DataNature, Effort, Horizon, InsightKind, Priority } from '@prisma/client';
import type { CompanyView } from './company-view.js';
import type { Benchmark, CompanyScores, DimensionKey } from './competitive.js';
import { DIMENSION_LABELS } from './competitive.js';
import type { GapAnalysis } from './gap.js';

/**
 * RADAR DE OPORTUNIDADES / AMEAÇAS / SWOT / RECOMENDAÇÕES.
 *
 * Motor determinístico: cada saída nasce de uma regra explícita sobre dados
 * coletados e carrega a evidência que a sustenta. É isso que permite que a
 * plataforma funcione sem depender de um LLM — e que a IA, quando configurada,
 * seja auditável, porque trabalha sobre estas mesmas estruturas.
 *
 * Nenhuma regra inventa número: se o dado não existe, a regra não dispara.
 */

export type EngineInsight = {
  kind: InsightKind;
  title: string;
  body: string;
  companyId?: string;
  evidenceRefs: { label: string; url?: string; value?: string; evidenceId?: string }[];
  confidence: number;
  score: number;
  dedupeKey: string;
  nature: DataNature;
};

export type EngineRecommendation = {
  problem: string;
  evidence: string;
  potentialImpact: string;
  action: string;
  successMetric: string;
  priority: Priority;
  effort: Effort;
  horizon: Horizon;
  companyId?: string;
  evidenceRefs: { label: string; url?: string; evidenceId?: string }[];
  impactValue: number;
  effortValue: number;
  dedupeKey: string;
};

export type EngineOutput = {
  insights: EngineInsight[];
  recommendations: EngineRecommendation[];
  swot: {
    strengths: EngineInsight[];
    weaknesses: EngineInsight[];
    opportunities: EngineInsight[];
    threats: EngineInsight[];
  };
  actionPlan: { horizon: Horizon; items: EngineRecommendation[] }[];
  notes: string[];
};

const EFFORT_VALUE: Record<Effort, number> = { LOW: 1, MEDIUM: 2, HIGH: 3 };

function priorityFromImpact(impact: number, effort: Effort): Priority {
  if (impact >= 80 && effort !== 'HIGH') return Priority.CRITICAL;
  if (impact >= 60) return Priority.HIGH;
  if (impact >= 35) return Priority.MEDIUM;
  return Priority.LOW;
}

const pct = (n: number) => `${Math.round(n * 100)}`;

export function runInsightEngine(input: {
  views: CompanyView[];
  scores: CompanyScores[];
  benchmarks: Benchmark[];
  gap: GapAnalysis;
}): EngineOutput {
  const { views, scores, benchmarks, gap } = input;
  const insights: EngineInsight[] = [];
  const recommendations: EngineRecommendation[] = [];
  const notes: string[] = [];

  const self = views.find((v) => v.role === 'SELF');
  const selfScore = scores.find((s) => s.role === 'SELF');
  const competitors = views.filter((v) => v.role === 'COMPETITOR');
  const competitorScores = scores.filter((s) => s.role === 'COMPETITOR');

  if (!self) {
    notes.push('Nenhuma empresa marcada como "minha empresa" neste projeto: as análises comparativas ficam indisponíveis.');
    return { insights, recommendations, swot: { strengths: [], weaknesses: [], opportunities: [], threats: [] }, actionPlan: [], notes };
  }
  if (competitors.length === 0) {
    notes.push('Nenhum concorrente cadastrado: adicione concorrentes para gerar comparações.');
  }

  // ── 1. Forças e fraquezas por dimensão (benchmark) ─────────────────────────
  for (const bench of benchmarks) {
    if (bench.self === null || bench.competitorAverage === null) continue;
    const delta = bench.deltaVsAveragePct;
    if (delta === null) continue;

    if (delta >= 12) {
      insights.push({
        kind: InsightKind.STRENGTH,
        title: `${bench.label}: ${delta.toFixed(0)}% acima da média dos concorrentes`,
        body: `Em ${bench.label.toLowerCase()}, ${self.name} pontua ${pct(bench.self)} contra ${pct(bench.competitorAverage)} da média de ${bench.sampleSize} concorrentes com dado disponível.`,
        evidenceRefs: [{ label: `${self.name} — ${bench.label}`, value: pct(bench.self) }, { label: 'Média dos concorrentes', value: pct(bench.competitorAverage) }],
        confidence: 0.75,
        score: Math.min(100, Math.abs(delta)),
        dedupeKey: `strength:${bench.dimension}`,
        nature: DataNature.ANALYSIS,
      });
    } else if (delta <= -12) {
      const best = bench.bestCompetitor;
      insights.push({
        kind: InsightKind.WEAKNESS,
        title: `${bench.label}: ${Math.abs(delta).toFixed(0)}% abaixo da média dos concorrentes`,
        body: `Em ${bench.label.toLowerCase()}, ${self.name} pontua ${pct(bench.self)} contra ${pct(bench.competitorAverage)} da média${best ? `; o melhor observado é ${best.name} com ${pct(best.value)}` : ''}.`,
        evidenceRefs: [
          { label: `${self.name} — ${bench.label}`, value: pct(bench.self) },
          { label: 'Média dos concorrentes', value: pct(bench.competitorAverage) },
          ...(best ? [{ label: `Melhor concorrente: ${best.name}`, value: pct(best.value) }] : []),
        ],
        confidence: 0.75,
        score: Math.min(100, Math.abs(delta)),
        dedupeKey: `weakness:${bench.dimension}`,
        nature: DataNature.ANALYSIS,
      });

      const rec = recommendationForDimension(bench.dimension, self, bench, views);
      if (rec) recommendations.push(rec);
    }
  }

  // ── 2. GAP de oferta ───────────────────────────────────────────────────────
  for (const row of gap.missingInSelf.slice(0, 8)) {
    const offering = row.competitors.filter((c) => c.has);
    const impact = Math.min(95, 40 + row.competitorsWithCount * 18);
    insights.push({
      kind: InsightKind.OPPORTUNITY,
      title: `Oferta ausente: ${row.label}`,
      body: `"${row.label}" é divulgado por ${row.competitorsWithCount} de ${gap.competitorCount} concorrentes analisados (${row.coveragePct}%) e não aparece na oferta pública de ${self.name}.`,
      evidenceRefs: offering.map((c) => ({ label: `${c.name} divulga "${row.label}"`, url: c.url ?? undefined, evidenceId: c.evidenceId ?? undefined })),
      confidence: 0.8,
      score: impact,
      dedupeKey: `gap:${row.normalized}`,
      nature: DataNature.ANALYSIS,
    });

    recommendations.push({
      problem: `"${row.label}" não aparece na oferta pública de ${self.name}, enquanto ${row.competitorsWithCount} de ${gap.competitorCount} concorrentes divulgam esse item.`,
      evidence: offering.map((c) => `${c.name}: ${c.url ?? 'página de serviços'}`).join(' | '),
      potentialImpact: `Recuperar visibilidade em uma demanda que ${row.coveragePct}% dos concorrentes já comunicam. Se a empresa já executa esse serviço, o custo é apenas de comunicação.`,
      action: `Verificar se ${self.name} já presta "${row.label}". Se sim, criar uma página dedicada em ${self.website ?? 'seu site'} com escopo, público e chamada para ação. Se não, avaliar viabilidade de incluir na carteira.`,
      successMetric: `Página de "${row.label}" publicada e indexada; contatos originados dessa página nos primeiros 60 dias.`,
      priority: priorityFromImpact(impact, Effort.MEDIUM),
      effort: Effort.MEDIUM,
      horizon: row.competitorsWithCount >= gap.competitorCount ? Horizon.D30 : Horizon.D90,
      evidenceRefs: offering.map((c) => ({ label: `${c.name} — ${row.label}`, url: c.url ?? undefined, evidenceId: c.evidenceId ?? undefined })),
      impactValue: impact,
      effortValue: EFFORT_VALUE.MEDIUM,
      dedupeKey: `rec:gap:${row.normalized}`,
    });
  }

  for (const row of gap.exclusiveToSelf.slice(0, 5)) {
    insights.push({
      kind: InsightKind.STRENGTH,
      title: `Diferencial exclusivo: ${row.label}`,
      body: `"${row.label}" aparece na oferta pública de ${self.name} e em nenhum dos ${gap.competitorCount} concorrentes analisados.`,
      evidenceRefs: [{ label: `${self.name} — ${row.label}` }],
      confidence: 0.7,
      score: 55,
      dedupeKey: `exclusive:${row.normalized}`,
      nature: DataNature.ANALYSIS,
    });
  }

  // ── 3. Voz do cliente: reclamações recorrentes dos concorrentes ────────────
  const complaintIndex = new Map<string, { mentions: number; companies: string[] }>();
  for (const competitor of competitors) {
    for (const theme of competitor.reputation.themes) {
      if (theme.polarity !== 'NEGATIVE' || theme.mentions < 2) continue;
      const entry = complaintIndex.get(theme.theme) ?? { mentions: 0, companies: [] };
      entry.mentions += theme.mentions;
      entry.companies.push(competitor.name);
      complaintIndex.set(theme.theme, entry);
    }
  }
  for (const [theme, data] of complaintIndex) {
    if (data.companies.length < 2) continue;
    const impact = Math.min(90, 45 + data.companies.length * 12);
    insights.push({
      kind: InsightKind.OPPORTUNITY,
      title: `Reclamação recorrente no mercado: ${theme}`,
      body: `Clientes de ${data.companies.length} concorrentes (${data.companies.join(', ')}) mencionam "${theme}" de forma negativa em ${data.mentions} avaliações analisadas. Uma dor compartilhada pelo mercado é espaço de posicionamento.`,
      evidenceRefs: data.companies.map((name) => ({ label: `Avaliações analisadas de ${name}` })),
      confidence: 0.65,
      score: impact,
      dedupeKey: `voc:${theme}`,
      nature: DataNature.ANALYSIS,
    });
    recommendations.push({
      problem: `"${theme}" aparece como reclamação recorrente nas avaliações de ${data.companies.length} concorrentes, indicando uma insatisfação não resolvida no mercado local.`,
      evidence: `${data.mentions} menções negativas ao tema "${theme}" nas avaliações analisadas de: ${data.companies.join(', ')}.`,
      potentialImpact: 'Posicionamento diferenciado sobre uma dor já validada por clientes da concorrência, sem necessidade de criar demanda nova.',
      action: `Transformar "${theme}" em promessa explícita de ${self.name}: definir um compromisso mensurável (por exemplo, prazo garantido), publicá-lo no site e usá-lo como mensagem principal em campanhas locais por 30 dias.`,
      successMetric: `Menções positivas ao tema "${theme}" nas próprias avaliações de ${self.name}; taxa de contato originada da página que comunica o compromisso.`,
      priority: priorityFromImpact(impact, Effort.MEDIUM),
      effort: Effort.MEDIUM,
      horizon: Horizon.D30,
      evidenceRefs: data.companies.map((name) => ({ label: `Reclamações sobre ${theme} — ${name}` })),
      impactValue: impact,
      effortValue: EFFORT_VALUE.MEDIUM,
      dedupeKey: `rec:voc:${theme}`,
    });
  }

  // ── 4. Fraquezas próprias reveladas pelas avaliações ───────────────────────
  for (const theme of self.reputation.themes) {
    if (theme.polarity !== 'NEGATIVE' || theme.mentions < 2) continue;
    insights.push({
      kind: InsightKind.WEAKNESS,
      title: `Clientes reclamam de "${theme.theme}"`,
      body: `${theme.mentions} avaliações analisadas de ${self.name} mencionam "${theme.theme}" negativamente${theme.sampleQuote ? `. Exemplo: "${theme.sampleQuote}"` : '.'}`,
      evidenceRefs: [{ label: 'Avaliações coletadas', value: `${theme.mentions} menções` }],
      confidence: 0.7,
      score: Math.min(85, 40 + theme.mentions * 8),
      dedupeKey: `self-weak:${theme.theme}`,
      nature: DataNature.ANALYSIS,
    });
  }

  // ── 5. Ameaças: movimentos recentes dos concorrentes ──────────────────────
  for (const competitor of competitorScores) {
    if (competitor.threat.score === null || competitor.threat.score < 20) continue;
    const view = competitors.find((c) => c.id === competitor.companyId)!;
    insights.push({
      kind: InsightKind.THREAT,
      title: `${competitor.name}: Threat Score ${competitor.threat.score}/100`,
      body: `${competitor.threat.factors.map((f) => f.detail).join(' ')}`,
      companyId: competitor.companyId,
      evidenceRefs: view.changes.slice(0, 5).map((c) => ({ label: c.summary, evidenceId: c.evidenceId ?? undefined })),
      confidence: 0.7,
      score: competitor.threat.score,
      dedupeKey: `threat:${competitor.companyId}`,
      nature: DataNature.ANALYSIS,
    });
  }

  // Concorrente muito à frente em reputação é ameaça estrutural.
  const selfReputation = selfScore?.dimensions.reputation.value ?? null;
  if (selfReputation !== null) {
    for (const competitor of competitorScores) {
      const value = competitor.dimensions.reputation.value;
      if (value === null || value - selfReputation < 0.15) continue;
      insights.push({
        kind: InsightKind.THREAT,
        title: `${competitor.name} tem reputação superior`,
        body: `${competitor.dimensions.reputation.detail} Em comparação, ${self.name}: ${selfScore!.dimensions.reputation.detail}`,
        companyId: competitor.companyId,
        evidenceRefs: [{ label: `${competitor.name} — reputação`, value: pct(value) }, { label: `${self.name} — reputação`, value: pct(selfReputation) }],
        confidence: 0.75,
        score: Math.round((value - selfReputation) * 100),
        dedupeKey: `threat-reputation:${competitor.companyId}`,
        nature: DataNature.ANALYSIS,
      });
    }
  }

  // ── 6. Preços: volatilidade observada ─────────────────────────────────────
  for (const competitor of competitors) {
    for (const [label, history] of Object.entries(competitor.priceHistory)) {
      const recent = history.filter((h) => (Date.now() - h.observedAt.getTime()) / 86_400_000 <= 60);
      if (recent.length < 2) continue;
      // Mudança de preço exige observações em coletas distintas. Dois valores
      // vistos na mesma coleta são itens diferentes na mesma página, não uma
      // alteração ao longo do tempo.
      const distinctDays = new Set(recent.map((h) => h.observedAt.toISOString().slice(0, 10)));
      if (distinctDays.size < 2) continue;
      const changes = recent.filter((h, i) => i > 0 && h.amount !== recent[i - 1].amount).length;
      if (changes === 0) continue;
      insights.push({
        kind: InsightKind.TREND,
        title: `${competitor.name} mexeu em preços`,
        body: `O preço observado de "${label.slice(0, 60)}" mudou ${changes} vez(es) nos últimos 60 dias: ${recent.map((h) => `${h.observedAt.toISOString().slice(0, 10)} R$ ${h.amount.toFixed(2)}`).join(' → ')}.`,
        companyId: competitor.id,
        evidenceRefs: [{ label: `Histórico de preço — ${competitor.name}` }],
        confidence: 0.8,
        score: 50 + changes * 10,
        dedupeKey: `price-trend:${competitor.id}:${label.slice(0, 40)}`,
        nature: DataNature.ANALYSIS,
      });
    }
  }

  // ── 7. Lacunas de conteúdo e SEO ──────────────────────────────────────────
  const selfKeywords = new Set((self.seo_metrics?.keywords ?? []).map((k) => k.term));
  const competitorTerms = new Map<string, { count: number; companies: Set<string> }>();
  for (const competitor of competitors) {
    for (const kw of competitor.seo_metrics?.keywords ?? []) {
      if (selfKeywords.has(kw.term) || kw.term.length < 5) continue;
      const entry = competitorTerms.get(kw.term) ?? { count: 0, companies: new Set<string>() };
      entry.count += kw.count;
      entry.companies.add(competitor.name);
      competitorTerms.set(kw.term, entry);
    }
  }
  const contentGaps = [...competitorTerms.entries()]
    .filter(([, v]) => v.companies.size >= 2)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 6);

  if (contentGaps.length > 0 && self.seo_metrics) {
    insights.push({
      kind: InsightKind.OPPORTUNITY,
      title: 'Termos que os concorrentes usam e você não',
      body: `Os seguintes termos aparecem no conteúdo de pelo menos 2 concorrentes e não aparecem entre os termos relevantes do site de ${self.name}: ${contentGaps.map(([term]) => `"${term}"`).join(', ')}.`,
      evidenceRefs: contentGaps.map(([term, v]) => ({ label: `"${term}" — ${[...v.companies].join(', ')}`, value: `${v.count} ocorrências` })),
      confidence: 0.6,
      score: 55,
      dedupeKey: 'content-gap:terms',
      nature: DataNature.ANALYSIS,
    });
    recommendations.push({
      problem: `O conteúdo público de ${self.name} não trabalha termos que aparecem de forma recorrente nos sites de pelo menos dois concorrentes.`,
      evidence: contentGaps.map(([term, v]) => `"${term}" (${v.count} ocorrências em ${[...v.companies].join(', ')})`).join('; '),
      potentialImpact: 'Ampliar a superfície de busca do site em temas que o mercado local já comunica.',
      action: `Produzir uma página ou artigo para os 3 termos mais recorrentes (${contentGaps.slice(0, 3).map(([t]) => `"${t}"`).join(', ')}), cada um com título, meta description e H1 próprios.`,
      successMetric: 'Páginas publicadas e indexadas; evolução do score de SEO na próxima coleta do Radar.',
      priority: Priority.MEDIUM,
      effort: Effort.MEDIUM,
      horizon: Horizon.D90,
      evidenceRefs: contentGaps.map(([term]) => ({ label: `Termo: ${term}` })),
      impactValue: 55,
      effortValue: EFFORT_VALUE.MEDIUM,
      dedupeKey: 'rec:content-gap',
    });
  }

  // ── 8. Higiene técnica do próprio site ────────────────────────────────────
  if (self.website_metrics) {
    const w = self.website_metrics;
    if (!w.hasContactForm && !w.hasWhatsapp) {
      recommendations.push({
        problem: `O site de ${self.name} não apresenta formulário de contato nem link de WhatsApp nas páginas coletadas — o visitante interessado não tem caminho direto de conversão.`,
        evidence: `Coleta de ${w.pagesCrawled} páginas do site: nenhum formulário de contato identificado; nenhum link para WhatsApp encontrado.`,
        potentialImpact: 'Toda visita qualificada que chega ao site hoje depende do usuário procurar telefone ou e-mail por conta própria.',
        action: 'Adicionar formulário curto (nome, contato, necessidade) na página de serviços e botão de WhatsApp fixo no rodapé e no topo.',
        successMetric: 'Número de contatos recebidos pelo formulário/WhatsApp por semana após a publicação.',
        priority: Priority.CRITICAL,
        effort: Effort.LOW,
        horizon: Horizon.D7,
        evidenceRefs: [{ label: 'Métricas do site coletadas', url: self.website ?? undefined }],
        impactValue: 85,
        effortValue: EFFORT_VALUE.LOW,
        dedupeKey: 'rec:no-conversion-path',
      });
    }
    if (!w.httpsOk) {
      recommendations.push({
        problem: `O site de ${self.name} respondeu à coleta sem HTTPS.`,
        evidence: `A coleta acessou o site por HTTP em ${self.website ?? 'endereço cadastrado'}.`,
        potentialImpact: 'Navegadores marcam o site como não seguro, o que afeta confiança e posicionamento.',
        action: 'Instalar certificado TLS e forçar redirecionamento de HTTP para HTTPS.',
        successMetric: 'Site acessível por HTTPS sem aviso de segurança na próxima coleta.',
        priority: Priority.CRITICAL,
        effort: Effort.LOW,
        horizon: Horizon.D7,
        evidenceRefs: [{ label: 'Coleta do site', url: self.website ?? undefined }],
        impactValue: 80,
        effortValue: EFFORT_VALUE.LOW,
        dedupeKey: 'rec:no-https',
      });
    }
    if (self.seo_metrics && self.seo_metrics.descriptionCoverage !== null && self.seo_metrics.descriptionCoverage < 0.6) {
      recommendations.push({
        problem: `${Math.round((1 - self.seo_metrics.descriptionCoverage) * 100)}% das páginas coletadas de ${self.name} não têm meta description.`,
        evidence: `Cobertura de meta description observada: ${Math.round(self.seo_metrics.descriptionCoverage * 100)}% em ${w.pagesCrawled} páginas coletadas.`,
        potentialImpact: 'A descrição exibida no resultado de busca passa a ser escolhida pelo buscador, sem controle da empresa.',
        action: 'Escrever meta description de 140–160 caracteres para as páginas de serviços, produtos e home, cada uma com a proposta de valor específica da página.',
        successMetric: 'Cobertura de meta description acima de 90% na próxima coleta.',
        priority: Priority.MEDIUM,
        effort: Effort.LOW,
        horizon: Horizon.D30,
        evidenceRefs: [{ label: 'Métricas de SEO coletadas', url: self.website ?? undefined }],
        impactValue: 45,
        effortValue: EFFORT_VALUE.LOW,
        dedupeKey: 'rec:meta-description',
      });
    }
    if (!w.hasBlog && competitors.some((c) => c.website_metrics?.hasBlog)) {
      const withBlog = competitors.filter((c) => c.website_metrics?.hasBlog);
      recommendations.push({
        problem: `${self.name} não mantém conteúdo editorial identificável, enquanto ${withBlog.length} concorrente(s) publicam regularmente.`,
        evidence: withBlog.map((c) => `${c.name}: ${c.website_metrics!.blogPostsSeen} publicações observadas${c.website_metrics!.publishIntervalDays ? `, cadência ~${c.website_metrics!.publishIntervalDays} dias` : ''}`).join('; '),
        potentialImpact: 'Conteúdo é o principal caminho para aparecer em buscas informacionais do segmento antes da decisão de compra.',
        action: 'Publicar 2 artigos por mês respondendo às dúvidas mais frequentes recebidas no atendimento, começando pelas que já viram objeção de venda.',
        successMetric: 'Cadência de publicação mantida por 90 dias; evolução do score de conteúdo na matriz competitiva.',
        priority: Priority.MEDIUM,
        effort: Effort.HIGH,
        horizon: Horizon.D90,
        evidenceRefs: withBlog.map((c) => ({ label: `Blog de ${c.name}`, url: c.website ?? undefined })),
        impactValue: 50,
        effortValue: EFFORT_VALUE.HIGH,
        dedupeKey: 'rec:no-blog',
      });
    }
  }

  // ── 9. Reputação: pedido sistemático de avaliações ────────────────────────
  const selfReviews = self.reputation.reviewCount;
  const competitorReviewCounts = competitors.map((c) => c.reputation.reviewCount).filter((n): n is number => n !== null);
  if (selfReviews !== null && competitorReviewCounts.length >= 2) {
    const avg = competitorReviewCounts.reduce((a, b) => a + b, 0) / competitorReviewCounts.length;
    if (selfReviews < avg * 0.6) {
      const impact = 70;
      recommendations.push({
        problem: `${self.name} tem ${selfReviews} avaliações públicas contra uma média de ${Math.round(avg)} entre os concorrentes analisados.`,
        evidence: competitors.filter((c) => c.reputation.reviewCount !== null).map((c) => `${c.name}: ${c.reputation.reviewCount} avaliações`).join('; '),
        potentialImpact: 'Volume de avaliações é o principal sinal de confiança consultado antes do primeiro contato — a diferença atual favorece o concorrente na comparação feita pelo cliente.',
        action: 'Criar rotina de solicitação de avaliação ao final de cada atendimento concluído (mensagem padrão com link direto), com responsável e meta semanal definidos.',
        successMetric: `Chegar a ${Math.round(avg)} avaliações públicas; acompanhar a evolução do volume nas próximas coletas do Radar.`,
        priority: priorityFromImpact(impact, Effort.LOW),
        effort: Effort.LOW,
        horizon: Horizon.D7,
        evidenceRefs: competitors.map((c) => ({ label: `${c.name}: ${c.reputation.reviewCount ?? 'sem dado'} avaliações` })),
        impactValue: impact,
        effortValue: EFFORT_VALUE.LOW,
        dedupeKey: 'rec:review-volume',
      });
    }
  } else if (selfReviews === null) {
    notes.push('Nenhuma fonte pública de avaliações foi coletada para sua empresa: as comparações de reputação ficam limitadas.');
  }

  // ── Saída ordenada ─────────────────────────────────────────────────────────
  insights.sort((a, b) => b.score - a.score);
  recommendations.sort((a, b) => b.impactValue - a.impactValue || a.effortValue - b.effortValue);

  const swot = {
    strengths: insights.filter((i) => i.kind === InsightKind.STRENGTH),
    weaknesses: insights.filter((i) => i.kind === InsightKind.WEAKNESS),
    opportunities: insights.filter((i) => i.kind === InsightKind.OPPORTUNITY),
    threats: insights.filter((i) => i.kind === InsightKind.THREAT),
  };

  // Plano de ação: 3 ações em 7 dias, 5 em 30, 10 em 90 — conforme a
  // especificação. Só entra o que a engine conseguiu justificar com dados.
  const actionPlan = [
    { horizon: Horizon.D7, items: pickForHorizon(recommendations, Horizon.D7, 3) },
    { horizon: Horizon.D30, items: pickForHorizon(recommendations, Horizon.D30, 5) },
    { horizon: Horizon.D90, items: pickForHorizon(recommendations, Horizon.D90, 10) },
  ];

  return { insights, recommendations, swot, actionPlan, notes };
}

/**
 * Preenche o horizonte com as recomendações daquele prazo; se faltarem, puxa as
 * de prazos mais longos por ordem de impacto — sem nunca inventar ações.
 */
function pickForHorizon(all: EngineRecommendation[], horizon: Horizon, limit: number): EngineRecommendation[] {
  const order: Horizon[] = [Horizon.D7, Horizon.D30, Horizon.D90];
  const idx = order.indexOf(horizon);
  const primary = all.filter((r) => r.horizon === horizon);
  if (primary.length >= limit) return primary.slice(0, limit);
  const fallback = all.filter((r) => order.indexOf(r.horizon) > idx);
  return [...primary, ...fallback].slice(0, limit);
}

function recommendationForDimension(
  dimension: DimensionKey,
  self: CompanyView,
  bench: Benchmark,
  views: CompanyView[],
): EngineRecommendation | null {
  const best = bench.bestCompetitor;
  const bestView = best ? views.find((v) => v.name === best.name) : undefined;
  const gapPct = Math.abs(bench.deltaVsAveragePct ?? 0);
  const impact = Math.min(90, 35 + gapPct);
  const label = DIMENSION_LABELS[dimension];

  const base = {
    evidence: `${self.name}: ${pct(bench.self ?? 0)} pontos em ${label.toLowerCase()}; média dos concorrentes: ${pct(bench.competitorAverage ?? 0)}${best ? `; melhor: ${best.name} com ${pct(best.value)}` : ''} (amostra de ${bench.sampleSize} concorrentes com dado disponível).`,
    priority: priorityFromImpact(impact, Effort.MEDIUM),
    impactValue: impact,
    effortValue: EFFORT_VALUE.MEDIUM,
    evidenceRefs: [
      { label: `${self.name} — ${label}` },
      ...(bestView ? [{ label: `${bestView.name} — ${label}`, url: bestView.website ?? undefined }] : []),
    ],
  };

  switch (dimension) {
    case 'presence':
      return {
        ...base,
        problem: `A presença digital de ${self.name} está ${gapPct.toFixed(0)}% abaixo da média dos concorrentes analisados.`,
        potentialImpact: 'Mais pontos de contato encontráveis significa mais chances de aparecer no momento em que o cliente procura o serviço.',
        action: `Publicar e vincular ao site os canais que hoje não aparecem${bestView ? `, seguindo a cobertura de ${bestView.name} (${bestView.social.map((s) => s.platform).join(', ') || 'canais próprios'})` : ''}, mantendo dados de contato idênticos em todos.`,
        successMetric: 'Número de canais oficiais vinculados ao site na próxima coleta.',
        effort: Effort.MEDIUM,
        horizon: Horizon.D30,
        dedupeKey: 'rec:dim:presence',
      };
    case 'seo':
      return {
        ...base,
        problem: `O SEO técnico de ${self.name} está ${gapPct.toFixed(0)}% abaixo da média dos concorrentes.`,
        potentialImpact: 'Correções técnicas de SEO têm efeito direto sobre a indexação e a apresentação do site nos resultados de busca.',
        action: 'Corrigir, nesta ordem: títulos e meta descriptions ausentes, H1 único por página, dados estruturados de LocalBusiness com endereço e horário, e sitemap.xml declarado no robots.txt.',
        successMetric: 'Score de SEO do Radar acima da média dos concorrentes na próxima coleta.',
        effort: Effort.MEDIUM,
        horizon: Horizon.D30,
        dedupeKey: 'rec:dim:seo',
      };
    case 'offer':
      return {
        ...base,
        problem: `A oferta pública de ${self.name} é menos completa que a dos concorrentes (${gapPct.toFixed(0)}% abaixo da média).`,
        potentialImpact: 'O cliente compara o que consegue ver: serviços prestados mas não publicados não entram na comparação.',
        action: 'Listar todos os serviços efetivamente prestados e criar uma página própria para cada um dos que hoje não têm página.',
        successMetric: 'Número de serviços com página dedicada publicada.',
        effort: Effort.MEDIUM,
        horizon: Horizon.D30,
        dedupeKey: 'rec:dim:offer',
      };
    case 'reputation':
      return {
        ...base,
        problem: `A reputação pública de ${self.name} está ${gapPct.toFixed(0)}% abaixo da média dos concorrentes.`,
        potentialImpact: 'Reputação é o filtro aplicado antes do primeiro contato; a diferença atual custa oportunidades que nunca chegam a virar conversa.',
        action: 'Implantar rotina de solicitação de avaliação após cada entrega concluída e responder publicamente a todas as avaliações existentes, inclusive as negativas.',
        successMetric: 'Nota média e volume de avaliações na próxima coleta.',
        effort: Effort.LOW,
        horizon: Horizon.D7,
        dedupeKey: 'rec:dim:reputation',
      };
    case 'content':
      return {
        ...base,
        problem: `A produção de conteúdo de ${self.name} está abaixo da média dos concorrentes (${gapPct.toFixed(0)}%).`,
        potentialImpact: 'Conteúdo constante aumenta a superfície de busca e sustenta autoridade percebida.',
        action: 'Definir calendário editorial de 2 publicações mensais a partir das dúvidas mais frequentes do atendimento.',
        successMetric: 'Cadência mantida e número de publicações observadas na próxima coleta.',
        effort: Effort.HIGH,
        horizon: Horizon.D90,
        dedupeKey: 'rec:dim:content',
      };
    case 'experience':
      return {
        ...base,
        problem: `A experiência de conversão do site de ${self.name} está abaixo da média dos concorrentes.`,
        potentialImpact: 'Visitantes qualificados que não encontram caminho de contato simplesmente saem.',
        action: 'Adicionar CTA visível acima da dobra em cada página de serviço e um formulário curto de contato.',
        successMetric: 'Contatos originados do site por semana.',
        effort: Effort.LOW,
        horizon: Horizon.D7,
        dedupeKey: 'rec:dim:experience',
      };
    default:
      return null;
  }
}
