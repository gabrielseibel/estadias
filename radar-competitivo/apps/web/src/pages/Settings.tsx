import { Activity, Database, Server, ShieldCheck } from 'lucide-react';
import { useApi, useSelectedProject } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { EmptyState, InfoNote, Loading, Panel, PanelHeader, PageHeader, Table, Chip } from '../components/ui';
import { dateTime } from '../lib/format';

type Ops = {
  window: string;
  jobs: Record<string, number>;
  pages: Record<string, number>;
  avgFetchMs: number | null;
  pagesFetched: number;
  sources: Record<string, number>;
  evidenceCount: number;
  aiRuns: Record<string, number>;
  recentErrors: { message: string; createdAt: string; jobId: string }[];
  crawler: {
    userAgent: string; respectRobots: boolean; maxPagesPerSite: number; domainDelayMs: number; concurrency: number;
    circuits: { domain: string; open: boolean; failures: number; delayMs: number }[];
  };
  ai: { available: boolean; model: string | null };
  search: { provider: string };
};

const FREQUENCIES = [
  { value: 'MANUAL', label: 'Manual' },
  { value: 'DAILY', label: 'Diária' },
  { value: 'WEEKLY', label: 'Semanal' },
  { value: 'BIWEEKLY', label: 'Quinzenal' },
  { value: 'MONTHLY', label: 'Mensal' },
];

