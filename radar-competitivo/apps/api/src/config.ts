import 'dotenv/config';

function str(key: string, fallback = ''): string {
  const v = process.env[key];
  return v === undefined || v === '' ? fallback : v;
}
function num(key: string, fallback: number): number {
  const v = Number(process.env[key]);
  return Number.isFinite(v) ? v : fallback;
}
function bool(key: string, fallback: boolean): boolean {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  return v === 'true' || v === '1';
}

const nodeEnv = str('NODE_ENV', 'development');
const isProd = nodeEnv === 'production';

const jwtSecret = str('JWT_SECRET');
if (isProd && jwtSecret.length < 32) {
  throw new Error('JWT_SECRET precisa ter ao menos 32 caracteres em produção.');
}

export const config = {
  nodeEnv,
  isProd,
  isTest: nodeEnv === 'test',
  port: num('PORT', 4000),
  databaseUrl: str('DATABASE_URL'),
  jwt: {
    secret: jwtSecret || 'dev-only-insecure-secret-change-me-please-0123456789',
    expiresIn: str('JWT_EXPIRES_IN', '12h'),
  },
  corsOrigins: str('CORS_ORIGINS', 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  crawler: {
    userAgent: str('CRAWLER_USER_AGENT', 'RadarCompetitivoBot/0.1 (+https://radarcompetitivo.example/bot)'),
    maxPagesPerSite: num('CRAWLER_MAX_PAGES_PER_SITE', 25),
    maxDepth: num('CRAWLER_MAX_DEPTH', 2),
    domainDelayMs: num('CRAWLER_DOMAIN_DELAY_MS', 1500),
    timeoutMs: num('CRAWLER_TIMEOUT_MS', 15_000),
    maxBytes: num('CRAWLER_MAX_BYTES', 3_000_000),
    maxRetries: num('CRAWLER_MAX_RETRIES', 2),
    concurrency: num('CRAWLER_CONCURRENCY', 4),
    respectRobots: bool('CRAWLER_RESPECT_ROBOTS', true),
    /**
     * PERIGO: libera alvos em redes privadas/localhost. Existe apenas para
     * testar o crawler contra um servidor local próprio. É lido a cada acesso
     * (e não capturado na carga do módulo) para que a suíte de testes possa
     * exercitar tanto o comportamento de produção quanto o de fixture.
     */
    get allowPrivateHosts(): boolean {
      return bool('CRAWLER_ALLOW_PRIVATE_HOSTS', false);
    },
  },
  jobs: {
    maxConcurrentPerOrg: num('JOBS_MAX_CONCURRENT_PER_ORG', 2),
    workerInline: bool('WORKER_INLINE', true),
    pollMs: num('WORKER_POLL_MS', 1500),
  },
  search: {
    provider: str('SEARCH_PROVIDER', 'none') as 'none' | 'searxng' | 'brave' | 'google_cse',
    searxngUrl: str('SEARXNG_URL'),
    braveKey: str('BRAVE_SEARCH_API_KEY'),
    googleKey: str('GOOGLE_CSE_KEY'),
    googleCx: str('GOOGLE_CSE_CX'),
  },
  ai: {
    apiKey: str('ANTHROPIC_API_KEY'),
    model: str('AI_MODEL', 'claude-sonnet-5'),
    maxTokens: num('AI_MAX_TOKENS', 4000),
    get enabled() {
      return Boolean(str('ANTHROPIC_API_KEY'));
    },
  },
  retention: {
    rawContentDays: num('RAW_CONTENT_RETENTION_DAYS', 30),
  },
} as const;

export type AppConfig = typeof config;
