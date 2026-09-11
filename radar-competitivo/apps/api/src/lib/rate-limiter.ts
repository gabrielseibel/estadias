import { config } from '../config.js';

/**
 * Controle de cortesia por domínio: espaçamento mínimo entre requisições,
 * limite de concorrência e circuit breaker.
 *
 * O crawler nunca deve ser agressivo. Além do delay configurado, o
 * `crawl-delay` declarado no robots.txt do host tem precedência quando maior.
 */

type DomainState = {
  nextAllowedAt: number;
  delayMs: number;
  inFlight: number;
  consecutiveFailures: number;
  openUntil: number;
};

const domains = new Map<string, DomainState>();

function state(domain: string): DomainState {
  let s = domains.get(domain);
  if (!s) {
    s = { nextAllowedAt: 0, delayMs: config.crawler.domainDelayMs, inFlight: 0, consecutiveFailures: 0, openUntil: 0 };
    domains.set(domain, s);
  }
  return s;
}

export function setDomainDelay(domain: string, delayMs: number): void {
  const s = state(domain);
  s.delayMs = Math.max(s.delayMs, delayMs);
}

export class CircuitOpenError extends Error {
  constructor(domain: string, readonly retryAfterMs: number) {
    super(`Circuit breaker aberto para ${domain} (retry em ${Math.ceil(retryAfterMs / 1000)}s).`);
    this.name = 'CircuitOpenError';
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Reserva um slot no domínio, respeitando espaçamento e circuit breaker. */
export async function acquireDomainSlot(domain: string): Promise<() => void> {
  const s = state(domain);
  const now = Date.now();
  if (s.openUntil > now) throw new CircuitOpenError(domain, s.openUntil - now);

  // Espera de cortesia (serializa por domínio).
  const wait = Math.max(0, s.nextAllowedAt - Date.now());
  if (wait > 0) await sleep(wait);
  s.nextAllowedAt = Date.now() + s.delayMs;
  s.inFlight += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    s.inFlight = Math.max(0, s.inFlight - 1);
  };
}

export function recordSuccess(domain: string): void {
  const s = state(domain);
  s.consecutiveFailures = 0;
  s.openUntil = 0;
}

/** 5 falhas seguidas abrem o circuito por 5 minutos. */
export function recordFailure(domain: string): void {
  const s = state(domain);
  s.consecutiveFailures += 1;
  if (s.consecutiveFailures >= 5) {
    s.openUntil = Date.now() + 5 * 60_000;
  }
}

export function circuitState(domain: string) {
  const s = state(domain);
  return { open: s.openUntil > Date.now(), openUntil: s.openUntil, failures: s.consecutiveFailures, delayMs: s.delayMs };
}

/** Uso em testes. */
export function resetRateLimiter(): void {
  domains.clear();
}

/** Backoff exponencial com jitter, limitado a 20s. */
export function backoffDelay(attempt: number): number {
  const base = Math.min(20_000, 500 * 2 ** attempt);
  return Math.round(base * (0.7 + Math.random() * 0.6));
}
