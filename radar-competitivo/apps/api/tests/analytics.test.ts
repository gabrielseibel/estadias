import { describe, expect, it } from 'vitest';
import './setup.js';
import { composeScore, seoScore, websiteScore } from '../src/analytics/metrics.js';
import { buildBenchmarks, buildMatrix, computeScores } from '../src/analytics/competitive.js';
import { analyzeOfferGap } from '../src/analytics/gap.js';
import { runInsightEngine } from '../src/analytics/insight-engine.js';
import { diffSnapshots, type SnapshotPayload } from '../src/analytics/snapshot.js';
import { computeDataQuality } from '../src/analytics/data-quality.js';
import { aggregateThemes, analyzeReview } from '../src/parsers/review-analysis.js';
import type { CompanyView } from '../src/analytics/company-view.js';

/** Constrói uma visão de empresa com valores explícitos para o teste. */
function view(overrides: Partial<CompanyView> & { id: string; name: string; role: 'SELF' | 'COMPETITOR' }): CompanyView {
  return {
    domain: null, website: 'https://exemplo.com', city: 'Chapecó', state: 'SC', segment: 'academia',
    description: 'Descrição', phone: '4933000000', email: 'x@y.com', address: 'Rua 1', priceRange: null,
    openingHours: null, unitsCount: null, isDemo: false, lastCollectedAt: new Date(),
    reputation: { rating: null, reviewCount: null, sources: [], history: [], themes: [], sentiment: { positive: 0, negative: 0, neutral: 0, mixed: 0, averageScore: null }, reviewsAnalyzed: 0, available: false, note: null },
    offerings: [], prices: [], priceHistory: {}, social: [],
    website_metrics: null, seo_metrics: null, changes: [], signals: [], images: [], sources: [], snapshots: [],
    ...overrides,
  } as CompanyView;
}

const webMetrics = (over: Partial<NonNullable<CompanyView['website_metrics']>> = {}) => ({
  score: 70, components: [], coverage: 1, methodology: '', pagesCrawled: 10, pagesDiscovered: 12,
  hasBlog: false, blogPostsSeen: 0, publishIntervalDays: null, hasContactForm: true, hasWhatsapp: true,
  ctaCount: 4, httpsOk: true, avgResponseMs: 200, ...over,
});
const seoMetrics = (over: Partial<NonNullable<CompanyView['seo_metrics']>> = {}) => ({
  score: 70, components: [], coverage: 1, methodology: '', indexablePages: 10, structuredDataTypes: ['LocalBusiness'],
  keywords: [], titleCoverage: 1, descriptionCoverage: 1, h1Coverage: 1, wordCountTotal: 3000, hasLocalSignals: true, ...over,
});

describe('composição de scores', () => {
  it('exclui do cálculo as dimensões sem dado e reduz a cobertura', () => {
    const result = composeScore(
      [
        { key: 'a', label: 'A', weight: 0.5, value: 1, detail: '' },
        { key: 'b', label: 'B', weight: 0.5, value: null, detail: '' },
      ],
      'metodologia',
    );
    expect(result.score).toBe(100);
    expect(result.coverage).toBe(0.5);
  });

  it('devolve score nulo quando nenhuma dimensão pôde ser medida', () => {
    const result = composeScore([{ key: 'a', label: 'A', weight: 1, value: null, detail: '' }], 'm');
    expect(result.score).toBeNull();
    expect(result.coverage).toBe(0);
  });

  it('site inacessível não vira nota zero silenciosa', () => {
    const result = websiteScore({
      reachable: false, httpsOk: false, pagesCrawled: 0, pagesDiscovered: 0, hasSitemap: false, hasRss: false,
      hasBlog: false, blogPostsSeen: 0, publishIntervalDays: null, hasContactForm: false, hasWhatsapp: false,
      hasPhone: false, ctaCount: 0, formCount: 0, socialLinks: 0, avgResponseMs: null, descriptionCoverage: null, offeringsCount: 0,
    });
    // Só a dimensão "presença" é mensurável (o site não respondeu).
    expect(result.coverage).toBeLessThan(0.3);
  });

  it('score de SEO expõe a metodologia e não inclui métricas não coletáveis', () => {
    const result = seoScore({
      indexablePages: 10, titleCoverage: 1, descriptionCoverage: 0.8, h1Coverage: 1, avgTitleLength: 55,
      structuredDataTypes: ['LocalBusiness'], hasOpenGraph: true, hasCanonical: true, hasRobotsTxt: true,
      hasSitemap: true, hasLocalSignals: true, imageAltCoverage: 0.9, internalLinks: 40, wordCountTotal: 5000, pagesCrawled: 10,
    });
    expect(result.score).toBeGreaterThan(70);
    expect(result.methodology).toMatch(/backlinks/i);
  });
});

