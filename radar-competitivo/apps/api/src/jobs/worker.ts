import { jobLog } from '../lib/logger.js';
import { config } from '../config.js';
import { claimNextJob, requeueStaleJobs } from './queue.js';
import { runJob } from './handlers.js';

/**
 * Worker de jobs. Roda em processo separado (`npm run worker`) ou embutido na
 * API em desenvolvimento (`WORKER_INLINE=true`). Coleta pesada nunca acontece
 * dentro de uma requisição HTTP.
 */

let running = false;
let stopping = false;
let inFlight = 0;

export async function startWorker(): Promise<void> {
  if (running) return;
  running = true;
  stopping = false;
  jobLog.info({ concurrency: config.crawler.concurrency, pollMs: config.jobs.pollMs }, 'worker iniciado');

  await requeueStaleJobs().catch((err) => jobLog.error({ err }, 'falha ao reenfileirar jobs presos'));

  const loop = async () => {
    while (!stopping) {
      try {
        if (inFlight >= config.crawler.concurrency) {
          await sleep(config.jobs.pollMs);
          continue;
        }
        const job = await claimNextJob();
        if (!job) {
          await sleep(config.jobs.pollMs);
          continue;
        }
        inFlight++;
        jobLog.info({ jobId: job.id }, 'executando job');
        void runJob(job.id)
          .catch((err) => jobLog.error({ jobId: job.id, err }, 'erro não tratado no job'))
          .finally(() => {
            inFlight--;
          });
      } catch (err) {
        jobLog.error({ err }, 'erro no laço do worker');
        await sleep(2000);
      }
    }
    running = false;
  };

  void loop();

  // Jobs presos são reciclados periodicamente.
  const interval = setInterval(() => {
    void requeueStaleJobs().catch(() => undefined);
  }, 5 * 60_000);
  interval.unref?.();
}

export async function stopWorker(): Promise<void> {
  stopping = true;
  const deadline = Date.now() + 30_000;
  while (inFlight > 0 && Date.now() < deadline) await sleep(200);
  jobLog.info('worker encerrado');
}

export function workerStatus() {
  return { running, stopping, inFlight };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
