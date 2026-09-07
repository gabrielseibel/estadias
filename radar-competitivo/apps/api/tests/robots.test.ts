import { describe, expect, it } from 'vitest';
import './setup.js';
import { crawlDelayFor, isAllowed, parseRobots } from '../src/lib/robots.js';

const UA = 'RadarCompetitivoBot/0.1';

describe('robots.txt', () => {
  it('respeita Disallow para o agente curinga', () => {
    const robots = parseRobots('User-agent: *\nDisallow: /admin\nDisallow: /privado\n');
    expect(isAllowed(robots, UA, '/')).toBe(true);
    expect(isAllowed(robots, UA, '/servicos')).toBe(true);
    expect(isAllowed(robots, UA, '/admin')).toBe(false);
    expect(isAllowed(robots, UA, '/admin/config')).toBe(false);
    expect(isAllowed(robots, UA, '/privado/dados')).toBe(false);
  });

  it('faz Allow mais específico prevalecer sobre Disallow', () => {
    const robots = parseRobots('User-agent: *\nDisallow: /blog\nAllow: /blog/publico\n');
    expect(isAllowed(robots, UA, '/blog/interno')).toBe(false);
    expect(isAllowed(robots, UA, '/blog/publico/post')).toBe(true);
  });

  it('aplica o grupo específico do agente em vez do curinga', () => {
    const robots = parseRobots(
      'User-agent: *\nDisallow: /\n\nUser-agent: radarcompetitivobot\nDisallow: /admin\nAllow: /\n',
    );
    expect(isAllowed(robots, UA, '/servicos')).toBe(true);
    expect(isAllowed(robots, UA, '/admin')).toBe(false);
    expect(isAllowed(robots, 'OutroBot/1.0', '/servicos')).toBe(false);
  });

  it('interpreta curingas e âncora de fim', () => {
    const robots = parseRobots('User-agent: *\nDisallow: /*.pdf$\nDisallow: /busca?*\n');
    expect(isAllowed(robots, UA, '/arquivo.pdf')).toBe(false);
    expect(isAllowed(robots, UA, '/arquivo.pdf.html')).toBe(true);
    expect(isAllowed(robots, UA, '/busca?q=teste')).toBe(false);
  });

  it('trata "Disallow:" vazio como liberação total', () => {
    const robots = parseRobots('User-agent: *\nDisallow:\n');
    expect(isAllowed(robots, UA, '/qualquer/coisa')).toBe(true);
  });

  it('lê crawl-delay e sitemaps declarados', () => {
    const robots = parseRobots('User-agent: *\nCrawl-delay: 5\nSitemap: https://exemplo.com/sitemap.xml\n');
    expect(crawlDelayFor(robots, UA)).toBe(5);
    expect(robots.sitemaps).toEqual(['https://exemplo.com/sitemap.xml']);
  });

  it('ignora comentários e linhas malformadas sem quebrar', () => {
    const robots = parseRobots('# comentário\nUser-agent: *\nlinha invalida\nDisallow: /x # inline\n');
    expect(isAllowed(robots, UA, '/x')).toBe(false);
    expect(isAllowed(robots, UA, '/y')).toBe(true);
  });
});
