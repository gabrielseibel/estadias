import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity, Bell, Building2, Database, Lightbulb, Play, RefreshCw, ShieldAlert, Sparkles, Star, TrendingUp, Trophy, Share2,
} from 'lucide-react';
import { api } from '../lib/api';
import { useApi, useSelectedProject } from '../lib/hooks';
import type { Dashboard as DashboardData, Job } from '../lib/types';
import { EmptyState, ErrorState, InfoNote, Loading, Panel, PanelHeader, PageHeader, ScoreBar, ScoreBreakdown, StatCard, Unavailable } from '../components/ui';
import { JobProgress } from '../components/JobProgress';
import { date, num, relativeTime } from '../lib/format';

export function Dashboard() {
  const [projectId] = useSelectedProject();
  const { data, error, loading, reload } = useApi<DashboardData>(projectId ? `/projects/${projectId}/dashboard` : null);
  const [activeJob, setActiveJob] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  if (!projectId) {
    return (
      <EmptyState
        title="Nenhum projeto selecionado"
        description="Crie um projeto, cadastre sua empresa e os concorrentes que deseja acompanhar."
        icon={<Building2 className="h-5 w-5" />}
        action={
          <Link className="btn-primary" to="/projects">
            Ir para Projetos
          </Link>
        }
      />
    );
  }
  if (loading && !data) return <Loading label="Carregando dashboard…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  const running = data.lastJob && ['QUEUED', 'RUNNING', 'PROCESSING'].includes(data.lastJob.status) ? data.lastJob.id : activeJob;

  async function analyzeNow() {
    setStarting(true);
    try {
      const res = await api.post<{ job: Job }>(`/projects/${projectId}/analyze`);
      setActiveJob(res.job.id);
    } finally {
      setStarting(false);
    }
  }

  const h = data.highlights;

  return (
    <div className="space-y-6">
      <PageHeader
        title={data.project.name}
        description={[data.project.segment, data.project.city, data.project.state].filter(Boolean).join(' · ') || 'Departamento de inteligência competitiva do seu negócio.'}
        actions={
          <>
            <span className="text-xs text-ink-500">Última análise: {relativeTime(data.project.lastAnalyzedAt)}</span>
            <button className="btn-ghost" onClick={reload} title="Atualizar">
              <RefreshCw className="h-4 w-4" />
            </button>
            <button className="btn-primary" onClick={analyzeNow} disabled={starting || Boolean(running)}>
              <Play className="h-4 w-4" />
              {running ? 'Análise em andamento' : 'Analisar agora'}
            </button>
          </>
        }
      />

      {running && <JobProgress projectId={projectId} jobId={running} onFinished={reload} />}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Market Score"
          value={data.marketScore?.value === null || data.marketScore === null ? <span className="text-lg text-ink-400">Não calculável</span> : Math.round(data.marketScore.value)}
          hint={data.marketScore ? `Cobertura de dados: ${Math.round(data.marketScore.coverage * 100)}%` : 'Cadastre sua empresa e execute uma análise.'}
          tone="good"
          icon={<TrendingUp className="h-4 w-4" />}
          footer={data.marketScore ? <ScoreBreakdown components={data.marketScore.components} methodology={data.marketScore.methodology} /> : undefined}
        />
        <StatCard
          label="Minha posição"
          value={data.position ? `${data.position.rank}º` : '—'}
          hint={data.position ? `entre ${data.position.total} empresas analisadas no projeto` : 'Sem score comparável ainda.'}
          icon={<Trophy className="h-4 w-4" />}
        />
        <StatCard label="Concorrentes monitorados" value={data.counts.competitors} hint="Empresas acompanhadas neste projeto." icon={<Building2 className="h-4 w-4" />} />
        <StatCard
          label="Mudanças (30 dias)"
          value={data.counts.recentChanges}
          hint={data.counts.recentChanges === 0 ? 'A detecção compara coletas sucessivas.' : 'Movimentos detectados entre coletas.'}
          icon={<Activity className="h-4 w-4" />}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MiniCard to="/alerts" label="Novos alertas" value={data.counts.newAlerts} icon={<Bell className="h-4 w-4" />} tone={data.counts.newAlerts > 0 ? 'warn' : 'default'} />
        <MiniCard to="/opportunities" label="Oportunidades" value={data.counts.opportunities} icon={<Lightbulb className="h-4 w-4" />} tone="good" />
        <MiniCard to="/threats" label="Ameaças" value={data.counts.threats} icon={<ShieldAlert className="h-4 w-4" />} tone={data.counts.threats > 0 ? 'bad' : 'default'} />
        <MiniCard to="/recommendations" label="Recomendações" value={data.counts.recommendations} icon={<Sparkles className="h-4 w-4" />} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Destaques do mercado" subtitle="Quem lidera cada dimensão, segundo os dados coletados." icon={<Trophy className="h-4 w-4 text-ink-500" />} />
          <div className="divide-y divide-ink-800">
            <Highlight
              icon={<Star className="h-4 w-4 text-signal-medium" />}
              label="Melhor avaliação"
              value={h.bestRated ? `${h.bestRated.name} — ${h.bestRated.rating?.toFixed(1)}` : null}
              detail={h.bestRated ? `${num(h.bestRated.reviewCount)} avaliações · ${h.bestRated.source ?? 'fonte pública'}` : 'Nenhuma fonte pública de avaliação foi coletada neste projeto.'}
              to={h.bestRated ? `/companies/${h.bestRated.companyId}` : undefined}
            />
            <Highlight
              icon={<Share2 className="h-4 w-4 text-signal-info" />}
              label="Maior presença digital"
              value={h.bestPresence?.name ?? null}
              detail={h.bestPresence?.detail ?? 'Sem dados de presença digital coletados.'}
              to={h.bestPresence ? `/companies/${h.bestPresence.companyId}` : undefined}
            />
            <Highlight
              icon={<Activity className="h-4 w-4 text-signal-high" />}
              label="Concorrente mais ativo"
              value={h.mostActive ? `${h.mostActive.name} — Threat ${h.mostActive.threatScore}/100` : null}
              detail={h.mostActive?.factors.map((f) => f.label).join(' · ') || 'Nenhum movimento competitivo relevante observado.'}
              to={h.mostActive ? `/companies/${h.mostActive.companyId}` : undefined}
            />
            <Highlight
              icon={<TrendingUp className="h-4 w-4 text-radar-400" />}
              label="Maior crescimento observado"
              value={h.fastestGrowth?.name ?? null}
              detail={h.fastestGrowth?.detail ?? 'É necessária mais de uma coleta para observar crescimento.'}
              to={h.fastestGrowth ? `/companies/${h.fastestGrowth.companyId}` : undefined}
            />
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            title="Qualidade dos dados"
            subtitle="Quanto o retrato de cada empresa pode sustentar uma decisão."
            icon={<Database className="h-4 w-4 text-ink-500" />}
          />
          <div className="space-y-4 p-5">
            {data.dataQuality.length === 0 && <p className="text-sm text-ink-400">Nenhuma empresa cadastrada.</p>}
            {data.dataQuality.map((dq) => (
              <div key={dq.companyId}>
                <div className="mb-1.5 flex items-baseline justify-between gap-3">
                  <Link className="text-sm font-medium text-ink-100 hover:text-radar-300" to={`/companies/${dq.companyId}`}>
                    {dq.name}
                  </Link>
                  <span className="text-[11px] text-ink-500">
                    {dq.sourcesCount} fonte(s) · atualizado {dq.freshnessDays === null ? 'nunca' : `há ${dq.freshnessDays.toFixed(1)} dia(s)`}
                  </span>
                </div>
                <ScoreBar value={dq.score} size="sm" />
                <ScoreBreakdown components={dq.breakdown.map((b) => ({ ...b, value: b.value }))} />
              </div>
            ))}
            <InfoNote>
              O Data Quality Score mede a confiabilidade do retrato coletado (completude, diversidade de fontes, frescor,
              consistência). Um score competitivo alto sobre dados rasos vale menos que um score médio sobre dados densos.
            </InfoNote>
          </div>
        </Panel>
      </div>

      {data.lastJob && !running && (
        <Panel className="px-5 py-3.5 text-xs text-ink-400">
          Última execução em {date(data.lastJob.finishedAt ?? data.lastJob.createdAt)} · {data.lastJob.pagesFetched} páginas coletadas
          {data.lastJob.pagesSkipped > 0 && `, ${data.lastJob.pagesSkipped} ignoradas (robots.txt, cache ou limite)`}
          {data.lastJob.pagesFailed > 0 && `, ${data.lastJob.pagesFailed} com erro`}.
          {data.lastJob.error && <span className="text-signal-high"> {data.lastJob.error}</span>}
        </Panel>
      )}
    </div>
  );
}

