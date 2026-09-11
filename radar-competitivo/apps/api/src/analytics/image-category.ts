/**
 * Classificação da galeria competitiva por pistas textuais da URL, do atributo
 * alt e da página de origem. Não há análise de conteúdo visual: o Radar não
 * baixa nem processa imagens, apenas referencia URLs públicas e seus metadados.
 */
const RULES: { category: string; re: RegExp }[] = [
  { category: 'fachada', re: /(fachada|facade|frente|exterior|entrada|storefront)/i },
  { category: 'interior', re: /(interior|dentro|sala|ambiente|loja-interna|showroom|recepcao|recep(ç|c)ão)/i },
  { category: 'equipe', re: /(equipe|time|team|colaborador|funcionario|staff|socios|s(ó|o)cios|profissional)/i },
  { category: 'produtos', re: /(produto|product|catalogo|cat(á|a)logo|item|servico|servi(ç|c)o)/i },
  { category: 'publicidade', re: /(banner|campanha|promo|publicidade|anuncio|an(ú|u)ncio|ads?)/i },
  { category: 'eventos', re: /(evento|feira|workshop|palestra|congresso|inaugura)/i },
  { category: 'redes_sociais', re: /(instagram|facebook|linkedin|tiktok|youtube|social)/i },
  { category: 'materiais', re: /(folder|catalogo-pdf|material|brochure|apresentacao|apresenta(ç|c)ão|ebook)/i },
];

export function classifyImage(src: string, alt: string, pageUrl: string): string {
  const haystack = `${src} ${alt} ${pageUrl}`;
  for (const rule of RULES) if (rule.re.test(haystack)) return rule.category;
  return 'outras';
}
