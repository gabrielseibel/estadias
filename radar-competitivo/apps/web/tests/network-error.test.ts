import { describe, expect, it, vi, afterEach } from 'vitest';
import { api, ApiError, API_BASE_URL, networkErrorMessage } from '../src/lib/api';

/**
 * Falha de rede e de CORS na chamada à API.
 *
 * Existe porque um deploy real quebrou aqui e a tela não ajudou: com a API em
 * um endereço errado, `fetch` rejeita antes de haver resposta e a tela de
 * acesso mostrava "Não foi possível concluir. Tente novamente." — mensagem que
 * aponta para a conta do usuário quando o problema é de configuração.
 */
describe('falha antes de existir resposta', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('vira um ApiError legível, com o endereço que falhou', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const erro = await api.post('/auth/register', { email: 'a@b.com' }).catch((e) => e);

    expect(erro).toBeInstanceOf(ApiError);
    expect(erro.status).toBe(0);
    expect(erro.code).toBe('network');
    // Sem `location` (ambiente de teste), sobra a parte que distingue erro de
    // configuração de erro de credencial: o endereço que não respondeu.
    expect(erro.message).toBe(networkErrorMessage(API_BASE_URL, null));
  });

  it('nomeia o endereço da API e a origem a liberar no CORS', () => {
    const msg = networkErrorMessage('https://radar-api.onrender.com/api', 'https://radar-web.onrender.com');
    expect(msg).toContain('https://radar-api.onrender.com/api');
    expect(msg).toContain('https://radar-web.onrender.com');
    expect(msg).toContain('CORS_ORIGINS');
  });

  it('não promete um endereço externo quando a base é relativa', () => {
    // Mesma origem: não há CORS envolvido e não existe host a conferir.
    expect(networkErrorMessage('/api', 'https://radar-web.onrender.com')).toContain('mesma origem');
  });

  it('omite a parte de CORS fora do navegador', () => {
    expect(networkErrorMessage('https://radar-api.onrender.com/api', null)).not.toContain('CORS_ORIGINS');
  });
});
