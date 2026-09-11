import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import './setup.js';
import type { Server } from 'node:http';
import { createApp } from '../src/http/app.js';
import { prisma } from '../src/lib/prisma.js';
import { runJob } from '../src/jobs/handlers.js';
import { claimNextJob } from '../src/jobs/queue.js';
import { buildCompanySite, startFixtureSite, type RunningSite } from './fixtures/site-server.js';

/**
 * Testes de integração da API.
 *
 * Exercitam o fluxo completo do MVP contra banco e servidor HTTP reais:
 * cadastro, criação de projeto, cadastro de empresas, execução da análise
 * (coleta + processamento), comparação, oportunidades, recomendações e
 * relatório — além do isolamento entre organizações.
 */

let server: Server;
let baseUrl: string;
let siteSelf: RunningSite;
let siteCompetitor: RunningSite;

async function call(path: string, init: RequestInit & { token?: string } = {}) {
  const { token, ...rest } = init;
  const res = await fetch(`${baseUrl}${path}`, {
    ...rest,
    headers: {
      ...(rest.body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...rest.headers,
    },
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

const post = (path: string, body: unknown, token?: string) => call(path, { method: 'POST', body: JSON.stringify(body), token });
const get = (path: string, token?: string) => call(path, { token });

/** Executa os jobs pendentes de forma síncrona (o worker roda separado). */
async function drainJobs() {
  for (let i = 0; i < 12; i++) {
    const job = await claimNextJob();
    if (!job) break;
    await runJob(job.id);
  }
}

beforeAll(async () => {
  process.env.CRAWLER_ALLOW_PRIVATE_HOSTS = 'true';

  await prisma.organization.deleteMany({ where: { slug: { startsWith: 'teste-' } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: '@teste.local' } } });

  siteSelf = await startFixtureSite(
    buildCompanySite({ name: 'Academia Própria', services: ['Musculação'], rating: 4.0, reviewCount: 40, social: ['https://instagram.com/propria'] }),
  );
  siteCompetitor = await startFixtureSite(
    buildCompanySite({
      name: 'Academia Rival', services: ['Musculação', 'Personal Trainer', 'Avaliação Física'],
      prices: [{ label: 'Plano Mensal', amount: 129.9 }], rating: 4.8, reviewCount: 320,
      social: ['https://instagram.com/rival', 'https://facebook.com/rival'],
      blogPosts: [{ title: 'A', date: '2026-08-20' }, { title: 'B', date: '2026-08-10' }, { title: 'C', date: '2026-07-30' }],
    }),
  );

  server = createApp().listen(0);
  const address = server.address();
  baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
});

afterAll(async () => {
  process.env.CRAWLER_ALLOW_PRIVATE_HOSTS = 'false';
  await siteSelf?.close();
  await siteCompetitor?.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.organization.deleteMany({ where: { slug: { startsWith: 'teste-' } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: '@teste.local' } } });
  await prisma.$disconnect();
});

describe('autenticação', () => {
  it('cadastra usuário, cria organização e devolve token', async () => {
    const res = await post('/api/auth/register', {
      name: 'Dono', email: 'dono@teste.local', password: 'senha-muito-segura', organizationName: 'Teste Org',
    });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.organization.plan).toBe('FREE');
    await prisma.organization.update({ where: { id: res.body.organization.id }, data: { slug: `teste-${res.body.organization.id.slice(0, 8)}` } });
  });

  it('recusa e-mail duplicado', async () => {
    const res = await post('/api/auth/register', { name: 'Outro Dono', email: 'dono@teste.local', password: 'senha-muito-segura', organizationName: 'Outra Org' });
    expect(res.status).toBe(409);
  });

  it('recusa senha curta com erro de validação', async () => {
    const res = await post('/api/auth/register', { name: 'Novo Dono', email: 'novo@teste.local', password: '123', organizationName: 'Outra Org' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });

  it('usa a mesma mensagem para e-mail inexistente e senha errada', async () => {
    const inexistente = await post('/api/auth/login', { email: 'ninguem@teste.local', password: 'qualquer-senha' });
    const senhaErrada = await post('/api/auth/login', { email: 'dono@teste.local', password: 'senha-errada-aqui' });
    expect(inexistente.status).toBe(401);
    expect(senhaErrada.status).toBe(401);
    expect(inexistente.body.message).toBe(senhaErrada.body.message);
  });

  it('exige autenticação nas rotas protegidas', async () => {
    expect((await get('/api/projects')).status).toBe(401);
    expect((await get('/api/projects', 'token-invalido')).status).toBe(401);
  });
});

describe('fluxo completo do MVP', () => {
  let token = '';
  let projectId = '';

  it('1. autentica', async () => {
    const res = await post('/api/auth/login', { email: 'dono@teste.local', password: 'senha-muito-segura' });
    expect(res.status).toBe(200);
    token = res.body.token;
  });

  it('2. cria projeto', async () => {
    const res = await post('/api/projects', { name: 'Academias — Teste', segment: 'academia', city: 'Chapecó', state: 'SC' }, token);
    expect(res.status).toBe(201);
    projectId = res.body.id;
  });

  it('3. cadastra a própria empresa e o concorrente', async () => {
    const self = await post(`/api/projects/${projectId}/companies`, { name: 'Academia Própria', role: 'SELF', website: siteSelf.origin }, token);
    expect(self.status).toBe(201);
    const competitor = await post(`/api/projects/${projectId}/companies`, { name: 'Academia Rival', role: 'COMPETITOR', website: siteCompetitor.origin }, token);
    expect(competitor.status).toBe(201);
  });

  it('4. recusa segunda "minha empresa" no mesmo projeto', async () => {
    const res = await post(`/api/projects/${projectId}/companies`, { name: 'Outra Própria', role: 'SELF', website: 'https://outra-propria-teste.com.br' }, token);
    expect(res.status).toBe(409);
  });

  it('5. recusa empresa duplicada pela resolução de entidades', async () => {
    const res = await post(`/api/projects/${projectId}/companies`, { name: 'Academia Rival Ltda', role: 'COMPETITOR', website: siteCompetitor.origin }, token);
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/já estar cadastrada/i);
  });

  it('6. recusa website com esquema inválido', async () => {
    const res = await post(`/api/projects/${projectId}/companies`, { name: 'Inválida', role: 'COMPETITOR', website: 'ftp://169.254.169.254/' }, token);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/http/i);
  });

  it('7. executa a análise e conclui o job com progresso real', async () => {
    const start = await post(`/api/projects/${projectId}/analyze`, {}, token);
    expect(start.status).toBe(202);
    const jobId = start.body.job.id;

    await drainJobs();

    const { body } = await get(`/api/projects/${projectId}/jobs/${jobId}`, token);
    expect(['COMPLETED', 'PARTIAL']).toContain(body.job.status);
    expect(body.job.progressDone).toBe(body.job.progressTotal);
    expect(body.job.pagesFetched).toBeGreaterThan(0);
    expect(body.logs.length).toBeGreaterThan(3);
  });

  it('8. dashboard traz score, posição e destaques com base nos dados coletados', async () => {
    const { body } = await get(`/api/projects/${projectId}/dashboard`, token);
    expect(body.marketScore.value).not.toBeNull();
    expect(body.marketScore.components.length).toBeGreaterThan(0);
    expect(body.position.total).toBe(2);
    expect(body.highlights.bestRated.name).toBe('Academia Rival');
    expect(body.dataQuality).toHaveLength(2);
  });

  it('9. matriz competitiva e benchmarking respondem', async () => {
    const { body } = await get(`/api/projects/${projectId}/matrix`, token);
    expect(body.matrix.length).toBeGreaterThan(5);
    expect(body.scores).toHaveLength(2);
    expect(body.benchmarks.every((b: { label: string }) => typeof b.label === 'string')).toBe(true);
  });

  it('10. GAP de oferta encontra o que o concorrente divulga e a empresa não', async () => {
    const { body } = await get(`/api/projects/${projectId}/gap`, token);
    expect(body.available).toBe(true);
    const faltantes = body.missingInSelf.map((r: { normalized: string }) => r.normalized);
    expect(faltantes.some((n: string) => n.includes('personal'))).toBe(true);
  });

  it('11. oportunidades e recomendações têm evidência associada', async () => {
    const oportunidades = await get(`/api/projects/${projectId}/insights?kind=OPPORTUNITY`, token);
    expect(oportunidades.body.length).toBeGreaterThan(0);

    const recomendacoes = await get(`/api/projects/${projectId}/recommendations`, token);
    expect(recomendacoes.body.recommendations.length).toBeGreaterThan(0);
    for (const rec of recomendacoes.body.recommendations) {
      expect(rec.problem).toBeTruthy();
      expect(rec.evidence).toBeTruthy();
      expect(rec.successMetric).toBeTruthy();
    }
    expect(recomendacoes.body.actionPlan.D7.length).toBeLessThanOrEqual(3);
  });

  it('12. evidências são consultáveis e apontam para a URL de origem', async () => {
    const companies = await get(`/api/projects/${projectId}/companies`, token);
    const rival = companies.body.find((c: { name: string }) => c.name === 'Academia Rival');
    const evidencias = await get(`/api/companies/${rival.id}/evidence`, token);
    expect(evidencias.body.length).toBeGreaterThan(0);
    expect(evidencias.body[0].url).toContain('127.0.0.1');
    expect(evidencias.body[0].collectedAt).toBeTruthy();
  });

  it('13. gera relatório com as seções previstas e exporta HTML', async () => {
    const criado = await post(`/api/projects/${projectId}/reports`, {}, token);
    expect(criado.status).toBe(201);

    const preview = await get(`/api/projects/${projectId}/reports/preview`, token);
    const ids = preview.body.sections.map((s: { id: string }) => s.id);
    for (const esperado of ['resumo', 'cenario', 'concorrentes', 'reputacao', 'oferta', 'oportunidades', 'ameacas', 'recomendacoes', 'plano', 'fontes']) {
      expect(ids, esperado).toContain(esperado);
    }

    const html = await fetch(`${baseUrl}/api/reports/${criado.body.id}/export.html`, { headers: { authorization: `Bearer ${token}` } });
    const texto = await html.text();
    expect(html.headers.get('content-type')).toMatch(/text\/html/);
    expect(texto).toContain('Relatório de Inteligência Competitiva');
    expect(texto).toContain('Radar Competitivo');
  });

  it('14. informa honestamente quando a IA não está configurada', async () => {
    const { body } = await get('/api/ai/status', token);
    expect(body.available).toBe(false);
    expect(body.message).toMatch(/ANTHROPIC_API_KEY/);
  });

  it('15. descoberta declara indisponibilidade em vez de inventar concorrentes', async () => {
    const { body } = await post(`/api/projects/${projectId}/discover`, {}, token);
    expect(body.available).toBe(false);
    expect(body.candidates).toHaveLength(0);
    expect(body.message).toMatch(/ainda não disponível/i);
  });
});

describe('isolamento entre organizações', () => {
  let tokenA = '';
  let tokenB = '';
  let projectA = '';
  let companyA = '';

  beforeAll(async () => {
    const a = await post('/api/auth/register', { name: 'Dona A', email: 'org-a@teste.local', password: 'senha-muito-segura', organizationName: 'Org A' });
    const b = await post('/api/auth/register', { name: 'Dono B', email: 'org-b@teste.local', password: 'senha-muito-segura', organizationName: 'Org B' });
    tokenA = a.body.token;
    tokenB = b.body.token;
    for (const org of [a, b]) {
      await prisma.organization.update({ where: { id: org.body.organization.id }, data: { slug: `teste-${org.body.organization.id.slice(0, 8)}` } });
    }
    const project = await post('/api/projects', { name: 'Projeto da Org A' }, tokenA);
    projectA = project.body.id;
    const company = await post(`/api/projects/${projectA}/companies`, { name: 'Empresa A', role: 'SELF', website: 'https://empresa-a-teste.com.br' }, tokenA);
    companyA = company.body.id;
  });

  it('a organização B não enxerga projetos da organização A', async () => {
    const { body } = await get('/api/projects', tokenB);
    expect(body.map((p: { id: string }) => p.id)).not.toContain(projectA);
  });

  it('a organização B não acessa o projeto da A por id direto', async () => {
    for (const path of [`/api/projects/${projectA}`, `/api/projects/${projectA}/dashboard`, `/api/projects/${projectA}/matrix`, `/api/projects/${projectA}/gap`, `/api/projects/${projectA}/recommendations`]) {
      const res = await get(path, tokenB);
      expect([403, 404], path).toContain(res.status);
    }
  });

  it('a organização B não acessa empresas nem evidências da A', async () => {
    expect((await get(`/api/companies/${companyA}`, tokenB)).status).toBe(403);
    expect((await get(`/api/companies/${companyA}/evidence`, tokenB)).status).toBe(403);
  });

  it('a organização B não dispara coleta em empresa da A', async () => {
    expect((await post(`/api/companies/${companyA}/analyze`, {}, tokenB)).status).toBe(403);
  });

  it('a organização B não cadastra empresa dentro do projeto da A', async () => {
    const res = await post(`/api/projects/${projectA}/companies`, { name: 'Intrusa', role: 'COMPETITOR' }, tokenB);
    expect(res.status).toBe(403);
  });
});

describe('limites de plano', () => {
  it('o plano FREE limita a quantidade de projetos', async () => {
    const res = await post('/api/auth/register', { name: 'Limite', email: 'limite@teste.local', password: 'senha-muito-segura', organizationName: 'Org Limite' });
    const token = res.body.token;
    await prisma.organization.update({ where: { id: res.body.organization.id }, data: { slug: `teste-${res.body.organization.id.slice(0, 8)}` } });

    const primeiro = await post('/api/projects', { name: 'P1' }, token);
    expect(primeiro.status).toBe(201);
    const segundo = await post('/api/projects', { name: 'P2' }, token);
    expect(segundo.status).toBe(409);
    expect(segundo.body.message).toMatch(/plano FREE/i);
  });
});
