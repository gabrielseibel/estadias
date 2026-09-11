import { config } from '../config.js';
import { crawlerLog } from '../lib/logger.js';
import { safeFetch, sha256 } from '../lib/http-client.js';
import { normalizeUrl, sameSite, canonicalDomain } from '../lib/url-security.js';
import { checkRobots, robotsSitemaps } from './robots-service.js';
import { parseHtml, type ParsedPage } from '../parsers/html.js';
import { parseFeed, parseSitemap, type FeedItem } from '../parsers/feeds.js';

/**
 * Coleta do site de uma empresa.
 *
 * Estratégia: descoberta por sitemap.xml (quando existe) + varredura em largura
 * a partir da home, com priorização das páginas que efetivamente respondem às
 * perguntas de inteligência competitiva (serviços, produtos, preços, sobre,
 * contato, blog). Limites de páginas, profundidade e cortesia por domínio são
 * sempre respeitados; robots.txt manda.
 */

export type CrawledPage = {
  url: string;
  finalUrl: string;
  status: 'FETCHED' | 'NOT_MODIFIED' | 'SKIPPED_ROBOTS' | 'SKIPPED_LIMIT' | 'BLOCKED_SECURITY' | 'ERROR';
  httpStatus?: number;
  contentType?: string;
  contentHash?: string;
  etag?: string | null;
  lastModified?: string | null;
  bytes?: number;
  fetchMs?: number;
  depth: number;
  html?: string;
  parsed?: ParsedPage;
  error?: string;
};

export type CrawlSiteResult = {
  startUrl: string;
  reachable: boolean;
  httpsOk: boolean;
  pages: CrawledPage[];
  discoveredUrls: number;
  sitemapFound: boolean;
  sitemapUrlCount: number;
  robotsTxtFound: boolean;
  feed: { url: string; items: FeedItem[] } | null;
  notes: string[];
};

export type CachedPageHint = { url: string; etag: string | null; lastModified: string | null; contentHash: string | null };

/** Ordem de importância das páginas para inteligência competitiva. */
const PRIORITY: { re: RegExp; weight: number }[] = [
  { re: /^\/?$/, weight: 100 },
  { re: /\/(planos?|precos?|pricing|assinaturas?|pacotes?|tabela-de-precos)/i, weight: 92 },
  { re: /\/(servicos?|services?|solucoes?|solutions?|especialidades)/i, weight: 90 },
  { re: /\/(produtos?|products?|catalogo|loja|shop)/i, weight: 86 },
  { re: /\/(sobre|quem-somos|about|empresa|institucional|historia)/i, weight: 72 },
  { re: /\/(contato|contact|fale-conosco|orcamento|atendimento)/i, weight: 70 },
  { re: /\/(unidades|lojas|filiais|onde-estamos|localizacao)/i, weight: 66 },
  { re: /\/(blog|noticias|artigos|conteudo|novidades)/i, weight: 60 },
  { re: /\/(depoimentos|avaliacoes|clientes|cases)/i, weight: 58 },
  { re: /\/(trabalhe-conosco|vagas|carreiras|jobs)/i, weight: 50 },
];

const SKIP_EXT = /\.(pdf|jpg|jpeg|png|gif|webp|svg|ico|css|js|mp4|mp3|avi|zip|rar|doc|docx|xls|xlsx|ppt|pptx|woff2?|ttf|eot)(\?|$)/i;
// Os limites de palavra são necessários: sem eles "/contato" casaria com "conta".
const SKIP_PATH = /\/(wp-admin|wp-login|wp-json|admin|login|signin|signup|cart|checkout|carrinho|conta|minha-conta|feed|xmlrpc)(\/|$|\?)/i;

function priorityOf(url: string): number {
  try {
    const path = new URL(url).pathname;
    for (const p of PRIORITY) if (p.re.test(path)) return p.weight;
    // Páginas rasas tendem a ser mais institucionais/relevantes.
    const depth = path.split('/').filter(Boolean).length;
    return Math.max(10, 45 - depth * 8);
  } catch {
    return 10;
  }
}

function crawlable(url: string, origin: string): boolean {
  if (!/^https?:/i.test(url)) return false;
  if (SKIP_EXT.test(url)) return false;
  if (SKIP_PATH.test(url)) return false;
  return sameSite(url, origin);
}

