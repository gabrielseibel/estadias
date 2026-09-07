import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
import { errorHandler, requestLogger } from './middleware.js';
import { authRoutes } from './routes/auth.routes.js';
import { projectRoutes } from './routes/projects.routes.js';
import { analysisRoutes } from './routes/analysis.routes.js';
import { discoveryRoutes } from './routes/discovery.routes.js';
import { opsRoutes } from './routes/ops.routes.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: false, // a API serve JSON; o relatório HTML é renderizado isolado
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(cors({ origin: config.corsOrigins.length ? config.corsOrigins : true, credentials: false }));
  // Corpo limitado: reduz superfície de abuso.
  app.use(express.json({ limit: '256kb' }));
  app.use(requestLogger);

  // Limite global e limite estrito no login (proteção contra força bruta).
  app.use(
    '/api',
    rateLimit({ windowMs: 60_000, limit: config.isTest ? 100_000 : 300, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'too_many_requests', message: 'Muitas requisições. Aguarde um instante.' } }),
  );
  app.use(
    '/api/auth/login',
    rateLimit({ windowMs: 15 * 60_000, limit: config.isTest ? 100_000 : 10, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'too_many_requests', message: 'Muitas tentativas de login. Tente novamente em alguns minutos.' } }),
  );

  app.use('/api', opsRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/projects', projectRoutes);
  app.use('/api', analysisRoutes);
  app.use('/api', discoveryRoutes);

  app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found', message: 'Rota não encontrada.' }));
  app.use(errorHandler);

  return app;
}
