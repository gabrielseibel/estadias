import pino from 'pino';
import { config } from '../config.js';

/**
 * Log estruturado. Em desenvolvimento usa pino-pretty; em produção JSON puro
 * (compatível com coletores). Contextos usados: crawler, jobs, parser, ai, db,
 * http — conforme a seção de observabilidade da especificação.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL || (config.isTest ? 'silent' : config.isProd ? 'info' : 'debug'),
  transport: config.isProd || config.isTest ? undefined : { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } },
  redact: {
    paths: ['req.headers.authorization', 'password', '*.password', 'passwordHash', 'apiKey', 'ANTHROPIC_API_KEY'],
    censor: '[redacted]',
  },
});

export const crawlerLog = logger.child({ ctx: 'crawler' });
export const jobLog = logger.child({ ctx: 'jobs' });
export const parserLog = logger.child({ ctx: 'parser' });
export const aiLog = logger.child({ ctx: 'ai' });
export const httpLog = logger.child({ ctx: 'http' });