describe('score competitivo', () => {
  const views = [
    view({
      id: 'self', name: 'Minha Empresa', role: 'SELF',
      reputation: { rating: 4.0, reviewCount: 50, sources: [{ sourceLabel: 'site', sourceUrl: 'https://x', rating: 4, reviewCount: 50, observedAt: new Date() }], history: [], themes: [], sentiment: { positive: 0, negative: 0, neutral: 0, mixed: 0, averageScore: null }, reviewsAnalyzed: 0, available: true, note: null },
      offerings: [{ kind: 'SERVICE', name: 'Musculação', normalized: 'musculacao', url: null, evidenceId: null }],
      website_metrics: webMetrics(), seo_metrics: seoMetrics({ score: 60 }),
    }),
    view({
      id: 'c1', name: 'Concorrente Forte', role: 'COMPETITOR',
      reputation: { rating: 4.8, reviewCount: 300, sources: [{ sourceLabel: 'site', sourceUrl: 'https://y', rating: 4.8, reviewCount: 300, observedAt: new Date() }], history: [], themes: [], sentiment: { positive: 0, negative: 0, neutral: 0, mixed: 0, averageScore: null }, reviewsAnalyzed: 0, available: true, note: null },
      offerings: [
        { kind: 'SERVICE', name: 'Musculação', normalized: 'musculacao', url: null, evidenceId: null },
        { kind: 'SERVICE', name: 'Personal Trainer', normalized: 'personal trainer', url: 'https://y/pt', evidenceId: null },
      ],
      social: [{ platform: 'instagram', url: 'https://instagram.com/y', handle: 'y', followers: null, note: null }],
      website_metrics: webMetrics({ hasBlog: true, blogPostsSeen: 8, publishIntervalDays: 7, pagesDiscovered: 30 }),
      seo_metrics: seoMetrics({ score: 90 }),
    }),
    view({ id: 'c2', name: 'Sem Coleta', role: 'COMPETITOR', website_metrics: webMetrics({ pagesCrawled: 0, pagesDiscovered: 0, score: null, coverage: 0 }), seo_metrics: null }),
  ];

  const scores = computeScores(views);

  it('calcula score composto com cobertura para quem tem dados', () => {
    const self = scores.find((s) => s.role === 'SELF')!;
    expect(self.composite.score).not.toBeNull();
    expect(self.composite.coverage).toBeGreaterThan(0.5);
  });

  it('marca dimensões como não verificáveis quando o site não foi coletado', () => {
    const semColeta = scores.find((s) => s.companyId === 'c2')!;
    expect(semColeta.dimensions.offer.value).toBeNull();
    expect(semColeta.dimensions.seo.value).toBeNull();
    expect(semColeta.dimensions.content.value).toBeNull();
    expect(semColeta.dimensions.offer.detail).toMatch(/não respondeu|Nenhum website/i);
  });

  it('não calcula Threat Score para a própria empresa', () => {
    expect(scores.find((s) => s.role === 'SELF')!.threat.score).toBeNull();
  });

  it('explica os fatores do Threat Score', () => {
    const forte = scores.find((s) => s.companyId === 'c1')!;
    if (forte.threat.score !== null && forte.threat.score > 0) {
      expect(forte.threat.factors.length).toBeGreaterThan(0);
      expect(forte.threat.methodology).toBeTruthy();
    }
  });

  it('constrói a matriz apontando o melhor de cada dimensão', () => {
    const matrix = buildMatrix(scores);
    const reputacao = matrix.find((m) => m.key === 'reputation')!;
    expect(reputacao.best).toBe('c1');
    expect(reputacao.cells).toHaveLength(3);
  });

  it('não calcula benchmark sem amostra mínima de concorrentes', () => {
    const benchmarks = buildBenchmarks(scores);
    const reputacao = benchmarks.find((b) => b.dimension === 'reputation')!;
    // Apenas um concorrente com dado de reputação: amostra insuficiente.
    expect(reputacao.competitorAverage).toBeNull();
    expect(reputacao.note).toMatch(/amostra insuficiente/i);
  });
});

