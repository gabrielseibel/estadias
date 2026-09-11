import dns from 'node:dns/promises';
import net from 'node:net';
import { config } from '../config.js';

/**
 * Guarda de segurança de URLs para o crawler (proteção SSRF).
 *
 * O crawler recebe URLs originadas de: cadastro do usuário, links encontrados
 * em páginas de terceiros e resultados de busca. Qualquer uma dessas origens
 * pode apontar para a rede interna, então toda URL passa por aqui — inclusive
 * cada salto de redirecionamento, que é seguido manualmente pelo fetcher.
 *
 * Regras aplicadas:
 *  - somente http/https;
 *  - sem credenciais embutidas (user:pass@host);
 *  - sem portas fora da lista permitida;
 *  - hostname resolvido em DNS e TODOS os endereços verificados contra faixas
 *    privadas, loopback, link-local, CGNAT, multicast e endpoints de metadados
 *    de nuvem (169.254.169.254, metadata.google.internal, …).
 */

export const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
export const ALLOWED_PORTS = new Set(['', '80', '443', '8080', '8443']);

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
  'metadata.goog',
  'instance-data',
  'metadata',
]);

/** Sufixos de domínio que nunca devem ser resolvidos externamente. */
const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.intranet', '.lan', '.home.arpa', '.svc.cluster.local'];

export type UrlCheckResult =
  | { ok: true; url: URL; addresses: string[] }
  | { ok: false; reason: string };

export function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts as [number, number, number, number];
  if (a === 0) return true; // "this network"
  if (a === 10) return true; // private
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local (inclui 169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 192 && b === 0) return true; // IETF protocol assignments
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast + reservado + broadcast
  return false;
}

export function isPrivateIPv6(ip: string): boolean {
  const addr = ip.toLowerCase().split('%')[0]; // remove zone id
  if (addr === '::' || addr === '::1') return true;
  if (addr.startsWith('fc') || addr.startsWith('fd')) return true; // unique local
  if (addr.startsWith('fe8') || addr.startsWith('fe9') || addr.startsWith('fea') || addr.startsWith('feb')) return true; // link-local
  if (addr.startsWith('ff')) return true; // multicast
  // IPv4 mapeado/compat: ::ffff:10.0.0.1
  const mapped = addr.match(/::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return false;
}

/**
 * `URL.hostname` devolve literais IPv6 entre colchetes ("[::1]"), forma que
 * `net.isIP` não reconhece. Sem remover os colchetes, um alvo IPv6 interno
 * escaparia da verificação de faixas e cairia no caminho de resolução DNS.
 */
export function hostnameToIp(hostname: string): string {
  const host = hostname.trim();
  return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
}

export function isBlockedAddress(ip: string): boolean {
  const version = net.isIP(ip);
  if (version === 4) return isPrivateIPv4(ip);
  if (version === 6) return isPrivateIPv6(ip);
  return true; // não é IP válido → bloqueia
}

/** Validação puramente sintática — não faz rede. */
export function validateUrlSyntax(raw: string): { ok: true; url: URL } | { ok: false; reason: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: 'URL inválida.' };
  }
  // "ftp://host" jamais deve virar "https://ftp//host": um esquema explícito e
  // não suportado é erro de entrada, não algo a normalizar.
  if (url.protocol === 'https:' && /^https:\/\/[a-z][a-z0-9+.-]*\/\//i.test(raw)) {
    return { ok: false, reason: 'URL inválida: informe um endereço http(s) válido.' };
  }
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    return { ok: false, reason: `Protocolo não permitido: ${url.protocol}` };
  }
  if (url.username || url.password) {
    return { ok: false, reason: 'URL com credenciais embutidas não é permitida.' };
  }
  // A lista de portas faz parte do guarda SSRF. O modo de testes locais
  // (allowPrivateHosts) usa portas efêmeras do próprio servidor de fixtures.
  if (!config.crawler.allowPrivateHosts && !ALLOWED_PORTS.has(url.port)) {
    return { ok: false, reason: `Porta não permitida: ${url.port}` };
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!host) return { ok: false, reason: 'Host ausente.' };
  if (!config.crawler.allowPrivateHosts) {
    if (BLOCKED_HOSTNAMES.has(host)) return { ok: false, reason: `Host bloqueado: ${host}` };
    if (BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) return { ok: false, reason: `Domínio interno bloqueado: ${host}` };
    const literal = hostnameToIp(host);
    if (net.isIP(literal) && isBlockedAddress(literal)) {
      return { ok: false, reason: `Endereço IP interno bloqueado: ${literal}` };
    }
  }
  return { ok: true, url };
}

/** Validação completa: sintaxe + resolução DNS + verificação de cada IP. */
export async function assertSafeUrl(raw: string): Promise<UrlCheckResult> {
  const syntax = validateUrlSyntax(raw);
  if (!syntax.ok) return syntax;
  const { url } = syntax;

  if (config.crawler.allowPrivateHosts) {
    return { ok: true, url, addresses: [] };
  }

  const host = hostnameToIp(url.hostname);
  if (net.isIP(host)) {
    return isBlockedAddress(host)
      ? { ok: false, reason: `Endereço IP interno bloqueado: ${host}` }
      : { ok: true, url, addresses: [host] };
  }

  let addresses: string[];
  try {
    const records = await dns.lookup(host, { all: true, verbatim: true });
    addresses = records.map((r) => r.address);
  } catch {
    return { ok: false, reason: `Não foi possível resolver o host: ${host}` };
  }
  if (addresses.length === 0) return { ok: false, reason: `Host sem endereços: ${host}` };

  const blocked = addresses.filter(isBlockedAddress);
  if (blocked.length > 0) {
    return { ok: false, reason: `Host resolve para endereço interno (${blocked.join(', ')}).` };
  }
  return { ok: true, url, addresses };
}

/**
 * Domínio canônico: chave de deduplicação de empresas e de agrupamento no rate
 * limiter. O "www." é descartado (é o mesmo site), mas uma porta não padrão é
 * mantida — `exemplo.com` e `exemplo.com:8080` são origens distintas.
 */
export function canonicalDomain(raw: string): string | null {
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(candidate);
    const host = u.hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
    if (!host) return null;
    const port = u.port && u.port !== '80' && u.port !== '443' ? `:${u.port}` : '';
    return `${host}${port}`;
  } catch {
    return null;
  }
}

/** Normaliza URL para comparação/dedupe (remove fragmento, params de tracking). */
const TRACKING_PARAMS = /^(utm_|fbclid|gclid|mc_cid|mc_eid|_ga|ref|igshid|yclid|msclkid)/i;
export function normalizeUrl(raw: string, base?: string): string | null {
  try {
    const u = base ? new URL(raw, base) : new URL(raw);
    u.hash = '';
    const keep: [string, string][] = [];
    u.searchParams.forEach((v, k) => {
      if (!TRACKING_PARAMS.test(k)) keep.push([k, v]);
    });
    u.search = '';
    keep.sort(([a], [b]) => a.localeCompare(b)).forEach(([k, v]) => u.searchParams.append(k, v));
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) u.pathname = u.pathname.slice(0, -1);
    return u.toString();
  } catch {
    return null;
  }
}

export function sameSite(a: string, b: string): boolean {
  const da = canonicalDomain(a);
  const db = canonicalDomain(b);
  if (!da || !db) return false;
  return da === db || da.endsWith(`.${db}`) || db.endsWith(`.${da}`);
}
