/** Utilidades de texto compartilhadas por parsers e normalizadores. */

export function stripAccents(input: string): string {
  return input.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function collapse(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

/** Chave de comparação: minúsculo, sem acento, sem pontuação. */
export function slugKey(input: string): string {
  return collapse(stripAccents(input.toLowerCase()))
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOPWORDS = new Set(
  ('a as o os um uma uns umas de do da dos das em no na nos nas por para com sem sobre entre ao aos à às e ou mas que se ' +
    'nosso nossa nossos nossas seu sua seus suas este esta estes estas isso aquilo qual quais quando onde como porque ' +
    'mais menos muito muita pouco pouca todo toda todos todas ja nao sim ser estar ter fazer voce voces nos eles elas ' +
    'the of and for you your our we is are to in on at be with from it this that').split(' '),
);

export function isStopword(word: string): boolean {
  return STOPWORDS.has(stripAccents(word.toLowerCase()));
}

export function tokenize(text: string): string[] {
  return stripAccents(text.toLowerCase())
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !isStopword(w) && !/^\d+$/.test(w));
}

/** Termos mais relevantes por frequência (usado no módulo de SEO). */
export function topTerms(text: string, limit = 25): { term: string; count: number }[] {
  const counts = new Map<string, number>();
  const tokens = tokenize(text);
  for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);
  // Bigramas capturam termos compostos ("contabilidade digital").
  for (let i = 0; i < tokens.length - 1; i++) {
    const bg = `${tokens[i]} ${tokens[i + 1]}`;
    counts.set(bg, (counts.get(bg) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([term, count]) => (term.includes(' ') ? count >= 3 : count >= 2))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([term, count]) => ({ term, count }));
}

export function wordCount(text: string): number {
  return collapse(text).split(' ').filter(Boolean).length;
}

/** Similaridade de Jaccard sobre trigramas — usada na resolução de entidades. */
export function trigramSimilarity(a: string, b: string): number {
  const grams = (s: string) => {
    const norm = ` ${slugKey(s)} `;
    const set = new Set<string>();
    for (let i = 0; i < norm.length - 2; i++) set.add(norm.slice(i, i + 3));
    return set;
  };
  const A = grams(a);
  const B = grams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return inter / (A.size + B.size - inter);
}

export function excerptAround(text: string, needle: string, radius = 140): string {
  const idx = stripAccents(text.toLowerCase()).indexOf(stripAccents(needle.toLowerCase()));
  if (idx === -1) return collapse(text).slice(0, radius * 2);
  const start = Math.max(0, idx - radius);
  return collapse(text.slice(start, idx + needle.length + radius));
}
