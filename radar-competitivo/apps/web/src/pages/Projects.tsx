import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, FolderKanban, Plus, Search, Trash2, Loader2 } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useApi, useSelectedProject } from '../lib/hooks';
import type { ProjectSummary } from '../lib/types';
import { EmptyState, ErrorState, InfoNote, Loading, Panel, PanelHeader, PageHeader } from '../components/ui';
import { date, relativeTime } from '../lib/format';

export function Projects() {
  const { data, error, loading, reload } = useApi<ProjectSummary[]>('/projects');
  const [, setSelected] = useSelectedProject();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', segment: '', city: '', state: '' });
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      const project = await api.post<{ id: string }>('/projects', {
        name: form.name,
        segment: form.segment || undefined,
        city: form.city || undefined,
        state: form.state || undefined,
      });
      setSelected(project.id);
      setCreating(false);
      setForm({ name: '', segment: '', city: '', state: '' });
      await reload();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Não foi possível criar o projeto.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Excluir o projeto "${name}"? Todos os dados coletados, análises e relatórios dele serão removidos.`)) return;
    await api.del(`/projects/${id}`);
    await reload();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projetos"
        description="Cada projeto é um mercado: sua empresa, os concorrentes daquele recorte e todas as análises correspondentes."
        actions={
          <button className="btn-primary" onClick={() => setCreating((v) => !v)}>
            <Plus className="h-4 w-4" />
            Novo projeto
          </button>
        }
      />

      {creating && (
        <Panel>
          <PanelHeader title="Criar projeto" subtitle="Ex.: “Mercado de Academias — Chapecó” ou “Contabilidade — Erechim”." />
          <form className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4" onSubmit={create}>
            <label className="sm:col-span-2">
              <span className="label mb-1.5 block">Nome do projeto</span>
              <input className="input" required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Mercado de Academias — Chapecó" />
            </label>
            <label>
              <span className="label mb-1.5 block">Segmento</span>
              <input className="input" value={form.segment} onChange={(e) => setForm({ ...form, segment: e.target.value })} placeholder="academia" />
            </label>
            <div className="grid grid-cols-3 gap-2">
              <label className="col-span-2">
                <span className="label mb-1.5 block">Cidade</span>
                <input className="input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Chapecó" />
              </label>
              <label>
                <span className="label mb-1.5 block">UF</span>
                <input className="input" maxLength={2} value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase() })} placeholder="SC" />
              </label>
            </div>
            {formError && <p className="text-xs text-signal-critical sm:col-span-2 lg:col-span-4">{formError}</p>}
            <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
              <button className="btn-primary" disabled={busy}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Criar projeto
              </button>
              <button type="button" className="btn-ghost" onClick={() => setCreating(false)}>
                Cancelar
              </button>
            </div>
          </form>
        </Panel>
      )}

      {loading && !data && <Loading />}
      {error && <ErrorState message={error} onRetry={reload} />}

      {data && data.length === 0 && !creating && (
        <Panel>
          <EmptyState
            title="Nenhum projeto ainda"
            description="Comece criando o recorte de mercado que você quer acompanhar. Depois cadastre sua empresa e os concorrentes."
            icon={<FolderKanban className="h-5 w-5" />}
            action={
              <button className="btn-primary" onClick={() => setCreating(true)}>
                <Plus className="h-4 w-4" />
                Criar primeiro projeto
              </button>
            }
          />
        </Panel>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data?.map((project) => (
          <Panel key={project.id} className="panel-hover flex flex-col">
            <div className="flex items-start justify-between gap-3 p-5">
              <div className="min-w-0">
                <Link to={`/projects/${project.id}`} className="block truncate text-sm font-semibold text-white hover:text-radar-300" onClick={() => setSelected(project.id)}>
                  {project.name}
                </Link>
                <p className="mt-1 truncate text-xs text-ink-400">
                  {[project.segment, project.city, project.state].filter(Boolean).join(' · ') || 'Sem segmento definido'}
                </p>
              </div>
              <button className="btn-subtle px-2 py-1.5 text-ink-500 hover:text-signal-critical" onClick={() => remove(project.id, project.name)} title="Excluir projeto">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-px border-y border-ink-800 bg-ink-800">
              <Metric label="Concorrentes" value={project.counts.competitors} />
              <Metric label="Alertas" value={project.counts.alerts} />
              <Metric label="Recomendações" value={project.counts.recommendations} />
            </div>

            <div className="flex items-center justify-between gap-3 p-5 text-xs">
              <span className="min-w-0 truncate text-ink-400">
                {project.self ? (
                  <>
                    <Building2 className="mr-1.5 inline h-3 w-3" />
                    {project.self.name}
                  </>
                ) : (
                  <span className="text-signal-medium">Empresa própria não cadastrada</span>
                )}
              </span>
              <span className="shrink-0 text-ink-500" title={date(project.lastAnalyzedAt)}>
                Análise {relativeTime(project.lastAnalyzedAt)}
              </span>
            </div>

            <div className="mt-auto flex gap-2 border-t border-ink-800 p-4">
              <Link className="btn-ghost flex-1 justify-center" to={`/projects/${project.id}`} onClick={() => setSelected(project.id)}>
                <Search className="h-3.5 w-3.5" />
                Abrir
              </Link>
              <Link className="btn-primary flex-1 justify-center" to="/dashboard" onClick={() => setSelected(project.id)}>
                Dashboard
              </Link>
            </div>
          </Panel>
        ))}
      </div>

      <InfoNote>
        Os limites por plano são aplicados na criação: FREE permite 1 projeto e 3 concorrentes; PRO, 5 projetos e 20 concorrentes.
        A cobrança ainda não está implementada — os limites já são respeitados pela arquitetura.
      </InfoNote>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-ink-900 px-3 py-3 text-center">
      <p className="text-lg font-semibold tabular-nums text-ink-100">{value}</p>
      <p className="mt-0.5 text-[10px] uppercase tracking-wider text-ink-500">{label}</p>
    </div>
  );
}
