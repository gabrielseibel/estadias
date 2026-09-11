import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useApi, useSelectedProject } from '../lib/hooks';
import { NoProjectSelected } from '../lib/projects';
import type { CompanyView } from '../lib/types';
import { EmptyState, ErrorState, InfoNote, Loading, Panel, PanelHeader, PageHeader, ScoreBar, ScoreBreakdown, Table, Unavailable, Chip } from '../components/ui';
import { num } from '../lib/format';

/** SEO BATTLE — comparativo do que é observável no HTML público. */
export function Seo() {
  const [projectId] = useSelectedProject();
  const { data, error, loading, reload } = useApi<CompanyView[]>(projectId ? `/projects/${projectId}/companies` : null);

  if (!projectId) return <NoProjectSelected />;
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  const withSeo = data.filter((c) => c.seo_metrics);
  const self = data.find((c) => c.role === 'SELF');
  const selfTerms = new Set((self?.seo_metrics?.keywords ?? []).map((k) => k.term));

  return (
    <div className="space-y-6">
      <PageHeader title="SEO Battle" description="Comparativo técnico e de conteúdo entre os sites monitorados. Apenas o que é observável no HTML servido publicamente." />

      {withSeo.length === 0 ? (
        <Panel>
          <EmptyState title="Sem métricas de SEO" description="Nenhum site foi coletado com sucesso. Verifique os websites cadastrados e execute a análise." icon={<Search className="h-5 w-5" />} />
        </Panel>
      ) : (
        <>
          <Panel>
            <PanelHeader title="Comparativo de SEO" />
            <Table headers={['Empresa', 'Score', 'Páginas indexáveis', 'Títulos', 'Descriptions', 'H1', 'Dados estruturados', 'Sinais locais', 'Palavras']}>
              {data.map((c) => {
                const s = c.seo_metrics;
                return (
                  <tr key={c.id} className="transition hover:bg-ink-850/40">
                    <td className="td">
                      <Link className="text-ink-100 hover:text-radar-300" to={`/companies/${c.id}`}>{c.name}</Link>
                      {c.role === 'SELF' && <Chip className="ml-2 border-radar-400/40 bg-radar-400/10 text-radar-300">você</Chip>}
                    </td>
                    <td className="td min-w-[140px]">{s ? <ScoreBar value={s.score} coverage={s.coverage} size="sm" /> : <Unavailable reason="Site não coletado" />}</td>
                    <td className="td tabular-nums">{s?.indexablePages ?? '—'}</td>
                    <td className="td">{s?.titleCoverage !== null && s?.titleCoverage !== undefined ? `${Math.round(s.titleCoverage * 100)}%` : <Unavailable />}</td>
                    <td className="td">{s?.descriptionCoverage !== null && s?.descriptionCoverage !== undefined ? `${Math.round(s.descriptionCoverage * 100)}%` : <Unavailable />}</td>
                    <td className="td">{s?.h1Coverage !== null && s?.h1Coverage !== undefined ? `${Math.round(s.h1Coverage * 100)}%` : <Unavailable />}</td>
                    <td className="td text-xs text-ink-300">{s?.structuredDataTypes.slice(0, 3).join(', ') || 'Nenhum'}</td>
                    <td className="td text-xs">{s?.hasLocalSignals ? <span className="text-radar-300">Presentes</span> : <span className="text-ink-500">Ausentes</span>}</td>
                    <td className="td tabular-nums text-xs">{s ? num(s.wordCountTotal) : '—'}</td>
                  </tr>
                );
              })}
            </Table>
          </Panel>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {withSeo.map((c) => (
              <Panel key={c.id}>
                <PanelHeader title={c.name} subtitle="Termos mais frequentes no conteúdo coletado" />
                <div className="p-5">
                  <div className="flex flex-wrap gap-1.5">
                    {(c.seo_metrics?.keywords ?? []).slice(0, 20).map((k) => {
                      const missing = c.role === 'COMPETITOR' && self && !selfTerms.has(k.term);
                      return (
                        <Chip key={k.term} className={missing ? 'border-signal-medium/40 bg-signal-medium/10 text-signal-medium' : ''} title={missing ? `${k.count} ocorrências — este termo não aparece no seu conteúdo` : `${k.count} ocorrências`}>
                          {k.term}
                        </Chip>
                      );
                    })}
                    {(c.seo_metrics?.keywords ?? []).length === 0 && <span className="text-xs text-ink-500">Conteúdo insuficiente para extrair termos relevantes.</span>}
                  </div>
                  <div className="mt-4">{c.seo_metrics && <ScoreBreakdown components={c.seo_metrics.components} methodology={c.seo_metrics.methodology} />}</div>
                </div>
              </Panel>
            ))}
          </div>
        </>
      )}

      <InfoNote>
        Posição em buscadores, volume de busca, backlinks e autoridade de domínio exigem APIs externas pagas. O Radar não estima
        essas métricas: quando não é possível verificar, ele diz que não é possível verificar. Termos destacados em amarelo aparecem
        no conteúdo do concorrente e não no seu.
      </InfoNote>
    </div>
  );
}
