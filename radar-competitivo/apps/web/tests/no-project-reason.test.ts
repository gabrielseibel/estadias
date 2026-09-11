import { describe, expect, it } from 'vitest';
import { noProjectReason } from '../src/lib/projects';
import type { ProjectSummary } from '../src/lib/types';

/**
 * Por que uma tela ficou sem projeto.
 *
 * Existe por causa de um relato real: com a listagem de projetos falhando, toda
 * tela dizia "selecione um projeto na barra lateral" — mas a barra não
 * oferecia nenhum, porque a lista era justamente o que não tinha carregado. O
 * usuário tinha projeto e dados; a interface é que estava atribuindo a falha à
 * escolha dele.
 */
const projeto = { id: 'p1' } as ProjectSummary;

describe('motivo de não haver projeto ativo', () => {
  it('falha de carregamento não é culpa da seleção', () => {
    expect(noProjectReason({ loading: false, error: 'Falha ao carregar os dados.', projects: null })).toBe('error');
    // Mesmo com uma lista antiga em mãos, o erro é o que precisa ser dito.
    expect(noProjectReason({ loading: false, error: 'Erro 502', projects: [projeto] })).toBe('error');
  });

  it('enquanto carrega, não conclui nada sobre a seleção', () => {
    expect(noProjectReason({ loading: true, error: null, projects: null })).toBe('loading');
    // Sem erro e sem lista ainda: também é espera, não ausência de projeto.
    expect(noProjectReason({ loading: false, error: null, projects: null })).toBe('loading');
  });

  it('lista vazia pede criação, não escolha', () => {
    expect(noProjectReason({ loading: false, error: null, projects: [] })).toBe('empty');
  });

  it('com projetos carregados e nenhum ativo, aí sim é escolher', () => {
    expect(noProjectReason({ loading: false, error: null, projects: [projeto] })).toBe('unselected');
  });
});
