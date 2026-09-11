import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import './setup.js';
import { buildCompanySite, startFixtureSite, type RunningSite } from './fixtures/site-server.js';
import { crawlSite } from '../src/crawler/site-crawler.js';
import { safeFetch } from '../src/lib/http-client.js';
import { clearRobotsMemoryCache } from '../src/crawler/robots-service.js';
import { resetRateLimiter } from '../src/lib/rate-limiter.js';
import { prisma } from '../src/lib/prisma.js';

/**
 * Testes de crawler contra um servidor HTTP local real.
 *
 * Nada é simulado na camada de rede: o servidor de fixtures responde HTTP de
 * verdade, com robots.txt, sitemap.xml e ETag. Para alcançar 127.0.0.1 o guarda
 * de rede privada é liberado apenas aqui — em produção ele permanece ativo, o
 * que é verificado no teste "bloqueia alvo interno".
 */

let site: RunningSite;

beforeAll(async () => {
  await prisma.robotsCache.deleteMany({});
});

beforeEach(() => {
  process.env.CRAWLER_ALLOW_PRIVATE_HOSTS = 'true';
  clearRobotsMemoryCache();
  resetRateLimiter();
});

afterEach(async () => {
  process.env.CRAWLER_ALLOW_PRIVATE_HOSTS = 'false';
  await site?.close();
  await prisma.robotsCache.deleteMany({});
});