describe('GAP de oferta', () => {
  const self = view({
    id: 'self', name: 'Minha', role: 'SELF',
    offerings: [{ kind: 'SERVICE', name: 'Musculação', normalized: 'musculacao', url: null, evidenceId: null }],
  });
  const mk = (id: string, names: string[]) =>
    view({
      id, name: `Conc ${id}`, role: 'COMPETITOR',
      offerings: names.map((n) => ({ kind: 'SERVICE', name: n, normalized: n.toLowerCase(), url: `https://${id}/x`, evidenceId: null })),
    });

  it('identifica ofertas presentes na maioria dos concorrentes e ausentes na sua empresa', () => {
    const gap = analyzeOfferGap([self, mk('a', ['musculacao', 'personal trainer']), mk('b', ['musculacao', 'personal trainer'])]);
    expect(gap.available).toBe(true);
    expect(gap.missingInSelf.map((r) => r.normalized)).toContain('personal trainer');
    expect(gap.missingInSelf[0].coveragePct).toBe(100);
  });

  it('ignora item oferecido por um único concorrente (especialização, não lacuna)', () => {
    const gap = analyzeOfferGap([self, mk('a', ['musculacao', 'crossfit']), mk('b', ['musculacao'])]);
    expect(gap.missingInSelf.map((r) => r.normalized)).not.toContain('crossfit');
  });

  it('exclui do denominador concorrentes sem oferta coletada', () => {
    const gap = analyzeOfferGap([self, mk('a', ['musculacao', 'pilates']), mk('b', ['musculacao', 'pilates']), view({ id: 'c', name: 'Sem dados', role: 'COMPETITOR' })]);
    expect(gap.competitorCount).toBe(2);
    expect(gap.missingInSelf[0].coveragePct).toBe(100);
    expect(gap.note).toMatch(/não entraram na comparação/i);
  });

  it('aponta diferenciais exclusivos da sua empresa', () => {
    const selfExclusivo = view({
      id: 'self', name: 'Minha', role: 'SELF',
      offerings: [
        { kind: 'SERVICE', name: 'Musculação', normalized: 'musculacao', url: null, evidenceId: null },
        { kind: 'SERVICE', name: 'Nutrição', normalized: 'nutricao', url: null, evidenceId: null },
      ],
    });
    const gap = analyzeOfferGap([selfExclusivo, mk('a', ['musculacao'])]);
    expect(gap.exclusiveToSelf.map((r) => r.normalized)).toContain('nutricao');
  });

  it('informa indisponibilidade em vez de inventar comparação', () => {
    const gap = analyzeOfferGap([self]);
    expect(gap.available).toBe(false);
    expect(gap.note).toBeTruthy();
  });
});

