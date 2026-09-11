/**
 * VERIFICADOR DE FUNDAMENTAÇÃO (anti-alucinação).
 *
 * Roda depois que o modelo responde e antes de a resposta chegar ao usuário.
 * A premissa é simples: em inteligência competitiva, um número inventado é pior
 * que uma resposta vazia. Então toda afirmação numérica precisa ter origem no
 * que as ferramentas devolveram.
 *
 * O verificador extrai números, percentuais, valores monetários e notas do texto
 * e confere se cada um aparece no rastro de ferramentas. Números que não podem
 * ser confirmados viram violações. A política de bloqueio está em `verdict`.
 */

export type GroundingViolation = {
  type: 'unsupported_number' | 'unsupported_currency' | 'unsupported_rating' | 'forbidden_claim';
  value: string;
  context: string;
};

export type GroundingReport = {
  verdict: 'PASS' | 'WARN' | 'BLOCK';
  checkedValues: number;
  supportedValues: number;
  violations: GroundingViolation[];
  notes: string[];
};

/** Afirmações que o sistema nunca pode fazer sobre um concorrente. */
const FORBIDDEN_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /\b(faturamento|receita|revenue)\s+(de|foi|é|estimad[oa]\s+em)\s+R?\$?\s?[\d.,]+/i, label: 'faturamento declarado' },
  { re: /\bfatura\s+R?\$\s?[\d.,]+/i, label: 'faturamento declarado' },
  { re: /\b(vendeu|vendas de|vendas foram)\s+R?\$?\s?[\d.,]+/i, label: 'volume de vendas declarado' },
  { re: /\b(possui|tem|conta com)\s+[\d.,]+\s+(clientes|funcionários|funcionarios|colaboradores|empregados)/i, label: 'número de clientes/funcionários declarado' },
  { re: /\bmarket\s*share\s+(de|é)\s+[\d.,]+\s*%/i, label: 'participação de mercado declarada' },
  { re: /\b[\d.,]+\s*%\s+do\s+mercado\b/i, label: 'participação de mercado declarada' },
];

/**
 * Extração de números do texto.
 *
 * Cobre as três formas que o modelo usa em português: milhar com ponto
 * ("1.284"), decimal com vírgula ("4,7") e inteiro simples ("340"). A
 * comparação com as fontes é NUMÉRICA, e não textual: comparar strings
 * reprovaria arredondamentos legítimos (o dado é 4.68, o modelo escreve 4,7)
 * e deixaria passar números que só coincidem como substring.
 */
type NumberMention = { raw: string; value: number; decimals: number; index: number; context: 'currency' | 'percent' | 'plain' };

const NUMBER_RE = /(?<![\w.,])(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)(?![\w])/g;

/** Unidades de tempo: "30 dias" é o horizonte de uma ação, não uma métrica. */
const TIME_UNIT = /^\s*(dias?|semanas?|m[êe]s(es)?|anos?|horas?|minutos?)\b/i;

function parsePtBrNumber(raw: string): { value: number; decimals: number } | null {
  let normalized: string;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(raw)) normalized = raw.replace(/\./g, '').replace(',', '.');
  else if (raw.includes(',')) normalized = raw.replace(/\./g, '').replace(',', '.');
  else normalized = raw;
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  const decimals = normalized.includes('.') ? normalized.split('.')[1].length : 0;
  return { value, decimals };
}

function extractMentions(text: string): NumberMention[] {
  const mentions: NumberMention[] = [];
  for (const match of text.matchAll(NUMBER_RE)) {
    const raw = match[1];
    const index = match.index ?? 0;
    const before = text.slice(Math.max(0, index - 12), index);
    const after = text.slice(index + raw.length, index + raw.length + 12);

    // Datas não são afirmações de métrica.
    if (/\d{2}\/\d{2}\/?$/.test(before) || /^\/\d{2,4}/.test(after)) continue;
    if (/\d{4}-\d{2}-?$/.test(before) || /^-\d{2}/.test(after)) continue;

    const parsed = parsePtBrNumber(raw);
    if (!parsed) continue;

    const isPercent = /^\s*%/.test(after);
    const isCurrency = /(R\$|US\$|€)\s*$/.test(before);

    // Prazos e horizontes ("próximos 30 dias") não são dados coletados.
    if (!isPercent && !isCurrency && TIME_UNIT.test(after)) continue;
    // Anos e inteiros pequenos aparecem naturalmente na redação.
    if (!isPercent && !isCurrency && parsed.decimals === 0) {
      if (parsed.value <= 10) continue;
      if (parsed.value >= 1900 && parsed.value <= 2100 && Number.isInteger(parsed.value)) continue;
    }

    mentions.push({
      raw,
      value: parsed.value,
      decimals: parsed.decimals,
      index,
      context: isCurrency ? 'currency' : isPercent ? 'percent' : 'plain',
    });
  }
  return mentions;
}

