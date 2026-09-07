import { TrendingUp } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useApi, useSelectedProject } from '../lib/hooks';
import type { HistoryResponse, Insight } from '../lib/types';
import { EmptyState, ErrorState, InfoNote, Loading, Panel, PanelHeader, PageHeader } from '../components/ui';
import { InsightList } from '../components/InsightList';
import { colorFor, date } from '../lib/format';

/** SWOT competitiva + memória analítica (evolução dos scores). */
export function Insights() {
  const [projectId] = useSelectedProject();
  const { data, error, loading, reload } = useApi<Insight[]>(projectId ? `/projects/${projectId}/insights` : null);
  const { data: history } = useApi<HistoryResponse>(projectId ? `/projects/${projectId}/history` : null);

  if (!projectId) return <EmptyState title="Selecione um projeto" />;
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const by = (kind: string) => (data ?? []).filter((i) => i.kind === kind);

  // Série temporal: um ponto por execução, uma linha por empresa.
  const byDate = new Map<string, Record<string, number | string>>();
  for (const m of history?.metrics ?? []) {
    const key = date(m.computedAt);
    const name = history?.companies.find((c) => c.id === m.companyId)?.name ?? m.companyId;
    const point = byDate.get(key) ?? { data: key };
    if (m.compositeScore !== null) point[name] = m.compositeScore;
    byDate.set(key, point);
  }
  const series = [...byDate.values()];
  const hasHistory = series.length > 1;

  return (
    <div className="space-y-6">
      <PageHeader title="Insights" description="SWOT competitiva construída sobre os dados coletados, e a evolução dos scores ao longo do tempo." />

      <div className="grid gap-4 lg:grid-cols-2">
        <SwotBlock title="Forças" subtitle="Onde sua empresa supera os concorrentes." insights={by('STRENGTH')} />
        <SwotBlock title="Fraquezas" subtitle="Onde sua empresa está atrás." insights={by('WEAKNESS')} />
        <SwotBlock title="Oportunidades" subtitle="Espaços pouco explorados no mercado." insights={by('OPPORTUNITY')} />
        <SwotBlock title="Ameaças" subtitle="Movimentos competitivos relevantes." insights={by('THREAT')} />
      </div>

      <Panel>
        <PanelHeader title="Memória analítica" subtitle="Evolução do score competitivo a cada execução da análise." icon={<TrendingUp className="h-4 w-4 text-ink-500" />} />
        {hasHistory ? (
          <div className="h-72 p-5">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series}>
                <CartesianGrid stroke="#1e2637" strokeDasharray="3 3" />
                <XAxis dataKey="data" tick={{ fill: '#5d6980', fontSize: 10 }} />
                <YAxis domain={[0, 100]} tick={{ fill: '#5d6980', fontSize: 10 }} />
                <Tooltip contentStyle={{ background: '#101522', border: '1px solid #2a3346', borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {(history?.companies ?? []).map((c) => (
                  <Line key={c.id} type="monotone" dataKey={c.name} stroke={colorFor(c.name)} strokeWidth={2} dot={{ r: 2 }} connectNulls />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState
            title="Histórico ainda insuficiente"
            description="A evolução aparece a partir da segunda execução da análise. É assim que o Radar deixa de ser uma fotografia e passa a ser um acompanhamento."
            icon={<TrendingUp className="h-5 w-5" />}
          />
        )}
      </Panel>

      {by('TREND').length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-white">Tendências observadas</h2>
          <InsightList insights={by('TREND')} emptyTitle="" emptyDescription="" />
        </div>
      )}

      <InfoNote>A SWOT é construída exclusivamente a partir dos dados coletados. Onde não há dado, não há afirmação.</InfoNote>
    </div>
  );
}

function SwotBlock({ title, subtitle, insights }: { title: string; subtitle: string; insights: Insight[] }) {
  return (
    <Panel>
      <PanelHeader title={title} subtitle={subtitle} />
      {insights.length === 0 ? (
        <p className="px-5 py-8 text-center text-xs text-ink-500">Nada identificado com os dados atuais.</p>
      ) : (
        <ul className="divide-y divide-ink-800">
          {insights.slice(0, 8).map((i) => (
            <li key={i.id} className="px-5 py-3.5">
              <p className="text-sm font-medium text-ink-100">{i.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-400">{i.body}</p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
