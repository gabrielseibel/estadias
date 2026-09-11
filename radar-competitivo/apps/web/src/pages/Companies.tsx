import { Link } from 'react-router-dom';
import { Building2, Users } from 'lucide-react';
import { useApi, useSelectedProject } from '../lib/hooks';
import { NoProjectSelected } from '../lib/projects';
import type { CompanyView } from '../lib/types';
import { EmptyState, ErrorState, Loading, Panel, PanelHeader, PageHeader, ScoreBar, Table, Unavailable, Chip } from '../components/ui';
import { num, relativeTime } from '../lib/format';

/** Lista de empresas do projeto. `onlyCompetitors` alimenta a rota /competitors. */
export function Companies({ onlyCompetitors = false }: { onlyCompetitors?: boolean }) {
  const [projectId] = useSelectedProject();
  const { data, error, loading, reload } = useApi<CompanyView[]>(projectId ? `/projects/${projectId}/companies` : null);

  if (!projectId) return <NoProjectSelected />;
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  const rows = onlyCompetitors ? data.filter((c) => c.role === 'COMPETITOR') : data;

  return (
    <div className="space-y-6">
      <PageHeader
        title={onlyCompetitors ? 'Concorrentes' : 'Empresas'}
        description={onlyCompetitors ? 'Empresas monitoradas neste projeto e o estado atual da coleta de cada uma.' : 'Sua empresa e os concorrentes monitorados neste projeto.'}
      />

      {rows.length === 0 ? (
        <Panel>
          <EmptyState
            title={onlyCompetitors ? 'Nenhum concorrente cadastrado' : 'Nenhuma empresa cadastrada'}
            description="Abra o projeto para cadastrar empresas manualmente ou usar a descoberta automática."
            icon={onlyCompetitors ? <Users className="h-5 w-5" /> : <Building2 className="h-5 w-5" />}
            action={<Link className="btn-primary" to={`/projects/${projectId}`}>Abrir projeto</Link>}
          />
        </Panel>
      ) : (
        <Panel>
          <PanelHeader title={`${rows.length} empresa(s)`} />
          <Table headers={['Empresa', 'Papel', 'Reputação', 'Ofertas', 'Canais', 'Score do site', 'SEO', 'Última coleta']}>
            {rows.map((c) => (
              <tr key={c.id} className="transition hover:bg-ink-850/40">
                <td className="td">
                  <Link className="font-medium text-ink-100 hover:text-radar-300" to={`/companies/${c.id}`}>{c.name}</Link>
                  <p className="text-[11px] text-ink-500">{c.domain ?? 'sem site cadastrado'}</p>
                </td>
                <td className="td">
                  <Chip className={c.role === 'SELF' ? 'border-radar-400/40 bg-radar-400/10 text-radar-300' : ''}>
                    {c.role === 'SELF' ? 'Minha empresa' : 'Concorrente'}
                  </Chip>
                </td>
                <td className="td">
                  {c.reputation.rating !== null ? (
                    <span className="text-ink-100">{c.reputation.rating.toFixed(1)} <span className="text-xs text-ink-500">({num(c.reputation.reviewCount)})</span></span>
                  ) : (
                    <Unavailable reason="Sem fonte de avaliação coletada" />
                  )}
                </td>
                <td className="td tabular-nums">{c.offerings.length}</td>
                <td className="td text-xs text-ink-300">{c.social.map((s) => s.platform).join(', ') || '—'}</td>
                <td className="td min-w-[130px]">{c.website_metrics ? <ScoreBar value={c.website_metrics.score} size="sm" /> : <Unavailable reason="Site não coletado" />}</td>
                <td className="td min-w-[130px]">{c.seo_metrics ? <ScoreBar value={c.seo_metrics.score} size="sm" /> : <Unavailable reason="Site não coletado" />}</td>
                <td className="td whitespace-nowrap text-xs text-ink-400">{relativeTime(c.lastCollectedAt)}</td>
              </tr>
            ))}
          </Table>
        </Panel>
      )}
    </div>
  );
}
