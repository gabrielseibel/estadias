import * as cheerio from 'cheerio';
import { collapse, wordCount } from './text.js';
import { normalizeUrl, sameSite } from '../lib/url-security.js';

/**
 * Extração estruturada de uma página HTML.
 *
 * Só coleta o que é publicamente servido na resposta: metadados, cabeçalhos,
 * links, formulários, dados estruturados (JSON-LD / OpenGraph / microdata) e
 * texto visível. Não executa JavaScript, não tenta login, não busca conteúdo
 * atrás de autenticação.
 */

export type ParsedPage = {
  title: string | null;
  metaDescription: string | null;
  canonical: string | null;
  lang: string | null;
  robotsMeta: string | null;
  h1: string[];
  h2: string[];
  h3: string[];
  text: string;
  wordCount: number;
  links: { href: string; text: string; internal: boolean }[];
  images: { src: string; alt: string | null; width?: number; height?: number }[];
  imagesWithAlt: number;
  forms: number;
  ctas: string[];
  emails: string[];
  phones: string[];
  whatsapp: string[];
  socialLinks: { platform: string; url: string }[];
  openGraph: Record<string, string>;
  twitterCard: Record<string, string>;
  jsonLd: unknown[];
  microdataTypes: string[];
  hasContactForm: boolean;
  prices: { raw: string; amount: number; currency: string; context: string; offsetInContext: number }[];
  publishedDates: string[];
};

const SOCIAL_PATTERNS: { platform: string; re: RegExp }[] = [
  { platform: 'instagram', re: /(?:^|\.)instagram\.com$/i },
  { platform: 'facebook', re: /(?:^|\.)(facebook|fb)\.com$/i },
  { platform: 'linkedin', re: /(?:^|\.)linkedin\.com$/i },
  { platform: 'youtube', re: /(?:^|\.)(youtube\.com|youtu\.be)$/i },
  { platform: 'tiktok', re: /(?:^|\.)tiktok\.com$/i },
  { platform: 'x', re: /(?:^|\.)(twitter\.com|x\.com)$/i },
  { platform: 'pinterest', re: /(?:^|\.)pinterest\.[a-z.]+$/i },
];

const CTA_WORDS = [
  'fale conosco', 'entre em contato', 'solicite', 'solicitar', 'peça', 'peca ', 'agende', 'agendar',
  'orçamento', 'orcamento', 'assine', 'assinar', 'comprar', 'compre', 'contratar', 'contrate',
  'saiba mais', 'quero', 'começar', 'comecar', 'cadastre', 'inscreva', 'matricule', 'teste grátis',
  'teste gratis', 'baixar', 'download', 'whatsapp', 'ligue', 'call', 'demonstração', 'demonstracao',
];

const PRICE_RE = /(R\$|BRL|US\$|USD|€|EUR)\s?([0-9]{1,3}(?:[.\s][0-9]{3})*(?:,[0-9]{2})?|[0-9]+(?:\.[0-9]{2})?)/gi;
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_RE = /(?:\+55\s?)?(?:\(?\d{2}\)?[\s.-]?)?(?:9?\d{4})[\s.-]?\d{4}\b/g;

