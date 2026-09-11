import { canonicalDomain } from '../lib/url-security.js';
import { slugKey, trigramSimilarity, stripAccents } from '../parsers/text.js';

/**
 * Resolução de entidades: decidir quando dois registros descrevem a mesma
 * empresa.
 *
 * Necessário porque a descoberta automática traz o mesmo negócio com grafias
 * diferentes ("Academia Corpo Ideal", "Corpo Ideal Fitness LTDA", "corpoideal.com.br").
 * Domínio é o sinal mais forte; nome + cidade resolvem o resto.
 */

export type EntityCandidate = {
  id?: string;
  name: string;
  domain?: string | null;
  website?: string | null;
  city?: string | null;
  phone?: string | null;
  aliases?: string[];
};

/** Remove sufixos societários e ruído que não distinguem entidades. */
// A normalização já removeu a pontuação, então "S/A" chega como "s a": as duas
// formas precisam constar para que o sufixo societário não vire parte do nome.
const LEGAL_SUFFIX = /\b(ltda|me|epp|eireli|s\s+a|sa|mei|cia|companhia|comercio|com|industria|ind|servicos|servico|e\s+cia)\b/g;

export function normalizeCompanyName(name: string): string {
  return slugKey(name).replace(LEGAL_SUFFIX, ' ').replace(/\s+/g, ' ').trim();
}

function normalizePhone(phone?: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 8) return null;
  return digits.slice(-9); // ignora DDI/DDD divergentes
}

/**
 * Palavras que descrevem o ramo, não a marca. "Academia Corpo Ideal" e
 * "Corpo Ideal Fitness" compartilham a marca ("corpo ideal") e diferem apenas
 * no descritor do segmento — o núcleo distintivo é o que importa comparar.
 */
const GENERIC_TOKENS = new Set(
  ('academia academias fitness gym contabilidade contabil contabeis escritorio consultoria clinica clinicas ' +
    'odontologia odontologica advocacia advogados restaurante padaria mercado supermercado loja lojas farmacia ' +
    'auto center oficina imobiliaria construtora transportes transportadora escola colegio curso cursos ' +
    'grupo centro instituto studio estudio espaco casa the').split(' '),
);

function distinctiveTokens(name: string): string[] {
  return normalizeCompanyName(name)
    .split(' ')
    .filter((t) => t.length >= 3 && !GENERIC_TOKENS.has(t));
}

/**
 * Contenção de tokens distintivos: proporção do núcleo da marca menor que
 * aparece na maior. Complementa a similaridade de trigramas, que pune nomes de
 * tamanhos muito diferentes mesmo quando a marca é a mesma.
 */
function tokenContainment(a: string, b: string): number {
  const ta = distinctiveTokens(a);
  const tb = distinctiveTokens(b);
  if (ta.length === 0 || tb.length === 0) return 0;
  const [shorter, longer] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const longerSet = new Set(longer);
  const hits = shorter.filter((t) => longerSet.has(t)).length;
  // Um único token em comum é fraco demais para sustentar uma fusão.
  if (hits < 2 && shorter.length > 1) return hits / shorter.length / 2;
  return hits / shorter.length;
}

export type MatchResult = { match: boolean; score: number; reason: string };

export function compareEntities(a: EntityCandidate, b: EntityCandidate): MatchResult {
  const domainA = a.domain ?? (a.website ? canonicalDomain(a.website) : null);
  const domainB = b.domain ?? (b.website ? canonicalDomain(b.website) : null);

  if (domainA && domainB) {
    if (domainA === domainB) return { match: true, score: 1, reason: 'Mesmo domínio de website.' };
    // Domínios diferentes são forte indício de entidades distintas, mas não
    // conclusivo (rebranding, domínio regional). Segue para a análise de nome.
  }

  const phoneA = normalizePhone(a.phone);
  const phoneB = normalizePhone(b.phone);
  const samePhone = Boolean(phoneA && phoneB && phoneA === phoneB);

  const namesA = [a.name, ...(a.aliases ?? [])].map(normalizeCompanyName).filter(Boolean);
  const namesB = [b.name, ...(b.aliases ?? [])].map(normalizeCompanyName).filter(Boolean);
  let bestName = 0;
  let bestContainment = 0;
  for (const na of namesA) {
    for (const nb of namesB) {
      bestName = Math.max(bestName, trigramSimilarity(na, nb));
      bestContainment = Math.max(bestContainment, tokenContainment(na, nb));
    }
  }

  const cityA = a.city ? stripAccents(a.city.toLowerCase()) : null;
  const cityB = b.city ? stripAccents(b.city.toLowerCase()) : null;
  const sameCity = Boolean(cityA && cityB && cityA === cityB);
  const cityConflict = Boolean(cityA && cityB && cityA !== cityB);

  if (samePhone && bestName >= 0.4) {
    return { match: true, score: 0.95, reason: 'Mesmo telefone público e nomes semelhantes.' };
  }
  if (bestName >= 0.9 && !cityConflict) {
    return { match: true, score: bestName, reason: 'Nomes praticamente idênticos.' };
  }
  if (bestName >= 0.72 && sameCity) {
    return { match: true, score: bestName, reason: 'Nomes semelhantes na mesma cidade.' };
  }
  // Marca em comum + mesma cidade: "Academia Corpo Ideal" ≡ "Corpo Ideal Fitness".
  if (bestContainment >= 0.99 && sameCity && !domainA && !domainB) {
    return { match: true, score: Math.max(bestName, 0.8), reason: 'Núcleo do nome em comum e mesma cidade.' };
  }
  if (domainA && domainB && domainA !== domainB && bestName < 0.9) {
    return { match: false, score: bestName, reason: 'Domínios distintos e nomes não coincidentes.' };
  }
  return { match: false, score: bestName, reason: 'Similaridade insuficiente para afirmar que são a mesma empresa.' };
}

export type DedupeResult<T extends EntityCandidate> = {
  unique: T[];
  duplicates: { kept: T; dropped: T; reason: string }[];
};

/** Remove duplicados de uma lista de candidatos (usado na descoberta). */
export function dedupeCandidates<T extends EntityCandidate>(candidates: T[]): DedupeResult<T> {
  const unique: T[] = [];
  const duplicates: DedupeResult<T>['duplicates'] = [];

  for (const candidate of candidates) {
    const existing = unique.find((u) => compareEntities(u, candidate).match);
    if (existing) {
      duplicates.push({ kept: existing, dropped: candidate, reason: compareEntities(existing, candidate).reason });
      // Mantém o registro mais completo.
      if (!existing.website && candidate.website) existing.website = candidate.website;
      if (!existing.city && candidate.city) existing.city = candidate.city;
      if (!existing.phone && candidate.phone) existing.phone = candidate.phone;
      const aliases = new Set([...(existing.aliases ?? []), candidate.name]);
      aliases.delete(existing.name);
      existing.aliases = [...aliases];
      continue;
    }
    unique.push({ ...candidate });
  }
  return { unique, duplicates };
}
