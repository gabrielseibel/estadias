import { collapse } from './text.js';

/**
 * Interpretação de dados estruturados (Schema.org via JSON-LD/microdata e
 * OpenGraph). É a fonte mais confiável do crawler: quando um site declara
 * `LocalBusiness` com `aggregateRating`, isso é DADO CONFIRMADO.
 */

export type StructuredCompany = {
  name?: string;
  legalName?: string;
  description?: string;
  telephone?: string;
  email?: string;
  url?: string;
  streetAddress?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
  priceRange?: string;
  openingHours?: string;
  sameAs: string[];
  types: string[];
};

export type StructuredRating = { value: number; count?: number; best?: number; source: string };
export type StructuredOffer = { name: string; description?: string; price?: number; currency?: string; url?: string; category?: string; kind: 'PRODUCT' | 'SERVICE' | 'PLAN' };
export type StructuredReview = { rating?: number; text?: string; datePublished?: string };
export type StructuredArticle = { headline: string; datePublished?: string; url?: string };

export type StructuredData = {
  company: StructuredCompany | null;
  ratings: StructuredRating[];
  offers: StructuredOffer[];
  reviews: StructuredReview[];
  articles: StructuredArticle[];
  types: string[];
};

const ORG_TYPES = /^(Organization|LocalBusiness|Corporation|Store|Restaurant|ProfessionalService|AccountingService|HealthAndBeautyBusiness|SportsActivityLocation|ExerciseGym|Dentist|LegalService|MedicalBusiness|HomeAndConstructionBusiness|AutomotiveBusiness|FoodEstablishment|EducationalOrganization|School|Company)$/i;

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function typeOf(node: any): string[] {
  return asArray(node?.['@type']).map((t: unknown) => String(t).split('/').pop() ?? '').filter(Boolean);
}

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v.replace(',', '.').replace(/[^\d.-]/g, ''));
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function text(v: unknown): string | undefined {
  if (typeof v === 'string') return collapse(v) || undefined;
  if (v && typeof v === 'object' && 'name' in (v as any)) return collapse(String((v as any).name)) || undefined;
  return undefined;
}

/** Percorre o grafo JSON-LD (inclusive `@graph` aninhado). */
function* walk(nodes: unknown[]): Generator<any> {
  const queue = [...nodes];
  let guard = 0;
  while (queue.length && guard++ < 2000) {
    const node: any = queue.shift();
    if (!node || typeof node !== 'object') continue;
    if (Array.isArray(node)) {
      queue.push(...node);
      continue;
    }
    yield node;
    for (const key of ['@graph', 'itemListElement', 'hasOfferCatalog', 'itemOffered', 'makesOffer', 'offers', 'review', 'subOrganization', 'department']) {
      if (node[key]) queue.push(...asArray(node[key]));
    }
  }
}

function openingHoursText(node: any): string | undefined {
  const oh = node.openingHours ?? node.openingHoursSpecification;
  if (!oh) return undefined;
  if (typeof oh === 'string') return collapse(oh);
  const parts = asArray(oh)
    .map((s: any) => {
      if (typeof s === 'string') return collapse(s);
      const days = asArray(s?.dayOfWeek).map((d: unknown) => String(d).split('/').pop()).join(', ');
      const open = s?.opens ? String(s.opens) : '';
      const close = s?.closes ? String(s.closes) : '';
      return [days, open && close ? `${open}-${close}` : ''].filter(Boolean).join(' ');
    })
    .filter(Boolean);
  return parts.length ? parts.join(' | ') : undefined;
}

export function extractStructuredData(jsonLd: unknown[], openGraph: Record<string, string>, microdataTypes: string[], pageUrl: string): StructuredData {
  const out: StructuredData = { company: null, ratings: [], offers: [], reviews: [], articles: [], types: [] };
  const typeSet = new Set<string>(microdataTypes);

  for (const node of walk(jsonLd)) {
    const types = typeOf(node);
    types.forEach((t) => typeSet.add(t));

    if (types.some((t) => ORG_TYPES.test(t))) {
      const addr = node.address ?? {};
      const geo = node.geo ?? {};
      const company: StructuredCompany = {
        name: text(node.name),
        legalName: text(node.legalName),
        description: text(node.description),
        telephone: text(node.telephone),
        email: text(node.email),
        url: text(node.url) ?? pageUrl,
        streetAddress: text(addr.streetAddress),
        city: text(addr.addressLocality),
        state: text(addr.addressRegion),
        country: text(addr.addressCountry),
        postalCode: text(addr.postalCode),
        latitude: num(geo.latitude),
        longitude: num(geo.longitude),
        priceRange: text(node.priceRange),
        openingHours: openingHoursText(node),
        sameAs: asArray(node.sameAs).map(String).filter((s) => /^https?:/i.test(s)),
        types,
      };
      out.company = out.company ? { ...out.company, ...Object.fromEntries(Object.entries(company).filter(([, v]) => v !== undefined && v !== null && (!Array.isArray(v) || v.length))) } as StructuredCompany : company;
    }

    const agg = node.aggregateRating;
    if (agg) {
      const value = num(agg.ratingValue);
      if (value !== undefined) {
        out.ratings.push({
          value,
          count: num(agg.reviewCount) ?? num(agg.ratingCount),
          best: num(agg.bestRating) ?? 5,
          source: pageUrl,
        });
      }
    }

    if (types.some((t) => /^(Product|Service|Offer|Course|MenuItem)$/i.test(t))) {
      const name = text(node.name);
      if (name) {
        const offerNode = asArray(node.offers)[0] ?? (types.includes('Offer') ? node : undefined);
        out.offers.push({
          name,
          description: text(node.description),
          price: num(offerNode?.price ?? offerNode?.lowPrice),
          currency: text(offerNode?.priceCurrency),
          url: text(node.url) ?? text(offerNode?.url),
          category: text(node.category),
          kind: /^(Service|Course)$/i.test(types[0] ?? '') ? 'SERVICE' : types.includes('Offer') ? 'PLAN' : 'PRODUCT',
        });
      }
    }

    if (types.includes('Review')) {
      out.reviews.push({
        rating: num(node.reviewRating?.ratingValue),
        text: text(node.reviewBody) ?? text(node.description),
        datePublished: text(node.datePublished),
      });
    }

    if (types.some((t) => /^(Article|BlogPosting|NewsArticle)$/i.test(t))) {
      const headline = text(node.headline) ?? text(node.name);
      if (headline) out.articles.push({ headline, datePublished: text(node.datePublished), url: text(node.url) });
    }
  }

  // OpenGraph complementa quando não há JSON-LD.
  if (!out.company && (openGraph['site_name'] || openGraph['title'])) {
    out.company = {
      name: openGraph['site_name'] ?? openGraph['title'],
      description: openGraph['description'],
      url: openGraph['url'] ?? pageUrl,
      sameAs: [],
      types: ['OpenGraph'],
    };
    typeSet.add('OpenGraph');
  }

  out.types = [...typeSet];
  return out;
}