function parseAmount(raw: string): number | null {
  let s = raw.trim();
  if (/,\d{2}$/.test(s)) s = s.replace(/[.\s]/g, '').replace(',', '.');
  else s = s.replace(/[\s,]/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function currencyOf(symbol: string): string {
  const s = symbol.toUpperCase();
  if (s.includes('R$') || s === 'BRL') return 'BRL';
  if (s.includes('US$') || s === 'USD') return 'USD';
  if (s.includes('€') || s === 'EUR') return 'EUR';
  return 'BRL';
}

export function parseHtml(html: string, pageUrl: string): ParsedPage {
  const $ = cheerio.load(html);
  // Segunda árvore preservada: os <script type="application/ld+json"> precisam
  // sobreviver à limpeza feita para extrair texto visível.
  const $raw = cheerio.load(html);

  // Remove ruído que polui a extração de texto.
  $('script, style, noscript, svg, iframe, template').remove();

  const title = collapse($('head > title').first().text()) || null;
  const metaDescription =
    collapse($('meta[name="description"]').attr('content') ?? $('meta[property="og:description"]').attr('content') ?? '') || null;
  const canonical = $('link[rel="canonical"]').attr('href') ?? null;
  const lang = $('html').attr('lang') ?? null;
  const robotsMeta = $('meta[name="robots"]').attr('content') ?? null;

  const heads = (sel: string) =>
    $(sel)
      .map((_, el) => collapse($(el).text()))
      .get()
      .filter(Boolean)
      .slice(0, 30);

  const bodyText = collapse($('body').text());

  const links: ParsedPage['links'] = [];
  const socialSeen = new Map<string, string>();
  $('a[href]').each((_, el) => {
    const rawHref = $(el).attr('href') ?? '';
    if (!rawHref || rawHref.startsWith('#')) return;
    const text = collapse($(el).text()).slice(0, 200);

    if (/^mailto:/i.test(rawHref) || /^tel:/i.test(rawHref)) return;
    const abs = normalizeUrl(rawHref, pageUrl);
    if (!abs) return;
    if (!/^https?:/i.test(abs)) return;

    let host = '';
    try {
      host = new URL(abs).hostname.toLowerCase();
    } catch {
      return;
    }
    const social = SOCIAL_PATTERNS.find((p) => p.re.test(host));
    if (social) {
      const key = `${social.platform}:${abs}`;
      if (!socialSeen.has(key)) socialSeen.set(key, abs);
    }
    links.push({ href: abs, text, internal: sameSite(abs, pageUrl) });
  });

  const images: ParsedPage['images'] = [];
  $('img').each((_, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src') || '';
    if (!src || src.startsWith('data:')) return;
    const abs = normalizeUrl(src, pageUrl);
    if (!abs) return;
    const w = Number($(el).attr('width'));
    const h = Number($(el).attr('height'));
    images.push({
      src: abs,
      alt: collapse($(el).attr('alt') ?? '') || null,
      width: Number.isFinite(w) && w > 0 ? w : undefined,
      height: Number.isFinite(h) && h > 0 ? h : undefined,
    });
  });

  // CTAs: botões, links de ação e submits com verbos de conversão.
  const ctaCandidates = new Set<string>();
  $('a, button, input[type="submit"], [role="button"]').each((_, el) => {
    const label = collapse($(el).text() || $(el).attr('value') || $(el).attr('aria-label') || '');
    if (!label || label.length > 60) return;
    const lower = label.toLowerCase();
    if (CTA_WORDS.some((w) => lower.includes(w))) ctaCandidates.add(label);
  });

  const emails = [...new Set((bodyText.match(EMAIL_RE) ?? []).map((e) => e.toLowerCase()))]
    .filter((e) => !/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(e))
    .slice(0, 10);
  $('a[href^="mailto:"]').each((_, el) => {
    const v = ($(el).attr('href') ?? '').replace(/^mailto:/i, '').split('?')[0].toLowerCase();
    if (v && emails.length < 10 && !emails.includes(v)) emails.push(v);
  });

  const phoneSet = new Set<string>();
  $('a[href^="tel:"]').each((_, el) => {
    const v = collapse(($(el).attr('href') ?? '').replace(/^tel:/i, ''));
    if (v) phoneSet.add(v);
  });
  for (const m of bodyText.match(PHONE_RE) ?? []) {
    const digits = m.replace(/\D/g, '');
    if (digits.length >= 10 && digits.length <= 13) phoneSet.add(collapse(m));
  }

  const whatsapp = new Set<string>();
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    if (/(wa\.me|api\.whatsapp\.com|whatsapp:\/\/)/i.test(href)) whatsapp.add(href);
  });
  if (/whatsapp/i.test(bodyText)) whatsapp.add('menção textual a WhatsApp');

  const openGraph: Record<string, string> = {};
  $('meta[property^="og:"]').each((_, el) => {
    const k = ($(el).attr('property') ?? '').replace(/^og:/, '');
    const v = $(el).attr('content');
    if (k && v) openGraph[k] = collapse(v);
  });
  const twitterCard: Record<string, string> = {};
  $('meta[name^="twitter:"]').each((_, el) => {
    const k = ($(el).attr('name') ?? '').replace(/^twitter:/, '');
    const v = $(el).attr('content');
    if (k && v) twitterCard[k] = collapse(v);
  });

  const jsonLd: unknown[] = [];
  $raw('script[type="application/ld+json"]').each((_, el) => {
      const raw = $raw(el).text();
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw.trim());
        if (Array.isArray(parsed)) jsonLd.push(...parsed);
        else jsonLd.push(parsed);
      } catch {
        /* JSON-LD malformado é ignorado silenciosamente — comum na web real */
      }
    });

  const microdataTypes = [
    ...new Set(
      $('[itemtype]')
        .map((_, el) => ($(el).attr('itemtype') ?? '').split('/').pop() ?? '')
        .get()
        .filter(Boolean),
    ),
  ];

  const forms = $('form').length;
  const hasContactForm = $('form').toArray().some((el) => {
    const f = $(el);
    const txt = collapse(f.text()).toLowerCase();
    const hasEmailField = f.find('input[type="email"], input[name*="mail" i]').length > 0;
    const hasMessage = f.find('textarea').length > 0;
    const looksContact = /contato|orçamento|orcamento|mensagem|fale|solicit/i.test(txt + (f.attr('id') ?? '') + (f.attr('class') ?? ''));
    return (hasEmailField && (hasMessage || looksContact)) || (hasMessage && looksContact);
  });

  const prices: ParsedPage['prices'] = [];
  const seenPrice = new Set<string>();
  for (const m of bodyText.matchAll(PRICE_RE)) {
    const amount = parseAmount(m[2]);
    if (amount === null || amount <= 0 || amount > 10_000_000) continue;
    const key = `${m[1]}-${amount}`;
    if (seenPrice.has(key)) continue;
    seenPrice.add(key);
    const at = m.index ?? 0;
    const start = Math.max(0, at - 90);
    const rawContext = bodyText.slice(start, at + 90);
    prices.push({
      raw: collapse(m[0]),
      amount,
      currency: currencyOf(m[1]),
      context: collapse(rawContext),
      // Posição do valor dentro do contexto: permite associar o preço ao item
      // mencionado mais próximo, e não ao primeiro que aparecer no trecho.
      offsetInContext: at - start,
    });
    if (prices.length >= 60) break;
  }

  const publishedDates: string[] = [];
  $('time[datetime]').each((_, el) => {
    const v = $(el).attr('datetime');
    if (v) publishedDates.push(v);
  });
  for (const sel of ['meta[property="article:published_time"]', 'meta[name="date"]', 'meta[itemprop="datePublished"]']) {
    const v = $(sel).attr('content');
    if (v) publishedDates.push(v);
  }

  return {
    title,
    metaDescription,
    canonical,
    lang,
    robotsMeta,
    h1: heads('h1'),
    h2: heads('h2'),
    h3: heads('h3'),
    text: bodyText.slice(0, 120_000),
    wordCount: wordCount(bodyText),
    links,
    images: images.slice(0, 120),
    imagesWithAlt: images.filter((i) => i.alt && i.alt.length > 1).length,
    forms,
    ctas: [...ctaCandidates].slice(0, 25),
    emails,
    phones: [...phoneSet].slice(0, 10),
    whatsapp: [...whatsapp].slice(0, 5),
    socialLinks: [...socialSeen.entries()].map(([key, url]) => ({ platform: key.split(':')[0], url })).slice(0, 25),
    openGraph,
    twitterCard,
    jsonLd,
    microdataTypes,
    hasContactForm,
    prices,
    publishedDates: [...new Set(publishedDates)].slice(0, 20),
  };
}
