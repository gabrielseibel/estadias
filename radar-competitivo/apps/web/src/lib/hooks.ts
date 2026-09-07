import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { api, ApiError } from './api';

/** Busca dados da API com estados de carregamento, erro e recarga. */
export function useApi<T>(path: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const alive = useRef(true);

  const reload = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.get<T>(path);
      if (alive.current) setData(result);
    } catch (err) {
      if (alive.current) setError(err instanceof ApiError ? err.message : 'Falha ao carregar os dados.');
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    alive.current = true;
    void reload();
    return () => {
      alive.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);

  return { data, error, loading, reload, setData };
}

/** Repete a busca em intervalo enquanto `active` — usado no acompanhamento de jobs. */
export function usePolling(callback: () => void | Promise<void>, intervalMs: number, active: boolean) {
  const saved = useRef(callback);
  saved.current = callback;
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => void saved.current(), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, active]);
}

/**
 * Projeto selecionado.
 *
 * Precisa ser um estado compartilhado: a barra lateral escolhe o projeto e
 * todas as páginas leem essa escolha. Um `useState` por componente criaria
 * cópias independentes — trocar o projeto na barra não atualizaria a página.
 * Uma loja externa mínima com `useSyncExternalStore` resolve isso sem provider.
 */
const KEY = 'radar.project';

const projectStore = {
  value: readStored(),
  listeners: new Set<() => void>(),
  subscribe(listener: () => void) {
    projectStore.listeners.add(listener);
    return () => {
      projectStore.listeners.delete(listener);
    };
  },
  get() {
    return projectStore.value;
  },
  set(next: string | null) {
    if (projectStore.value === next) return;
    projectStore.value = next;
    try {
      if (next) localStorage.setItem(KEY, next);
      else localStorage.removeItem(KEY);
    } catch {
      /* armazenamento indisponível — a escolha vale enquanto a aba estiver aberta */
    }
    projectStore.listeners.forEach((l) => l());
  },
};

function readStored(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function useSelectedProject(): [string | null, (id: string | null) => void] {
  const id = useSyncExternalStore(projectStore.subscribe, projectStore.get, projectStore.get);
  return [id, projectStore.set];
}
