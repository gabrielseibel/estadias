import { collapse, stripAccents } from './text.js';

/**
 * Classificação temática e de sentimento de avaliações públicas.
 *
 * Implementação determinística por léxico, em português. Escolha deliberada:
 *  - funciona sem depender de provedor de IA (a plataforma não fica "fake"
 *    quando não há chave configurada);
 *  - é auditável — cada tema aponta o termo que o disparou;
 *  - a camada de IA, quando configurada, refina esta base; não a substitui.
 *
 * O texto da avaliação é analisado como conteúdo; nomes de autores não são
 * coletados nem armazenados (LGPD).
 */

export const THEMES = [
  'atendimento', 'preço', 'qualidade', 'prazo', 'localização', 'ambiente',
  'produto', 'suporte', 'entrega', 'pós-venda', 'confiança', 'experiência',
] as const;
export type Theme = (typeof THEMES)[number];

const THEME_TERMS: Record<Theme, string[]> = {
  atendimento: ['atendimento', 'atendente', 'atenderam', 'atendeu', 'equipe', 'funcionario', 'funcionarios', 'recepcao', 'educado', 'simpatico', 'cordial', 'grosseiro', 'mal educado', 'atenciosa', 'atencioso'],
  preço: ['preco', 'precos', 'valor', 'valores', 'caro', 'barato', 'custo', 'custo beneficio', 'cobranca', 'cobrou', 'taxa', 'mensalidade', 'promocao', 'desconto'],
  qualidade: ['qualidade', 'excelente', 'otimo', 'otima', 'perfeito', 'ruim', 'pessimo', 'pessima', 'impecavel', 'acabamento', 'capricho', 'profissionalismo'],
  prazo: ['prazo', 'demora', 'demorou', 'demorado', 'rapido', 'rapidez', 'agil', 'agilidade', 'atraso', 'atrasou', 'espera', 'esperei', 'fila', 'pontual'],
  localização: ['localizacao', 'local', 'endereco', 'estacionamento', 'acesso', 'perto', 'longe', 'facil de achar', 'dificil de achar'],
  ambiente: ['ambiente', 'limpo', 'limpeza', 'sujo', 'organizado', 'bagunca', 'estrutura', 'instalacoes', 'climatizado', 'confortavel', 'aconchegante', 'barulho'],
  produto: ['produto', 'produtos', 'material', 'equipamento', 'equipamentos', 'variedade', 'estoque', 'cardapio', 'comida', 'sabor'],
  suporte: ['suporte', 'ajuda', 'ajudou', 'duvida', 'duvidas', 'orientacao', 'explicou', 'esclareceu', 'acompanhamento', 'consultoria'],
  entrega: ['entrega', 'entregou', 'entregue', 'envio', 'frete', 'transporte', 'delivery', 'chegou'],
  'pós-venda': ['pos venda', 'posvenda', 'garantia', 'troca', 'devolucao', 'reembolso', 'assistencia', 'retorno', 'nao respondeu', 'resolveu'],
  confiança: ['confianca', 'confiavel', 'honesto', 'honestidade', 'transparente', 'transparencia', 'seguranca', 'seguro', 'enganacao', 'golpe', 'mentira', 'propaganda enganosa'],
  experiência: ['experiencia', 'recomendo', 'nao recomendo', 'voltarei', 'nunca mais', 'satisfeito', 'satisfeita', 'insatisfeito', 'frustrado', 'adorei', 'amei', 'odiei'],
};

const POSITIVE = [
  'excelente', 'otimo', 'otima', 'maravilhoso', 'maravilhosa', 'perfeito', 'perfeita', 'adorei', 'amei',
  'recomendo', 'super recomendo', 'nota 10', 'melhor', 'satisfeito', 'satisfeita', 'rapido', 'rapidez',
  'atencioso', 'atenciosa', 'educado', 'cordial', 'limpo', 'organizado', 'agil', 'agilidade', 'honesto',
  'confiavel', 'barato', 'justo', 'capricho', 'impecavel', 'pontual', 'resolveu', 'gostei', 'bom', 'boa',
];
const NEGATIVE = [
  'pessimo', 'pessima', 'ruim', 'horrivel', 'terrivel', 'nunca mais', 'nao recomendo', 'demora', 'demorou',
  'demorado', 'atraso', 'atrasou', 'caro', 'grosseiro', 'mal educado', 'sujo', 'bagunca', 'insatisfeito',
  'frustrado', 'enganacao', 'golpe', 'mentira', 'descaso', 'abandonado', 'nao respondeu', 'nao resolveu',
  'decepcao', 'decepcionado', 'fila', 'espera', 'perdi', 'problema', 'reclamacao', 'lamentavel',
];
const NEGATORS = ['nao', 'nunca', 'jamais', 'nem'];

export type ReviewAnalysis = {
  sentiment: 'POSITIVE' | 'NEGATIVE' | 'MIXED' | 'NEUTRAL';
  score: number; // -1..1
  themes: { theme: Theme; polarity: 'POSITIVE' | 'NEGATIVE' | 'MIXED'; trigger: string }[];
};

/**
 * Divide a avaliação em orações. Necessário porque uma mesma frase costuma
 * misturar elogio e reclamação ("atendimento excelente, mas o preço é caro"):
 * avaliar o texto inteiro atribuiria a polaridade errada a um dos temas.
 */
function splitClauses(normalized: string): string[] {
  return normalized
    .split(/(?:[,.;:!?]| mas | porem | contudo | entretanto | todavia | embora | so que | apesar )/g)
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
}

