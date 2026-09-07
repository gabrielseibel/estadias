import * as cheerio from 'cheerio';
import { collapse } from './text.js';

/** Parsers de sitemap.xml (incluindo índices) e de feeds RSS/Atom. */

export type SitemapEntry = { loc: string; lastmod?: string };
export type SitemapResult = { urls: SitemapEntry[]; sitemaps: string[] };

export function parseSitemap(xml: string): SitemapResult {
  const $ = cheerio.load(xml, { xmlMode: true });
  const urls: SitemapEntry[] = [];
  const sitemaps: string[] = [];

  $('sitemapindex > sitemap > loc').each((_, el) => {
    const loc = collapse($(el).text());
    if (loc) sitemaps.push(loc);
  });

  $('urlset > url').each((_, el) => {
    const loc = collapse($(el).find('loc').first().text());
    if (!loc) return;
    const lastmod = collapse($(el).find('lastmod').first().text()) || undefined;
    urls.push({ loc, lastmod });
  });

  // Sitemaps sem namespace declarado corretamente.
  if (urls.length === 0 && sitemaps.length === 0) {
    $('loc').each((_, el) => {
      const loc = collapse($(el).text());
      if (loc) urls.push({ loc });
    });
  }
  return { urls, sitemaps };
}

export type FeedItem = { title: string; link?: string; published?: string; summary?: string };

export function parseFeed(xml: string): FeedItem[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  const items: FeedItem[] = [];

  $('item').each((_, el) => {
    const n = $(el);
    const title = collapse(n.find('title').first().text());
    if (!title) return;
    items.push({
      title,
      link: collapse(n.find('link').first().text()) || undefined,
      published: collapse(n.find('pubDate').first().text()) || collapse(n.find('dc\\:date').first().text()) || undefined,
      summary: collapse(n.find('description').first().text()).slice(0, 400) || undefined,
    });
  });

  $('entry').each((_, el) => {
    const n = $(el);
    const title = collapse(n.find('title').first().text());
    if (!title) return;
    items.push({
      title,
      link: n.find('link').first().attr('href') || undefined,
      published: collapse(n.find('published').first().text()) || collapse(n.find('updated').first().text()) || undefined,
      summary: collapse(n.find('summary').first().text()).slice(0, 400) || undefined,
    });
  });

  return items;
}

/** Datas de publicação → cadência média em dias (null quando não verificável). */
export function publishIntervalDays(dates: (string | undefined)[]): number | null {
  const times = dates
    .filter((d): d is string => Boolean(d))
    .map((d) => Date.parse(d))
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => b - a);
  if (times.length < 3) return null;
  const recent = times.slice(0, 12);
  const span = recent[0] - recent[recent.length - 1];
  if (span <= 0) return null;
  return Number((span / (recent.length - 1) / 86_400_000).toFixed(1));
}