function MiniCard({ to, label, value, icon, tone = 'default' }: { to: string; label: string; value: number; icon: React.ReactNode; tone?: 'default' | 'good' | 'warn' | 'bad' }) {
  const toneClass = tone === 'good' ? 'text-radar-300' : tone === 'warn' ? 'text-signal-medium' : tone === 'bad' ? 'text-signal-critical' : 'text-white';
  return (
    <Link to={to} className="panel panel-hover flex items-center justify-between gap-3 px-5 py-4">
      <div>
        <p className="label">{label}</p>
        <p className={`mt-1 text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</p>
      </div>
      <span className="text-ink-500">{icon}</span>
    </Link>
  );
}

function Highlight({ icon, label, value, detail, to }: { icon: React.ReactNode; label: string; value: string | null; detail: string; to?: string }) {
  const content = (
    <div className="flex items-start gap-3 px-5 py-3.5">
      <span className="mt-0.5">{icon}</span>
      <div className="min-w-0">
        <p className="label">{label}</p>
        {value ? <p className="mt-0.5 truncate text-sm font-medium text-ink-100">{value}</p> : <div className="mt-1"><Unavailable reason="Sem dado suficiente" /></div>}
        <p className="mt-0.5 text-[11px] leading-relaxed text-ink-500">{detail}</p>
      </div>
    </div>
  );
  return to ? <Link to={to} className="block transition hover:bg-ink-850/50">{content}</Link> : content;
}
