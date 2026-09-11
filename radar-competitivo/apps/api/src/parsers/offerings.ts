import { collapse, slugKey, stripAccents } from './text.js';
import type { ParsedPage } from './html.js';
import type { StructuredData } from './structured-data.js';

/**
 * Identificação de produtos e serviços a partir do conteúdo público.
 *
 * Estratégia em três camadas, da mais confiável para a menos:
 *  1. dados estruturados (Schema.org Product/Service/Offer) — CONFIRMADO;
 *  2. páginas dedicadas (/servicos/x, /produtos/y) — CONFIRMADO;
 *  3. cabeçalhos em páginas de serviços/produtos — CONFIRMADO com confiança
 *     menor (o título da seção é textualmente publicado pelo próprio site).
 *
 * Não há inferência de oferta sem texto correspondente na página: se o site não
 * publica, o sistema não afirma.
 */

export type ExtractedOffering = {
  kind: 'PRODUCT' | 'SERVICE' | 'PLAN';
  name: string;
  normalized: string;
  category?: string;
  description?: string;
  url: string;
  confidence: number;
  evidenceExcerpt: string;
};

const SERVICE_URL_RE = /\/(servicos?|services?|solucoes?|solutions?|atendimento|especialidades)(\/|$)/i;
const PRODUCT_URL_RE = /\/(produtos?|products?|loja|shop|catalogo|catalog)(\/|$)/i;
const PLAN_URL_RE = /\/(planos?|plans?|pricing|precos?|assinaturas?|pacotes?)(\/|$)/i;

/** Rótulos genéricos que não descrevem uma oferta real. */
const NOISE = new Set(
  [
    'home', 'inicio', 'sobre', 'sobre nos', 'quem somos', 'contato', 'fale conosco', 'blog', 'noticias',
    'servicos', 'produtos', 'nossos servicos', 'nossos produtos', 'planos', 'precos', 'depoimentos',
    'clientes', 'parceiros', 'trabalhe conosco', 'politica de privacidade', 'termos de uso', 'faq',
    'perguntas frequentes', 'localizacao', 'onde estamos', 'menu', 'newsletter', 'siga nos', 'redes sociais',
    'saiba mais', 'leia mais', 'veja mais', 'cadastre se', 'assine', 'login', 'entrar', 'carrinho',
  ].map((s) => slugKey(s)),
);

function looksLikeOffering(label: string): boolean {
  const key = slugKey(label);
  if (!key || key.length < 4 || key.length > 90) return false;
  if (NOISE.has(key)) return false;
  if (/^\d+$/.test(key)) return false;
  const words = key.split(' ');
  if (words.length > 9) return false;
  // Frases inteiras (com verbo de ação no fim) raramente são nome de oferta.
  if (/[.!?]$/.test(collapse(label))) return false;
  return true;
}

function kindForUrl(url: string): 'PRODUCT' | 'SERVICE' | 'PLAN' | null {
  if (PLAN_URL_RE.test(url)) return 'PLAN';
  if (PRODUCT_URL_RE.test(url)) return 'PRODUCT';
  if (SERVICE_URL_RE.test(url)) return 'SERVICE';
  return null;
}

function titleFromSlug(url: string): string | null {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    const last = parts[parts.length - 1];
    if (!last || /^(index|home)(\.\w+)?$/i.test(last)) return null;
    const cleaned = last.replace(/\.(html?|php|aspx?)$/i, '').replace(/[-_]+/g, ' ');
    if (cleaned.length < 3) return null;
    return collapse(cleaned.replace(/\b\w/g, (c) => c.toUpperCase()));
  } catch {
    return null;
  }
}