describe('coleta de site', () => {
  it('coleta a home, descobre o sitemap e prioriza páginas de valor competitivo', async () => {
    site = await startFixtureSite(
      buildCompanySite({
        name: 'Academia Fixture',
        services: ['Musculação', 'Personal Trainer'],
        prices: [{ label: 'Plano Mensal', amount: 129.9 }],
        rating: 4.5,
        reviewCount: 120,
        social: ['https://instagram.com/fixture'],
        blogPosts: [{ title: 'Treino', date: '2026-08-01' }],
      }),
    );

    const result = await crawlSite(site.origin, { maxPages: 20 });

    expect(result.reachable).toBe(true);
    expect(result.robotsTxtFound).toBe(true);
    expect(result.sitemapFound).toBe(true);

    const paths = result.pages.map((p) => new URL(p.url).pathname);
    expect(paths).toContain('/');
    expect(paths).toContain('/servicos');
    expect(paths).toContain('/planos');
    expect(paths).toContain('/contato');
    expect(paths).toContain('/servicos/musculacao');

    const home = result.pages.find((p) => new URL(p.url).pathname === '/');
    expect(home?.parsed?.title).toContain('Academia Fixture');
    expect(home?.contentHash).toBeTruthy();
  });

  it('respeita Disallow do robots.txt', async () => {
    const fixture = buildCompanySite({ name: 'Bloqueada', services: ['Servico A'] });
    fixture.robots = 'User-agent: *\nDisallow: /servicos\nAllow: /\n';
    site = await startFixtureSite(fixture);

    const result = await crawlSite(site.origin, { maxPages: 20 });
    const fetched = result.pages.filter((p) => p.status === 'FETCHED').map((p) => new URL(p.url).pathname);

    expect(fetched).toContain('/');
    expect(fetched.some((p) => p.startsWith('/servicos'))).toBe(false);
    expect(result.pages.some((p) => p.status === 'SKIPPED_ROBOTS')).toBe(true);
    // O servidor não deve ter recebido requisição para o caminho proibido.
    expect(site.requests.some((r) => r.startsWith('/servicos'))).toBe(false);
  });

  it('não coleta nada quando o robots.txt proíbe o site inteiro', async () => {
    const fixture = buildCompanySite({ name: 'Fechada', services: ['Servico A'] });
    fixture.robots = 'User-agent: *\nDisallow: /\n';
    site = await startFixtureSite(fixture);

    const result = await crawlSite(site.origin, { maxPages: 10 });
    expect(result.reachable).toBe(false);
    expect(result.notes.join(' ')).toMatch(/robots\.txt/i);
  });

  it('respeita o limite de páginas por execução e registra a ressalva', async () => {
    site = await startFixtureSite(
      buildCompanySite({ name: 'Grande', services: ['A', 'B', 'C', 'D', 'E', 'F'], products: ['P1', 'P2', 'P3'] }),
    );
    const result = await crawlSite(site.origin, { maxPages: 4 });
    const fetched = result.pages.filter((p) => p.status === 'FETCHED');
    expect(fetched.length).toBeLessThanOrEqual(4);
    expect(result.notes.join(' ')).toMatch(/limite de 4 páginas/i);
  });

  it('usa ETag para evitar recoletar página inalterada (HTTP 304)', async () => {
    site = await startFixtureSite(buildCompanySite({ name: 'Cacheada', services: ['Servico A'] }));

    const first = await crawlSite(site.origin, { maxPages: 3 });
    const home = first.pages.find((p) => new URL(p.url).pathname === '/');
    expect(home?.etag).toBeTruthy();

    const second = await crawlSite(site.origin, {
      maxPages: 3,
      cachedPages: [{ url: home!.url, etag: home!.etag ?? null, lastModified: null, contentHash: home!.contentHash ?? null }],
    });
    // A home é sempre buscada para validar o site; as demais respeitam o cache.
    const revalidated = await safeFetch(`${site.origin}/`, { etag: home!.etag });
    expect(revalidated.ok && revalidated.notModified).toBe(true);
    expect(second.reachable).toBe(true);
  });

  it('registra erro sem interromper a coleta quando uma página falha', async () => {
    const fixture = buildCompanySite({ name: 'Com Erro', services: ['Servico A'] });
    fixture.routes['/servicos'] = { body: 'erro interno', status: 500 };
    site = await startFixtureSite(fixture);

    const result = await crawlSite(site.origin, { maxPages: 10 });
    expect(result.reachable).toBe(true);
    expect(result.pages.some((p) => p.status === 'ERROR')).toBe(true);
    expect(result.pages.some((p) => p.status === 'FETCHED')).toBe(true);
  });

  it('não sai do domínio da empresa', async () => {
    const fixture = buildCompanySite({ name: 'Com Links Externos', services: ['Servico A'] });
    fixture.routes['/'] = {
      body: `<html><head><title>Externa</title></head><body>
        <a href="https://exemplo-externo.com/pagina">externo</a>
        <a href="/servicos">interno</a></body></html>`,
    };
    site = await startFixtureSite(fixture);

    const result = await crawlSite(site.origin, { maxPages: 10 });
    expect(result.pages.every((p) => p.url.startsWith(site.origin))).toBe(true);
  });
});

describe('proteção de rede no fetcher', () => {
  it('bloqueia alvo interno quando o modo de teste está desligado', async () => {
    site = await startFixtureSite(buildCompanySite({ name: 'Interna', services: ['A'] }));
    process.env.CRAWLER_ALLOW_PRIVATE_HOSTS = 'false';

    const result = await safeFetch(`${site.origin}/`);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.blocked).toBe('security');
    // Nenhuma requisição chegou ao servidor.
    expect(site.requests).toHaveLength(0);
  });

  it('aborta resposta maior que o limite configurado', async () => {
    const fixture = buildCompanySite({ name: 'Pesada', services: ['A'] });
    fixture.routes['/pesada'] = { body: 'x'.repeat(200_000) };
    site = await startFixtureSite(fixture);

    const result = await safeFetch(`${site.origin}/pesada`, { maxBytes: 1000 });
    expect(result.ok).toBe(false);
  });

  it('encerra requisição que excede o timeout', async () => {
    site = await startFixtureSite({ routes: { '/': { body: 'ok' } }, delayMs: 800 });
    const result = await safeFetch(`${site.origin}/`, { timeoutMs: 100 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/timeout/i);
  });
});
