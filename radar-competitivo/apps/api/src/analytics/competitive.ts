import type { CompanyView } from './company-view.js';
import { composeScore, type ScoreComponent, type ScoreResult } from './metrics.js';

/**
 * SCORE COMPETITIVO
 *
 * Compõe as dimensões observadas em um índice 0–100. Três regras não negociáveis:
 *  1. dimensão sem dado não vale zero — sai do cálculo e derruba a cobertura;
 *  2. a composição é sempre exibível (peso, valor, origem de cada componente);
 *  3. o rótulo é "score analítico baseado nos dados públicos disponíveis",
 *     nunca uma medida objetiva de qualidade da empresa.
 */

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export type DimensionKey = 'reputation' | 'presence' | 'offer' | 'content' | 'seo' | 'experience' | 'activity' | 'price' | 'growth';

export type CompanyScores = {
  companyId: string;
  name: string;
  role: 'SELF' | 'COMPETITOR';
  dimensions: Record<DimensionKey, { value: number | null; detail: string }>;
  composite: ScoreResult;
  threat: { score: number | null; factors: { label: string; contribution: number; detail: string }[]; methodology: string };
};

const DIMENSION_WEIGHTS: Record<DimensionKey, number> = {
  reputation: 0.2,
  presence: 0.12,
  offer: 0.15,
  content: 0.1,
  seo: 0.15,
  experience: 0.08,
  activity: 0.1,
  price: 0.05,
  growth: 0.05,
};

const DIMENSION_LABELS: Record<DimensionKey, string> = {
  reputation: 'Reputação',
  presence: 'Presença digital',
  offer: 'Oferta',
  content: 'Conteúdo',
  seo: 'SEO',
  experience: 'Experiência',
  activity: 'Atividade',
  price: 'Transparência de preço',
  growth: 'Crescimento observado',
};

/** Normaliza um valor contra o máximo do grupo (comparação relativa é o que importa). */
function relative(value: number | null, max: number): number | null {
  if (value === null || max <= 0) return null;
  return clamp01(value / max);
}

function daysSince(date: Date | null): number | null {
  if (!date) return null;
  return (Date.now() - date.getTime()) / 86_400_000;
}

