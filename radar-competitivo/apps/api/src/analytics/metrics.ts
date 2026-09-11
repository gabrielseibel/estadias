import type { WebsiteMetric, SeoMetric } from '@prisma/client';

/**
 * Cálculo dos scores de site e de SEO.
 *
 * Regras de honestidade adotadas em toda a engine:
 *  - todo score expõe sua composição (`breakdown`) com peso, valor e origem;
 *  - dimensão sem dado coletado NÃO vira zero: ela sai do cálculo e reduz a
 *    cobertura (`coverage`), que é exibida junto do score;
 *  - o score é rotulado como "analítico", nunca como verdade objetiva.
 */

export type ScoreComponent = {
  key: string;
  label: string;
  weight: number;
  /** 0..1 — null quando não foi possível verificar. */
  value: number | null;
  detail: string;
};

export type ScoreResult = {
  score: number | null;
  coverage: number;
  components: ScoreComponent[];
  methodology: string;
};

export function composeScore(components: ScoreComponent[], methodology: string): ScoreResult {
  const measured = components.filter((c) => c.value !== null);
  const totalWeight = components.reduce((s, c) => s + c.weight, 0);
  const measuredWeight = measured.reduce((s, c) => s + c.weight, 0);
  if (measuredWeight === 0) {
    return { score: null, coverage: 0, components, methodology };
  }
  const raw = measured.reduce((s, c) => s + (c.value as number) * c.weight, 0) / measuredWeight;
  return {
    score: Number((raw * 100).toFixed(1)),
    coverage: Number((measuredWeight / totalWeight).toFixed(3)),
    components,
    methodology,
  };
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const ratio = (n: number, target: number) => clamp01(n / target);

export type WebsiteSignals = {
  reachable: boolean;
  httpsOk: boolean;
  pagesCrawled: number;
  pagesDiscovered: number;
  hasSitemap: boolean;
  hasRss: boolean;
  hasBlog: boolean;
  blogPostsSeen: number;
  publishIntervalDays: number | null;
  hasContactForm: boolean;
  hasWhatsapp: boolean;
  hasPhone: boolean;
  ctaCount: number;
  formCount: number;
  socialLinks: number;
  avgResponseMs: number | null;
  descriptionCoverage: number | null;
  offeringsCount: number;
};

/** WEBSITE SCORE — presença, conteúdo, conversão, experiência e clareza da oferta. */
export function websiteScore(s: WebsiteSignals): ScoreResult {
  const components: ScoreComponent[] = [
    {
      key: 'presence',
      label: 'Presença',
      weight: 0.15,
      value: s.reachable ? (s.httpsOk ? 1 : 0.6) : 0,
      detail: s.reachable ? (s.httpsOk ? 'Site acessível por HTTPS.' : 'Site acessível apenas por HTTP.') : 'Site não respondeu à coleta.',
    },
    {
      key: 'content',
      label: 'Conteúdo',
      weight: 0.2,
      value: s.pagesCrawled === 0 ? null : clamp01(ratio(s.pagesDiscovered, 25) * 0.6 + (s.hasBlog ? 0.25 : 0) + ratio(s.blogPostsSeen, 8) * 0.15),
      detail: `${s.pagesDiscovered} páginas conhecidas; ${s.hasBlog ? `blog com ${s.blogPostsSeen} publicações observadas` : 'sem blog identificado'}.`,
    },
    {
      key: 'offer_clarity',
      label: 'Clareza da oferta',
      weight: 0.2,
      value: s.pagesCrawled === 0 ? null : ratio(s.offeringsCount, 8),
      detail: `${s.offeringsCount} produtos/serviços identificados publicamente.`,
    },
    {
      key: 'conversion',
      label: 'Conversão',
      weight: 0.2,
      value:
        s.pagesCrawled === 0
          ? null
          : clamp01(
              (s.hasContactForm ? 0.3 : 0) + (s.hasWhatsapp ? 0.2 : 0) + (s.hasPhone ? 0.15 : 0) + ratio(s.ctaCount, 6) * 0.25 + ratio(s.formCount, 2) * 0.1,
            ),
      detail: [
        s.hasContactForm ? 'formulário de contato' : null,
        s.hasWhatsapp ? 'WhatsApp' : null,
        s.hasPhone ? 'telefone' : null,
        `${s.ctaCount} CTAs`,
      ].filter(Boolean).join(', '),
    },
    {
      key: 'experience',
      label: 'Experiência',
      weight: 0.15,
      value:
        s.avgResponseMs === null
          ? null
          : clamp01(1 - Math.max(0, s.avgResponseMs - 400) / 3000) * 0.7 + (s.descriptionCoverage ?? 0) * 0.3,
      detail: s.avgResponseMs === null ? 'Tempo de resposta não medido.' : `Tempo médio de resposta ${s.avgResponseMs}ms na coleta.`,
    },
    {
      key: 'authority_signals',
      label: 'Sinais de autoridade',
      weight: 0.1,
      value: s.pagesCrawled === 0 ? null : clamp01(ratio(s.socialLinks, 4) * 0.5 + (s.hasSitemap ? 0.3 : 0) + (s.hasRss ? 0.2 : 0)),
      detail: `${s.socialLinks} canais sociais vinculados; sitemap ${s.hasSitemap ? 'presente' : 'ausente'}.`,
    },
  ];

  return composeScore(
    components,
    'Média ponderada de seis dimensões observadas na coleta do site. Dimensões sem dado disponível são excluídas do cálculo e reduzem a cobertura, em vez de contarem como zero. Tempo de resposta reflete a coleta do Radar, não uma medição de performance de usuário real.',
  );
}

export type SeoSignals = {
  indexablePages: number;
  titleCoverage: number | null;
  descriptionCoverage: number | null;
  h1Coverage: number | null;
  avgTitleLength: number | null;
  structuredDataTypes: string[];
  hasOpenGraph: boolean;
  hasCanonical: boolean;
  hasRobotsTxt: boolean;
  hasSitemap: boolean;
  hasLocalSignals: boolean;
  imageAltCoverage: number | null;
  internalLinks: number;
  wordCountTotal: number;
  pagesCrawled: number;
};

/** SEO SCORE — apenas o que é observável no HTML servido publicamente. */
export function seoScore(s: SeoSignals): ScoreResult {
  const titleQuality =
    s.avgTitleLength === null ? null : clamp01(1 - Math.abs(s.avgTitleLength - 55) / 55);

  const components: ScoreComponent[] = [
    { key: 'titles', label: 'Títulos', weight: 0.18, value: s.titleCoverage === null ? null : clamp01(s.titleCoverage * 0.7 + (titleQuality ?? 0) * 0.3), detail: s.titleCoverage === null ? 'Não verificável.' : `${Math.round(s.titleCoverage * 100)}% das páginas com <title>; comprimento médio ${s.avgTitleLength ?? '—'}.` },
    { key: 'descriptions', label: 'Meta descriptions', weight: 0.15, value: s.descriptionCoverage, detail: s.descriptionCoverage === null ? 'Não verificável.' : `${Math.round(s.descriptionCoverage * 100)}% das páginas com meta description.` },
    { key: 'headings', label: 'Estrutura de cabeçalhos', weight: 0.12, value: s.h1Coverage, detail: s.h1Coverage === null ? 'Não verificável.' : `${Math.round(s.h1Coverage * 100)}% das páginas com H1.` },
    { key: 'structured_data', label: 'Dados estruturados', weight: 0.15, value: clamp01(ratio(s.structuredDataTypes.length, 3) * 0.7 + (s.hasOpenGraph ? 0.3 : 0)), detail: s.structuredDataTypes.length ? `Tipos: ${s.structuredDataTypes.slice(0, 6).join(', ')}.` : 'Nenhum dado estruturado encontrado.' },
    { key: 'indexability', label: 'Indexabilidade', weight: 0.15, value: clamp01((s.hasSitemap ? 0.4 : 0) + (s.hasRobotsTxt ? 0.2 : 0) + (s.hasCanonical ? 0.2 : 0) + ratio(s.indexablePages, 20) * 0.2), detail: `${s.indexablePages} páginas indexáveis observadas; sitemap ${s.hasSitemap ? 'sim' : 'não'}, canonical ${s.hasCanonical ? 'sim' : 'não'}.` },
    { key: 'content_depth', label: 'Profundidade de conteúdo', weight: 0.15, value: s.pagesCrawled === 0 ? null : clamp01(ratio(s.wordCountTotal, 6000) * 0.6 + ratio(s.internalLinks, 60) * 0.4), detail: `${s.wordCountTotal} palavras e ${s.internalLinks} links internos nas páginas coletadas.` },
    { key: 'local_seo', label: 'Sinais locais', weight: 0.1, value: s.hasLocalSignals ? 1 : 0, detail: s.hasLocalSignals ? 'Endereço/cidade publicados com dados estruturados locais.' : 'Sem sinais locais estruturados (endereço, cidade, LocalBusiness).' },
    { key: 'images', label: 'Acessibilidade de imagens', weight: 0.05, value: s.imageAltCoverage, detail: s.imageAltCoverage === null ? 'Sem imagens observadas.' : `${Math.round(s.imageAltCoverage * 100)}% das imagens com atributo alt.` },
  ];

  return composeScore(
    components,
    'Avaliação de SEO técnico e de conteúdo baseada exclusivamente no HTML servido publicamente nas páginas coletadas. Não inclui posição em buscadores, volume de busca, backlinks ou autoridade de domínio — métricas que exigem APIs externas e que o Radar não estima.',
  );
}

export type { WebsiteMetric, SeoMetric };