describe('engine de insights e recomendações', () => {
  const self = view({
    id: 'self', name: 'Minha Empresa', role: 'SELF',
    reputation: { rating: 3.8, reviewCount: 20, sources: [], history: [], themes: [], sentiment: { positive: 0, negative: 0, neutral: 0, mixed: 0, averageScore: null }, reviewsAnalyzed: 0, available: true, note: null },
    offerings: [{ kind: 'SERVICE', name: 'Musculação', normalized: 'musculacao', url: null, evidenceId: null }],
    website_metrics: webMetrics({ hasContactForm: false, hasWhatsapp: false, httpsOk: false }),
    seo_metrics: seoMetrics({ score: 40, descriptionCoverage: 0.3 }),
  });
  const competitor = (id: string, extras: string[]) =>
    view({
      id, name: `Conc ${id}`, role: 'COMPETITOR',
      reputation: {
        rating: 4.7, reviewCount: 300, sources: [], history: [],
        themes: [{ theme: 'prazo', polarity: 'NEGATIVE', mentions: 5, positive: 0, negative: 5, sampleQuote: 'Demorou muito' }],
        sentiment: { positive: 1, negative: 5, neutral: 0, mixed: 0, averageScore: -0.4 }, reviewsAnalyzed: 6, available: true, note: null,
      },
      offerings: [
        { kind: 'SERVICE', name: 'Musculação', normalized: 'musculacao', url: null, evidenceId: null },
        ...extras.map((e) => ({ kind: 'SERVICE', name: e, normalized: e.toLowerCase(), url: `https://${id}/${e}`, evidenceId: null })),
      ],
      website_metrics: webMetrics({ hasBlog: true, blogPostsSeen: 10, publishIntervalDays: 7 }),
      seo_metrics: seoMetrics({ score: 85 }),
    });

  const views = [self, competitor('a', ['Personal Trainer']), competitor('b', ['Personal Trainer'])];
  const scores = computeScores(views);
  const output = runInsightEngine({ views, scores, benchmarks: buildBenchmarks(scores), gap: analyzeOfferGap(views) });

  it('gera oportunidade a partir da lacuna de oferta', () => {
    expect(output.swot.opportunities.some((o) => o.title.includes('Personal Trainer'))).toBe(true);
  });

  it('gera oportunidade a partir de reclamação recorrente compartilhada pelos concorrentes', () => {
    expect(output.swot.opportunities.some((o) => o.title.toLowerCase().includes('prazo'))).toBe(true);
  });

  it('toda recomendação traz problema, evidência, ação, métrica, prioridade e prazo', () => {
    expect(output.recommendations.length).toBeGreaterThan(0);
    for (const rec of output.recommendations) {
      expect(rec.problem.length).toBeGreaterThan(10);
      expect(rec.evidence.length).toBeGreaterThan(5);
      expect(rec.action.length).toBeGreaterThan(10);
      expect(rec.successMetric.length).toBeGreaterThan(5);
      expect(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).toContain(rec.priority);
      expect(['D7', 'D30', 'D90']).toContain(rec.horizon);
    }
  });

  it('não gera recomendação genérica de "melhore o marketing"', () => {
    for (const rec of output.recommendations) {
      expect(rec.action.toLowerCase()).not.toMatch(/^melhore (seu )?marketing/);
    }
  });

  it('recomenda caminho de conversão quando o site não tem formulário nem WhatsApp', () => {
    expect(output.recommendations.some((r) => r.dedupeKey === 'rec:no-conversion-path')).toBe(true);
  });

  it('recomenda HTTPS quando o site respondeu sem TLS', () => {
    expect(output.recommendations.some((r) => r.dedupeKey === 'rec:no-https')).toBe(true);
  });

  it('monta plano de ação em 7, 30 e 90 dias', () => {
    const [d7, d30, d90] = output.actionPlan;
    expect(d7.horizon).toBe('D7');
    expect(d7.items.length).toBeLessThanOrEqual(3);
    expect(d30.items.length).toBeLessThanOrEqual(5);
    expect(d90.items.length).toBeLessThanOrEqual(10);
  });

  it('registra ressalva quando não há empresa própria definida', () => {
    const semSelf = runInsightEngine({
      views: [competitor('a', [])], scores: computeScores([competitor('a', [])]),
      benchmarks: [], gap: analyzeOfferGap([competitor('a', [])]),
    });
    expect(semSelf.notes.join(' ')).toMatch(/minha empresa/i);
    expect(semSelf.insights).toHaveLength(0);
  });
});

