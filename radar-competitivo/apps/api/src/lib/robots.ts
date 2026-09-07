import { crawlerLog } from './logger.js';

/**
 * Parser de robots.txt (subconjunto do padrão suficiente para um crawler
 * educado): grupos User-agent, Allow/Disallow com match por prefixo e curinga
 * `*`/`$`, Crawl-delay e Sitemap.
 *
 * O sistema respeita robots.txt por padrão. Não há caminho de código que
 * ignore uma regra Disallow quando `CRAWLER_RESPECT_ROBOTS=true`.
 */

export type RobotsRule = { allow: boolean; pattern: string };
export type RobotsGroup = { agents: string[]; rules: RobotsRule[]; crawlDelay?: number };
export type RobotsTxt = { groups: RobotsGroup[]; sitemaps: string[]; raw: string };

export function parseRobots(body: string): RobotsTxt {
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];
  let current: RobotsGroup | null = null;
  let lastLineWasAgent = false;

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.split('#')[0].trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (field === 'user-agent') {
      if (!current || !lastLineWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastLineWasAgent = true;
      continue;
    }
    lastLineWasAgent = false;

    if (field === 'sitemap') {
      sitemaps.push(value);
      continue;
    }
    if (!current) continue;
    if (field === 'disallow') current.rules.push({ allow: false, pattern: value });
    else if (field === 'allow') current.rules.push({ allow: true, pattern: value });
    else if (field === 'crawl-delay') {
      const n = Number(value.replace(',', '.'));
      if (Number.isFinite(n) && n >= 0) current.crawlDelay = n;
    }
  }
  return { groups, sitemaps, raw: body };
}

/** Escolhe o grupo mais específico para o user-agent informado. */
export function groupFor(robots: RobotsTxt, userAgent: string): RobotsGroup | null {
  const ua = userAgent.toLowerCase();
  let best: RobotsGroup | null = null;
  let bestLen = -1;
  for (const g of robots.groups) {
    for (const agent of g.agents) {
      if (agent === '*') {
        if (bestLen < 0) {
          best = g;
          bestLen = 0;
        }
      } else if (ua.includes(agent) && agent.length > bestLen) {
        best = g;
        bestLen = agent.length;
      }
    }
  }
  return best;
}

function patternToRegex(pattern: string): RegExp {
  let p = pattern;
  let anchorEnd = false;
  if (p.endsWith('$')) {
    anchorEnd = true;
    p = p.slice(0, -1);
  }
  const escaped = p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}${anchorEnd ? '$' : ''}`);
}

/**
 * Decide se um caminho pode ser coletado. Em empate de tamanho, `Allow` vence
 * (comportamento adotado pelos principais mecanismos de busca).
 */
export function isAllowed(robots: RobotsTxt, userAgent: string, pathname: string): boolean {
  const group = groupFor(robots, userAgent);
  if (!group) return true;
  let decision = true;
  let bestLen = -1;
  for (const rule of group.rules) {
    if (rule.pattern === '') {
      // "Disallow:" vazio libera tudo para o grupo.
      if (!rule.allow && bestLen < 0) decision = true;
      continue;
    }
    if (patternToRegex(rule.pattern).test(pathname)) {
      const len = rule.pattern.length;
      if (len > bestLen || (len === bestLen && rule.allow)) {
        bestLen = len;
        decision = rule.allow;
      }
    }
  }
  return decision;
}

export function crawlDelayFor(robots: RobotsTxt, userAgent: string): number | undefined {
  const g = groupFor(robots, userAgent);
  return g?.crawlDelay;
}

/** robots.txt ausente (404) libera a coleta; erro de rede é tratado como restrito. */
export const ROBOTS_ALLOW_ALL: RobotsTxt = { groups: [], sitemaps: [], raw: '' };
export const ROBOTS_DENY_ALL: RobotsTxt = {
  groups: [{ agents: ['*'], rules: [{ allow: false, pattern: '/' }] }],
  sitemaps: [],
  raw: 'User-agent: *\nDisallow: /',
};

export function logRobotsDecision(url: string, allowed: boolean): void {
  if (!allowed) crawlerLog.debug({ url }, 'bloqueado por robots.txt');
}
