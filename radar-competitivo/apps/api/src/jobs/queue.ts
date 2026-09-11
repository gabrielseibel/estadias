import { JobStatus, JobType, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { jobLog } from '../lib/logger.js';
import { config } from '../config.js';
import { tooMany } from '../lib/errors.js';

/**
 * Fila de jobs persistida em PostgreSQL.
 *
 * Optou-se por fila em banco (em vez de Redis/BullMQ) para o MVP: menos
 * infraestrutura, transações reais e visibilidade direta do estado dos jobs na
 * interface. A reivindicação usa `FOR UPDATE SKIP LOCKED`, o que permite vários
 * workers concorrentes sem processar o mesmo job duas vezes.
 */

export type EnqueueInput = {
  organizationId: string;
  type: JobType;
  projectId?: string | null;
  companyId?: string | null;
  progressTotal?: number;
  currentStep?: string;
};

export async function enqueueJob(input: EnqueueInput) {
  const running = await prisma.crawlJob.count({
    where: { organizationId: input.organizationId, status: { in: [JobStatus.QUEUED, JobStatus.RUNNING, JobStatus.PROCESSING] } },
  });
  // Proteção contra abuso do crawler: limite de jobs simultâneos por organização.
  const limit = config.jobs.maxConcurrentPerOrg * 5;
  if (running >= limit) {
    throw tooMany(`Limite de ${limit} execuções pendentes atingido para esta organização. Aguarde a conclusão das análises em andamento.`);
  }

  const job = await prisma.crawlJob.create({
    data: {
      organizationId: input.organizationId,
      projectId: input.projectId ?? null,
      companyId: input.companyId ?? null,
      type: input.type,
      status: JobStatus.QUEUED,
      progressTotal: input.progressTotal ?? 0,
      currentStep: input.currentStep ?? 'Na fila',
    },
  });
  await appendLog(job.id, 'info', 'Job enfileirado.', { type: input.type });
  jobLog.info({ jobId: job.id, type: input.type }, 'job enfileirado');
  return job;
}

/** Reivindica o próximo job pendente respeitando o limite por organização. */
export async function claimNextJob(): Promise<{ id: string } | null> {
  const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    WITH busy AS (
      SELECT organization_id, COUNT(*)::int AS running
      FROM crawl_jobs
      WHERE status IN ('RUNNING', 'PROCESSING')
      GROUP BY organization_id
    )
    UPDATE crawl_jobs j
    SET status = 'RUNNING', started_at = COALESCE(j.started_at, NOW()), attempts = j.attempts + 1, updated_at = NOW()
    WHERE j.id = (
      SELECT c.id FROM crawl_jobs c
      LEFT JOIN busy b ON b.organization_id = c.organization_id
      WHERE c.status = 'QUEUED'
        AND COALESCE(b.running, 0) < ${config.jobs.maxConcurrentPerOrg}
      ORDER BY c.created_at
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING j.id
  `);
  return rows[0] ?? null;
}

export async function appendLog(jobId: string, level: 'info' | 'warn' | 'error' | 'debug', message: string, meta?: unknown) {
  await prisma.jobLog.create({
    data: { jobId, level, message: message.slice(0, 2000), meta: meta === undefined ? undefined : (meta as Prisma.InputJsonValue) },
  });
}

export async function updateProgress(
  jobId: string,
  patch: { done?: number; total?: number; step?: string; status?: JobStatus; pagesFetched?: number; pagesSkipped?: number; pagesFailed?: number },
) {
  await prisma.crawlJob.update({
    where: { id: jobId },
    data: {
      progressDone: patch.done,
      progressTotal: patch.total,
      currentStep: patch.step,
      status: patch.status,
      pagesFetched: patch.pagesFetched,
      pagesSkipped: patch.pagesSkipped,
      pagesFailed: patch.pagesFailed,
    },
  });
}

export async function finishJob(jobId: string, status: JobStatus, error?: string) {
  await prisma.crawlJob.update({
    where: { id: jobId },
    data: { status, error: error?.slice(0, 2000), finishedAt: new Date(), currentStep: status === JobStatus.COMPLETED ? 'Concluído' : status === JobStatus.PARTIAL ? 'Concluído com ressalvas' : 'Encerrado' },
  });
  await appendLog(jobId, status === JobStatus.FAILED ? 'error' : 'info', `Job finalizado: ${status}${error ? ` — ${error}` : ''}`);
}

/** Jobs presos (worker morreu no meio) voltam para a fila. */
export async function requeueStaleJobs(olderThanMs = 20 * 60_000) {
  const cutoff = new Date(Date.now() - olderThanMs);
  const stale = await prisma.crawlJob.updateMany({
    where: { status: { in: [JobStatus.RUNNING, JobStatus.PROCESSING] }, updatedAt: { lt: cutoff }, attempts: { lt: 3 } },
    data: { status: JobStatus.QUEUED, currentStep: 'Reenfileirado após interrupção' },
  });
  const dead = await prisma.crawlJob.updateMany({
    where: { status: { in: [JobStatus.RUNNING, JobStatus.PROCESSING] }, updatedAt: { lt: cutoff }, attempts: { gte: 3 } },
    data: { status: JobStatus.FAILED, error: 'Execução interrompida repetidamente.', finishedAt: new Date() },
  });
  if (stale.count || dead.count) jobLog.warn({ requeued: stale.count, failed: dead.count }, 'jobs interrompidos tratados');
  return { requeued: stale.count, failed: dead.count };
}
