import { useState, type ReactNode } from 'react';
import { AlertTriangle, ChevronDown, ExternalLink, Info, Loader2, ShieldCheck } from 'lucide-react';
import { NATURE_META, NOT_VERIFIABLE } from '../lib/format';

/** Blocos visuais reutilizados em toda a plataforma. */

export function Panel({ children, className = '', ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`panel ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function PanelHeader({ title, subtitle, action, icon }: { title: string; subtitle?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-ink-800 px-5 py-4">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
          {icon}
          {title}
        </h2>
        {subtitle && <p className="mt-1 text-xs leading-relaxed text-ink-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-white">{title}</h1>
        {description && <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-ink-400">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Loading({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 px-5 py-10 text-sm text-ink-400">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="panel flex items-start gap-3 border-signal-critical/30 bg-signal-critical/5 p-5">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-signal-critical" />
      <div className="text-sm">
        <p className="font-medium text-signal-critical">Não foi possível carregar</p>
        <p className="mt-1 text-ink-300">{message}</p>
        {onRetry && (
          <button className="btn-ghost mt-3" onClick={onRetry}>
            Tentar novamente
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Estado vazio honesto: em vez de esconder a ausência de dado, explica por que
 * não há dado e o que fazer para obtê-lo.
 */
export function EmptyState({ title, description, action, icon }: { title: string; description?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <div className="rounded-full border border-ink-700 bg-ink-850 p-3 text-ink-400">{icon ?? <Info className="h-5 w-5" />}</div>
      <div>
        <p className="text-sm font-medium text-ink-100">{title}</p>
        {description && <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-ink-400">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/** Aviso de dado ausente, com o motivo. Nunca substituído por número inventado. */
export function Unavailable({ reason }: { reason?: string | null }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-400" title={reason ?? undefined}>
      <span className="h-1.5 w-1.5 rounded-full bg-ink-600" />
      {reason ?? NOT_VERIFIABLE}
    </span>
  );
}

export function NatureBadge({ nature }: { nature: string }) {
  const meta = NATURE_META[nature] ?? NATURE_META.ANALYSIS;
  return (
    <span className={`chip ${meta.className}`} title={meta.hint}>
      {meta.label}
    </span>
  );
}

export function Chip({ children, className = '', title }: { children: ReactNode; className?: string; title?: string }) {
  return (
    <span className={`chip border-ink-700 bg-ink-850 text-ink-300 ${className}`} title={title}>
      {children}
    </span>
  );
}

/** "Ver fonte": o caminho do usuário para verificar de onde veio um dado. */
export function EvidenceLink({ url, label, excerpt }: { url?: string | null; label?: string; excerpt?: string | null }) {
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener nofollow"
      className="inline-flex items-center gap-1 text-[11px] text-ink-400 transition hover:text-radar-300"
      title={excerpt ? `Trecho coletado: ${excerpt}` : url}
    >
      <ExternalLink className="h-3 w-3" />
      {label ?? 'Ver fonte'}
    </a>
  );
}

/** Barra de score com a composição auditável. */
export function ScoreBar({ value, coverage, size = 'md' }: { value: number | null; coverage?: number; size?: 'sm' | 'md' }) {
  if (value === null) return <Unavailable />;
  const tone = value >= 75 ? 'bg-radar-400' : value >= 50 ? 'bg-signal-medium' : value >= 25 ? 'bg-signal-high' : 'bg-signal-critical';
  return (
    <div className="flex items-center gap-2">
      <div className={`relative w-full overflow-hidden rounded-full bg-ink-800 ${size === 'sm' ? 'h-1.5' : 'h-2'}`}>
        <div className={`h-full rounded-full ${tone} transition-all duration-500`} style={{ width: `${Math.max(2, Math.min(100, value))}%` }} />
      </div>
      <span className={`shrink-0 tabular-nums ${size === 'sm' ? 'text-xs' : 'text-sm'} font-medium text-ink-100`}>{Math.round(value)}</span>
      {coverage !== undefined && (
        <span className="shrink-0 text-[10px] text-ink-500" title="Percentual do score que pôde ser calculado com dados coletados.">
          {Math.round(coverage * 100)}%
        </span>
      )}
    </div>
  );
}

/** Explicabilidade: composição do score, dimensão por dimensão. */
export function ScoreBreakdown({ components, methodology }: { components: { key: string; label: string; weight: number; value: number | null; detail: string }[]; methodology?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="text-xs">
      <button className="inline-flex items-center gap-1.5 text-ink-400 transition hover:text-ink-100" onClick={() => setOpen((v) => !v)}>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        {open ? 'Ocultar composição' : 'Ver como o score é calculado'}
      </button>
      {open && (
        <div className="mt-3 space-y-2.5 rounded-lg border border-ink-800 bg-ink-950/60 p-3.5">
          {components.map((c) => (
            <div key={c.key}>
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-ink-200">
                  {c.label} <span className="text-ink-500">· peso {Math.round(c.weight * 100)}%</span>
                </span>
                <span className="tabular-nums text-ink-300">{c.value === null ? NOT_VERIFIABLE : `${Math.round(c.value * 100)}`}</span>
              </div>
              <p className="mt-0.5 leading-relaxed text-ink-500">{c.detail}</p>
            </div>
          ))}
          {methodology && (
            <p className="mt-3 flex gap-2 border-t border-ink-800 pt-3 leading-relaxed text-ink-400">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-radar-400" />
              <span>{methodology}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function StatCard({ label, value, hint, tone = 'default', icon, footer }: {
  label: string; value: ReactNode; hint?: string; tone?: 'default' | 'good' | 'warn' | 'bad'; icon?: ReactNode; footer?: ReactNode;
}) {
  const toneClass =
    tone === 'good' ? 'text-radar-300' : tone === 'warn' ? 'text-signal-medium' : tone === 'bad' ? 'text-signal-critical' : 'text-white';
  return (
    <Panel className="panel-hover p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="label">{label}</p>
        {icon && <span className="text-ink-500">{icon}</span>}
      </div>
      <p className={`stat mt-2 ${toneClass}`}>{value}</p>
      {hint && <p className="mt-1.5 text-xs leading-relaxed text-ink-400">{hint}</p>}
      {footer && <div className="mt-3">{footer}</div>}
    </Panel>
  );
}

export function Table({ headers, children, className = '' }: { headers: ReactNode[]; children: ReactNode; className?: string }) {
  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} className="th">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function DemoBadge() {
  return (
    <span className="chip border-signal-medium/40 bg-signal-medium/10 font-semibold tracking-wider text-signal-medium">
      DEMONSTRAÇÃO
    </span>
  );
}

export function InfoNote({ children }: { children: ReactNode }) {
  return (
    <p className="flex gap-2 rounded-lg border border-ink-800 bg-ink-950/50 px-3.5 py-2.5 text-xs leading-relaxed text-ink-400">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-500" />
      <span>{children}</span>
    </p>
  );
}