export function computeScores(views: CompanyView[]): CompanyScores[] {
  const maxOfferings = Math.max(1, ...views.map((v) => v.offerings.length));
  const maxSocial = Math.max(1, ...views.map((v) => v.social.length));
  const maxPages = Math.max(1, ...views.map((v) => v.website_metrics?.pagesDiscovered ?? 0));
  const maxBlog = Math.max(1, ...views.map((v) => v.website_metrics?.blogPostsSeen ?? 0));
  const maxReviews = Math.max(1, ...views.map((v) => v.reputation.reviewCount ?? 0));
  const maxChanges = Math.max(1, ...views.map((v) => v.changes.length));

  return views.map((view) => {
    const web = view.website_metrics;
    const seo = view.seo_metrics;

    /**
     * Site que não respondeu não vale zero: zero é uma medição, e não houve
     * medição. Sem página coletada, as dimensões que dependem do site ficam
     * "não verificável" e reduzem a cobertura — a falha de coleta aparece
     * explicitamente em vez de virar uma nota ruim silenciosa.
     */
    const siteCollected = (web?.pagesCrawled ?? 0) > 0;
    const notCollectedDetail = view.website
      ? 'O site cadastrado não respondeu à coleta — não há dado para avaliar esta dimensão.'
      : 'Nenhum website cadastrado para esta empresa.';

    // ── Reputação: nota (70%) + volume relativo (30%) ───────────────────────
    const rating = view.reputation.rating;
    const reviewCount = view.reputation.reviewCount;
    const reputationValue =
      rating === null && reviewCount === null && view.reputation.reviewsAnalyzed === 0
        ? null
        : clamp01((rating !== null ? (rating / 5) * 0.7 : 0) + (reviewCount !== null ? (relative(reviewCount, maxReviews) ?? 0) * 0.3 : 0) + (rating === null && view.reputation.sentiment.averageScore !== null ? ((view.reputation.sentiment.averageScore + 1) / 2) * 0.7 : 0));

    const reputationDetail =
      rating !== null
        ? `Nota ${rating.toFixed(1)}${reviewCount !== null ? ` com ${reviewCount} avaliações` : ''} (${view.reputation.sources[0]?.sourceLabel ?? 'fonte pública'}).`
        : view.reputation.reviewsAnalyzed > 0
          ? `${view.reputation.reviewsAnalyzed} avaliações textuais analisadas; nota agregada não publicada.`
          : 'Nenhuma fonte pública de avaliação coletada.';

    // ── Presença digital ────────────────────────────────────────────────────
    const presenceValue =
      !siteCollected && view.social.length === 0
        ? null
        : clamp01((relative(view.social.length, maxSocial) ?? 0) * 0.5 + (web?.httpsOk ? 0.15 : 0) + (relative(web?.pagesDiscovered ?? 0, maxPages) ?? 0) * 0.35);

    // ── Oferta ──────────────────────────────────────────────────────────────
    const offerValue = !siteCollected && view.offerings.length === 0 ? null : relative(view.offerings.length, maxOfferings);

    // ── Conteúdo ────────────────────────────────────────────────────────────
    const contentValue =
      !siteCollected || !web
        ? null
        : clamp01(
            (relative(web.blogPostsSeen, maxBlog) ?? 0) * 0.5 +
              (web.hasBlog ? 0.2 : 0) +
              (web.publishIntervalDays !== null ? clamp01(1 - web.publishIntervalDays / 60) * 0.3 : 0),
          );

    // ── SEO e experiência vêm dos scores dedicados ──────────────────────────
    const seoValue = siteCollected && seo?.score !== null && seo?.score !== undefined ? seo.score / 100 : null;
    const experienceComponent = web?.components.find((c) => c.key === 'experience');
    const conversionComponent = web?.components.find((c) => c.key === 'conversion');
    const experienceValue = !siteCollected
      ? null
      : experienceComponent?.value !== null && experienceComponent?.value !== undefined
        ? clamp01(experienceComponent.value * 0.6 + (conversionComponent?.value ?? 0) * 0.4)
        : (conversionComponent?.value ?? null);

    // ── Atividade observada (mudanças detectadas recentemente) ───────────────
    const recentChanges = view.changes.filter((c) => daysSince(c.observedAt)! <= 90).length;
    const activityValue = view.snapshots.length < 2 ? null : relative(recentChanges, maxChanges);

    // ── Transparência de preço ──────────────────────────────────────────────
    const priceValue = view.prices.length === 0 ? (siteCollected ? 0 : null) : clamp01(view.prices.length / 5);

    // ── Crescimento observado (exige histórico) ─────────────────────────────
    const repHistory = view.reputation.history.filter((h) => h.reviewCount !== null);
    let growthValue: number | null = null;
    let growthDetail = 'Sem histórico suficiente para observar crescimento (é necessária mais de uma coleta).';
    if (repHistory.length >= 2) {
      const first = repHistory[0].reviewCount!;
      const last = repHistory[repHistory.length - 1].reviewCount!;
      const delta = first > 0 ? (last - first) / first : 0;
      growthValue = clamp01(0.5 + delta * 2);
      growthDetail = `Volume de avaliações passou de ${first} para ${last} entre coletas (${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(1)}%).`;
    } else if (view.signals.some((s) => s.kind === 'review_growth' || s.kind === 'new_offering')) {
      const strength = Math.max(...view.signals.map((s) => s.strength));
      growthValue = clamp01(0.5 + strength * 0.5);
      growthDetail = `Sinais indiretos de crescimento observados: ${view.signals.map((s) => s.label).slice(0, 3).join('; ')}.`;
    }

    const dimensions: CompanyScores['dimensions'] = {
      reputation: { value: reputationValue, detail: reputationDetail },
      presence: {
        value: presenceValue,
        detail: siteCollected
          ? `${view.social.length} canais sociais identificados; ${web?.pagesDiscovered ?? 0} páginas conhecidas no site.`
          : notCollectedDetail,
      },
      offer: {
        value: offerValue,
        detail: siteCollected ? `${view.offerings.length} produtos/serviços identificados publicamente.` : notCollectedDetail,
      },
      content: {
        value: contentValue,
        detail: siteCollected && web
          ? `${web.blogPostsSeen} publicações observadas; cadência ${web.publishIntervalDays !== null ? `~${web.publishIntervalDays} dias` : 'não verificável'}.`
          : notCollectedDetail,
      },
      seo: {
        value: seoValue,
        detail: siteCollected && seo ? `Score de SEO ${seo.score ?? '—'} sobre ${seo.indexablePages} páginas indexáveis.` : notCollectedDetail,
      },
      experience: {
        value: experienceValue,
        detail: siteCollected && web
          ? `${web.ctaCount} CTAs, formulário de contato ${web.hasContactForm ? 'presente' : 'ausente'}, WhatsApp ${web.hasWhatsapp ? 'presente' : 'ausente'}.`
          : notCollectedDetail,
      },
      activity: {
        value: activityValue,
        detail: view.snapshots.length < 2 ? 'É necessária mais de uma coleta para medir atividade.' : `${recentChanges} mudanças observadas nos últimos 90 dias.`,
      },
      price: {
        value: priceValue,
        detail: !siteCollected ? notCollectedDetail : view.prices.length === 0 ? 'Nenhum preço público encontrado nas páginas coletadas.' : `${view.prices.length} preços públicos monitorados.`,
      },
      growth: { value: growthValue, detail: growthDetail },
    };

    const components: ScoreComponent[] = (Object.keys(DIMENSION_WEIGHTS) as DimensionKey[]).map((key) => ({
      key,
      label: DIMENSION_LABELS[key],
      weight: DIMENSION_WEIGHTS[key],
      value: dimensions[key].value,
      detail: dimensions[key].detail,
    }));

    const composite = composeScore(
      components,
      'Score analítico baseado nos dados públicos disponíveis. Cada dimensão é normalizada em relação ao melhor valor observado entre as empresas do projeto; dimensões sem dado são excluídas do cálculo e reduzem a cobertura. Não representa faturamento, participação de mercado ou qualidade intrínseca da empresa.',
    );

    return {
      companyId: view.id,
      name: view.name,
      role: view.role,
      dimensions,
      composite,
      threat: computeThreat(view, dimensions),
    };
  });
}

