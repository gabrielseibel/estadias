import { DataNature, PageStatus, SourceKind, type Company } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { config } from '../config.js';
import { crawlerLog } from '../lib/logger.js';
import { crawlSite, type CrawlSiteResult } from './site-crawler.js';
import { parseHtml } from '../parsers/html.js';
import { extractStructuredData } from '../parsers/structured-data.js';
import { extractOfferings, attachPrices } from '../parsers/offerings.js';
import { publishIntervalDays } from '../parsers/feeds.js';
import { collapse, slugKey, topTerms } from '../parsers/text.js';
import { recordEvidence } from '../lib/evidence.js';
import { seoScore, websiteScore } from '../analytics/metrics.js';
import { classifyImage } from '../analytics/image-category.js';

/**
 * Coletor de empresa: transforma uma varredura de site em dados normalizados,
 * persistidos e rastreáveis.
 *
 * Cada informação gravada aponta para uma evidência (URL + trecho + data). O
 * que não for encontrado simplesmente não é gravado — nunca preenchido com
 * valor plausível.
 */

export type CollectResult = {
  companyId: string;
  reachable: boolean;
  pagesFetched: number;
  pagesSkipped: number;
  pagesFailed: number;
  offerings: number;
  prices: number;
  socialProfiles: number;
  images: number;
  ratingsFound: number;
  notes: string[];
};

export type CollectOptions = {
  jobId?: string;
  maxPages?: number;
  onProgress?: (done: number, total: number, step: string) => void | Promise<void>;
};

