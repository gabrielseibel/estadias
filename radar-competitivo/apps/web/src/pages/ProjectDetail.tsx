import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Building2, Globe, Play, Plus, Radar, Search, Trash2, Loader2, Users } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useApi } from '../lib/hooks';
import type { Job } from '../lib/types';
import { EmptyState, ErrorState, InfoNote, Loading, Panel, PanelHeader, PageHeader, Table, Chip } from '../components/ui';
import { JobProgress } from '../components/JobProgress';
import { relativeTime } from '../lib/format';

type ProjectDetailData = {
  id: string; name: string; segment: string | null; city: string | null; state: string | null; description: string | null;
  frequency: string; lastAnalyzedAt: string | null;
  companies: { id: string; name: string; role: 'SELF' | 'COMPETITOR'; website: string | null; domain: string | null; city: string | null; lastCollectedAt: string | null; isDemo: boolean }[];
  lastJob: Job | null;
  counts: { newAlerts: number; opportunities: number; threats: number; recommendations: number };
};

type DiscoveryResult = {
  available: boolean; provider: string; query: string; message: string; duplicatesRemoved: number;
  candidates: { name: string; title: string; snippet?: string; domain?: string | null; website?: string | null; sourceUrl: string }[];
};

export function ProjectDetail() {
  const { id = '' } = useParams();
  const { data, error, loading, reload } = useApi<ProjectDetailData>(`/projects/${id}`);
  const [form, setForm] = useState({ name: '', website: '', role: 'COMPETITOR' as 'SELF' | 'COMPETITOR', city: '' });
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [activeJob, setActiveJob] = useState<string | null>(null);
  const [discovery, setDiscovery] = useState<DiscoveryResult | null>(null);
  const [discovering, setDiscovering] = useState(false);

  if (loading && !data) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  const hasSelf = data.companies.some((c) => c.role === 'SELF');
  const running = data.lastJob && ['QUEUED', 'RUNNING', 'PROCESSING'].includes(data.lastJob.status) ? data.lastJob.id : activeJob;

  async function addCompany(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      await api.post(`/projects/${id}/companies`, {
        name: form.name,
        website: form.website || undefined,
        role: form.role,
        city: form.city || data!.city || undefined,
      });
      setForm({ name: '', website: '', role: hasSelf ? 'COMPETITOR' : 'SELF', city: '' });
      await reload();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Não foi possível cadastrar a empresa.');
    } finally {
      setBusy(false);
    }
  }

  async function runDiscovery() {
    setDiscovering(true);
    try {
      setDiscovery(await api.post<DiscoveryResult>(`/projects/${id}/discover`, {}));
    } finally {
      setDiscovering(false);
    }
  }

  async function analyze() {
    const res = await api.post<{ job: Job }>(`/projects/${id}/analyze`);
    setActiveJob(res.job.id);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={data.name}
        description={[data.segment, data.city, data.state].filter(Boolean).join(' · ') || undefined}
        actions={
          <>
            <Link className="btn-ghost" to="/dashboard">
              Dashboard
            </Link>
            <button className="btn-primary" onClick={analyze} disabled={Boolean(running) || data.companies.length === 0}>
              <Play className="h-4 w-4" />
              Analisar agora
            </button>
          </>
        }
      />

      {running && <JobProgress projectId={id} jobId={running} onFinished={reload} />}

      {!hasSelf && (
        <Panel className="border-signal-medium/30 bg-signal-medium/5 px-5 py-3.5 text-sm text-signal-medium">
          Cadastre a <strong>sua empresa</strong> neste projeto: sem ela não há base de comparação, e as análises de GAP,
          benchmark e recomendações ficam indisponíveis.
        </Panel>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <PanelHeader
            title="Empresas do projeto"
            subtitle="A sua empresa e os concorrentes monitorados."
            icon={<Users className="h-4 w-4 text-ink-500" />}
          />
          {data.companies.length === 0 ? (
            <EmptyState title="Nenhuma empresa cadastrada" description="Comece cadastrando a sua empresa e depois os concorrentes." icon={<Building2 className="h-5 w-5" />} />
          ) : (
            <Table headers={['Empresa', 'Papel', 'Site', 'Última coleta', '']}>
              {data.companies.map((c) => (
                <tr key={c.id} className="transition hover:bg-ink-850/40">
                  <td className="td">
                    <Link className="font-medium text-ink-100 hover:text-radar-300" to={`/companies/${c.id}`}>
                      {c.name}
                    </Link>
                    {c.city && <p className="text-[11px] text-ink-500">{c.city}</p>}
                  </td>
                  <td className="td">
                    <Chip className={c.role === 'SELF' ? 'border-radar-400/40 bg-radar-400/10 text-radar-300' : ''}>
                      {c.role === 'SELF' ? 'Minha empresa' : 'Concorrente'}
                    </Chip>
                  </td>
                  <td className="td">
                    {c.website ? (
                      <a className="link inline-flex items-center gap-1 text-xs" href={c.website} target="_blank" rel="noreferrer noopener nofollow">
                        <Globe className="h-3 w-3" />
                        {c.domain ?? c.website}
                      </a>
                    ) : (
                      <span className="text-xs text-ink-500">Sem site cadastrado</span>
                    )}
                  </td>
                  <td className="td text-xs text-ink-400">{relativeTime(c.lastCollectedAt)}</td>
                  <td className="td text-right">
                    <button
                      className="btn-subtle px-2 py-1 text-ink-500 hover:text-signal-critical"
                      title="Remover empresa"
                      onClick={async () => {
                        if (!confirm(`Remover "${c.name}" do projeto?`)) return;
                        await api.del(`/companies/${c.id}`);
                        await reload();
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>

        <Panel>
          <PanelHeader title="Cadastrar empresa" subtitle="Informe o site para que a coleta encontre os dados públicos." />
          <form className="space-y-3.5 p-5" onSubmit={addCompany}>
            <label className="block">
              <span className="label mb-1.5 block">Papel</span>
              <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as 'SELF' | 'COMPETITOR' })}>
                <option value="SELF" disabled={hasSelf}>
                  Minha empresa {hasSelf ? '(já cadastrada)' : ''}
                </option>
                <option value="COMPETITOR">Concorrente</option>
              </select>
            </label>
            <label className="block">
              <span className="label mb-1.5 block">Nome</span>
              <input className="input" required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Academia Corpo Ideal" />
            </label>
            <label className="block">
              <span className="label mb-1.5 block">Website</span>
              <input className="input" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="corpoideal.com.br" />
            </label>
            <label className="block">
              <span className="label mb-1.5 block">Cidade</span>
              <input className="input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder={data.city ?? 'Chapecó'} />
            </label>
            {formError && <p className="text-xs text-signal-critical">{formError}</p>}
            <button className="btn-primary w-full justify-center" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Cadastrar
            </button>
          </form>
        </Panel>
      </div>

      <Panel>
        <PanelHeader
          title="Descoberta automática de concorrentes"
          subtitle="Pesquisa empresas do segmento e da região para você confirmar quais são concorrentes de fato."
          icon={<Radar className="h-4 w-4 text-ink-500" />}
          action={
            <button className="btn-ghost" onClick={runDiscovery} disabled={discovering || !data.segment}>
              {discovering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Pesquisar
            </button>
          }
        />
        <div className="p-5">
          {!data.segment && <p className="text-sm text-ink-400">Defina o segmento do projeto para usar a descoberta automática.</p>}
          {discovery && !discovery.available && <InfoNote>{discovery.message}</InfoNote>}
          {discovery?.available && (
            <div className="space-y-3">
              <p className="text-xs text-ink-400">
                {discovery.message}
                {discovery.duplicatesRemoved > 0 && ` ${discovery.duplicatesRemoved} duplicado(s) removido(s) pela resolução de entidades.`}
              </p>
              <div className="grid gap-2 md:grid-cols-2">
                {discovery.candidates.map((c) => (
                  <div key={c.sourceUrl} className="flex items-start justify-between gap-3 rounded-lg border border-ink-800 bg-ink-950/40 p-3.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink-100">{c.name}</p>
                      <p className="truncate text-[11px] text-ink-500">{c.domain}</p>
                      {c.snippet && <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-ink-400">{c.snippet}</p>}
                    </div>
                    <button
                      className="btn-ghost shrink-0 px-2.5 py-1.5 text-xs"
                      onClick={async () => {
                        await api.post(`/projects/${id}/companies`, { name: c.name, website: c.website, role: 'COMPETITOR' }).catch(() => undefined);
                        await reload();
                      }}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Adicionar
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {!discovery && data.segment && (
            <p className="text-sm text-ink-400">
              A descoberta usa um provedor de busca configurável. Sem provedor, o cadastro manual continua disponível e todas as
              análises funcionam normalmente.
            </p>
          )}
        </div>
      </Panel>
    </div>
  );
}
