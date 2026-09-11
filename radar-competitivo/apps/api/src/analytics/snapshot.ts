import crypto from 'node:crypto';
import { ChangeImpact, ChangeKind, DataNature, type Company } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { collapse } from '../parsers/text.js';

/**
 * Snapshots e detecção de mudanças.
 *
 * O diferencial do produto não é analisar o concorrente uma vez: é acompanhá-lo.
 * Cada coleta produz um retrato normalizado e imutável; o diff entre o retrato
 * anterior e o atual gera os eventos da linha do tempo, os alertas e os sinais
 * comerciais indiretos.
 */

export type SnapshotPayload = {
  profile: {
    name: string;
    description: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    priceRange: string | null;
    openingHours: string | null;
    unitsCount: number | null;
  };
  pages: { url: string; title: string | null; hash: string | null }[];
  offerings: { kind: string; normalized: string; name: string; url: string | null }[];
  prices: { label: string; amount: number; currency: string; isPromo: boolean }[];
  social: { platform: string; url: string }[];
  reputation: { sourceLabel: string; rating: number | null; reviewCount: number | null }[];
  reviewCountTotal: number;
  websiteScore: number | null;
  seoScore: number | null;
  ctas: number;
  blogPostsSeen: number;
};

export async function buildSnapshotPayload(companyId: string): Promise<SnapshotPayload> {
  const [company, pages, offerings, prices, social, reputation, reviewCountTotal, web, seo] = await Promise.all([
    prisma.company.findUniqueOrThrow({ where: { id: companyId } }),
    prisma.crawlPage.findMany({
      where: { companyId, status: { in: ['FETCHED', 'NOT_MODIFIED'] } },
      orderBy: { collectedAt: 'desc' },
      distinct: ['url'],
      select: { url: true, title: true, contentHash: true },
      take: 300,
    }),
    prisma.offering.findMany({ where: { companyId, removedAt: null }, select: { kind: true, normalized: true, name: true, url: true } }),
    prisma.priceObservation.findMany({ where: { companyId }, orderBy: { observedAt: 'desc' }, distinct: ['label'], select: { label: true, amount: true, currency: true, isPromo: true }, take: 100 }),
    prisma.socialProfile.findMany({ where: { companyId }, select: { platform: true, url: true } }),
    prisma.reviewSummary.findMany({ where: { companyId }, orderBy: { observedAt: 'desc' }, distinct: ['sourceLabel'], select: { sourceLabel: true, rating: true, reviewCount: true } }),
    prisma.review.count({ where: { companyId } }),
    prisma.websiteMetric.findFirst({ where: { companyId }, orderBy: { observedAt: 'desc' } }),
    prisma.seoMetric.findFirst({ where: { companyId }, orderBy: { observedAt: 'desc' } }),
  ]);

  return {
    profile: {
      name: company.name,
      description: company.description,
      phone: company.phone,
      email: company.email,
      address: company.address,
      city: company.city,
      state: company.state,
      priceRange: company.priceRange,
      openingHours: company.openingHours,
      unitsCount: company.unitsCount,
    },
    pages: pages.map((p) => ({ url: p.url, title: p.title, hash: p.contentHash })),
    offerings: offerings.map((o) => ({ kind: o.kind, normalized: o.normalized, name: o.name, url: o.url })),
    prices: prices.map((p) => ({ label: p.label, amount: p.amount, currency: p.currency, isPromo: p.isPromo })),
    social: social.map((s) => ({ platform: s.platform, url: s.url })),
    reputation: reputation.map((r) => ({ sourceLabel: r.sourceLabel, rating: r.rating, reviewCount: r.reviewCount })),
    reviewCountTotal,
    websiteScore: web?.score ?? null,
    seoScore: seo?.score ?? null,
    ctas: web?.ctaCount ?? 0,
    blogPostsSeen: web?.blogPostsSeen ?? 0,
  };
}

