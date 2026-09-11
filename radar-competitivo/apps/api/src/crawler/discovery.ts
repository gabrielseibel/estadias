import { config } from '../config.js';
import { crawlerLog } from '../lib/logger.js';
import { safeFetch } from '../lib/http-client.js';
import { canonicalDomain } from '../lib/url-security.js';
import { dedupeCandidates, type EntityCandidate } from '../analytics/entity-resolution.js';

/**
 * DESCOBERTA DE CONCORRENTES.
 *
 * O usuário escreve "academias em Chapecó" e o sistema propõe candidatos. Isso
 * depende de um mecanismo de busca — e nenhum deles permite raspagem direta de
 * SERP. Por isso a descoberta é feita por provedores configuráveis com API/
 * instância própria (SearXNG, Brave Search API, Google Programmable Search).
 *
 * Sem provedor configurado, a função é honesta: informa que a fonte não está
 * disponível e orienta o cadastro manual. Nenhum resultado é inventado.
 */

export type DiscoveryCandidate = EntityCandidate & {
  title: string;
  snippet?: string;
  sourceUrl: string;
};

export type DiscoveryResult = {
  available: boolean;
  provider: string;
  query: string;
  candidates: DiscoveryCandidate[];
  duplicatesRemoved: number;
  message: string;
};

const UNAVAILABLE_MESSAGE =
  'Fonte de busca ainda não disponível. A descoberta automática de concorrentes exige um provedor de busca configurado (SEARCH_PROVIDER=searxng | brave | google_cse). Enquanto isso, cadastre os concorrentes manualmente informando o site de cada um — a coleta, a comparação e as análises funcionam normalmente.';

/** Domínios que nunca são candidatos a "empresa concorrente". */
const EXCLUDED = /(google|facebook|instagram|linkedin|youtube|twitter|x\.com|tiktok|wikipedia|tripadvisor|reclameaqui|yelp|olx|mercadolivre|ifood|booking|apontador|telelistas|guiamais|solutudo|econodata|cnpj|jusbrasil|indeed|catho|glassdoor|gov\.br|globo|uol|terra)\./i;

type RawResult = { title: string; url: string; snippet?: string };

async function searchSearxng(query: string): Promise<RawResult[]> {
  const base = config.search.searxngUrl.replace(/\/$/, '');
  const url = `${base}/search?q=${encodeURIComponent(query)}&format=json&language=pt-BR`;
  const res = await safeFetch(url, { accept: 'application/json', skipRateLimit: true });
  if (!res.ok || res.notModified) throw new Error(res.ok ? 'Resposta vazia do SearXNG.' : res.error);
  const data = JSON.parse(res.body) as { results?: { title: string; url: string; content?: string }[] };
  return (data.results ?? []).map((r) => ({ title: r.title, url: r.url, snippet: r.content }));
}

async function searchBrave(query: string): Promise<RawResult[]> {
  const res = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&country=br&search_lang=pt`, {
    headers: { accept: 'application/json', 'x-subscription-token': config.search.braveKey },
  });
  if (!res.ok) throw new Error(`Brave Search respondeu ${res.status}.`);
  const data = (await res.json()) as { web?: { results?: { title: string; url: string; description?: string }[] } };
  return (data.web?.results ?? []).map((r) => ({ title: r.title, url: r.url, snippet: r.description }));
}

async function searchGoogleCse(query: string): Promise<RawResult[]> {
  const url = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(config.search.googleKey)}&cx=${encodeURIComponent(config.search.googleCx)}&q=${encodeURIComponent(query)}&gl=br&hl=pt-BR`;
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`Google CSE respondeu ${res.status}.`);
  const data = (await res.json()) as { items?: { title: string; link: string; snippet?: string }[] };
  return (data.items ?? []).map((r) => ({ title: r.title, url: r.link, snippet: r.snippet }));
}

export async function discoverCompetitors(params: { segment: string; city?: string; state?: string; exclude?: string[] }): Promise<DiscoveryResult> {
  const query = [params.segment, params.city, params.state].filter(Boolean).join(' ');
  const provider = config.search.provider;

  const configured =
    (provider === 'searxng' && config.search.searxngUrl) ||
    (provider === 'brave' && config.search.braveKey) ||
    (provider === 'google_cse' && config.search.googleKey && config.search.googleCx);

  if (provider === 'none' || !configured) {
    return { available: false, provider, query, candidates: [], duplicatesRemoved: 0, message: UNAVAILABLE_MESSAGE };
  }

  let raw: RawResult[];
  try {
    raw = provider === 'searxng' ? await searchSearxng(query) : provider === 'brave' ? await searchBrave(query) : await searchGoogleCse(query);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    crawlerLog.error({ provider, err: message }, 'falha na descoberta');
    return { available: false, provider, query, candidates: [], duplicatesRemoved: 0, message: `O provedor de busca (${provider}) não respondeu: ${message}` };
  }

  const excluded = new Set((params.exclude ?? []).map((d) => canonicalDomain(d)).filter(Boolean) as string[]);
  const candidates: DiscoveryCandidate[] = [];

  for (const item of raw) {
    const domain = canonicalDomain(item.url);
    if (!domain || EXCLUDED.test(`${domain}.`) || excluded.has(domain)) continue;
    if (candidates.some((c) => c.domain === domain)) continue;
    candidates.push({
      name: cleanTitle(item.title),
      title: item.title,
      snippet: item.snippet,
      domain,
      website: `https://${domain}`,
      city: params.city ?? null,
      sourceUrl: item.url,
    });
  }

  const { unique, duplicates } = dedupeCandidates(candidates);
  return {
    available: true,
    provider,
    query,
    candidates: unique as DiscoveryCandidate[],
    duplicatesRemoved: duplicates.length,
    message:
      unique.length > 0
        ? `${unique.length} candidato(s) encontrado(s) para "${query}". Confirme quais são de fato concorrentes antes de iniciar a coleta.`
        : `Nenhum candidato utilizável retornado para "${query}".`,
  };
}

/** Remove sufixos de SEO do título ("Empresa X | Contabilidade em Chapecó"). */
function cleanTitle(title: string): string {
  return title
    .split(/[|—–-]/)[0]
    .replace(/\b(home|início|inicio|site oficial|oficial)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}
