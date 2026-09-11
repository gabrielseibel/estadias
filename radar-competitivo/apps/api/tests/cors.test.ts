import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import './setup.js';
import type { Server } from 'node:http';

// Definido antes de importar a app: a lista de origens é lida na carga do
// módulo de configuração.
process.env.CORS_ORIGINS = 'https://radar-web.onrender.com';
const { createApp } = await import('../src/http/app.js');

/**
 * Preflight de CORS.
 *
 * Existe por causa de um diagnóstico em produção: a requisição de cadastro
 * falhou com "404 · preflight", e a dúvida era se a própria API estava
 * recusando o OPTIONS. Não estava — e este teste fixa isso, para que um 404 em
 * um preflight continue significando "a requisição não chegou à aplicação"
 * (serviço fora do ar, endereço errado, proxy na frente), e não um defeito
 * daqui.
 */
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  const addr = server.address();
  baseUrl = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

function preflight(path: string, origin?: string) {
  return fetch(`${baseUrl}${path}`, {
    method: 'OPTIONS',
    headers: {
      ...(origin ? { origin } : {}),
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'content-type',
    },
  });
}

describe('preflight de CORS', () => {
  it('responde 204 à origem declarada e a libera', async () => {
    const res = await preflight('/api/auth/register', 'https://radar-web.onrender.com');
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('https://radar-web.onrender.com');
  });

  it('responde 204 a uma origem não declarada, mas sem liberá-la', async () => {
    // O navegador é quem barra: a ausência do cabeçalho é a recusa. Devolver
    // 404 aqui confundiria uma origem não autorizada com uma rota inexistente.
    const res = await preflight('/api/auth/register', 'https://origem-nao-declarada.example');
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('nunca responde 404 a um preflight, nem em rota inexistente', async () => {
    // O CORS encerra o OPTIONS antes do roteamento. Por isso um "404 ·
    // preflight" no navegador nunca vem desta aplicação: o que respondeu foi
    // outra coisa — serviço sem deploy ativo, endereço errado ou proxy.
    for (const rota of ['/api/auth/register', '/api/rota-que-nao-existe', '/api']) {
      const res = await preflight(rota, 'https://radar-web.onrender.com');
      expect(res.status).toBe(204);
    }
  });
});