/** Todos os números presentes no retorno das ferramentas. */
function sourceNumbers(toolTrace: unknown): number[] {
  const found: number[] = [];
  const visit = (node: unknown, depth: number) => {
    if (depth > 12 || node === null || node === undefined) return;
    if (typeof node === 'number') {
      if (Number.isFinite(node)) found.push(node);
      return;
    }
    if (typeof node === 'string') {
      for (const match of node.matchAll(NUMBER_RE)) {
        const parsed = parsePtBrNumber(match[1]);
        if (parsed) found.push(parsed.value);
      }
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((item) => visit(item, depth + 1));
      return;
    }
    if (typeof node === 'object') {
      Object.values(node as Record<string, unknown>).forEach((v) => visit(v, depth + 1));
    }
  };
  visit(toolTrace, 0);
  return found;
}

const roundTo = (value: number, decimals: number) => Number(value.toFixed(Math.min(6, Math.max(0, decimals))));

/**
 * Um número da resposta é considerado fundamentado quando coincide com algum
 * número das ferramentas — exatamente, ou após arredondamento para a mesma
 * precisão com que foi escrito. Percentuais também aceitam a proporção
 * equivalente (cobertura 0.85 → "85%"), derivação legítima e verificável.
 */
function isSupported(mention: NumberMention, sources: number[]): boolean {
  for (const source of sources) {
    if (source === mention.value) return true;
    if (roundTo(source, mention.decimals) === mention.value) return true;
    if (mention.decimals > 0 && roundTo(mention.value, 0) === roundTo(source, 0) && Math.abs(source - mention.value) < 0.05) return true;
    if (mention.context === 'percent') {
      const asRatio = mention.value / 100;
      if (Math.abs(source - asRatio) < 0.005) return true;
      if (roundTo(source * 100, mention.decimals) === mention.value) return true;
    }
  }
  return false;
}

function contextOf(text: string, index: number, radius = 70): string {
  return text.slice(Math.max(0, index - radius), Math.min(text.length, index + radius)).replace(/\s+/g, ' ').trim();
}

export function verifyGrounding(answer: string, toolTrace: unknown): GroundingReport {
  const sources = sourceNumbers(toolTrace);
  const violations: GroundingViolation[] = [];
  const notes: string[] = [];

  // 1. Afirmações proibidas por natureza — bloqueiam independentemente do valor.
  for (const pattern of FORBIDDEN_PATTERNS) {
    const match = answer.match(pattern.re);
    if (match) violations.push({ type: 'forbidden_claim', value: match[0], context: pattern.label });
  }

  // 2. Cada número citado precisa existir nos dados retornados pelas ferramentas.
  const mentions = extractMentions(answer);
  let supportedCount = 0;
  for (const mention of mentions) {
    if (isSupported(mention, sources)) {
      supportedCount++;
      continue;
    }
    violations.push({
      type: mention.context === 'currency' ? 'unsupported_currency' : mention.context === 'percent' ? 'unsupported_number' : 'unsupported_number',
      value: mention.context === 'currency' ? `R$ ${mention.raw}` : mention.context === 'percent' ? `${mention.raw}%` : mention.raw,
      context: contextOf(answer, mention.index),
    });
  }

  const hardViolations = violations.filter((v) => v.type === 'forbidden_claim');
  const numericViolations = violations.filter((v) => v.type !== 'forbidden_claim');

  let verdict: GroundingReport['verdict'] = 'PASS';
  if (hardViolations.length > 0) {
    verdict = 'BLOCK';
    notes.push('A resposta contém afirmação de tipo proibido (faturamento, vendas, clientes ou participação de mercado de concorrente).');
  } else if (numericViolations.length > 0) {
    // Um único número não confirmado já basta para não publicar: é exatamente
    // o caso que a especificação proíbe.
    verdict = 'BLOCK';
    notes.push(`${numericViolations.length} valor(es) numérico(s) da resposta não foram encontrados nos dados retornados pelas ferramentas.`);
  }

  if (mentions.length === 0 && violations.length === 0) {
    notes.push('A resposta não apresenta valores numéricos verificáveis — nada a conferir.');
  }

  return { verdict, checkedValues: mentions.length, supportedValues: supportedCount, violations, notes };
}

/** Mensagem exibida quando a resposta é bloqueada. */
export function blockedAnswerMessage(report: GroundingReport): string {
  const list = report.violations.slice(0, 5).map((v) => `• ${v.value}${v.context ? ` (em: "${v.context}")` : ''}`).join('\n');
  return [
    'A resposta gerada foi bloqueada pelo verificador de fundamentação do Radar porque continha informação que não pôde ser confirmada nos dados coletados.',
    '',
    'Valores não confirmados:',
    list,
    '',
    'Isso é proteção deliberada: em inteligência competitiva, um número inventado é pior do que nenhuma resposta. Reformule a pergunta, execute uma nova coleta ou consulte diretamente as páginas de Oportunidades, Ameaças e Comparação — todas construídas apenas com dados verificados.',
  ].join('\n');
}
