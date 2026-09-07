export class AppError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly code = 'bad_request',
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (m: string, details?: unknown) => new AppError(m, 400, 'bad_request', details);
export const unauthorized = (m = 'Não autenticado.') => new AppError(m, 401, 'unauthorized');
export const forbidden = (m = 'Acesso negado.') => new AppError(m, 403, 'forbidden');
export const notFound = (m = 'Recurso não encontrado.') => new AppError(m, 404, 'not_found');
export const conflict = (m: string) => new AppError(m, 409, 'conflict');
export const tooMany = (m: string) => new AppError(m, 429, 'too_many_requests');
export const unavailable = (m: string) => new AppError(m, 503, 'unavailable');
