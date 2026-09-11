import { createApp } from './http/app.js';
import { config } from './config.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { startWorker, stopWorker } from './jobs/worker.js';

const app = createApp();
const server = app.listen(config.port, () => {
  logger.info(
    {
      port: config.port,
      env: config.nodeEnv,
      ai: config.ai.enabled ? config.ai.model : 'não configurada',
      search: config.search.provider,
      worker: config.jobs.workerInline ? 'embutido' : 'externo',
    },
    'Radar Competitivo — API iniciada',
  );
});

if (config.jobs.workerInline) {
  void startWorker();
}

const shutdown = async (signal: string) => {
  logger.info({ signal }, 'encerrando');
  server.close();
  await stopWorker();
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