export function extractOfferings(page: ParsedPage, structured: StructuredData, pageUrl: string): ExtractedOffering[] {
  const found = new Map<string, ExtractedOffering>();
  const push = (o: ExtractedOffering) => {
    const key = `${o.kind}:${o.normalized}`;
    const prev = found.get(key);
    if (!prev || o.confidence > prev.confidence) found.set(key, o);
  };

  // 1. Dados estruturados.
  for (const offer of structured.offers) {
    if (!looksLikeOffering(offer.name)) continue;
    push({
      kind: offer.kind,
      name: collapse(offer.name).slice(0, 120),
      normalized: slugKey(offer.name),
      category: offer.category,
      description: offer.description?.slice(0, 400),
      url: offer.url ?? pageUrl,
      confidence: 0.95,
      evidenceExcerpt: `Schema.org ${offer.kind}: ${collapse(offer.name)}`,
    });
  }

  const urlKind = kindForUrl(pageUrl);

  // 2. Página dedicada a uma oferta (…/servicos/contabilidade-digital).
  if (urlKind) {
    const depth = new URL(pageUrl).pathname.split('/').filter(Boolean).length;
    if (depth >= 2) {
      const name = page.h1[0] ?? titleFromSlug(pageUrl) ?? page.title;
      if (name && looksLikeOffering(name)) {
        push({
          kind: urlKind,
          name: collapse(name).slice(0, 120),
          normalized: slugKey(name),
          description: page.metaDescription ?? page.text.slice(0, 300),
          url: pageUrl,
          confidence: 0.9,
          evidenceExcerpt: `Página dedicada: ${collapse(name)}`,
        });
      }
    }
  }

  // 3. Cabeçalhos dentro de páginas de oferta.
  if (urlKind) {
    for (const heading of [...page.h2, ...page.h3]) {
      if (!looksLikeOffering(heading)) continue;
      push({
        kind: urlKind,
        name: collapse(heading).slice(0, 120),
        normalized: slugKey(heading),
        url: pageUrl,
        confidence: 0.7,
        evidenceExcerpt: `Seção "${collapse(heading)}" em ${pageUrl}`,
      });
    }
  }

  // 4. Links internos que apontam para páginas de oferta (descoberta de catálogo).
  for (const link of page.links) {
    if (!link.internal) continue;
    const k = kindForUrl(link.href);
    if (!k) continue;
    let depth = 0;
    try {
      depth = new URL(link.href).pathname.split('/').filter(Boolean).length;
    } catch {
      continue;
    }
    if (depth < 2) continue;
    const label = link.text || titleFromSlug(link.href) || '';
    if (!looksLikeOffering(label)) continue;
    push({
      kind: k,
      name: collapse(label).slice(0, 120),
      normalized: slugKey(label),
      url: link.href,
      confidence: 0.65,
      evidenceExcerpt: `Link para "${collapse(label)}" em ${pageUrl}`,
    });
  }

  return [...found.values()];
}

/**
 * Associa preços observados na página à oferta mais provável.
 *
 * A associação usa proximidade textual: em uma tabela de planos, o trecho ao
 * redor de um valor costuma conter o nome de mais de um item, e pegar o
 * primeiro que aparece atribui o preço ao item errado. Vence a menção mais
 * próxima do valor. Sem menção no trecho, o preço é registrado sem oferta
 * associada — nunca atribuído por chute.
 */
export function attachPrices(
  page: ParsedPage,
  offerings: ExtractedOffering[],
  pageUrl: string,
): { label: string; amount: number; currency: string; unit?: string; isPromo: boolean; offeringNormalized?: string; context: string; url: string }[] {
  const out: ReturnType<typeof attachPrices> = [];
  for (const price of page.prices) {
    const ctx = stripAccents(price.context.toLowerCase());

    let best: { offering: ExtractedOffering; distance: number } | null = null;
    for (const offering of offerings) {
      const needle = stripAccents(offering.name.toLowerCase());
      if (needle.length < 3) continue;
      for (let idx = ctx.indexOf(needle); idx !== -1; idx = ctx.indexOf(needle, idx + 1)) {
        const distance = Math.abs(idx + needle.length / 2 - price.offsetInContext);
        if (!best || distance < best.distance) best = { offering, distance };
      }
    }

    const unit = /\/\s?m[êe]s|mensal|por m[êe]s/i.test(price.context)
      ? 'mensal'
      : /\/\s?ano|anual/i.test(price.context)
        ? 'anual'
        : /a partir de/i.test(price.context)
          ? 'a partir de'
          : undefined;

    out.push({
      label: best?.offering.name ?? collapse(price.context).slice(0, 90),
      amount: price.amount,
      currency: price.currency,
      unit,
      isPromo: /promo|desconto|oferta|black|off\b/i.test(price.context),
      offeringNormalized: best?.offering.normalized,
      context: price.context,
      url: pageUrl,
    });
  }
  return out;
}
