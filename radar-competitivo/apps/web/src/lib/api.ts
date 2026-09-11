/** Cliente HTTP da API. Anexa o token e normaliza erros para a interface. */

/**
 * Base das chamadas à API.
 *
 * O padrão `/api` cobre os dois cenários em que interface e API compartilham a
 * origem: o proxy do Vite em desenvolvimento e o nginx no Docker Compose.
 * Quando as duas ficam em hosts distintos — como em um deploy na Render, onde
 * o site estático e o serviço da API têm domínios próprios — basta definir
 * `VITE_API_URL` no build com a URL da API.
 */
export function resolveBaseUrl(raw: string | undefined): string {
  const value = (raw ?? '/api').trim().replace(/\/$/, '');
  if (!value) return '/api';
  // Caminho relativo (mesma origem) fica como está.
  if (value.startsWith('/')) return value;

  // Plataformas de deploy costumam expor apenas o hostname do serviço
  // ("radar-api.onrender.com"). Sem esquema, a URL seria interpretada como
  // caminho relativo e todas as chamadas falhariam silenciosamente.
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;

  // A API monta todas as rotas sob /api. Quando o valor traz apenas a origem
  // — que é o caso do hostname devolvido pela plataforma — o prefixo precisa
  // ser acrescentado, ou cada chamada bateria na raiz do serviço e receberia
  // 404. Um caminho informado explicitamente é respeitado como está.
  try {
    const parsed = new URL(withScheme);
    if (parsed.pathname === '/' || parsed.pathname === '') {
      return `${parsed.origin}/api`;
    }
  } catch {
    // Valor não parseável: devolve como veio e deixa a falha visível.
  }
  return withScheme;
}

export const API_BASE_URL = resolveBaseUrl(import.meta.env.VITE_API_URL);

/** Monta a URL absoluta de uma rota da API a partir do caminho relativo. */
export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

const TOKEN_KEY = 'radar.token';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* armazenamento indisponível — a sessão dura enquanto a aba estiver aberta */
  }
}

export class ApiError extends Error {
  constructor(readonly status: number, message: string, readonly code?: string, readonly details?: unknown) {
    super(message);
  }
}

/**
 * Mensagem para a falha que acontece ANTES de existir resposta: DNS que não
 * resolve, conexão recusada, certificado inválido ou preflight de CORS barrado.
 * O navegador esconde o motivo por segurança — `fetch` rejeita com um
 * "Failed to fetch" que não diz nada. Sem esta tradução, um erro de
 * configuração do deploy aparece na tela como se a conta é que estivesse
 * errada, que foi exatamente o que aconteceu em produção.
 */
export function networkErrorMessage(base: string, origin: string | null): string {
  const alvo = base.startsWith('/') ? 'a API na mesma origem do site' : `a API em ${base}`;
  const cors = origin ? ` e se ela libera a origem ${origin} (CORS_ORIGINS)` : '';
  return `Não foi possível falar com ${alvo}. Verifique se o endereço está correto e no ar${cors}.`;
}

function currentOrigin(): string | null {
  return typeof location !== 'undefined' && location.origin ? location.origin : null;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(apiUrl(path), {
      ...init,
      headers: {
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError(0, networkErrorMessage(API_BASE_URL, currentOrigin()), 'network');
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const data = text ? safeJson(text) : null;

  if (!res.ok) {
    const message = (data as { message?: string })?.message ?? `Erro ${res.status}`;
    if (res.status === 401) setToken(null);
    throw new ApiError(res.status, message, (data as { error?: string })?.error, (data as { details?: unknown })?.details);
  }
  return data as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
