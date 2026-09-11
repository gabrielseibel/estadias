import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import './setup.js';
import * as urlSecurity from '../src/lib/url-security.js';

/**
 * Testes de segurança do crawler (SSRF).
 *
 * O crawler recebe URLs de fontes não confiáveis: cadastro do usuário, links
 * encontrados em páginas de terceiros e resultados de busca. Estes testes
 * garantem que nenhuma delas alcança a rede interna.
 *
 * A variável CRAWLER_ALLOW_PRIVATE_HOSTS é forçada como desligada aqui, que é
 * o padrão de produção.
 */

/** Força o comportamento de produção: alvos privados bloqueados. */
async function loadGuard() {
  process.env.CRAWLER_ALLOW_PRIVATE_HOSTS = 'false';
  return urlSecurity;
}

describe('guarda SSRF — validação sintática', () => {
  let guard: typeof import('../src/lib/url-security.js');
  beforeEach(async () => {
    guard = await loadGuard();
  });
  afterEach(() => {
    process.env.CRAWLER_ALLOW_PRIVATE_HOSTS = 'false';
  });

  it('aceita URLs públicas http e https', () => {
    for (const url of ['https://exemplo.com.br', 'http://exemplo.com/pagina?x=1', 'https://sub.exemplo.com:8443/a']) {
      expect(guard.validateUrlSyntax(url).ok, url).toBe(true);
    }
  });

  it('rejeita protocolos não http(s)', () => {
    for (const url of ['file:///etc/passwd', 'ftp://exemplo.com', 'gopher://exemplo.com', 'data:text/html,<h1>x</h1>', 'javascript:alert(1)']) {
      const result = guard.validateUrlSyntax(url);
      expect(result.ok, url).toBe(false);
    }
  });

  it('rejeita credenciais embutidas na URL', () => {
    const result = guard.validateUrlSyntax('https://user:senha@exemplo.com/');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/credenciais/i);
  });

  it('rejeita portas fora da lista permitida', () => {
    const result = guard.validateUrlSyntax('http://exemplo.com:22/');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/porta/i);
  });

  it('rejeita localhost e domínios internos', () => {
    for (const url of ['http://localhost/', 'http://algo.local/', 'http://api.internal/', 'http://svc.svc.cluster.local/', 'http://metadata.google.internal/']) {
      expect(guard.validateUrlSyntax(url).ok, url).toBe(false);
    }
  });

  it('rejeita IPs literais de redes privadas e de metadados de nuvem', () => {
    const blocked = [
      'http://127.0.0.1/', 'http://10.0.0.5/', 'http://192.168.1.1/', 'http://172.16.0.1/',
      'http://169.254.169.254/latest/meta-data/', 'http://100.64.0.1/', 'http://0.0.0.0/', 'http://[::1]/',
      'http://[fd00::1]/', 'http://224.0.0.1/',
    ];
    for (const url of blocked) {
      expect(guard.validateUrlSyntax(url).ok, url).toBe(false);
    }
  });

  it('classifica corretamente as faixas de IP', () => {
    expect(guard.isPrivateIPv4('169.254.169.254')).toBe(true);
    expect(guard.isPrivateIPv4('172.31.255.255')).toBe(true);
    expect(guard.isPrivateIPv4('172.32.0.1')).toBe(false);
    expect(guard.isPrivateIPv4('8.8.8.8')).toBe(false);
    expect(guard.isPrivateIPv6('::ffff:10.0.0.1')).toBe(true);
    expect(guard.isPrivateIPv6('2001:4860:4860::8888')).toBe(false);
  });
});

describe('guarda SSRF — resolução DNS', () => {
  let guard: typeof import('../src/lib/url-security.js');
  beforeEach(async () => {
    guard = await loadGuard();
  });
  afterEach(() => {
    process.env.CRAWLER_ALLOW_PRIVATE_HOSTS = 'false';
  });

  it('bloqueia host que resolve para endereço interno', async () => {
    // localhost.localdomain e variantes resolvem para 127.0.0.1.
    const result = await guard.assertSafeUrl('http://127.0.0.1:8080/admin');
    expect(result.ok).toBe(false);
  });

  it('bloqueia host inexistente em vez de deixar passar', async () => {
    const result = await guard.assertSafeUrl('https://este-host-nao-existe-radar-teste-123456.invalid/');
    expect(result.ok).toBe(false);
  });
});

describe('normalização de URL', () => {
  let guard: typeof import('../src/lib/url-security.js');
  beforeEach(async () => {
    guard = await loadGuard();
  });

  it('remove fragmento e parâmetros de rastreamento', () => {
    expect(guard.normalizeUrl('https://exemplo.com/a?utm_source=x&id=2#topo')).toBe('https://exemplo.com/a?id=2');
  });

  it('resolve URL relativa contra a base', () => {
    expect(guard.normalizeUrl('/servicos', 'https://exemplo.com/sobre')).toBe('https://exemplo.com/servicos');
  });

  it('mantém porta não padrão no domínio canônico', () => {
    expect(guard.canonicalDomain('https://www.exemplo.com.br/x')).toBe('exemplo.com.br');
    expect(guard.canonicalDomain('http://exemplo.com:8080/')).toBe('exemplo.com:8080');
    expect(guard.canonicalDomain('https://exemplo.com:443/')).toBe('exemplo.com');
  });

  it('reconhece mesmo site apenas quando o domínio coincide', () => {
    expect(guard.sameSite('https://exemplo.com/a', 'https://www.exemplo.com/b')).toBe(true);
    expect(guard.sameSite('https://exemplo.com/a', 'https://outro.com/b')).toBe(false);
  });
});
