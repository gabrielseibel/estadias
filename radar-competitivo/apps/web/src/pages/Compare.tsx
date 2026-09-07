import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { GitCompareArrows, Trophy } from 'lucide-react';
import { Radar as RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, RadarChart as RC, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { useApi, useSelectedProject } from '../lib/hooks';
import type { CompanyView, MatrixResponse } from '../lib/types';
import { EmptyState, ErrorState, InfoNote, Loading, Panel, PanelHeader, PageHeader, ScoreBar, ScoreBreakdown, Table, Unavailable, Chip } from '../components/ui';
import { colorFor, date, num, NOT_AVAILABLE } from '../lib/format';

export function Compare() {
  const [projectId] = useSelectedProject();
  const { data, error, loading, reload } = useApi<MatrixResponse>(projectId ? `/projects/${projectId}/matrix` : null);
  const { data: companies } = useApi<CompanyView[]>(projectId ? `/projects/${projectId}/companies` : null);
  const [selected, setSelected] = useState<string[] | null>(null);

  const allIds = useMemo(() => data?.scores.map((s) => s.companyId) ?? [], [data]);
  const visible = selected ?? allIds;

  if (!projectId) return <EmptyState title="Selecione um projeto" description="Escolha um projeto na barra lateral para comparar empresas." />;
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data || data.scores.length === 0) {
    return (
      <Panel>
        <EmptyState title="Nada para comparar ainda" description="Cadastre sua empresa e ao menos um concorrente e execute uma análise." icon={<GitCompareArrows className="h-5 w-5" />} />
      </Panel>
    );
  }

  const shown = data.scores.filter((s) => visible.includes(s.companyId));
  const radarData = data.matrix.map((row) => {
    const point: Record<string, string | number> = { dimension: row.label };
    for (const cell of row.cells) {
      if (!visible.includes(cell.companyId)) continue;
      // Dimensão sem dado é omitida do gráfico em vez de virar zero.
      if (cell.value !== null) point[cell.name] = Math.round(cell.value * 100);
    }
    return point;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Comparar"
        description="Sua empresa lado a lado com os concorrentes, dimensão por dimensão. Células sem dado aparecem como “não verificável” — nunca como zero."
      />

      <Panel className="flex flex-wrap items-center gap-2 p-4">
        <span className="label mr-1">Empresas no comparativo</span>
        {data.scores.map((s) => {
          const on = visible.includes(s.companyId);
          return (
            <button
              key={s.companyId}
              className={`chip transition ${on ? 'border-transparent text-ink-950' : 'border-ink-700 bg-ink-850 text-ink-400'}`}
              style={on ? { backgroundColor: colorFor(s.name) } : undefined}
              onClick={() => {
                const next = on ? visible.filter((id) => id !== s.companyId) : [...visible, s.companyId];
                setSelected(next.length ? next : [s.companyId]);
              }}
            >
              {s.name}
              {s.role === 'SELF' && ' (você)'}
            </button>
          );
        })}
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_1fr]">
        <Panel>
          <PanelHeader title="Matriz competitiva" subtitle="Valores normalizados de 0 a 100 em relação ao melhor observado no projeto." />
          <Table headers={['Indicador', ...shown.map((s) => (s.role === 'SELF' ? `${s.name} (você)` : s.name))]}>
            {data.matrix.map((row) => (
              <tr key={row.key} className="group transition hover:bg-ink-850/40">
                <td className="td">
                  <p className="font-medium text-ink-100">{row.label}</p>
                  <p className="text-[10px] text-ink-500">peso {Math.round(row.weight * 100)}%</p>
                </td>
                {shown.map((s) => {
                  const cell = row.cells.find((c) => c.companyId === s.companyId);
                  const best = row.best === s.companyId;
                  return (
                    <td key={s.companyId} className="td" title={cell?.detail}>
                      {cell?.value === null || cell === undefined ? (
                        <Unavailable />
                      ) : (
                        <div className="flex items-center gap-2">
                          <ScoreBar value={cell.value * 100} size="sm" />
                          {best && <Trophy className="h-3 w-3 shrink-0 text-signal-medium"><title>Melhor do projeto nesta dimensão</title></Trophy>}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="bg-ink-950/40">
              <td className="td font-semibold text-white">Score competitivo</td>
              {shown.map((s) => (
                <td key={s.companyId} className="td">
                  <ScoreBar value={s.composite} coverage={s.coverage} />
                </td>
              ))}
            </tr>
          </Table>
          <div className="border-t border-ink-800 p-5">
            <InfoNote>{data.scores[0]?.methodology}</InfoNote>
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Perfil competitivo" subtitle="Sobreposição das dimensões medidas. Dimensões sem dado ficam fora do gráfico." />
          <div className="h-[380px] p-4">
            <ResponsiveContainer width="100%" height="100%">
              <RC data={radarData} outerRadius="72%">
                <PolarGrid stroke="#2a3346" />
                <PolarAngleAxis dataKey="dimension" tick={{ fill: '#8b95ab', fontSize: 11 }} />
                <PolarRadiusAxis domain={[0, 100]} tick={{ fill: '#5d6980', fontSize: 9 }} angle={90} />
                {shown.map((s) => (
                  <RadarChart key={s.companyId} name={s.name} dataKey={s.name} stroke={colorFor(s.name)} fill={colorFor(s.name)} fillOpacity={0.14} strokeWidth={2} />
                ))}
                <Legend wrapperStyle={{ fontSize: 11, color: '#b9c1d1' }} />
                <Tooltip contentStyle={{ background: '#101522', border: '1px solid #2a3346', borderRadius: 8, fontSize: 12 }} labelStyle={{ color: '#dfe4ed' }} />
              </RC>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <Panel>
        <PanelHeader title="Benchmarking" subtitle="Sua empresa contra a média, o melhor e o pior concorrente. Só é calculado com amostra suficiente." />
        <Table headers={['Dimensão', 'Você', 'Média dos concorrentes', 'Diferença', 'Melhor', 'Pior', 'Amostra']}>
          {data.benchmarks.map((b) => (
            <tr key={b.dimension} className="transition hover:bg-ink-850/40">
              <td className="td font-medium text-ink-100">{b.label}</td>
              <td className="td">{b.self === null ? <Unavailable /> : Math.round(b.self * 100)}</td>
              <td className="td">{b.competitorAverage === null ? <span className="text-xs text-ink-500">{b.note ?? NOT_AVAILABLE}</span> : Math.round(b.competitorAverage * 100)}</td>
              <td className="td">
                {b.deltaVsAveragePct === null ? (
                  <Unavailable />
                ) : (
                  <span className={b.deltaVsAveragePct >= 0 ? 'text-radar-300' : 'text-signal-high'}>
                    {b.deltaVsAveragePct >= 0 ? '+' : ''}
                    {b.deltaVsAveragePct}%
                  </span>
                )}
              </td>
              <td className="td text-xs text-ink-300">{b.bestCompetitor ? `${b.bestCompetitor.name} (${Math.round(b.bestCompetitor.value * 100)})` : '—'}</td>
              <td className="td text-xs text-ink-300">{b.worstCompetitor ? `${b.worstCompetitor.name} (${Math.round(b.worstCompetitor.value * 100)})` : '—'}</td>
              <td className="td text-xs text-ink-500">{b.sampleSize}</td>
            </tr>
          ))}
        </Table>
      </Panel>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {shown.map((s) => {
          const view = companies?.find((c) => c.id === s.companyId);
          return (
            <Panel key={s.companyId} className="panel-hover">
              <div className="flex items-start justify-between gap-3 border-b border-ink-800 p-5">
                <div className="min-w-0">
                  <Link className="block truncate text-sm font-semibold text-white hover:text-radar-300" to={`/companies/${s.companyId}`}>
                    {s.name}
                  </Link>
                  <p className="mt-0.5 text-[11px] text-ink-500">{s.role === 'SELF' ? 'Minha empresa' : 'Concorrente'}</p>
                </div>
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: colorFor(s.name) }} />
              </div>
              <div className="space-y-3 p-5 text-xs">
                <Row label="Score competitivo" value={<ScoreBar value={s.composite} coverage={s.coverage} size="sm" />} />
                <Row label="Reputação" value={view?.reputation.rating !== null && view?.reputation.rating !== undefined ? `${view.reputation.rating.toFixed(1)} · ${num(view.reputation.reviewCount)} avaliações` : <Unavailable reason="Sem fonte de avaliação coletada" />} />
                <Row label="Ofertas identificadas" value={view ? String(view.offerings.length) : '—'} />
                <Row label="Canais sociais" value={view ? view.social.map((x) => x.platform).join(', ') || 'Nenhum identificado' : '—'} />
                <Row label="Preços públicos" value={view ? (view.prices.length ? `${view.prices.length} monitorados` : 'Não encontrados publicamente') : '—'} />
                <Row label="Última coleta" value={view ? date(view.lastCollectedAt) : '—'} />
                {s.threat.score !== null && (
                  <Row
                    label="Threat Score"
                    value={
                      <span className="inline-flex items-center gap-2">
                        <Chip className={s.threat.score >= 50 ? 'border-signal-critical/40 bg-signal-critical/10 text-signal-critical' : 'border-signal-medium/40 bg-signal-medium/10 text-signal-medium'}>
                          {s.threat.score}/100
                        </Chip>
                      </span>
                    }
                  />
                )}
                <ScoreBreakdown components={s.components} methodology={s.methodology} />
              </div>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="shrink-0 text-ink-500">{label}</span>
      <span className="min-w-0 text-right text-ink-200">{value}</span>
    </div>
  );
}
