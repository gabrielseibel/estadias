import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, Sparkles, Target } from 'lucide-react';
import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useApi, useSelectedProject } from '../lib/hooks';
import type { Recommendation } from '../lib/types';
import { EmptyState, ErrorState, EvidenceLink, InfoNote, Loading, Panel, PanelHeader, PageHeader, Chip } from '../components/ui';
import { EFFORT_LABEL, HORIZON_LABEL, PRIORITY_LABEL } from '../lib/format';

const PRIORITY_STYLE: Record<string, string> = {
  CRITICAL: 'border-signal-critical/40 bg-signal-critical/10 text-signal-critical',
  HIGH: 'border-signal-high/40 bg-signal-high/10 text-signal-high',
  MEDIUM: 'border-signal-medium/40 bg-signal-medium/10 text-signal-medium',
  LOW: 'border-radar-400/40 bg-radar-400/10 text-radar-300',
};
const PRIORITY_EMOJI: Record<string, string> = { CRITICAL: '🔥', HIGH: '🟠', MEDIUM: '🟡', LOW: '🟢' };

type Response = { recommendations: Recommendation[]; actionPlan: Record<'D7' | 'D30' | 'D90', Recommendation[]> };

/** RECOMENDAÇÕES + PLANO DE AÇÃO + matriz impacto × esforço. */
export function Recommendations() {
  const [projectId] = useSelectedProject();
  const { data, error, loading, reload } = useApi<Response>(projectId ? `/projects/${projectId}/recommendations` : null);
  const [view, setView] = useState<'plano' | 'todas' | 'matriz'>('plano');

  if (!projectId) return <EmptyState title="Selecione um projeto" />;
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  if (data.recommendations.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Recomendações" description="Ações concretas derivadas dos dados coletados." />
        <Panel>
          <EmptyState
            title="Nenhuma recomendação ainda"
            description="As recomendações nascem de lacunas medidas: oferta ausente, reputação abaixo da média, ausência de caminho de conversão. Cadastre concorrentes e execute a análise."
            icon={<Sparkles className="h-5 w-5" />}
          />
        </Panel>
      </div>
    );
  }

  const scatter = data.recommendations.map((r) => ({
    x: r.effortValue, y: r.impactValue, z: 120, name: r.action.slice(0, 60), priority: r.priority,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recomendações"
        description="Cada recomendação declara o problema, a evidência, o impacto potencial, a ação, o esforço, a prioridade e a métrica de sucesso."
        actions={
          <div className="flex gap-1 rounded-lg border border-ink-800 bg-ink-900 p-1">
            {(['plano', 'todas', 'matriz'] as const).map((v) => (
              <button key={v} className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition ${view === v ? 'bg-ink-800 text-white' : 'text-ink-400 hover:text-ink-200'}`} onClick={() => setView(v)}>
                {v === 'plano' ? 'Plano de ação' : v === 'todas' ? 'Todas' : 'Impacto × Esforço'}
              </button>
            ))}
          </div>
        }
      />

      {view === 'plano' && (
        <div className="space-y-5">
          {(['D7', 'D30', 'D90'] as const).map((horizon) => (
            <Panel key={horizon}>
              <PanelHeader
                title={HORIZON_LABEL[horizon]}
                subtitle={`${data.actionPlan[horizon].length} ação(ões) priorizada(s)`}
                icon={<CalendarClock className="h-4 w-4 text-ink-500" />}
              />
              {data.actionPlan[horizon].length === 0 ? (
                <p className="px-5 py-6 text-xs text-ink-500">Nenhuma ação disponível para este horizonte com os dados atuais.</p>
              ) : (
                <ol className="divide-y divide-ink-800">
                  {data.actionPlan[horizon].map((r, i) => (
                    <li key={r.id} className="px-5 py-4">
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-ink-700 bg-ink-850 text-[11px] font-semibold text-ink-300">{i + 1}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium leading-relaxed text-white">{r.action}</p>
                          <p className="mt-1.5 text-xs leading-relaxed text-ink-400"><strong className="text-ink-300">Por quê:</strong> {r.problem}</p>
                          <p className="mt-1 text-xs leading-relaxed text-ink-500"><strong className="text-ink-400">Evidência:</strong> {r.evidence}</p>
                          <p className="mt-1 text-xs leading-relaxed text-ink-500"><strong className="text-ink-400">Métrica de sucesso:</strong> {r.successMetric}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <Chip className={PRIORITY_STYLE[r.priority]}>{PRIORITY_EMOJI[r.priority]} {PRIORITY_LABEL[r.priority]}</Chip>
                            <Chip>Esforço {EFFORT_LABEL[r.effort]}</Chip>
                            {r.company && <Link className="chip border-ink-700 bg-ink-850 text-ink-300 hover:text-radar-300" to={`/companies/${r.company.id}`}>{r.company.name}</Link>}
                            {(r.evidenceRefs ?? []).slice(0, 3).map((ref, k) => <EvidenceLink key={k} url={ref.url} label={ref.label.slice(0, 40)} />)}
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </Panel>
          ))}
        </div>
      )}

      {view === 'todas' && (
        <div className="space-y-3">
          {data.recommendations.map((r) => (
            <Panel key={r.id} className="panel-hover p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h3 className="text-sm font-semibold text-white">{r.action}</h3>
                <div className="flex shrink-0 gap-1.5">
                  <Chip className={PRIORITY_STYLE[r.priority]}>{PRIORITY_EMOJI[r.priority]} {PRIORITY_LABEL[r.priority]}</Chip>
                  <Chip>Esforço {EFFORT_LABEL[r.effort]}</Chip>
                  <Chip>{HORIZON_LABEL[r.horizon]}</Chip>
                </div>
              </div>
              <dl className="mt-3 grid gap-x-8 gap-y-2.5 text-xs sm:grid-cols-2">
                <Field label="Problema" value={r.problem} />
                <Field label="Evidência" value={r.evidence} />
                <Field label="Impacto potencial" value={r.potentialImpact} />
                <Field label="Métrica de sucesso" value={r.successMetric} />
              </dl>
              {(r.evidenceRefs ?? []).length > 0 && (
                <div className="mt-3 flex flex-wrap gap-3 border-t border-ink-800 pt-3">
                  {(r.evidenceRefs ?? []).map((ref, i) => <EvidenceLink key={i} url={ref.url} label={ref.label} />)}
                </div>
              )}
            </Panel>
          ))}
        </div>
      )}

      {view === 'matriz' && (
        <Panel>
          <PanelHeader title="Matriz Impacto × Esforço" subtitle="Prioridade prática: alto impacto com baixo esforço primeiro." icon={<Target className="h-4 w-4 text-ink-500" />} />
          <div className="h-96 p-5">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
                <CartesianGrid stroke="#1e2637" />
                <XAxis type="number" dataKey="x" name="Esforço" domain={[0.5, 3.5]} ticks={[1, 2, 3]} tickFormatter={(v) => ['', 'Baixo', 'Médio', 'Alto'][v] ?? ''} tick={{ fill: '#8b95ab', fontSize: 11 }} label={{ value: 'Esforço', position: 'insideBottom', offset: -15, fill: '#5d6980', fontSize: 11 }} />
                <YAxis type="number" dataKey="y" name="Impacto" domain={[0, 100]} tick={{ fill: '#8b95ab', fontSize: 11 }} label={{ value: 'Impacto potencial', angle: -90, position: 'insideLeft', fill: '#5d6980', fontSize: 11 }} />
                <ZAxis type="number" dataKey="z" range={[80, 200]} />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  contentStyle={{ background: '#101522', border: '1px solid #2a3346', borderRadius: 8, fontSize: 12, maxWidth: 320 }}
                  formatter={(_v, _n, item: any) => item?.payload?.name}
                />
                <Scatter data={scatter}>
                  {scatter.map((entry, i) => (
                    <Cell key={i} fill={entry.priority === 'CRITICAL' ? '#f4436c' : entry.priority === 'HIGH' ? '#ff8a3d' : entry.priority === 'MEDIUM' ? '#f4c33d' : '#4cc38a'} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      )}

      <InfoNote>
        O impacto é uma pontuação relativa calculada pela engine a partir do tamanho da lacuna medida — não uma projeção de receita.
        Recomendações genéricas são evitadas por construção: toda ação aponta o dado que a motivou.
      </InfoNote>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd className="mt-0.5 leading-relaxed text-ink-300">{value}</dd>
    </div>
  );
}
