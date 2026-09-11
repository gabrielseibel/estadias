import { ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useApi, useSelectedProject } from '../lib/hooks';
import { NoProjectSelected } from '../lib/projects';
import type { Insight, MatrixResponse } from '../lib/types';
import { ErrorState, InfoNote, Loading, Panel, PanelHeader, PageHeader, ScoreBar } from '../components/ui';
import { InsightList } from '../components/InsightList';

/** RADAR DE AMEAÇAS + Threat Score. */
export function Threats() {
  const [projectId] = useSelectedProject();
  const { data, error, loading, reload } = useApi<Insight[]>(projectId ? `/projects/${projectId}/insights?kind=THREAT` : null);
  const { data: matrix } = useApi<MatrixResponse>(projectId ? `/projects/${projectId}/matrix` : null);

  if (!projectId) return <NoProjectSelected />;
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const threats = (matrix?.scores ?? []).filter((s) => s.role === 'COMPETITOR');

  return (
    <div className="space-y-6">
      <PageHeader title="Ameaças" description="Movimentos competitivos que exigem atenção, com o Threat Score de cada concorrente e os fatores que o compõem." />

      {threats.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {threats.map((s) => (
            <Panel key={s.companyId}>
              <PanelHeader
                title={s.name}
                subtitle={s.threat.score === null ? 'Threat Score não calculável' : `Threat Score ${s.threat.score}/100`}
                action={<Link className="btn-subtle text-xs" to={`/companies/${s.companyId}`}>Ver empresa</Link>}
              />
              <div className="space-y-3 p-5">
                <ScoreBar value={s.threat.score} />
                {s.threat.factors.length === 0 ? (
                  <p className="text-xs leading-relaxed text-ink-400">{s.threat.methodology}</p>
                ) : (
                  <>
                    <ul className="space-y-2">
                      {s.threat.factors.map((f) => (
                        <li key={f.label} className="text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-ink-200">{f.label}</span>
                            <span className="tabular-nums text-ink-400">+{f.contribution}</span>
                          </div>
                          <p className="mt-0.5 leading-relaxed text-ink-500">{f.detail}</p>
                        </li>
                      ))}
                    </ul>
                    <p className="border-t border-ink-800 pt-2.5 text-[11px] leading-relaxed text-ink-500">{s.threat.methodology}</p>
                  </>
                )}
              </div>
            </Panel>
          ))}
        </div>
      )}

      <InsightList
        insights={data ?? []}
        emptyTitle="Nenhuma ameaça identificada"
        emptyDescription="Ameaças são detectadas a partir de movimentos observados entre coletas (novas ofertas, mudanças de preço, crescimento de avaliações) e de vantagens estruturais dos concorrentes."
        icon={<ShieldAlert className="h-5 w-5" />}
      />

      <InfoNote>
        O Threat Score soma contribuições de fatores observados nos últimos 90 dias. Ele mede movimento competitivo — não o tamanho
        nem a saúde financeira do concorrente, dados que o Radar não coleta.
      </InfoNote>
    </div>
  );
}
