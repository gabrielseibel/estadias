import { prisma } from '../lib/prisma.js';
import { config } from '../config.js';
import { safeFetch } from '../lib/http-client.js';
import { crawlDelayFor, isAllowed, parseRobots, ROBOTS_ALLOW_ALL, ROBOTS_DENY_ALL, type RobotsTxt } from '../lib/robots.js';
import { setDomainDelay } from '../lib/rate-limiter.js';
import { crawlerLog } from '../lib/logger.js';

/**
 * Busca e cacheia robots.txt por host (12h em banco + memória no processo).
 * O crawl-delay declarado pelo site é aplicado ao rate limiter do domínio.
 */

const TTL_MS = 12 * 60 * 60 * 1000;
const memory = new Map<string, { robots: RobotsTxt; at: number }>();

async function load(origin: string): Promise<RobotsTxt> {
  const host = new URL(origin).host;
  const cached = memory.get(host);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.robots;

  const row = await prisma.robotsCache.findUnique({ where: { host } });
  if (row && Date.now() - row.fetchedAt.getTime() < TTL_MS) {
    const robots = row.status === 404 ? ROBOTS_ALLOW_ALL : parseRobots(row.body);
    memory.set(host, { robots, at: Date.now() });
    return robots;
  }

  const res = await safeFetch(new URL('/robots.txt', origin).toString(), {
    accept: 'text/plain,*/*;q=0.5',
    maxBytes: 512_000,
    skipRateLimit: true,
  });

  let robots: RobotsTxt;
  let status: number | null = null;
  let body = '';
  if (res.ok && !res.notModified) {
    status = res.status;
    body = res.body;
    robots = parseRobots(res.body);
  } else if (!res.ok && res.status === 404) {
    status = 404;
    robots = ROBOTS_ALLOW_ALL; // ausência de robots.txt = permitido
  } else if (!res.ok && res.status && res.status >= 400 && res.status < 500) {
    status = res.status;
    robots = ROBOTS_ALLOW_ALL;
  } else {
    // Indisponível/erro de servidor: postura conservadora — não coleta agora.
    crawlerLog.warn({ host, error: res.ok ? null : res.error }, 'robots.txt indisponível; host tratado como restrito');
    robots = ROBOTS_DENY_ALL;
  }

  await prisma.robotsCache.upsert({
    where: { host },
    create: { host, body, status: status ?? undefined, fetchedAt: new Date() },
    update: { body, status: status ?? undefined, fetchedAt: new Date() },
  });
  memory.set(host, { robots, at: Date.now() });
  return robots;
}

export type RobotsDecision = { allowed: boolean; reason?: string; sitemaps: string[] };

export async function checkRobots(url: string): Promise<RobotsDecision> {
  if (!config.crawler.respectRobots) return { allowed: true, sitemaps: [] };
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { allowed: false, reason: 'URL inválida', sitemaps: [] };
  }
  const robots = await load(parsed.origin);
  const delay = crawlDelayFor(robots, config.crawler.userAgent);
  if (delay) setDomainDelay(parsed.hostname.replace(/^www\./, ''), delay * 1000);
  const allowed = isAllowed(robots, config.crawler.userAgent, parsed.pathname + parsed.search);
  return {
    allowed,
    reason: allowed ? undefined : 'Bloqueado por robots.txt',
    sitemaps: robots.sitemaps,
  };
}

export async function robotsSitemaps(origin: string): Promise<string[]> {
  const robots = await load(new URL(origin).origin);
  return robots.sitemaps;
}

export function clearRobotsMemoryCache(): void {
  memory.clear();
}
