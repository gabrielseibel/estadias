import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

/** Envolve handlers assíncronos para que rejeições cheguem ao error handler. */
export function wrap<T>(handler: (req: Request, res: Response) => Promise<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch(next);
  };
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'validation_error',
      message: 'Dados inválidos.',
      details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.code, message: err.message, details: err.details });
  }
  const message = err instanceof Error ? err.message : String(err);
  logger.error({ err: message, path: req.path, method: req.method }, 'erro não tratado');
  // Detalhes internos não vazam para o cliente.
  return res.status(500).json({ error: 'internal_error', message: 'Erro interno ao processar a requisição.' });
}

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const started = Date.now();
  res.on('finish', () => {
    const elapsed = Date.now() - started;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'debug';
    logger[level]({ method: req.method, path: req.path, status: res.statusCode, ms: elapsed }, 'requisição');
  });
  next();
}