/** CONFIGURAÇÕES + painel operacional (observabilidade). */
export function Settings() {
  const { organization, user } = useAuth();
  const [projectId] = useSelectedProject();
  const { data: ops, loading } = useApi<Ops>('/ops/overview');
  const { data: project, reload } = useApi<{ id: string; name: string; frequency: string }>(projectId ? `/projects/${projectId}` : null);

  return (
    <div className="space-y-6">
      <PageHeader title="Configurações" description="Conta, frequência de monitoramento e o painel operacional da coleta." />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Conta e organização" />
          <dl className="grid gap-x-8 gap-y-3 p-5 text-sm sm:grid-cols-2">
            <Item label="Usuário" value={user?.name ?? '—'} />
            <Item label="E-mail" value={user?.email ?? '—'} />
            <Item label="Organização" value={organization?.name ?? '—'} />
            <Item label="Plano" value={organization?.plan ?? '—'} />
            <Item label="Modo demonstração" value={organization?.isDemo ? 'Ativo' : 'Inativo'} />
          </dl>
          <div className="border-t border-ink-800 p-5">
            <InfoNote>
              Os limites por plano (projetos e concorrentes) já são aplicados. Cobrança não faz parte do MVP; a arquitetura
              multi-tenant permite adicioná-la sem alterar o modelo de dados.
            </InfoNote>
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Frequência de monitoramento" subtitle="Com que periodicidade este projeto deve ser recoletado." />
          <div className="p-5">
            {!project ? (
              <EmptyState title="Selecione um projeto" />
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  {FREQUENCIES.map((f) => (
                    <button
                      key={f.value}
                      className={`chip transition ${project.frequency === f.value ? 'border-radar-400/50 bg-radar-400/15 text-radar-200' : 'border-ink-700 bg-ink-850 text-ink-300 hover:text-ink-100'}`}
                      onClick={async () => {
                        await api.patch(`/projects/${project.id}`, { frequency: f.value });
                        await reload();
                      }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
                <InfoNote>
                  No MVP a execução agendada depende de um agendador externo (cron) chamando a rota de análise, ou do botão
                  “Analisar agora”. A frequência escolhida fica registrada no projeto e orienta esse agendamento.
                </InfoNote>
              </>
            )}
          </div>
        </Panel>
      </div>

      {loading && !ops && <Loading label="Carregando painel operacional…" />}

      {ops && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Panel className="p-5">
              <p className="label">Páginas coletadas ({ops.window})</p>
              <p className="stat mt-2">{ops.pagesFetched}</p>
              <p className="mt-1 text-xs text-ink-400">Tempo médio de resposta: {ops.avgFetchMs !== null ? `${ops.avgFetchMs} ms` : 'não medido'}</p>
            </Panel>
            <Panel className="p-5">
              <p className="label">Evidências registradas</p>
              <p className="stat mt-2">{ops.evidenceCount}</p>
              <p className="mt-1 text-xs text-ink-400">Cada dado relevante rastreável até a fonte.</p>
            </Panel>
            <Panel className="p-5">
              <p className="label">Camada de IA</p>
              <p className="stat mt-2 text-lg">{ops.ai.available ? ops.ai.model : 'Não configurada'}</p>
              <p className="mt-1 text-xs text-ink-400">{ops.ai.available ? 'Síntese executiva e chat habilitados.' : 'Motor analítico determinístico ativo.'}</p>
            </Panel>
            <Panel className="p-5">
              <p className="label">Provedor de busca</p>
              <p className="stat mt-2 text-lg">{ops.search.provider === 'none' ? 'Não configurado' : ops.search.provider}</p>
              <p className="mt-1 text-xs text-ink-400">{ops.search.provider === 'none' ? 'Descoberta automática indisponível; cadastro manual ativo.' : 'Descoberta automática de concorrentes habilitada.'}</p>
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel>
              <PanelHeader title="Política do crawler" subtitle="Como o Radar se comporta ao coletar sites de terceiros." icon={<ShieldCheck className="h-4 w-4 text-ink-500" />} />
              <dl className="grid gap-x-8 gap-y-3 p-5 text-sm sm:grid-cols-2">
                <Item label="User-Agent" value={ops.crawler.userAgent} mono />
                <Item label="Respeita robots.txt" value={ops.crawler.respectRobots ? 'Sim' : 'Não'} />
                <Item label="Páginas por site" value={String(ops.crawler.maxPagesPerSite)} />
                <Item label="Intervalo entre requisições" value={`${ops.crawler.domainDelayMs} ms por domínio`} />
                <Item label="Concorrência" value={String(ops.crawler.concurrency)} />
              </dl>
              {ops.crawler.circuits.length > 0 && (
                <div className="border-t border-ink-800 p-5">
                  <p className="label mb-2">Domínios com falhas recentes</p>
                  <div className="flex flex-wrap gap-1.5">
                    {ops.crawler.circuits.map((c) => (
                      <Chip key={c.domain} className={c.open ? 'border-signal-critical/40 bg-signal-critical/10 text-signal-critical' : ''}>
                        {c.domain} · {c.failures} falha(s){c.open ? ' · circuito aberto' : ''}
                      </Chip>
                    ))}
                  </div>
                </div>
              )}
            </Panel>

            <Panel>
              <PanelHeader title="Execuções e coleta" subtitle={`Janela: ${ops.window}`} icon={<Server className="h-4 w-4 text-ink-500" />} />
              <div className="grid gap-5 p-5 sm:grid-cols-2">
                <Distribution title="Jobs" data={ops.jobs} />
                <Distribution title="Páginas" data={ops.pages} />
                <Distribution title="Fontes" data={ops.sources} />
                <Distribution title="Execuções de IA" data={ops.aiRuns} />
              </div>
            </Panel>
          </div>

          <Panel>
            <PanelHeader title="Erros recentes" subtitle="Falhas registradas durante a coleta e o processamento." icon={<Activity className="h-4 w-4 text-ink-500" />} />
            {ops.recentErrors.length === 0 ? (
              <p className="px-5 py-6 text-sm text-ink-400">Nenhum erro registrado no período.</p>
            ) : (
              <Table headers={['Quando', 'Mensagem']}>
                {ops.recentErrors.map((e, i) => (
                  <tr key={i}>
                    <td className="td whitespace-nowrap text-xs text-ink-400">{dateTime(e.createdAt)}</td>
                    <td className="td text-xs text-signal-high">{e.message}</td>
                  </tr>
                ))}
              </Table>
            )}
          </Panel>

          <Panel>
            <PanelHeader title="Privacidade e retenção" icon={<Database className="h-4 w-4 text-ink-500" />} />
            <div className="space-y-2.5 p-5 text-xs leading-relaxed text-ink-400">
              <p>• O Radar coleta apenas dados empresariais públicos. Não coleta CPF, RG, endereço residencial, telefone pessoal, e-mail pessoal nem dados biométricos.</p>
              <p>• Avaliações públicas são analisadas como conteúdo. Identificação de autores não é coletada nem armazenada — avaliações não viram perfis de pessoas físicas.</p>
              <p>• O HTML bruto das páginas é descartado após o prazo de retenção configurado; o texto extraído e as evidências (URL, trecho, data, hash) permanecem para auditoria.</p>
              <p>• O crawler respeita robots.txt, aplica intervalo entre requisições por domínio e não tenta contornar CAPTCHA, autenticação, paywall ou qualquer mecanismo de proteção.</p>
              <p>• Excluir um projeto remove em cascata todas as páginas, snapshots, evidências e análises associadas.</p>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}

function Item({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd className={`mt-0.5 break-words text-ink-100 ${mono ? 'font-mono text-[11px]' : ''}`}>{value}</dd>
    </div>
  );
}

function Distribution({ title, data }: { title: string; data: Record<string, number> }) {
  const entries = Object.entries(data);
  const total = entries.reduce((s, [, v]) => s + v, 0) || 1;
  return (
    <div>
      <p className="label mb-2">{title}</p>
      {entries.length === 0 ? (
        <p className="text-xs text-ink-500">Sem registros.</p>
      ) : (
        <ul className="space-y-1.5">
          {entries.map(([key, value]) => (
            <li key={key} className="text-xs">
              <div className="flex justify-between">
                <span className="text-ink-400">{key}</span>
                <span className="tabular-nums text-ink-200">{value}</span>
              </div>
              <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-ink-800">
                <div className="h-full rounded-full bg-radar-500/60" style={{ width: `${(value / total) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