/**
 * THREAT SCORE (0–100): quanto o movimento recente do concorrente exige atenção.
 * Baseado apenas em fatos observados; cada fator é exibido com sua contribuição.
 */
function computeThreat(view: CompanyView, dimensions: CompanyScores['dimensions']): CompanyScores['threat'] {
  if (view.role === 'SELF') {
    return { score: null, factors: [], methodology: 'O Threat Score é calculado apenas para concorrentes.' };
  }

  const factors: { label: string; contribution: number; detail: string }[] = [];
  const recent = view.changes.filter((c) => (Date.now() - c.observedAt.getTime()) / 86_400_000 <= 90);

  const newOfferings = recent.filter((c) => c.kind === 'PRODUCT_ADDED' || c.kind === 'SERVICE_ADDED').length;
  if (newOfferings > 0) factors.push({ label: 'Novas ofertas lançadas', contribution: Math.min(25, newOfferings * 8), detail: `${newOfferings} nova(s) oferta(s) divulgada(s) nos últimos 90 dias.` });

  const priceMoves = recent.filter((c) => c.kind === 'PRICE_CHANGED').length;
  if (priceMoves > 0) factors.push({ label: 'Movimentação de preços', contribution: Math.min(20, priceMoves * 7), detail: `${priceMoves} mudança(s) de preço observada(s).` });

  const reviewGrowth = recent.filter((c) => c.kind === 'REVIEW_VOLUME_CHANGED').length;
  if (reviewGrowth > 0) factors.push({ label: 'Crescimento de avaliações', contribution: Math.min(20, reviewGrowth * 10), detail: 'Volume de avaliações públicas crescendo entre coletas.' });

  const newChannels = recent.filter((c) => c.kind === 'SOCIAL_PROFILE_ADDED').length;
  if (newChannels > 0) factors.push({ label: 'Novos canais digitais', contribution: Math.min(12, newChannels * 6), detail: `${newChannels} novo(s) canal(is) social(is).` });

  const expansion = recent.filter((c) => c.kind === 'ADDRESS_CHANGED').length;
  if (expansion > 0) factors.push({ label: 'Mudança de endereço/unidade', contribution: 10, detail: 'Endereço publicado mudou entre coletas.' });

  const positioning = recent.filter((c) => c.kind === 'DESCRIPTION_CHANGED' || c.kind === 'TITLE_CHANGED').length;
  if (positioning > 0) factors.push({ label: 'Mudança de posicionamento', contribution: Math.min(10, positioning * 4), detail: `${positioning} alteração(ões) em títulos/descrições.` });

  const strength = dimensions.reputation.value;
  if (strength !== null && strength >= 0.8) factors.push({ label: 'Reputação forte', contribution: 15, detail: dimensions.reputation.detail });

  const seoStrength = dimensions.seo.value;
  if (seoStrength !== null && seoStrength >= 0.75) factors.push({ label: 'SEO acima da média', contribution: 10, detail: dimensions.seo.detail });

  if (factors.length === 0) {
    return {
      score: view.snapshots.length < 2 ? null : 0,
      factors: [],
      methodology:
        view.snapshots.length < 2
          ? 'Threat Score exige pelo menos duas coletas para comparar movimentos. Execute uma nova análise mais tarde.'
          : 'Nenhum movimento competitivo relevante observado no período.',
    };
  }

  const score = Math.min(100, Math.round(factors.reduce((s, f) => s + f.contribution, 0)));
  return {
    score,
    factors,
    methodology: 'Soma das contribuições de fatores observados nos últimos 90 dias (novas ofertas, movimentação de preços, crescimento de avaliações, novos canais, expansão e mudança de posicionamento), somada à força estrutural de reputação e SEO. Limitado a 100.',
  };
}

