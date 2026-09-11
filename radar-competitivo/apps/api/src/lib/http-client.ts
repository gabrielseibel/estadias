import crypto from 'node:crypto';
import { config } from '../config.js';
import { crawlerLog } from './logger.js';
import { assertSafeUrl, canonicalDomain } from './url-security.js';
import { acquireDomainSlot, backoffDelay, recordFailure, recordSuccess, CircuitOpenError } from './rate-limiter.js';

/**
 * Cliente HTTP do crawler.
 *
 * Características relevantes:
 *  - toda URL (inclusive cada salto de redirecionamento) passa pelo guarda SSRF;
 *  - redirecionamentos são seguidos manualmente, com limite;
 *  - corpo é lido em streaming e abortado ao ultrapassar o limite de bytes;
 *  - ETag/Last-Modified são enviados quando conhecidos → 304 evita retrabalho;
 *  - retries com backoff exponencial apenas em falhas transitórias.
 */

export type FetchOutcome =
  | {
      ok: true;
      status: number;
      notModified: boolean;
      url: string;
      finalUrl: string;
      body: string;
      contentType: string;
      etag: string | null;
      lastModified: string | null;
      bytes: number;
      elapsedMs: number;
      contentHash: string;
    }
  | {
      ok: false;
      url: string;
      status?: number;
      error: string;
      blocked?: 'security' | 'size' | 'circuit' | 'content-type';
      elapsedMs: number;
    };

export type FetchOptions = {
  etag?: string | null;
  lastModified?: string | null;
  accept?: string;
  maxBytes?: number;
  timeoutMs?: number;
  /** Não aplica espaçamento por domínio (usado para robots.txt do próprio host). */
  skipRateLimit?: boolean;
};

const MAX_REDIRECTS = 4;
const TEXTUAL = /^(text\/|application\/(xml|xhtml\+xml|rss\+xml|atom\+xml|json|ld\+json))/i;

export function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

async function readLimited(res: Response, maxBytes: number): Promise<{ text: string; bytes: number; truncated: boolean }> {
  const reader = res.body?.getReader();
  if (!reader) return { text: '', bytes: 0, truncated: false };
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    bytes += value.byteLength;
    if (bytes > maxBytes) {
      truncated = true;
      await reader.cancel().catch(() => undefined);
      break;
    }
    chunks.push(value);
  }
  const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  return { text: buf.toString('utf8'), bytes, truncated };
}

