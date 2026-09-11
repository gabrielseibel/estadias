import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useApi, useSelectedProject } from './hooks';
import type { ProjectSummary } from './types';
import { EmptyState, ErrorState, Loading } from '../components/ui';

/**
 * Lista de projetos da organização, compartilhada por toda a interface.
 *
 * Existe porque a ausência de projeto selecionado tem causas diferentes e a
 * interface tratava todas como a mesma: quando a listagem falhava — API
 * hibernando, queda de rede, sessão expirada — nenhuma seleção automática
 * acontecia e cada tela pedia "selecione um projeto na barra lateral", onde
 * não havia nada para selecionar, justamente porque a lista não carregou.
 * Com o estado da listagem acessível às telas, cada caso diz o que é.
 */
type ProjectsState = {
  projects: ProjectSummary[] | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

const Ctx = createContext<ProjectsState | null>(null);

export function ProjectsProvider({ children }: { children: ReactNode }) {
  const { data, error, loading, reload } = useApi<ProjectSummary[]>('/projects');
  const [projectId, setProjectId] = useSelectedProject();

  // Seleciona o primeiro projeto automaticamente para não deixar a interface
  // vazia, e descarta uma seleção que não existe mais (projeto excluído ou
  // troca de organização).
  useEffect(() => {
    if (!data) return;
    if (!projectId && data.length > 0) setProjectId(data[0].id);
    if (projectId && !data.some((p) => p.id === projectId)) setProjectId(data[0]?.id ?? null);
  }, [data, projectId, setProjectId]);

  return <Ctx.Provider value={{ projects: data, loading, error, reload }}>{children}</Ctx.Provider>;
}

export function useProjects(): ProjectsState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useProjects precisa estar dentro de ProjectsProvider.');
  return ctx;
}

/** Os quatro motivos possíveis para uma tela não ter projeto com que trabalhar. */
export type NoProjectReason = 'loading' | 'error' | 'empty' | 'unselected';

/**
 * Função pura para ser testável sem montar a árvore de componentes.
 *
 * A ordem importa: "ainda carregando" e "falhou ao carregar" vêm antes de
 * qualquer conclusão sobre a seleção, porque nos dois casos ainda não se sabe
 * se existem projetos.
 */
export function noProjectReason(state: { loading: boolean; error: string | null; projects: ProjectSummary[] | null }): NoProjectReason {
  if (state.error) return 'error';
  if (state.loading || !state.projects) return 'loading';
  if (state.projects.length === 0) return 'empty';
  return 'unselected';
}

/** Substitui o antigo "Selecione um projeto" fixo das telas. */
export function NoProjectSelected() {
  const state = useProjects();
  const reason = noProjectReason(state);

  if (reason === 'loading') return <Loading label="Carregando seus projetos…" />;

  if (reason === 'error') {
    return (
      <ErrorState
        message={`Não foi possível carregar a lista de projetos, então nenhum pôde ser aberto. ${state.error ?? ''}`.trim()}
        onRetry={() => void state.reload()}
      />
    );
  }

  if (reason === 'empty') {
    return (
      <EmptyState
        title="Nenhum projeto ainda"
        description="Um projeto é um mercado: sua empresa, os concorrentes daquele recorte e as análises correspondentes."
        action={
          <Link className="btn-primary" to="/projects">
            Criar o primeiro projeto
          </Link>
        }
      />
    );
  }

  return (
    <EmptyState
      title="Selecione um projeto"
      description="Escolha o projeto ativo na barra lateral."
      action={
        <Link className="btn-ghost" to="/projects">
          Ver projetos
        </Link>
      }
    />
  );
}