function averageOf(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

export async function collectCompany(company: Company, opts: CollectOptions = {}): Promise<CollectResult> {
  const notes: string[] = [];
  const target = company.website || company.domain;
  if (!target) {
    notes.push('Empresa sem website cadastrado — nenhuma fonte para coletar.');
    return { companyId: company.id, reachable: false, pagesFetched: 0, pagesSkipped: 0, pagesFailed: 0, offerings: 0, prices: 0, socialProfiles: 0, images: 0, ratingsFound: 0, notes };
  }

  // Cache: envia ETag/Last-Modified das páginas já conhecidas.
  const previous = await prisma.crawlPage.findMany({
    where: { companyId: company.id },
    orderBy: { collectedAt: 'desc' },
    distinct: ['url'],
    select: { url: true, etag: true, lastModified: true, contentHash: true },
    take: 300,
  });

  await opts.onProgress?.(0, opts.maxPages ?? config.crawler.maxPagesPerSite, `Coletando ${company.name}`);

  const crawl = await crawlSite(target, {
    maxPages: opts.maxPages,
    cachedPages: previous,
    onProgress: (done, total, current) => opts.onProgress?.(done, total, `Coletando ${company.name}: ${current}`),
  });
  notes.push(...crawl.notes);

  const persisted = await persistPages(company, crawl, opts.jobId);
  const extraction = await extractAndPersist(company, crawl);
  await computeMetrics(company, crawl, extraction);

  await prisma.company.update({ where: { id: company.id }, data: { lastCollectedAt: new Date() } });

  return {
    companyId: company.id,
    reachable: crawl.reachable,
    ...persisted,
    ...extraction.counters,
    notes,
  };
}

async function persistPages(company: Company, crawl: CrawlSiteResult, jobId?: string) {
  let pagesFetched = 0;
  let pagesSkipped = 0;
  let pagesFailed = 0;
  const retentionCutoff = new Date(Date.now() - config.retention.rawContentDays * 86_400_000);

  for (const page of crawl.pages) {
    const status = page.status as PageStatus;
    if (status === 'FETCHED') pagesFetched++;
    else if (status === 'NOT_MODIFIED' || status === 'SKIPPED_ROBOTS' || status === 'SKIPPED_LIMIT') pagesSkipped++;
    else pagesFailed++;

    await prisma.crawlPage.create({
      data: {
        companyId: company.id,
        jobId: jobId ?? null,
        url: page.url.slice(0, 2000),
        finalUrl: page.finalUrl?.slice(0, 2000),
        status,
        httpStatus: page.httpStatus,
        contentType: page.contentType,
        contentHash: page.contentHash,
        etag: page.etag ?? null,
        lastModified: page.lastModified ?? null,
        bytes: page.bytes,
        fetchMs: page.fetchMs,
        depth: page.depth,
        title: page.parsed?.title ?? null,
        text: page.parsed?.text?.slice(0, 40_000) ?? null,
        rawHtml: page.html?.slice(0, 400_000) ?? null,
        error: page.error?.slice(0, 500),
      },
    });
  }

  // Política de retenção: HTML bruto antigo é descartado; texto e evidências ficam.
  await prisma.crawlPage.updateMany({
    where: { companyId: company.id, collectedAt: { lt: retentionCutoff }, rawHtml: { not: null } },
    data: { rawHtml: null },
  });

  return { pagesFetched, pagesSkipped, pagesFailed };
}

type ExtractionResult = {
  counters: { offerings: number; prices: number; socialProfiles: number; images: number; ratingsFound: number };
  offeringsCount: number;
  descriptionCoverage: number | null;
};

async function extractAndPersist(company: Company, crawl: CrawlSiteResult): Promise<ExtractionResult> {
  const orgId = company.organizationId;
  const fetched = crawl.pages.filter((p) => p.status === 'FETCHED' && p.parsed);
  let offeringsCount = 0;
  let pricesCount = 0;
  let socialCount = 0;
  let imagesCount = 0;
  let ratingsFound = 0;

  const now = new Date();
  const companyPatch: Record<string, unknown> = {};
  const seenSocial = new Set<string>();
  const seenOffering = new Set<string>();

  for (const page of fetched) {
    const parsed = page.parsed!;
    const structured = extractStructuredData(parsed.jsonLd, parsed.openGraph, parsed.microdataTypes, page.finalUrl);

    const pageEvidence = async (excerpt: string, confidence: number) =>
      recordEvidence({
        organizationId: orgId,
        companyId: company.id,
        sourceKind: SourceKind.WEBSITE,
        sourceLabel: parsed.title ?? new URL(page.finalUrl).hostname,
        url: page.finalUrl,
        excerpt,
        contentHash: page.contentHash,
        httpStatus: page.httpStatus,
        confidence,
        collectedAt: now,
      });

    // ── Perfil da empresa (Schema.org tem precedência sobre heurística) ──────
    if (structured.company) {
      const c = structured.company;
      const assign = (field: string, value: unknown) => {
        if (value === undefined || value === null || value === '') return;
        if (companyPatch[field] === undefined) companyPatch[field] = value;
      };
      assign('legalName', c.legalName);
      assign('description', c.description ?? parsed.metaDescription);
      assign('phone', c.telephone);
      assign('email', c.email);
      assign('address', c.streetAddress);
      assign('city', c.city);
      assign('state', c.state);
      assign('country', c.country);
      assign('latitude', c.latitude);
      assign('longitude', c.longitude);
      assign('priceRange', c.priceRange);
      assign('openingHours', c.openingHours);
      if (c.name && slugKey(c.name) !== slugKey(company.name)) {
        companyPatch['aliases'] = [...new Set([...(company.aliases ?? []), collapse(c.name)])];
      }
    }
    if (!companyPatch['description'] && parsed.metaDescription) companyPatch['description'] = parsed.metaDescription;
    if (!companyPatch['phone'] && parsed.phones[0]) companyPatch['phone'] = parsed.phones[0];
    if (!companyPatch['email'] && parsed.emails[0]) companyPatch['email'] = parsed.emails[0];

    // ── Reputação declarada em dados estruturados ───────────────────────────
    for (const rating of structured.ratings) {
      const normalized = rating.best && rating.best !== 5 ? (rating.value / rating.best) * 5 : rating.value;
      if (!Number.isFinite(normalized) || normalized <= 0 || normalized > 5) continue;
      ratingsFound++;
      const ev = await pageEvidence(`aggregateRating: ${rating.value}${rating.count ? ` (${rating.count} avaliações)` : ''}`, 0.8);
      await prisma.reviewSummary.create({
        data: {
          companyId: company.id,
          sourceLabel: 'Dados estruturados do próprio site (Schema.org)',
          sourceUrl: page.finalUrl,
          rating: Number(normalized.toFixed(2)),
          reviewCount: rating.count ?? null,
          nature: DataNature.CONFIRMED,
          evidenceId: ev.id,
          observedAt: now,
        },
      });
    }

    // ── Avaliações individuais publicadas na própria página ─────────────────
    for (const review of structured.reviews) {
      const text = review.text?.trim();
      if (!text || text.length < 15) continue;
      const contentHash = slugKey(text).slice(0, 200);
      const ev = await pageEvidence(text.slice(0, 300), 0.7);
      await prisma.review.upsert({
        where: { companyId_contentHash: { companyId: company.id, contentHash } },
        create: {
          companyId: company.id,
          sourceUrl: page.finalUrl,
          sourceLabel: 'Depoimento publicado no site',
          rating: review.rating ?? null,
          text: text.slice(0, 4000),
          publishedAt: review.datePublished ? new Date(review.datePublished) : null,
          contentHash,
          evidenceId: ev.id,
        },
        update: { collectedAt: now },
      });
    }

    // ── Produtos e serviços ────────────────────────────────────────────────
    const offerings = extractOfferings(parsed, structured, page.finalUrl);
    for (const off of offerings) {
      const key = `${off.kind}:${off.normalized}`;
      if (seenOffering.has(key)) continue;
      seenOffering.add(key);
      const ev = await pageEvidence(off.evidenceExcerpt, off.confidence);
      await prisma.offering.upsert({
        where: { companyId_kind_normalized: { companyId: company.id, kind: off.kind, normalized: off.normalized } },
        create: {
          companyId: company.id,
          kind: off.kind,
          name: off.name,
          normalized: off.normalized,
          category: off.category,
          description: off.description,
          url: off.url,
          evidenceId: ev.id,
          nature: DataNature.CONFIRMED,
          firstSeenAt: now,
          lastSeenAt: now,
        },
        update: { lastSeenAt: now, removedAt: null, evidenceId: ev.id, name: off.name, url: off.url },
      });
      offeringsCount++;
    }

    // ── Preços públicos ────────────────────────────────────────────────────
    const prices = attachPrices(parsed, offerings, page.finalUrl);
    for (const price of prices.slice(0, 30)) {
      const offering = price.offeringNormalized
        ? await prisma.offering.findFirst({ where: { companyId: company.id, normalized: price.offeringNormalized } })
        : null;
      // Um preço só é gravado novamente se o valor mudou desde a última observação.
      const last = await prisma.priceObservation.findFirst({
        where: { companyId: company.id, label: price.label.slice(0, 190) },
        orderBy: { observedAt: 'desc' },
      });
      if (last && last.amount === price.amount && last.isPromo === price.isPromo) continue;
      const ev = await pageEvidence(price.context, 0.75);
      await prisma.priceObservation.create({
        data: {
          companyId: company.id,
          offeringId: offering?.id ?? null,
          label: price.label.slice(0, 190),
          amount: price.amount,
          currency: price.currency,
          unit: price.unit,
          isPromo: price.isPromo,
          url: price.url,
          evidenceId: ev.id,
          nature: DataNature.CONFIRMED,
          observedAt: now,
        },
      });
      pricesCount++;
    }

    // ── Perfis sociais públicos ────────────────────────────────────────────
    const socialUrls = [...parsed.socialLinks, ...(structured.company?.sameAs ?? []).map((url) => ({ platform: platformOf(url), url }))];
    for (const social of socialUrls) {
      if (!social.platform) continue;
      const key = `${social.platform}:${social.url}`;
      if (seenSocial.has(key)) continue;
      seenSocial.add(key);
      const ev = await pageEvidence(`Link para ${social.platform}: ${social.url}`, 0.85);
      const profile = await prisma.socialProfile.upsert({
        where: { companyId_platform_url: { companyId: company.id, platform: social.platform, url: social.url } },
        create: { companyId: company.id, platform: social.platform, url: social.url, handle: handleOf(social.url), evidenceId: ev.id, firstSeenAt: now, lastSeenAt: now },
        update: { lastSeenAt: now },
      });
      // Métricas de seguidores exigem API oficial; o estado honesto é registrado.
      await prisma.socialSnapshot.create({
        data: {
          profileId: profile.id,
          followers: null,
          posts: null,
          bio: null,
          nature: DataNature.UNAVAILABLE,
          note: 'Perfil identificado publicamente. Contagem de seguidores e frequência de publicação exigem API oficial da plataforma — não coletadas.',
          observedAt: now,
        },
      });
      socialCount++;
    }

    // ── Galeria competitiva (URLs + metadados; binários não são armazenados) ─
    for (const img of parsed.images.slice(0, 20)) {
      const category = classifyImage(img.src, img.alt ?? '', page.finalUrl);
      try {
        await prisma.companyImage.upsert({
          where: { companyId_url: { companyId: company.id, url: img.src } },
          create: {
            companyId: company.id,
            url: img.src.slice(0, 2000),
            pageUrl: page.finalUrl,
            category,
            alt: img.alt,
            width: img.width,
            height: img.height,
            observedAt: now,
          },
          update: { observedAt: now, category, alt: img.alt },
        });
        imagesCount++;
      } catch {
        /* URL muito longa ou duplicada — ignorada */
      }
    }

    // ── Fonte registrada ───────────────────────────────────────────────────
    await prisma.source.upsert({
      where: { companyId_url: { companyId: company.id, url: page.finalUrl.slice(0, 2000) } },
      create: { companyId: company.id, kind: SourceKind.WEBSITE, url: page.finalUrl.slice(0, 2000), label: parsed.title ?? undefined, trust: 0.85, lastSeenAt: now },
      update: { lastSeenAt: now, label: parsed.title ?? undefined },
    });
  }

  if (crawl.feed) {
    await prisma.source.upsert({
      where: { companyId_url: { companyId: company.id, url: crawl.feed.url } },
      create: { companyId: company.id, kind: SourceKind.RSS, url: crawl.feed.url, label: 'Feed RSS/Atom', trust: 0.9, lastSeenAt: now },
      update: { lastSeenAt: now },
    });
  }

  if (Object.keys(companyPatch).length > 0) {
    await prisma.company.update({ where: { id: company.id }, data: companyPatch as never });
  }

  const withDescription = fetched.filter((p) => p.parsed?.metaDescription).length;
  return {
    counters: { offerings: offeringsCount, prices: pricesCount, socialProfiles: socialCount, images: imagesCount, ratingsFound },
    offeringsCount,
    descriptionCoverage: fetched.length > 0 ? withDescription / fetched.length : null,
  };
}

function platformOf(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (/instagram\.com$/.test(host)) return 'instagram';
    if (/(facebook|fb)\.com$/.test(host)) return 'facebook';
    if (/linkedin\.com$/.test(host)) return 'linkedin';
    if (/(youtube\.com|youtu\.be)$/.test(host)) return 'youtube';
    if (/tiktok\.com$/.test(host)) return 'tiktok';
    if (/(twitter\.com|x\.com)$/.test(host)) return 'x';
    return null;
  } catch {
    return null;
  }
}