describe('detecção de mudanças entre snapshots', () => {
  const base: SnapshotPayload = {
    profile: { name: 'X', description: 'antiga', phone: null, email: null, address: 'Rua A', city: null, state: null, priceRange: null, openingHours: null, unitsCount: null },
    pages: [{ url: 'https://x.com/', title: 'Home', hash: 'h1' }],
    offerings: [{ kind: 'SERVICE', normalized: 'servico a', name: 'Serviço A', url: null }],
    prices: [{ label: 'Plano', amount: 100, currency: 'BRL', isPromo: false }],
    social: [{ platform: 'instagram', url: 'https://instagram.com/x' }],
    reputation: [{ sourceLabel: 'site', rating: 4.0, reviewCount: 100 }],
    reviewCountTotal: 0, websiteScore: 50, seoScore: 50, ctas: 2, blogPostsSeen: 0,
  };

  it('não reporta mudanças quando nada mudou', () => {
    expect(diffSnapshots(base, base, 'X')).toHaveLength(0);
  });

  it('detecta novo serviço, novo preço, nova nota e novo canal', () => {
    const next: SnapshotPayload = {
      ...base,
      pages: [...base.pages, { url: 'https://x.com/novo', title: 'Novo', hash: 'h2' }],
      offerings: [...base.offerings, { kind: 'SERVICE', normalized: 'servico b', name: 'Serviço B', url: null }],
      prices: [{ label: 'Plano', amount: 130, currency: 'BRL', isPromo: false }],
      social: [...base.social, { platform: 'linkedin', url: 'https://linkedin.com/x' }],
      reputation: [{ sourceLabel: 'site', rating: 4.4, reviewCount: 160 }],
    };
    const kinds = diffSnapshots(base, next, 'X').map((c) => c.kind);
    expect(kinds).toContain('SERVICE_ADDED');
    expect(kinds).toContain('PAGE_ADDED');
    expect(kinds).toContain('PRICE_CHANGED');
    expect(kinds).toContain('RATING_CHANGED');
    expect(kinds).toContain('REVIEW_VOLUME_CHANGED');
    expect(kinds).toContain('SOCIAL_PROFILE_ADDED');
  });

  it('descreve a variação de preço com percentual calculado', () => {
    const next = { ...base, prices: [{ label: 'Plano', amount: 130, currency: 'BRL', isPromo: false }] };
    const price = diffSnapshots(base, next, 'X').find((c) => c.kind === 'PRICE_CHANGED')!;
    expect(price.summary).toMatch(/\+30\.0%/);
    expect(price.impact).toBe('HIGH');
  });

  it('detecta remoção de página e de oferta', () => {
    const next = { ...base, pages: [], offerings: [] };
    const kinds = diffSnapshots(base, next, 'X').map((c) => c.kind);
    expect(kinds).toContain('PAGE_REMOVED');
    expect(kinds).toContain('SERVICE_REMOVED');
  });
});

describe('qualidade dos dados', () => {
  it('pontua mais alto um retrato completo e recente', () => {
    const completo = computeDataQuality(
      view({
        id: 'a', name: 'Completa', role: 'SELF',
        sources: [
          { kind: 'WEBSITE', url: 'https://x/1', label: null, trust: 0.9, lastSeenAt: new Date() },
          { kind: 'RSS', url: 'https://x/feed', label: null, trust: 0.9, lastSeenAt: new Date() },
          { kind: 'STRUCTURED_DATA', url: 'https://x/2', label: null, trust: 0.95, lastSeenAt: new Date() },
        ],
        website_metrics: webMetrics(),
      }),
    );
    const vazio = computeDataQuality(view({ id: 'b', name: 'Vazia', role: 'COMPETITOR', website: null, city: null, description: null, phone: null, email: null, address: null, lastCollectedAt: null }));
    expect(completo.score).toBeGreaterThan(vazio.score);
    expect(vazio.breakdown.some((b) => b.value === 0)).toBe(true);
  });
});

describe('análise de avaliações', () => {
  it('separa polaridade por oração dentro da mesma frase', () => {
    const analysis = analyzeReview('Atendimento excelente e muito rápido, mas o preço é caro demais', 4);
    const preco = analysis.themes.find((t) => t.theme === 'preço');
    const atendimento = analysis.themes.find((t) => t.theme === 'atendimento');
    expect(preco?.polarity).toBe('NEGATIVE');
    expect(atendimento?.polarity).toBe('POSITIVE');
  });

  it('classifica avaliação negativa mesmo sem nota', () => {
    expect(analyzeReview('Demorou muito para entregar. Péssimo pós-venda, não recomendo.').sentiment).toBe('NEGATIVE');
  });

  it('agrega temas e sentimento de um conjunto de avaliações', () => {
    const result = aggregateThemes([
      { text: 'Atendimento excelente, equipe muito atenciosa', rating: 5 },
      { text: 'Preço caro e demorou bastante', rating: 2 },
      { text: 'Demora no atendimento em horário de pico', rating: 3 },
    ]);
    expect(result.analyzed).toBe(3);
    expect(result.themes.some((t) => t.theme === 'prazo' && t.polarity === 'NEGATIVE')).toBe(true);
    expect(result.sentiment.averageScore).not.toBeNull();
  });

  it('não analisa nada quando não há texto de avaliação', () => {
    const result = aggregateThemes([{ text: null, rating: 5 }]);
    expect(result.analyzed).toBe(0);
    expect(result.sentiment.averageScore).toBeNull();
  });
});