// ── Matriz competitiva ───────────────────────────────────────────────────────

export type MatrixRow = {
  key: DimensionKey;
  label: string;
  weight: number;
  cells: { companyId: string; name: string; role: 'SELF' | 'COMPETITOR'; value: number | null; display: string; detail: string }[];
  best: string | null;
};

export function buildMatrix(scores: CompanyScores[]): MatrixRow[] {
  return (Object.keys(DIMENSION_WEIGHTS) as DimensionKey[]).map((key) => {
    const cells = scores.map((s) => ({
      companyId: s.companyId,
      name: s.name,
      role: s.role,
      value: s.dimensions[key].value,
      display: s.dimensions[key].value === null ? 'Não verificável' : `${Math.round(s.dimensions[key].value! * 100)}`,
      detail: s.dimensions[key].detail,
    }));
    const measured = cells.filter((c) => c.value !== null);
    const best = measured.length ? measured.reduce((a, b) => (b.value! > a.value! ? b : a)).companyId : null;
    return { key, label: DIMENSION_LABELS[key], weight: DIMENSION_WEIGHTS[key], cells, best };
  });
}

// ── Benchmarking ─────────────────────────────────────────────────────────────

export type Benchmark = {
  dimension: DimensionKey;
  label: string;
  self: number | null;
  competitorAverage: number | null;
  bestCompetitor: { name: string; value: number } | null;
  worstCompetitor: { name: string; value: number } | null;
  deltaVsAveragePct: number | null;
  sampleSize: number;
  note: string | null;
};

export function buildBenchmarks(scores: CompanyScores[]): Benchmark[] {
  const self = scores.find((s) => s.role === 'SELF');
  const competitors = scores.filter((s) => s.role === 'COMPETITOR');

  return (Object.keys(DIMENSION_WEIGHTS) as DimensionKey[]).map((key) => {
    const values = competitors
      .map((c) => ({ name: c.name, value: c.dimensions[key].value }))
      .filter((v): v is { name: string; value: number } => v.value !== null);

    const selfValue = self?.dimensions[key].value ?? null;
    const avg = values.length ? values.reduce((s, v) => s + v.value, 0) / values.length : null;

    // Benchmark só é calculado com amostra mínima — abaixo disso, o número
    // enganaria mais do que informaria.
    const enough = values.length >= 2;

    return {
      dimension: key,
      label: DIMENSION_LABELS[key],
      self: selfValue,
      competitorAverage: enough ? Number(avg!.toFixed(3)) : null,
      bestCompetitor: values.length ? values.reduce((a, b) => (b.value > a.value ? b : a)) : null,
      worstCompetitor: values.length ? values.reduce((a, b) => (b.value < a.value ? b : a)) : null,
      deltaVsAveragePct: enough && selfValue !== null && avg! > 0 ? Number((((selfValue - avg!) / avg!) * 100).toFixed(1)) : null,
      sampleSize: values.length,
      note: enough
        ? null
        : `Amostra insuficiente para benchmark desta dimensão (${values.length} concorrente(s) com dado disponível; mínimo 2).`,
    };
  });
}

export { DIMENSION_LABELS, DIMENSION_WEIGHTS };