function handleOf(url: string): string | null {
  try {
    const seg = new URL(url).pathname.split('/').filter(Boolean)[0];
    return seg ? seg.replace(/^@/, '').slice(0, 60) : null;
  } catch {
    return null;
  }
}

async function computeMetrics(company: Company, crawl: CrawlSiteResult, extraction: ExtractionResult) {
  const fetched = crawl.pages.filter((p) => p.status === 'FETCHED' && p.parsed);
  const parsedPages = fetched.map((p) => p.parsed!);

  const blogPages = fetched.filter((p) => /\/(blog|noticias|artigos|novidades)/i.test(p.url));
  const publishDates = [
    ...(crawl.feed?.items.map((i) => i.published) ?? []),
    ...parsedPages.flatMap((p) => p.publishedDates),
  ];
  const interval = publishIntervalDays(publishDates);

  const ctaCount = new Set(parsedPages.flatMap((p) => p.ctas)).size;
  const formCount = parsedPages.reduce((s, p) => s + p.forms, 0);
  const socialLinks = new Set(parsedPages.flatMap((p) => p.socialLinks.map((s) => s.url))).size;
  const responseTimes = fetched.map((p) => p.fetchMs).filter((n): n is number => typeof n === 'number');

  const websiteSignals = {
    reachable: crawl.reachable,
    httpsOk: crawl.httpsOk,
    pagesCrawled: fetched.length,
    pagesDiscovered: crawl.discoveredUrls,
    hasSitemap: crawl.sitemapFound,
    hasRss: Boolean(crawl.feed),
    hasBlog: blogPages.length > 0,
    blogPostsSeen: Math.max(blogPages.length, crawl.feed?.items.length ?? 0),
    publishIntervalDays: interval,
    hasContactForm: parsedPages.some((p) => p.hasContactForm),
    hasWhatsapp: parsedPages.some((p) => p.whatsapp.length > 0),
    hasPhone: parsedPages.some((p) => p.phones.length > 0),
    ctaCount,
    formCount,
    socialLinks,
    avgResponseMs: averageOf(responseTimes),
    descriptionCoverage: extraction.descriptionCoverage,
    offeringsCount: extraction.offeringsCount,
  };
  const web = websiteScore(websiteSignals);

  await prisma.websiteMetric.create({
    data: {
      companyId: company.id,
      pagesCrawled: websiteSignals.pagesCrawled,
      pagesDiscovered: websiteSignals.pagesDiscovered,
      hasSitemap: websiteSignals.hasSitemap,
      hasRss: websiteSignals.hasRss,
      hasBlog: websiteSignals.hasBlog,
      blogPostsSeen: websiteSignals.blogPostsSeen,
      publishIntervalDays: interval,
      hasContactForm: websiteSignals.hasContactForm,
      hasWhatsapp: websiteSignals.hasWhatsapp,
      hasPhone: websiteSignals.hasPhone,
      ctaCount,
      formCount,
      socialLinks,
      avgResponseMs: websiteSignals.avgResponseMs,
      httpsOk: crawl.httpsOk,
      score: web.score,
      breakdown: { components: web.components, coverage: web.coverage, methodology: web.methodology } as never,
    },
  });

  const withTitle = parsedPages.filter((p) => p.title).length;
  const withDesc = parsedPages.filter((p) => p.metaDescription).length;
  const withH1 = parsedPages.filter((p) => p.h1.length > 0).length;
  const titleLengths = parsedPages.map((p) => p.title?.length ?? 0).filter((n) => n > 0);
  const totalImages = parsedPages.reduce((s, p) => s + p.images.length, 0);
  const imagesWithAlt = parsedPages.reduce((s, p) => s + p.imagesWithAlt, 0);
  const structuredTypes = new Set<string>();
  for (const page of fetched) {
    const sd = extractStructuredData(page.parsed!.jsonLd, page.parsed!.openGraph, page.parsed!.microdataTypes, page.finalUrl);
    sd.types.forEach((t) => structuredTypes.add(t));
  }
  const allText = parsedPages.map((p) => `${p.title ?? ''} ${p.h1.join(' ')} ${p.h2.join(' ')} ${p.text}`).join(' ');

  const seoSignals = {
    indexablePages: parsedPages.filter((p) => !/noindex/i.test(p.robotsMeta ?? '')).length,
    titleCoverage: parsedPages.length ? withTitle / parsedPages.length : null,
    descriptionCoverage: parsedPages.length ? withDesc / parsedPages.length : null,
    h1Coverage: parsedPages.length ? withH1 / parsedPages.length : null,
    avgTitleLength: titleLengths.length ? Number((titleLengths.reduce((a, b) => a + b, 0) / titleLengths.length).toFixed(1)) : null,
    structuredDataTypes: [...structuredTypes],
    hasOpenGraph: parsedPages.some((p) => Object.keys(p.openGraph).length > 0),
    hasCanonical: parsedPages.some((p) => Boolean(p.canonical)),
    hasRobotsTxt: crawl.robotsTxtFound,
    hasSitemap: crawl.sitemapFound,
    hasLocalSignals: [...structuredTypes].some((t) => /LocalBusiness|PostalAddress|Place/i.test(t)) || Boolean(company.address),
    imageAltCoverage: totalImages > 0 ? imagesWithAlt / totalImages : null,
    internalLinks: parsedPages.reduce((s, p) => s + p.links.filter((l) => l.internal).length, 0),
    wordCountTotal: parsedPages.reduce((s, p) => s + p.wordCount, 0),
    pagesCrawled: parsedPages.length,
  };
  const seo = seoScore(seoSignals);

  await prisma.seoMetric.create({
    data: {
      companyId: company.id,
      indexablePages: seoSignals.indexablePages,
      titleCoverage: seoSignals.titleCoverage,
      descriptionCoverage: seoSignals.descriptionCoverage,
      h1Coverage: seoSignals.h1Coverage,
      avgTitleLength: seoSignals.avgTitleLength,
      structuredDataTypes: seoSignals.structuredDataTypes,
      hasOpenGraph: seoSignals.hasOpenGraph,
      hasCanonical: seoSignals.hasCanonical,
      hasRobotsTxt: seoSignals.hasRobotsTxt,
      hasLocalSignals: seoSignals.hasLocalSignals,
      imageAltCoverage: seoSignals.imageAltCoverage,
      internalLinks: seoSignals.internalLinks,
      keywords: topTerms(allText, 25) as never,
      wordCountTotal: seoSignals.wordCountTotal,
      score: seo.score,
      breakdown: { components: seo.components, coverage: seo.coverage, methodology: seo.methodology } as never,
    },
  });

  crawlerLog.info({ company: company.name, websiteScore: web.score, seoScore: seo.score }, 'métricas calculadas');
}

export { parseHtml };
