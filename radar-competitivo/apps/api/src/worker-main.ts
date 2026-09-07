import { startWorker, stopWorker } from './jobs/worker.js';
import { jobLog } from './lib/logger.js';
import { prisma } from './lib/prisma.js';

/** Processo dedicado ao worker (produção). */
await startWorker();

const shutdown = async (signal: string) => {
  jobLog.info({ signal }, 'encerrando worker');
  await stopWorker();
  await prisma.$disconnect();
  process.exit(0);
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