async function once(target: string, opts: FetchOptions): Promise<FetchOutcome> {
  const started = Date.now();
  const maxBytes = opts.maxBytes ?? config.crawler.maxBytes;
  const timeoutMs = opts.timeoutMs ?? config.crawler.timeoutMs;

  let currentUrl = target;
  let release: (() => void) | null = null;

  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const safe = await assertSafeUrl(currentUrl);
      if (!safe.ok) {
        return { ok: false, url: currentUrl, error: safe.reason, blocked: 'security', elapsedMs: Date.now() - started };
      }
      const domain = canonicalDomain(currentUrl) ?? 'unknown';
      if (!opts.skipRateLimit) {
        release?.();
        release = await acquireDomainSlot(domain);
      }

      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), timeoutMs);
      let res: Response;
      try {
        const headers: Record<string, string> = {
          'user-agent': config.crawler.userAgent,
          accept: opts.accept ?? 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'accept-language': 'pt-BR,pt;q=0.9,en;q=0.6',
        };
        if (opts.etag) headers['if-none-match'] = opts.etag;
        if (opts.lastModified) headers['if-modified-since'] = opts.lastModified;

        res = await fetch(safe.url, { method: 'GET', headers, redirect: 'manual', signal: ac.signal });
      } finally {
        clearTimeout(timer);
      }

      // 304 precisa ser tratado ANTES do bloco de redirecionamento: seu código
      // cai na faixa 3xx, mas não é um redirect — é a confirmação de que o
      // conteúdo já em cache continua válido.
      if (res.status === 304) {
        await res.body?.cancel().catch(() => undefined);
        recordSuccess(domain);
        return {
          ok: true, status: 304, notModified: true, url: target, finalUrl: currentUrl, body: '',
          contentType: res.headers.get('content-type') ?? '', etag: res.headers.get('etag') ?? opts.etag ?? null,
          lastModified: res.headers.get('last-modified') ?? opts.lastModified ?? null,
          bytes: 0, elapsedMs: Date.now() - started, contentHash: '',
        };
      }

      // Redirecionamento: revalida o destino antes de seguir.
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        await res.body?.cancel().catch(() => undefined);
        if (!location) {
          return { ok: false, url: currentUrl, status: res.status, error: 'Redirecionamento sem Location.', elapsedMs: Date.now() - started };
        }
        const next = new URL(location, currentUrl).toString();
        crawlerLog.debug({ from: currentUrl, to: next, status: res.status }, 'redirecionamento');
        currentUrl = next;
        continue;
      }

      const contentType = res.headers.get('content-type') ?? '';
      if (contentType && !TEXTUAL.test(contentType)) {
        await res.body?.cancel().catch(() => undefined);
        return { ok: false, url: currentUrl, status: res.status, error: `Tipo de conteúdo ignorado: ${contentType}`, blocked: 'content-type', elapsedMs: Date.now() - started };
      }

      const declared = Number(res.headers.get('content-length') ?? '0');
      if (declared && declared > maxBytes) {
        await res.body?.cancel().catch(() => undefined);
        return { ok: false, url: currentUrl, status: res.status, error: `Resposta maior que o limite (${declared} bytes).`, blocked: 'size', elapsedMs: Date.now() - started };
      }

      const { text, bytes, truncated } = await readLimited(res, maxBytes);
      if (!res.ok) {
        if (res.status >= 500 || res.status === 429) recordFailure(domain);
        return { ok: false, url: currentUrl, status: res.status, error: `HTTP ${res.status}`, elapsedMs: Date.now() - started };
      }
      if (truncated) {
        // Um HTML cortado ao meio produz extração não confiável (JSON-LD
        // incompleto, tags abertas). É melhor descartar a página e registrar o
        // motivo do que analisar um documento parcial como se fosse completo.
        return {
          ok: false, url: currentUrl, status: res.status,
          error: `Resposta excedeu o limite de ${maxBytes} bytes e foi descartada.`,
          blocked: 'size', elapsedMs: Date.now() - started,
        };
      }
      recordSuccess(domain);
      return {
        ok: true, status: res.status, notModified: false, url: target, finalUrl: currentUrl,
        body: text, contentType, etag: res.headers.get('etag'),
        lastModified: res.headers.get('last-modified'), bytes,
        elapsedMs: Date.now() - started, contentHash: sha256(text),
      };
    }
    return { ok: false, url: currentUrl, error: `Excesso de redirecionamentos (> ${MAX_REDIRECTS}).`, elapsedMs: Date.now() - started };
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      return { ok: false, url: currentUrl, error: err.message, blocked: 'circuit', elapsedMs: Date.now() - started };
    }
    const message = err instanceof Error ? (err.name === 'AbortError' ? `Timeout após ${timeoutMs}ms` : err.message) : String(err);
    const domain = canonicalDomain(currentUrl);
    if (domain) recordFailure(domain);
    return { ok: false, url: currentUrl, error: message, elapsedMs: Date.now() - started };
  } finally {
    release?.();
  }
}

const RETRYABLE = /timeout|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket|network|fetch failed|HTTP (429|5\d\d)/i;

export async function safeFetch(url: string, opts: FetchOptions = {}): Promise<FetchOutcome> {
  let last: FetchOutcome | null = null;
  for (let attempt = 0; attempt <= config.crawler.maxRetries; attempt++) {
    const out = await once(url, opts);
    if (out.ok) return out;
    last = out;
    // Falhas definitivas não são repetidas.
    if (out.blocked || !RETRYABLE.test(out.error)) return out;
    if (attempt < config.crawler.maxRetries) {
      const delay = backoffDelay(attempt);
      crawlerLog.debug({ url, attempt, delay, error: out.error }, 'nova tentativa');
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  return last!;
}
