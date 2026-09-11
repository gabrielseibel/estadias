import { describe, expect, it } from 'vitest';
import { resolveBaseUrl } from '../src/lib/api';

/**
 * Composição da base de chamadas à API.
 *
 * Existe porque um deploy quebrou aqui: a plataforma de hospedagem expõe o
 * endereço de um serviço como hostname puro ("radar-api.onrender.com"), sem
 * esquema e sem caminho. A API monta todas as rotas sob /api, então uma base
 * sem esse prefixo faz cada chamada bater na raiz do serviço e receber 404 —
 * com a interface carregando normalmente, o que torna o sintoma confuso.
 */
describe('base de chamadas à API', () => {
  const rota = (base: string) => `${base}/auth/register`;

  it('usa caminho relativo quando interface e API compartilham a origem', () => {
    expect(rota(resolveBaseUrl(undefined))).toBe('/api/auth/register');
    expect(rota(resolveBaseUrl(''))).toBe('/api/auth/register');
  });

  it('completa esquema e prefixo a partir de um hostname puro', () => {
    // Formato que a plataforma entrega ao referenciar outro serviço.
    expect(rota(resolveBaseUrl('radar-api.onrender.com'))).toBe('https://radar-api.onrender.com/api/auth/register');
  });

  it('acrescenta o prefixo quando a URL traz apenas a origem', () => {
    expect(rota(resolveBaseUrl('https://radar-api.onrender.com'))).toBe('https://radar-api.onrender.com/api/auth/register');
    expect(rota(resolveBaseUrl('https://radar-api.onrender.com/'))).toBe('https://radar-api.onrender.com/api/auth/register');
  });

  it('não duplica o prefixo quando já foi informado', () => {
    expect(rota(resolveBaseUrl('https://radar-api.onrender.com/api'))).toBe('https://radar-api.onrender.com/api/auth/register');
    expect(rota(resolveBaseUrl('https://radar-api.onrender.com/api/'))).toBe('https://radar-api.onrender.com/api/auth/register');
  });

  it('respeita um caminho informado explicitamente', () => {
    // Cenário de proxy reverso servindo a API sob outro prefixo.
    expect(rota(resolveBaseUrl('https://proxy.exemplo.com/backend'))).toBe('https://proxy.exemplo.com/backend/auth/register');
  });

  it('preserva caminho relativo customizado', () => {
    expect(rota(resolveBaseUrl('/backend'))).toBe('/backend/auth/register');
  });

  it('aceita http para ambientes sem TLS', () => {
    expect(rota(resolveBaseUrl('http://localhost:4000'))).toBe('http://localhost:4000/api/auth/register');
  });
});