/** Sentimento local: conta termos polarizados, invertendo após negação. */
function polarityOf(tokens: string[]): number {
  let score = 0;
  tokens.forEach((tok, i) => {
    const bigram = i + 1 < tokens.length ? `${tok} ${tokens[i + 1]}` : '';
    const isPos = POSITIVE.includes(tok) || POSITIVE.includes(bigram);
    const isNeg = NEGATIVE.includes(tok) || NEGATIVE.includes(bigram);
    if (!isPos && !isNeg) return;
    const negated = tokens.slice(Math.max(0, i - 3), i).some((t) => NEGATORS.includes(t));
    const value = isPos ? 1 : -1;
    score += negated ? -value : value;
  });
  return score;
}

function clauseMentionsTheme(clause: string, theme: Theme): string | null {
  const tokens = clause.split(/\s+/).filter(Boolean);
  for (const term of THEME_TERMS[theme]) {
    if (term.includes(' ') ? clause.includes(term) : tokens.includes(term)) return term;
  }
  return null;
}

export function analyzeReview(text: string, rating?: number | null): ReviewAnalysis {
  const normalized = stripAccents(collapse(text).toLowerCase()).replace(/[^a-z0-9\s,.;:!?]/g, ' ');
  const clauses = splitClauses(normalized);
  const allTokens = normalized.replace(/[,.;:!?]/g, ' ').split(/\s+/).filter(Boolean);

  // Polaridade por tema, acumulada oração a oração.
  const perTheme = new Map<Theme, { score: number; trigger: string }>();
  for (const clause of clauses) {
    const tokens = clause.split(/\s+/).filter(Boolean);
    const local = polarityOf(tokens);
    for (const theme of THEMES) {
      const trigger = clauseMentionsTheme(clause, theme);
      if (!trigger) continue;
      const prev = perTheme.get(theme);
      perTheme.set(theme, { score: (prev?.score ?? 0) + local, trigger: prev?.trigger ?? trigger });
    }
  }

  const overall = polarityOf(allTokens);
  let score = overall === 0 ? 0 : Math.max(-1, Math.min(1, overall / 3));
  if (typeof rating === 'number' && Number.isFinite(rating)) {
    const fromRating = (rating - 3) / 2; // 1→-1, 5→+1
    score = score === 0 ? fromRating : score * 0.4 + fromRating * 0.6;
  }

  const themes: ReviewAnalysis['themes'] = [...perTheme.entries()].map(([theme, v]) => ({
    theme,
    polarity: v.score > 0 ? 'POSITIVE' : v.score < 0 ? 'NEGATIVE' : 'MIXED',
    trigger: v.trigger,
  }));

  const hasPos = themes.some((t) => t.polarity === 'POSITIVE');
  const hasNeg = themes.some((t) => t.polarity === 'NEGATIVE');
  const sentiment: ReviewAnalysis['sentiment'] =
    score > 0.2 ? 'POSITIVE' : score < -0.2 ? 'NEGATIVE' : hasPos && hasNeg ? 'MIXED' : 'NEUTRAL';

  // Tema sem sinal léxico próprio herda a polaridade geral da avaliação.
  const resolved = themes.map((t) =>
    t.polarity === 'MIXED' && Math.abs(score) > 0.2
      ? { ...t, polarity: (score > 0 ? 'POSITIVE' : 'NEGATIVE') as 'POSITIVE' | 'NEGATIVE' }
      : t,
  );

  return { sentiment, score: Number(score.toFixed(3)), themes: resolved };
}

export type ThemeAggregate = {
  theme: Theme;
  polarity: 'POSITIVE' | 'NEGATIVE' | 'MIXED';
  mentions: number;
  positive: number;
  negative: number;
  sampleQuote?: string;
};

export function aggregateThemes(reviews: { text?: string | null; rating?: number | null }[]): {
  themes: ThemeAggregate[];
  sentiment: { positive: number; negative: number; neutral: number; mixed: number; averageScore: number | null };
  analyzed: number;
} {
  const buckets = new Map<Theme, { positive: number; negative: number; mentions: number; quote?: string }>();
  let pos = 0, neg = 0, neu = 0, mix = 0;
  let scoreSum = 0;
  let analyzed = 0;

  for (const review of reviews) {
    const text = review.text?.trim();
    if (!text) continue;
    analyzed++;
    const a = analyzeReview(text, review.rating);
    scoreSum += a.score;
    if (a.sentiment === 'POSITIVE') pos++;
    else if (a.sentiment === 'NEGATIVE') neg++;
    else if (a.sentiment === 'MIXED') mix++;
    else neu++;

    for (const t of a.themes) {
      const b = buckets.get(t.theme) ?? { positive: 0, negative: 0, mentions: 0 };
      b.mentions++;
      if (t.polarity === 'POSITIVE') b.positive++;
      else if (t.polarity === 'NEGATIVE') b.negative++;
      if (!b.quote && collapse(text).length <= 240) b.quote = collapse(text);
      buckets.set(t.theme, b);
    }
  }

  const themes: ThemeAggregate[] = [...buckets.entries()]
    .map(([theme, b]) => ({
      theme,
      polarity: (b.positive > b.negative * 1.5 ? 'POSITIVE' : b.negative > b.positive * 1.5 ? 'NEGATIVE' : 'MIXED') as ThemeAggregate['polarity'],
      mentions: b.mentions,
      positive: b.positive,
      negative: b.negative,
      sampleQuote: b.quote,
    }))
    .sort((a, b) => b.mentions - a.mentions);

  return {
    themes,
    sentiment: {
      positive: pos,
      negative: neg,
      neutral: neu,
      mixed: mix,
      averageScore: analyzed > 0 ? Number((scoreSum / analyzed).toFixed(3)) : null,
    },
    analyzed,
  };
}
