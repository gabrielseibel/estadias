import { Link } from 'react-router-dom';
import { Bell, Check } from 'lucide-react';
import { api } from '../lib/api';
import { useApi, useSelectedProject } from '../lib/hooks';
import { NoProjectSelected } from '../lib/projects';
import type { Alert } from '../lib/types';
import { EmptyState, ErrorState, EvidenceLink, InfoNote, Loading, Panel, PanelHeader, PageHeader } from '../components/ui';
import { dateTime, SEVERITY_META } from '../lib/format';

/** ALERTAS — o que exige atenção agora. */
export function Alerts() {
  const [projectId] = useSelectedProject();
  const { data, error, loading, reload } = useApi<Alert[]>(projectId ? `/projects/${projectId}/alerts` : null);

  if (!projectId) return <NoProjectSelected />;
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  const groups = ['CRITICAL', 'HIGH', 'MEDIUM', 'OPPORTUNITY', 'POSITIONING', 'INFO'] as const;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Alertas"
        description="Movimentos que pedem uma decisão. Cada alerta aponta o fato observado e a evidência que o sustenta."
        actions={
          data.some((a) => a.status === 'NEW') ? (
            <button
              className="btn-ghost"
              onClick={async () => {
                await Promise.all(data.filter((a) => a.status === 'NEW').map((a) => api.patch(`/alerts/${a.id}`, { status: 'READ' })));
                await reload();
              }}
            >
              <Check className="h-4 w-4" />
              Marcar todos como lidos
            </button>
          ) : undefined
        }
      />

      {data.length === 0 ? (
        <Panel>
          <EmptyState
            title="Nenhum alerta"
            description="Alertas são gerados quando a comparação entre coletas detecta um movimento relevante. Execute a análise periodicamente para que o Radar acompanhe o mercado."
            icon={<Bell className="h-5 w-5" />}
          />
        </Panel>
      ) : (
        groups.map((severity) => {
          const items = data.filter((a) => a.severity === severity);
          if (items.length === 0) return null;
          const meta = SEVERITY_META[severity];
          return (
            <Panel key={severity}>
              <PanelHeader title={`${meta.emoji} ${meta.label}`} subtitle={`${items.length} alerta(s)`} />
              <ul className="divide-y divide-ink-800">
                {items.map((a) => (
                  <li key={a.id} className={`px-5 py-4 transition ${a.status === 'NEW' ? 'bg-ink-850/30' : ''}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink-100">
                          {a.status === 'NEW' && <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-radar-400 align-middle" />}
                          {a.title}
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-ink-300">{a.body}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[11px] text-ink-500">
                          <span>{dateTime(a.observedAt)}</span>
                          {a.company && <Link className="hover:text-radar-300" to={`/companies/${a.company.id}`}>{a.company.name}</Link>}
                          {a.evidence && <EvidenceLink url={a.evidence.url} excerpt={a.evidence.excerpt} />}
                        </div>
                      </div>
                      {a.status === 'NEW' && (
                        <button
                          className="btn-subtle shrink-0 text-xs"
                          onClick={async () => {
                            await api.patch(`/alerts/${a.id}`, { status: 'READ' });
                            await reload();
                          }}
                        >
                          Marcar como lido
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          );
        })
      )}

      <InfoNote>
        Cada alerta tem chave de deduplicação: o mesmo fato nunca gera dois alertas, mesmo que a análise seja executada várias vezes.
      </InfoNote>
    </div>
  );
}