export function hashPayload(payload: SnapshotPayload): string {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export type DetectedChange = {
  kind: ChangeKind;
  impact: ChangeImpact;
  field?: string;
  previousValue?: string;
  currentValue?: string;
  summary: string;
};

/** Compara dois retratos e devolve as mudanças observadas. */
export function diffSnapshots(previous: SnapshotPayload, current: SnapshotPayload, companyName: string): DetectedChange[] {
  const changes: DetectedChange[] = [];

  // ── Páginas ───────────────────────────────────────────────────────────────
  const prevPages = new Map(previous.pages.map((p) => [p.url, p]));
  const currPages = new Map(current.pages.map((p) => [p.url, p]));
  for (const [url, page] of currPages) {
    if (!prevPages.has(url)) {
      changes.push({
        kind: ChangeKind.PAGE_ADDED,
        impact: /\/(servicos?|produtos?|planos?|precos?)/i.test(url) ? ChangeImpact.MEDIUM : ChangeImpact.LOW,
        field: 'page',
        currentValue: url,
        summary: `${companyName} publicou uma nova página: ${page.title ? `"${page.title}" (${url})` : url}.`,
      });
    } else {
      const before = prevPages.get(url)!;
      if (before.hash && page.hash && before.hash !== page.hash) {
        changes.push({
          kind: ChangeKind.CONTENT_CHANGED,
          impact: ChangeImpact.LOW,
          field: 'page',
          previousValue: before.hash.slice(0, 12),
          currentValue: page.hash.slice(0, 12),
          summary: `Conteúdo alterado em ${url}${page.title ? ` ("${page.title}")` : ''}.`,
        });
      }
      if (before.title && page.title && before.title !== page.title) {
        changes.push({
          kind: ChangeKind.TITLE_CHANGED,
          impact: ChangeImpact.MEDIUM,
          field: 'title',
          previousValue: before.title,
          currentValue: page.title,
          summary: `Título de ${url} mudou de "${before.title}" para "${page.title}".`,
        });
      }
    }
  }
  for (const [url] of prevPages) {
    if (!currPages.has(url)) {
      changes.push({
        kind: ChangeKind.PAGE_REMOVED,
        impact: ChangeImpact.LOW,
        field: 'page',
        previousValue: url,
        summary: `A página ${url} não foi mais encontrada na coleta de ${companyName}.`,
      });
    }
  }

  // ── Oferta ────────────────────────────────────────────────────────────────
  const prevOff = new Map(previous.offerings.map((o) => [`${o.kind}:${o.normalized}`, o]));
  const currOff = new Map(current.offerings.map((o) => [`${o.kind}:${o.normalized}`, o]));
  for (const [key, off] of currOff) {
    if (prevOff.has(key)) continue;
    changes.push({
      kind: off.kind === 'PRODUCT' ? ChangeKind.PRODUCT_ADDED : ChangeKind.SERVICE_ADDED,
      impact: ChangeImpact.HIGH,
      field: 'offering',
      currentValue: off.name,
      summary: `${companyName} passou a divulgar ${off.kind === 'PRODUCT' ? 'o produto' : 'o serviço'} "${off.name}".`,
    });
  }
  for (const [key, off] of prevOff) {
    if (currOff.has(key)) continue;
    changes.push({
      kind: off.kind === 'PRODUCT' ? ChangeKind.PRODUCT_REMOVED : ChangeKind.SERVICE_REMOVED,
      impact: ChangeImpact.MEDIUM,
      field: 'offering',
      previousValue: off.name,
      summary: `"${off.name}" não aparece mais na oferta pública de ${companyName}.`,
    });
  }

  // ── Preços ────────────────────────────────────────────────────────────────
  const prevPrice = new Map(previous.prices.map((p) => [p.label, p]));
  for (const price of current.prices) {
    const before = prevPrice.get(price.label);
    if (!before || before.amount === price.amount) continue;
    const delta = ((price.amount - before.amount) / before.amount) * 100;
    changes.push({
      kind: ChangeKind.PRICE_CHANGED,
      impact: Math.abs(delta) >= 10 ? ChangeImpact.HIGH : ChangeImpact.MEDIUM,
      field: price.label,
      previousValue: `${before.currency} ${before.amount.toFixed(2)}`,
      currentValue: `${price.currency} ${price.amount.toFixed(2)}`,
      summary: `Preço observado de "${collapse(price.label).slice(0, 60)}" mudou ${delta > 0 ? 'de alta' : 'de baixa'} (${delta > 0 ? '+' : ''}${delta.toFixed(1)}%): ${before.currency} ${before.amount.toFixed(2)} → ${price.currency} ${price.amount.toFixed(2)}.`,
    });
  }

  // ── Reputação ─────────────────────────────────────────────────────────────
  const prevRep = new Map(previous.reputation.map((r) => [r.sourceLabel, r]));
  for (const rep of current.reputation) {
    const before = prevRep.get(rep.sourceLabel);
    if (!before) continue;
    if (before.rating !== null && rep.rating !== null && Math.abs(before.rating - rep.rating) >= 0.1) {
      changes.push({
        kind: ChangeKind.RATING_CHANGED,
        impact: Math.abs(before.rating - rep.rating) >= 0.3 ? ChangeImpact.HIGH : ChangeImpact.MEDIUM,
        field: rep.sourceLabel,
        previousValue: before.rating.toFixed(2),
        currentValue: rep.rating.toFixed(2),
        summary: `Nota em "${rep.sourceLabel}" passou de ${before.rating.toFixed(1)} para ${rep.rating.toFixed(1)}.`,
      });
    }
    if (before.reviewCount !== null && rep.reviewCount !== null && rep.reviewCount > before.reviewCount) {
      const growth = rep.reviewCount - before.reviewCount;
      changes.push({
        kind: ChangeKind.REVIEW_VOLUME_CHANGED,
        impact: growth >= 20 ? ChangeImpact.HIGH : ChangeImpact.MEDIUM,
        field: rep.sourceLabel,
        previousValue: String(before.reviewCount),
        currentValue: String(rep.reviewCount),
        summary: `${companyName} recebeu +${growth} avaliações em "${rep.sourceLabel}" (${before.reviewCount} → ${rep.reviewCount}).`,
      });
    }
  }

  // ── Redes sociais ─────────────────────────────────────────────────────────
  const prevSocial = new Set(previous.social.map((s) => s.url));
  const currSocial = new Set(current.social.map((s) => s.url));
  for (const s of current.social) {
    if (!prevSocial.has(s.url)) {
      changes.push({
        kind: ChangeKind.SOCIAL_PROFILE_ADDED,
        impact: ChangeImpact.MEDIUM,
        field: s.platform,
        currentValue: s.url,
        summary: `${companyName} passou a divulgar um perfil em ${s.platform}: ${s.url}.`,
      });
    }
  }
  for (const s of previous.social) {
    if (!currSocial.has(s.url)) {
      changes.push({
        kind: ChangeKind.SOCIAL_PROFILE_REMOVED,
        impact: ChangeImpact.LOW,
        field: s.platform,
        previousValue: s.url,
        summary: `O perfil ${s.url} não é mais divulgado no site de ${companyName}.`,
      });
    }
  }

  // ── Perfil ────────────────────────────────────────────────────────────────
  const profileFields: { key: keyof SnapshotPayload['profile']; kind: ChangeKind; label: string; impact: ChangeImpact }[] = [
    { key: 'description', kind: ChangeKind.DESCRIPTION_CHANGED, label: 'descrição', impact: ChangeImpact.MEDIUM },
    { key: 'phone', kind: ChangeKind.CONTACT_CHANGED, label: 'telefone', impact: ChangeImpact.LOW },
    { key: 'email', kind: ChangeKind.CONTACT_CHANGED, label: 'e-mail', impact: ChangeImpact.LOW },
    { key: 'address', kind: ChangeKind.ADDRESS_CHANGED, label: 'endereço', impact: ChangeImpact.HIGH },
    { key: 'openingHours', kind: ChangeKind.CONTENT_CHANGED, label: 'horário', impact: ChangeImpact.LOW },
    { key: 'priceRange', kind: ChangeKind.PRICE_CHANGED, label: 'faixa de preço', impact: ChangeImpact.MEDIUM },
  ];
  for (const field of profileFields) {
    const before = previous.profile[field.key];
    const after = current.profile[field.key];
    if (before && after && String(before) !== String(after)) {
      changes.push({
        kind: field.kind,
        impact: field.impact,
        field: String(field.key),
        previousValue: String(before).slice(0, 300),
        currentValue: String(after).slice(0, 300),
        summary: `${companyName} alterou ${field.label}.`,
      });
    }
  }

  // ── Conteúdo editorial ────────────────────────────────────────────────────
  if (current.blogPostsSeen > previous.blogPostsSeen) {
    changes.push({
      kind: ChangeKind.BLOG_ACTIVITY_CHANGED,
      impact: ChangeImpact.LOW,
      field: 'blog',
      previousValue: String(previous.blogPostsSeen),
      currentValue: String(current.blogPostsSeen),
      summary: `${companyName} publicou ${current.blogPostsSeen - previous.blogPostsSeen} novo(s) conteúdo(s) editorial(is) desde a última coleta.`,
    });
  }

  return changes;
}

/**
 * Grava o snapshot e persiste as mudanças detectadas. Devolve as mudanças para
 * que a camada de alertas e de sinais comerciais as consuma.
 */
export async function snapshotAndDetect(company: Company, jobId?: string) {
  const payload = await buildSnapshotPayload(company.id);
  const hash = hashPayload(payload);

  const previous = await prisma.companySnapshot.findFirst({
    where: { companyId: company.id },
    orderBy: { collectedAt: 'desc' },
  });

  const snapshot = await prisma.companySnapshot.create({
    data: {
      companyId: company.id,
      jobId: jobId ?? null,
      payload: payload as never,
      hash,
      pageCount: payload.pages.length,
      collectedAt: new Date(),
    },
  });

  if (!previous) {
    return { snapshot, changes: [], isFirst: true as const };
  }
  if (previous.hash === hash) {
    return { snapshot, changes: [], isFirst: false as const };
  }

  const detected = diffSnapshots(previous.payload as unknown as SnapshotPayload, payload, company.name);
  const evidenceForUrl = async (url?: string) => {
    if (!url) return null;
    const page = await prisma.crawlPage.findFirst({ where: { companyId: company.id, url }, orderBy: { collectedAt: 'desc' } });
    if (!page) return null;
    const ev = await prisma.evidence.findFirst({ where: { companyId: company.id, url: page.finalUrl ?? page.url }, orderBy: { collectedAt: 'desc' } });
    return ev?.id ?? null;
  };

  const stored = [];
  for (const change of detected.slice(0, 200)) {
    const evidenceId = await evidenceForUrl(change.currentValue?.startsWith('http') ? change.currentValue : undefined);
    stored.push(
      await prisma.companyChange.create({
        data: {
          companyId: company.id,
          snapshotId: snapshot.id,
          kind: change.kind,
          impact: change.impact,
          field: change.field,
          previousValue: change.previousValue?.slice(0, 1000),
          currentValue: change.currentValue?.slice(0, 1000),
          summary: change.summary.slice(0, 1000),
          evidenceId,
          observedAt: new Date(),
        },
      }),
    );
  }

  await deriveCommercialSignals(company, detected);

  return { snapshot, changes: stored, isFirst: false as const };
}

/**
 * Sinais comerciais indiretos.
 *
 * A especificação é explícita: não inventar faturamento, vendas ou clientes.
 * O que o Radar faz é registrar sinais observáveis — crescimento de avaliações,
 * novos serviços, mudanças de preço, novos canais — sempre rotulados como
 * ESTIMATIVA e acompanhados da metodologia que os gerou.
 */
async function deriveCommercialSignals(company: Company, changes: DetectedChange[]) {
  const signals: { kind: string; label: string; detail: string; strength: number; methodology: string }[] = [];

  const reviewGrowth = changes.filter((c) => c.kind === ChangeKind.REVIEW_VOLUME_CHANGED);
  if (reviewGrowth.length > 0) {
    const total = reviewGrowth.reduce((sum, c) => sum + (Number(c.currentValue) - Number(c.previousValue) || 0), 0);
    signals.push({
      kind: 'review_growth',
      label: `Crescimento de ${total} avaliações públicas`,
      detail: reviewGrowth.map((c) => c.summary).join(' '),
      strength: Math.min(1, total / 50),
      methodology: 'Diferença entre a contagem de avaliações registrada na coleta anterior e a atual, na mesma fonte pública. Indica atividade comercial recente; não é medida de vendas.',
    });
  }

  const newOfferings = changes.filter((c) => c.kind === ChangeKind.PRODUCT_ADDED || c.kind === ChangeKind.SERVICE_ADDED);
  if (newOfferings.length > 0) {
    signals.push({
      kind: 'new_offering',
      label: `${newOfferings.length} nova(s) oferta(s) divulgada(s)`,
      detail: newOfferings.map((c) => c.currentValue).filter(Boolean).join(', '),
      strength: Math.min(1, newOfferings.length / 4),
      methodology: 'Ofertas presentes na coleta atual e ausentes na anterior, identificadas em páginas públicas ou dados estruturados.',
    });
  }

  const priceMoves = changes.filter((c) => c.kind === ChangeKind.PRICE_CHANGED && c.previousValue && c.currentValue);
  if (priceMoves.length > 0) {
    signals.push({
      kind: 'price_change',
      label: `${priceMoves.length} mudança(s) de preço observada(s)`,
      detail: priceMoves.map((c) => c.summary).slice(0, 5).join(' '),
      strength: Math.min(1, priceMoves.length / 5),
      methodology: 'Comparação de preços publicamente exibidos entre duas coletas, por rótulo de item.',
    });
  }

  const newChannels = changes.filter((c) => c.kind === ChangeKind.SOCIAL_PROFILE_ADDED);
  if (newChannels.length > 0) {
    signals.push({
      kind: 'digital_growth',
      label: `${newChannels.length} novo(s) canal(is) digital(is)`,
      detail: newChannels.map((c) => c.currentValue).filter(Boolean).join(', '),
      strength: Math.min(1, newChannels.length / 3),
      methodology: 'Perfis sociais divulgados no site na coleta atual que não constavam na anterior.',
    });
  }

  const addressChange = changes.find((c) => c.kind === ChangeKind.ADDRESS_CHANGED);
  if (addressChange) {
    signals.push({
      kind: 'geo_expansion',
      label: 'Alteração de endereço publicado',
      detail: `${addressChange.previousValue} → ${addressChange.currentValue}`,
      strength: 0.6,
      methodology: 'Endereço declarado publicamente mudou entre coletas. Pode indicar mudança de sede ou nova unidade — o Radar não afirma qual sem evidência adicional.',
    });
  }

  for (const signal of signals) {
    await prisma.commercialSignal.create({
      data: {
        companyId: company.id,
        kind: signal.kind,
        label: signal.label.slice(0, 200),
        detail: signal.detail?.slice(0, 1000),
        strength: signal.strength,
        nature: DataNature.ESTIMATED,
        methodology: signal.methodology,
        observedAt: new Date(),
      },
    });
  }
}
