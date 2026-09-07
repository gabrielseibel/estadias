import { useState } from 'react';
import { CheckCircle2, ChevronDown, CircleAlert, Loader2, XCircle, Clock } from 'lucide-react';
import { api } from '../lib/api';
import { useApi, usePolling } from '../lib/hooks';
import type { Job, JobLog } from '../lib/types';
import { dateTime } from '../lib/format';

/**
 * Acompanhamento de execução.
 *
 * O progresso exibido é o real reportado pelo job (etapas concluídas / total de
 * etapas). Quando o total ainda não é conhecido, mostramos a etapa atual em vez
 * de uma barra fictícia — nunca uma porcentagem simulada.
 */

const STATUS_META: Record<string, { label: string; icon: typeof Loader2; className: string }> = {
  QUEUED: { label: 'Na fila', icon: Clock, className: 'text-ink-300' },
  RUNNING: { label: 'Coletando', icon: Loader2, className: 'text-signal-info' },
  PROCESSING: { label: 'Processando', icon: Loader2, className: 'text-signal-info' },
  COMPLETED: { label: 'Concluído', icon: CheckCircle2, className: 'text-radar-300' },
  PARTIAL: { label: 'Concluído com ressalvas', icon: CircleAlert, className: 'text-signal-medium' },
  FAILED: { label: 'Falhou', icon: XCircle, className: 'text-signal-critical' },
  CANCELLED: { label: 'Cancelado', icon: XCircle, className: 'text-ink-400' },
};

export function JobProgress({ projectId, jobId, onFinished }: { projectId: string; jobId: string; onFinished?: () => void }) {
  const [open, setOpen] = useState(true);
  const { data, reload } = useApi<{ job: Job; logs: JobLog[] }>(`/projects/${projectId}/jobs/${jobId}`);
  const job = data?.job;
  const active = job ? ['QUEUED', 'RUNNING', 'PROCESSING'].includes(job.status) : true;

  usePolling(async () => {
    const previous = job?.status;
    await reload();
    if (previous && ['QUEUED', 'RUNNING', 'PROCESSING'].includes(previous)) {
      const next = await api.get<{ job: Job }>(`/projects/${projectId}/jobs/${jobId}`).catch(() => null);
      if (next && !['QUEUED', 'RUNNING', 'PROCESSING'].includes(next.job.status)) onFinished?.();
    }
  }, 2000, active);

  if (!job) return null;
  const meta = STATUS_META[job.status] ?? STATUS_META.QUEUED;
  const Icon = meta.icon;
  const spinning = job.status === 'RUNNING' || job.status === 'PROCESSING';
  const known = job.progressTotal > 0;
  const percent = known ? Math.min(100, Math.round((job.progressDone / job.progressTotal) * 100)) : 0;

  return (
    <div className="panel overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
        <span className={`inline-flex items-center gap-2 text-sm font-medium ${meta.className}`}>
          <Icon className={`h-4 w-4 ${spinning ? 'animate-spin' : ''}`} />
          {meta.label}
        </span>
        <span className="text-xs text-ink-400">{job.currentStep ?? '—'}</span>
        <span className="ml-auto flex items-center gap-3 text-[11px] text-ink-500">
          <span title="Páginas efetivamente coletadas">{job.pagesFetched} coletadas</span>
          {job.pagesSkipped > 0 && <span title="Ignoradas por robots.txt, cache ou limite">{job.pagesSkipped} ignoradas</span>}
          {job.pagesFailed > 0 && <span className="text-signal-high">{job.pagesFailed} com erro</span>}
          <button className="btn-subtle px-1.5 py-1" onClick={() => setOpen((v) => !v)}>
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        </span>
      </div>

      {known ? (
        <div className="h-1 w-full bg-ink-850">
          <div
            className={`h-full transition-all duration-700 ${job.status === 'FAILED' ? 'bg-signal-critical' : job.status === 'PARTIAL' ? 'bg-signal-medium' : 'bg-radar-500'}`}
            style={{ width: `${percent}%` }}
          />
        </div>
      ) : (
        <div className="h-1 w-full overflow-hidden bg-ink-850">
          <div className="h-full w-1/3 animate-shimmer bg-gradient-to-r from-transparent via-radar-500/60 to-transparent" />
        </div>
      )}

      {known && (
        <p className="px-5 pt-2 text-[11px] text-ink-500">
          {job.progressDone} de {job.progressTotal} etapas concluídas
        </p>
      )}

      {job.error && <p className="px-5 pt-2 text-xs text-signal-high">{job.error}</p>}

      {open && data.logs.length > 0 && (
        <div className="max-h-64 overflow-y-auto border-t border-ink-800 px-5 py-3">
          <ol className="space-y-1.5 font-mono text-[11px]">
            {data.logs.map((log) => (
              <li key={log.id} className="flex gap-2.5">
                <span className="shrink-0 text-ink-600">{dateTime(log.createdAt).slice(-5)}</span>
                <span
                  className={`shrink-0 uppercase ${
                    log.level === 'error' ? 'text-signal-critical' : log.level === 'warn' ? 'text-signal-medium' : 'text-ink-500'
                  }`}
                >
                  {log.level}
                </span>
                <span className="text-ink-300">{log.message}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
