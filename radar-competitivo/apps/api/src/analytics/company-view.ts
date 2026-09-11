import { prisma } from '../lib/prisma.js';
import { aggregateThemes, type ThemeAggregate } from '../parsers/review-analysis.js';
import type { ScoreComponent } from './metrics.js';

/**
 * Visão consolidada de uma empresa: o objeto que alimenta a engine analítica,
 * a interface e as ferramentas da IA. Tudo o que aparece aqui foi coletado —
 * campos sem dado permanecem nulos e são exibidos como "não disponível".
 */

export type ReputationView = {
  rating: number | null;
  reviewCount: number | null;
  sources: { sourceLabel: string; sourceUrl: string; rating: number | null; reviewCount: number | null; observedAt: Date }[];
  history: { observedAt: Date; rating: number | null; reviewCount: number | null }[];
  themes: ThemeAggregate[];
  sentiment: { positive: number; negative: number; neutral: number; mixed: number; averageScore: number | null };
  reviewsAnalyzed: number;
  available: boolean;
  note: string | null;
};

export type CompanyView = {
  id: string;
  role: 'SELF' | 'COMPETITOR';
  name: string;
  domain: string | null;
  website: string | null;
  city: string | null;
  state: string | null;
  segment: string | null;
  description: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  priceRange: string | null;
  openingHours: string | null;
  unitsCount: number | null;
  isDemo: boolean;
  lastCollectedAt: Date | null;
  reputation: ReputationView;
  offerings: { kind: string; name: string; normalized: string; url: string | null; evidenceId: string | null }[];
  prices: { label: string; amount: number; currency: string; unit: string | null; isPromo: boolean; observedAt: Date; url: string | null }[];
  priceHistory: Record<string, { amount: number; observedAt: Date; isPromo: boolean }[]>;
  social: { platform: string; url: string; handle: string | null; followers: number | null; note: string | null }[];
  website_metrics: {
    score: number | null;
    components: ScoreComponent[];
    coverage: number;
    methodology: string;
    pagesCrawled: number;
    pagesDiscovered: number;
    hasBlog: boolean;
    blogPostsSeen: number;
    publishIntervalDays: number | null;
    hasContactForm: boolean;
    hasWhatsapp: boolean;
    ctaCount: number;
    httpsOk: boolean;
    avgResponseMs: number | null;
  } | null;
  seo_metrics: {
    score: number | null;
    components: ScoreComponent[];
    coverage: number;
    methodology: string;
    indexablePages: number;
    structuredDataTypes: string[];
    keywords: { term: string; count: number }[];
    titleCoverage: number | null;
    descriptionCoverage: number | null;
    h1Coverage: number | null;
    wordCountTotal: number;
    hasLocalSignals: boolean;
  } | null;
  changes: { kind: string; impact: string; summary: string; observedAt: Date; evidenceId: string | null }[];
  signals: { kind: string; label: string; detail: string | null; strength: number; methodology: string | null; observedAt: Date }[];
  images: { url: string; category: string; alt: string | null; pageUrl: string | null }[];
  sources: { kind: string; url: string; label: string | null; trust: number; lastSeenAt: Date | null }[];
  snapshots: { collectedAt: Date; websiteScore: number | null; seoScore: number | null }[];
};

function jsonArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export async function loadCompanyView(companyId: string): Promise<CompanyView> {
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });

  const [summaries, reviews, offerings, prices, social, web, seo, changes, signals, images, sources, snapshots] = await Promise.all([
    prisma.reviewSummary.findMany({ where: { companyId }, orderBy: { observedAt: 'desc' }, take: 60 }),
    prisma.review.findMany({ where: { companyId }, orderBy: { collectedAt: 'desc' }, take: 500 }),
    prisma.offering.findMany({ where: { companyId, removedAt: null }, orderBy: { name: 'asc' } }),
    prisma.priceObservation.findMany({ where: { companyId }, orderBy: { observedAt: 'desc' }, take: 300 }),
    prisma.socialProfile.findMany({ where: { companyId }, include: { snapshots: { orderBy: { observedAt: 'desc' }, take: 1 } } }),
    prisma.websiteMetric.findFirst({ where: { companyId }, orderBy: { observedAt: 'desc' } }),
    prisma.seoMetric.findFirst({ where: { companyId }, orderBy: { observedAt: 'desc' } }),
    prisma.companyChange.findMany({ where: { companyId }, orderBy: { observedAt: 'desc' }, take: 100 }),
    prisma.commercialSignal.findMany({ where: { companyId }, orderBy: { observedAt: 'desc' }, take: 40 }),
    prisma.companyImage.findMany({ where: { companyId }, orderBy: { observedAt: 'desc' }, take: 60 }),
    prisma.source.findMany({ where: { companyId }, orderBy: { lastSeenAt: 'desc' }, take: 60 }),
    prisma.companySnapshot.findMany({ where: { companyId }, orderBy: { collectedAt: 'desc' }, take: 24 }),
  ]);

  // Reputação: a fonte mais recente com maior volume é a de referência.
  const latestBySource = new Map<string, (typeof summaries)[number]>();
  for (const s of summaries) if (!latestBySource.has(s.sourceLabel)) latestBySource.set(s.sourceLabel, s);
  const current = [...latestBySource.values()].sort((a, b) => (b.reviewCount ?? 0) - (a.reviewCount ?? 0))[0] ?? null;

  const themeData = aggregateThemes(reviews.map((r) => ({ text: r.text, rating: r.rating })));

  const priceHistory: CompanyView['priceHistory'] = {};
  for (const p of prices) {
    (priceHistory[p.label] ??= []).push({ amount: p.amount, observedAt: p.observedAt, isPromo: p.isPromo });
  }
  for (const key of Object.keys(priceHistory)) {
    priceHistory[key].sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime());
  }

  const currentPrices = Object.entries(priceHistory).map(([label, entries]) => {
    const last = entries[entries.length - 1];
    const source = prices.find((p) => p.label === label && p.amount === last.amount);
    return {
      label,
      amount: last.amount,
      currency: source?.currency ?? 'BRL',
      unit: source?.unit ?? null,
      isPromo: last.isPromo,
      observedAt: last.observedAt,
      url: source?.url ?? null,
    };
  });

  return {
    id: company.id,
    role: company.role,
    name: company.name,
    domain: company.domain,
    website: company.website,
    city: company.city,
    state: company.state,
    segment: company.segment,
    description: company.description,
    phone: company.phone,
    email: company.email,
    address: company.address,
    priceRange: company.priceRange,
    openingHours: company.openingHours,
    unitsCount: company.unitsCount,
    isDemo: company.isDemo,
    lastCollectedAt: company.lastCollectedAt,
    reputation: {
      rating: current?.rating ?? null,
      reviewCount: current?.reviewCount ?? null,
      sources: [...latestBySource.values()].map((s) => ({
        sourceLabel: s.sourceLabel,
        sourceUrl: s.sourceUrl,
        rating: s.rating,
        reviewCount: s.reviewCount,
        observedAt: s.observedAt,
      })),
      history: summaries
        .slice()
        .reverse()
        .map((s) => ({ observedAt: s.observedAt, rating: s.rating, reviewCount: s.reviewCount })),
      themes: themeData.themes,
      sentiment: themeData.sentiment,
      reviewsAnalyzed: themeData.analyzed,
      available: Boolean(current) || reviews.length > 0,
      note:
        current || reviews.length > 0
          ? null
          : 'Nenhuma fonte pública de avaliações foi coletada para esta empresa. Portais de avaliação exigem integração própria ou API oficial.',
    },
    offerings: offerings.map((o) => ({ kind: o.kind, name: o.name, normalized: o.normalized, url: o.url, evidenceId: o.evidenceId })),
    prices: currentPrices,
    priceHistory,
    social: social.map((s) => ({
      platform: s.platform,
      url: s.url,
      handle: s.handle,
      followers: s.snapshots[0]?.followers ?? null,
      note: s.snapshots[0]?.note ?? null,
    })),
    website_metrics: web
      ? {
          score: web.score,
          components: jsonArray<ScoreComponent>((web.breakdown as any)?.components),
          coverage: (web.breakdown as any)?.coverage ?? 0,
          methodology: (web.breakdown as any)?.methodology ?? '',
          pagesCrawled: web.pagesCrawled,
          pagesDiscovered: web.pagesDiscovered,
          hasBlog: web.hasBlog,
          blogPostsSeen: web.blogPostsSeen,
          publishIntervalDays: web.publishIntervalDays,
          hasContactForm: web.hasContactForm,
          hasWhatsapp: web.hasWhatsapp,
          ctaCount: web.ctaCount,
          httpsOk: web.httpsOk,
          avgResponseMs: web.avgResponseMs,
        }
      : null,
    seo_metrics: seo
      ? {
          score: seo.score,
          components: jsonArray<ScoreComponent>((seo.breakdown as any)?.components),
          coverage: (seo.breakdown as any)?.coverage ?? 0,
          methodology: (seo.breakdown as any)?.methodology ?? '',
          indexablePages: seo.indexablePages,
          structuredDataTypes: seo.structuredDataTypes,
          keywords: jsonArray<{ term: string; count: number }>(seo.keywords),
          titleCoverage: seo.titleCoverage,
          descriptionCoverage: seo.descriptionCoverage,
          h1Coverage: seo.h1Coverage,
          wordCountTotal: seo.wordCountTotal,
          hasLocalSignals: seo.hasLocalSignals,
        }
      : null,
    changes: changes.map((c) => ({ kind: c.kind, impact: c.impact, summary: c.summary, observedAt: c.observedAt, evidenceId: c.evidenceId })),
    signals: signals.map((s) => ({ kind: s.kind, label: s.label, detail: s.detail, strength: s.strength, methodology: s.methodology, observedAt: s.observedAt })),
    images: images.map((i) => ({ url: i.url, category: i.category, alt: i.alt, pageUrl: i.pageUrl })),
    sources: sources.map((s) => ({ kind: s.kind, url: s.url, label: s.label, trust: s.trust, lastSeenAt: s.lastSeenAt })),
    snapshots: snapshots
      .slice()
      .reverse()
      .map((s) => ({
        collectedAt: s.collectedAt,
        websiteScore: (s.payload as any)?.websiteScore ?? null,
        seoScore: (s.payload as any)?.seoScore ?? null,
      })),
  };
}

export async function loadProjectViews(projectId: string): Promise<CompanyView[]> {
  const companies = await prisma.company.findMany({ where: { projectId }, orderBy: [{ role: 'asc' }, { name: 'asc' }] });
  return Promise.all(companies.map((c) => loadCompanyView(c.id)));
}