export async function crawlSite(
  websiteOrDomain: string,
  opts: {
    maxPages?: number;
    maxDepth?: number;
    cachedPages?: CachedPageHint[];
    onProgress?: (done: number, total: number, current: string) => void | Promise<void>;
  } = {},
): Promise<CrawlSiteResult> {
  const maxPages = opts.maxPages ?? config.crawler.maxPagesPerSite;
  const maxDepth = opts.maxDepth ?? config.crawler.maxDepth;
  const cache = new Map(opts.cachedPages?.map((c) => [c.url, c]) ?? []);
  const notes: string[] = [];

  const domain = canonicalDomain(websiteOrDomain);
  if (!domain) {
    return { startUrl: websiteOrDomain, reachable: false, httpsOk: false, pages: [], discoveredUrls: 0, sitemapFound: false, sitemapUrlCount: 0, robotsTxtFound: false, feed: null, notes: ['Domínio inválido.'] };
  }

  const explicit = /^https?:\/\//i.test(websiteOrDomain) ? websiteOrDomain : null;
  const candidates = explicit ? [explicit] : [`https://${domain}`, `https://www.${domain}`, `http://${domain}`];

  // ── 1. Home ────────────────────────────────────────────────────────────────
  let start: { url: string; html: string; res: Extract<Awaited<ReturnType<typeof safeFetch>>, { ok: true }> } | null = null;
  let httpsOk = false;
  for (const candidate of candidates) {
    const robots = await checkRobots(candidate);
    if (!robots.allowed) {
      notes.push(`robots.txt não permite a coleta de ${candidate}.`);
      continue;
    }
    const res = await safeFetch(candidate);
    if (res.ok && !res.notModified) {
      start = { url: res.finalUrl, html: res.body, res };
      httpsOk = res.finalUrl.startsWith('https://');
      break;
    }
    if (!res.ok) notes.push(`${candidate}: ${res.error}`);
  }

  if (!start) {
    return { startUrl: candidates[0], reachable: false, httpsOk: false, pages: [], discoveredUrls: 0, sitemapFound: false, sitemapUrlCount: 0, robotsTxtFound: false, feed: null, notes };
  }

  const origin = new URL(start.url).origin;
  const pages: CrawledPage[] = [];
  const seen = new Set<string>();
  const queue: { url: string; depth: number; weight: number }[] = [];

  const enqueue = (raw: string, depth: number) => {
    const norm = normalizeUrl(raw, origin);
    if (!norm || seen.has(norm) || !crawlable(norm, origin)) return;
    seen.add(norm);
    queue.push({ url: norm, depth, weight: priorityOf(norm) });
  };

  const homeNorm = normalizeUrl(start.url) ?? start.url;
  seen.add(homeNorm);
  const homeParsed = parseHtml(start.html, start.url);
  pages.push({
    url: homeNorm,
    finalUrl: start.res.finalUrl,
    status: 'FETCHED',
    httpStatus: start.res.status,
    contentType: start.res.contentType,
    contentHash: start.res.contentHash,
    etag: start.res.etag,
    lastModified: start.res.lastModified,
    bytes: start.res.bytes,
    fetchMs: start.res.elapsedMs,
    depth: 0,
    html: start.html,
    parsed: homeParsed,
  });

  // ── 2. Sitemaps (robots.txt + convenções) ──────────────────────────────────
  let sitemapFound = false;
  let sitemapUrlCount = 0;
  let robotsTxtFound = false;
  const sitemapCandidates = new Set<string>();
  try {
    const declared = await robotsSitemaps(origin);
    robotsTxtFound = declared.length > 0;
    declared.forEach((s) => sitemapCandidates.add(s));
  } catch {
    /* robots indisponível já foi tratado */
  }
  ['/sitemap.xml', '/sitemap_index.xml', '/sitemap-index.xml'].forEach((p) => sitemapCandidates.add(new URL(p, origin).toString()));

  const sitemapUrls: { loc: string; lastmod?: string }[] = [];
  let sitemapsFetched = 0;
  for (const sm of sitemapCandidates) {
    if (sitemapsFetched >= 3 || sitemapUrls.length > 500) break;
    if (!sameSite(sm, origin)) continue;
    const res = await safeFetch(sm, { accept: 'application/xml,text/xml,*/*;q=0.5', maxBytes: 2_000_000 });
    if (!res.ok || res.notModified) continue;
    sitemapsFetched++;
    const parsed = parseSitemap(res.body);
    if (parsed.urls.length === 0 && parsed.sitemaps.length === 0) continue;
    sitemapFound = true;
    sitemapUrls.push(...parsed.urls);
    // Índices de sitemap: busca no máximo dois filhos.
    for (const child of parsed.sitemaps.slice(0, 2)) {
      if (!sameSite(child, origin)) continue;
      const childRes = await safeFetch(child, { accept: 'application/xml,text/xml', maxBytes: 2_000_000 });
      if (childRes.ok && !childRes.notModified) sitemapUrls.push(...parseSitemap(childRes.body).urls);
      sitemapsFetched++;
    }
  }
  sitemapUrlCount = sitemapUrls.length;
  sitemapUrls.slice(0, 400).forEach((u) => enqueue(u.loc, 1));

  // ── 3. Links da home ───────────────────────────────────────────────────────
  homeParsed.links.filter((l) => l.internal).forEach((l) => enqueue(l.href, 1));

  // ── 4. Feed (cadência editorial) ───────────────────────────────────────────
  let feed: CrawlSiteResult['feed'] = null;
  const feedCandidates = ['/feed', '/rss', '/blog/feed', '/feed.xml', '/rss.xml', '/atom.xml'];
  for (const path of feedCandidates) {
    const url = new URL(path, origin).toString();
    const robots = await checkRobots(url);
    if (!robots.allowed) continue;
    const res = await safeFetch(url, { accept: 'application/rss+xml,application/atom+xml,application/xml', maxBytes: 1_000_000 });
    if (res.ok && !res.notModified) {
      const items = parseFeed(res.body);
      if (items.length > 0) {
        feed = { url, items };
        break;
      }
    }
  }

  // ── 5. Varredura em largura por prioridade ─────────────────────────────────
  const budget = Math.max(1, maxPages - 1);
  let fetched = 0;
  while (queue.length > 0 && fetched < budget) {
    queue.sort((a, b) => b.weight - a.weight || a.depth - b.depth);
    const next = queue.shift()!;
    if (next.depth > maxDepth) {
      pages.push({ url: next.url, finalUrl: next.url, status: 'SKIPPED_LIMIT', depth: next.depth, error: 'Profundidade máxima atingida.' });
      continue;
    }

    await opts.onProgress?.(pages.length, Math.min(maxPages, pages.length + queue.length + 1), next.url);

    const robots = await checkRobots(next.url);
    if (!robots.allowed) {
      pages.push({ url: next.url, finalUrl: next.url, status: 'SKIPPED_ROBOTS', depth: next.depth, error: robots.reason });
      continue;
    }

    const hint = cache.get(next.url);
    const res = await safeFetch(next.url, { etag: hint?.etag ?? null, lastModified: hint?.lastModified ?? null });
    fetched++;

    if (!res.ok) {
      pages.push({
        url: next.url,
        finalUrl: next.url,
        status: res.blocked === 'security' ? 'BLOCKED_SECURITY' : 'ERROR',
        httpStatus: res.status,
        depth: next.depth,
        error: res.error,
        fetchMs: res.elapsedMs,
      });
      continue;
    }
    if (res.notModified) {
      pages.push({
        url: next.url, finalUrl: res.finalUrl, status: 'NOT_MODIFIED', httpStatus: 304,
        etag: res.etag, lastModified: res.lastModified, depth: next.depth, fetchMs: res.elapsedMs,
        contentHash: hint?.contentHash ?? undefined,
      });
      continue;
    }

    const parsed = parseHtml(res.body, res.finalUrl);
    pages.push({
      url: next.url,
      finalUrl: res.finalUrl,
      status: 'FETCHED',
      httpStatus: res.status,
      contentType: res.contentType,
      contentHash: res.contentHash,
      etag: res.etag,
      lastModified: res.lastModified,
      bytes: res.bytes,
      fetchMs: res.elapsedMs,
      depth: next.depth,
      html: res.body,
      parsed,
    });

    if (next.depth < maxDepth) {
      parsed.links.filter((l) => l.internal).forEach((l) => enqueue(l.href, next.depth + 1));
    }
  }

  if (queue.length > 0) {
    notes.push(`Limite de ${maxPages} páginas atingido; ${queue.length} URLs conhecidas não foram coletadas nesta execução.`);
  }

  crawlerLog.info({ domain, fetched: pages.filter((p) => p.status === 'FETCHED').length, discovered: seen.size }, 'coleta de site concluída');

  return {
    startUrl: start.url,
    reachable: true,
    httpsOk,
    pages,
    discoveredUrls: seen.size,
    sitemapFound,
    sitemapUrlCount,
    robotsTxtFound,
    feed,
    notes,
  };
}

export { sha256 };
