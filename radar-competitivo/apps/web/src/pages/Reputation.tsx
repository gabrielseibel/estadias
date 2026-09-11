import { Link } from 'react-router-dom';
import { Star } from 'lucide-react';
import { useApi, useSelectedProject } from '../lib/hooks';
import { NoProjectSelected } from '../lib/projects';
import type { CompanyView } from '../lib/types';
import { EmptyState, ErrorState, EvidenceLink, InfoNote, Loading, Panel, PanelHeader, PageHeader, Table, Unavailable, Chip } from '../components/ui';
import { num } from '../lib/format';

/** REPUTAÇÃO — comparativo entre empresas do projeto. */
export function Reputation() {
  const [projectId] = useSelectedProject();
  const { data, error, loading, reload } = useApi<CompanyView[]>(projectId ? `/projects/${projectId}/companies` : null);

  if (!projectId) return <NoProjectSelected />;
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  const withData = data.filter((c) => c.reputation.available);

  return (
    <div className="space-y-6">
      <PageHeader title="Reputação" description="Nota, volume e o que os clientes efetivamente dizem sobre cada empresa, a partir das avaliações públicas coletadas." />

      {withData.length === 0 ? (
        <Panel>
          <EmptyState
            title="Nenhuma fonte de reputação coletada"
            description="Portais de avaliação de terceiros exigem integração própria ou API oficial. Quando o site da empresa publica dados estruturados de avaliação (Schema.org), o Radar os coleta automaticamente."
            icon={<Star className="h-5 w-5" />}
          />
        </Panel>
      ) : (
        <>
          <Panel>
            <PanelHeader title="Comparativo de reputação" />
            <Table headers={['Empresa', 'Nota', 'Avaliações', 'Sentimento', 'Elogios recorrentes', 'Reclamações recorrentes', 'Fonte']}>
              {data.map((c) => (
                <tr key={c.id} className="transition hover:bg-ink-850/40">
                  <td className="td">
                    <Link className="font-medium text-ink-100 hover:text-radar-300" to={`/companies/${c.id}`}>{c.name}</Link>
                    {c.role === 'SELF' && <Chip className="ml-2 border-radar-400/40 bg-radar-400/10 text-radar-300">você</Chip>}
                  </td>
                  <td className="td tabular-nums text-white">{c.reputation.rating !== null ? c.reputation.rating.toFixed(1) : <Unavailable />}</td>
                  <td className="td tabular-nums">{c.reputation.reviewCount !== null ? num(c.reputation.reviewCount) : <Unavailable />}</td>
                  <td className="td text-xs">
                    {c.reputation.reviewsAnalyzed > 0 ? (
                      <span className="text-ink-300">
                        {c.reputation.sentiment.positive}+ / {c.reputation.sentiment.negative}−<span className="ml-1 text-ink-500">({c.reputation.reviewsAnalyzed} analisadas)</span>
                      </span>
                    ) : (
                      <span className="text-ink-500">Sem texto de avaliação</span>
                    )}
                  </td>
                  <td className="td text-xs capitalize text-radar-200">{c.reputation.themes.filter((t) => t.polarity === 'POSITIVE').slice(0, 3).map((t) => t.theme).join(', ') || '—'}</td>
                  <td className="td text-xs capitalize text-signal-high">{c.reputation.themes.filter((t) => t.polarity === 'NEGATIVE').slice(0, 3).map((t) => t.theme).join(', ') || '—'}</td>
                  <td className="td"><EvidenceLink url={c.reputation.sources[0]?.sourceUrl} label={c.reputation.sources[0]?.sourceLabel?.slice(0, 24)} /></td>
                </tr>
              ))}
            </Table>
          </Panel>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {withData.filter((c) => c.reputation.themes.length > 0).map((c) => (
              <Panel key={c.id}>
                <PanelHeader title={c.name} subtitle={`Voz do cliente · ${c.reputation.reviewsAnalyzed} avaliação(ões) analisada(s)`} />
                <div className="space-y-2.5 p-5">
                  {c.reputation.themes.slice(0, 8).map((t) => {
                    const total = t.positive + t.negative || 1;
                    return (
                      <div key={t.theme}>
                        <div className="flex items-center justify-between text-xs">
                          <span className="capitalize text-ink-200">{t.theme}</span>
                          <span className="text-ink-500">{t.mentions}</span>
                        </div>
                        <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-ink-800">
                          <div className="bg-radar-400" style={{ width: `${(t.positive / total) * 100}%` }} />
                          <div className="bg-signal-critical" style={{ width: `${(t.negative / total) * 100}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Panel>
            ))}
          </div>
        </>
      )}

      <InfoNote>
        A classificação temática é determinística (léxico em português) e auditável: cada tema aponta o termo que o disparou.
        O Radar analisa o conteúdo das avaliações, mas não coleta nem armazena identificação de autores — avaliações não viram
        perfis de pessoas físicas.
      </InfoNote>
    </div>
  );
}
