/** Formatação consistente — inclusive dos estados de "sem dado". */

export const NOT_AVAILABLE = 'Não disponível';
export const NOT_VERIFIABLE = 'Não foi possível verificar';

export function num(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NOT_AVAILABLE;
  return value.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function score(value: number | null | undefined): string {
  return value === null || value === undefined ? NOT_VERIFIABLE : `${Math.round(value)}`;
}

export function pct(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined) return NOT_AVAILABLE;
  return `${(value * 100).toFixed(digits)}%`;
}

export function money(amount: number, currency = 'BRL'): string {
  return amount.toLocaleString('pt-BR', { style: 'currency', currency });
}

export function date(value: string | null | undefined): string {
  if (!value) return 'Nunca';
  return new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function dateTime(value: string | null | undefined): string {
  if (!value) return 'Nunca';
  return new Date(value).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function relativeTime(value: string | null | undefined): string {
  if (!value) return 'nunca';
  const diff = Date.now() - new Date(value).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `há ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `há ${days} dia${days > 1 ? 's' : ''}`;
  const months = Math.round(days / 30);
  return `há ${months} mês${months > 1 ? 'es' : ''}`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

/** Cor estável por empresa, para manter identidade entre gráficos e tabelas. */
const PALETTE = ['#34c79a', '#4b9dfa', '#f4c33d', '#ff8a3d', '#c77dff', '#f4436c', '#4cc38a', '#78bfff'];
export function colorFor(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

export const HORIZON_LABEL: Record<string, string> = { D7: 'Próximos 7 dias', D30: 'Próximos 30 dias', D90: 'Próximos 90 dias' };
export const PRIORITY_LABEL: Record<string, string> = { CRITICAL: 'Crítica', HIGH: 'Alta', MEDIUM: 'Média', LOW: 'Baixa' };
export const EFFORT_LABEL: Record<string, string> = { LOW: 'Baixo', MEDIUM: 'Médio', HIGH: 'Alto' };
export const SEVERITY_META: Record<string, { emoji: string; label: string; className: string }> = {
  CRITICAL: { emoji: '🔴', label: 'Crítico', className: 'border-signal-critical/40 bg-signal-critical/10 text-signal-critical' },
  HIGH: { emoji: '🟠', label: 'Alto', className: 'border-signal-high/40 bg-signal-high/10 text-signal-high' },
  MEDIUM: { emoji: '🟡', label: 'Médio', className: 'border-signal-medium/40 bg-signal-medium/10 text-signal-medium' },
  INFO: { emoji: '🔵', label: 'Informativo', className: 'border-signal-info/40 bg-signal-info/10 text-signal-info' },
  POSITIONING: { emoji: '🟣', label: 'Posicionamento', className: 'border-purple-400/40 bg-purple-400/10 text-purple-300' },
  OPPORTUNITY: { emoji: '🟢', label: 'Oportunidade', className: 'border-radar-400/40 bg-radar-400/10 text-radar-300' },
};
export const NATURE_META: Record<string, { label: string; className: string; hint: string }> = {
  CONFIRMED: { label: 'Confirmado', className: 'border-radar-400/40 bg-radar-400/10 text-radar-300', hint: 'Encontrado em fonte pública verificável.' },
  ESTIMATED: { label: 'Estimativa', className: 'border-signal-medium/40 bg-signal-medium/10 text-signal-medium', hint: 'Calculado a partir de sinais — veja a metodologia.' },
  ANALYSIS: { label: 'Análise', className: 'border-signal-info/40 bg-signal-info/10 text-signal-info', hint: 'Interpretação do sistema sobre os dados coletados.' },
  RECOMMENDATION: { label: 'Recomendação', className: 'border-purple-400/40 bg-purple-400/10 text-purple-300', hint: 'Ação sugerida a partir das evidências.' },
  UNAVAILABLE: { label: 'Indisponível', className: 'border-ink-600 bg-ink-800 text-ink-300', hint: 'Não disponível publicamente.' },
};
