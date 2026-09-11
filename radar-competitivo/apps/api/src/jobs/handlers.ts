import { JobStatus, JobType, type CrawlJob } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { jobLog } from '../lib/logger.js';
import { appendLog, finishJob, updateProgress } from './queue.js';
import { collectCompany } from '../crawler/company-collector.js';
import { snapshotAndDetect } from '../analytics/snapshot.js';
import { createAlertsFromChanges } from '../analytics/alerts.js';
import { runProjectAnalysis } from '../analytics/pipeline.js';
import { generateExecutiveSynthesis } from '../ai/analyst.js';

/**
 * Execução dos jobs.
 *
 * O progresso reportado é real: as unidades são etapas concretas do pipeline e
 * páginas efetivamente coletadas. Nenhuma porcentagem é simulada — quando o
 * total ainda não é conhecido, o job informa a etapa atual em vez de um número
 * inventado.
 */

export async function runJob(jobId: string): Promise<void> {
  const job = await prisma.crawlJob.findUnique({ where: { id: jobId } });
  if (!job) return;

  try {
    switch (job.type) {
      case JobType.COMPANY_CRAWL:
        await runCompanyCrawl(job);
        break;
      case JobType.FULL_ANALYSIS:
        await runFullAnalysis(job);
        break;
      case JobType.AI_ANALYSIS:
        await runAiAnalysis(job);
        break;
      default:
        await finishJob(jobId, JobStatus.FAILED, `Tipo de job não suportado: ${job.type}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    jobLog.error({ jobId, err: message }, 'job falhou');
    await appendLog(jobId, 'error', `Falha na execução: ${message}`);
    await finishJob(jobId, JobStatus.FAILED, message);
  }
}

async function runCompanyCrawl(job: CrawlJob) {
  if (!job.companyId) {
    await finishJob(job.id, JobStatus.FAILED, 'Job de coleta sem empresa associada.');
    return;
  }
  const company = await prisma.company.findUniqueOrThrow({ where: { id: job.companyId } });
  await updateProgress(job.id, { done: 0, total: 3, step: `Coletando ${company.name}`, status: JobStatus.RUNNING });

  const result = await collectCompany(company, {
    jobId: job.id,
    onProgress: async (done, total, step) => {
      await updateProgress(job.id, { done, total: Math.max(total, done), step });
    },
  });
  await appendLog(job.id, 'info', `Coleta concluída: ${result.pagesFetched} páginas coletadas, ${result.offerings} ofertas, ${result.prices} preços.`, result);

  await updateProgress(job.id, { step: 'Detectando mudanças', status: JobStatus.PROCESSING, pagesFetched: result.pagesFetched, pagesSkipped: result.pagesSkipped, pagesFailed: result.pagesFailed });
  const { changes, isFirst } = await snapshotAndDetect(company, job.id);
  await appendLog(job.id, 'info', isFirst ? 'Primeiro retrato registrado — comparações começam na próxima coleta.' : `${changes.length} mudança(s) detectada(s).`);

  if (changes.length > 0 && job.projectId) {
    const alerts = await createAlertsFromChanges(job.organizationId, job.projectId, company.name, changes);
    await appendLog(job.id, 'info', `${alerts} alerta(s) gerado(s).`);
  }

  const status = !result.reachable ? JobStatus.PARTIAL : result.pagesFailed > 0 && result.pagesFetched === 0 ? JobStatus.FAILED : result.pagesFailed > 0 ? JobStatus.PARTIAL : JobStatus.COMPLETED;
  await finishJob(job.id, status, result.reachable ? undefined : `Site não respondeu: ${result.notes.join(' ')}`);
}

async function runFullAnalysis(job: CrawlJob) {
  if (!job.projectId) {
    await finishJob(job.id, JobStatus.FAILED, 'Job de análise sem projeto associado.');
    return;
  }
  const companies = await prisma.company.findMany({ where: { projectId: job.projectId } });
  if (companies.length === 0) {
    await finishJob(job.id, JobStatus.FAILED, 'Projeto sem empresas cadastradas.');
    return;
  }

  // Etapas reais: uma por empresa + análise + síntese.
  const totalSteps = companies.length + 2;
  await updateProgress(job.id, { done: 0, total: totalSteps, step: 'Iniciando coleta', status: JobStatus.RUNNING });

  let done = 0;
  let unreachable = 0;
  let totalFetched = 0;
  let totalSkipped = 0;
  let totalFailed = 0;

  for (const company of companies) {
    await updateProgress(job.id, { done, total: totalSteps, step: `Coletando ${company.name} (${done + 1}/${companies.length})` });
    await appendLog(job.id, 'info', `Iniciando coleta de ${company.name}.`, { website: company.website });

    try {
      const result = await collectCompany(company, { jobId: job.id });
      totalFetched += result.pagesFetched;
      totalSkipped += result.pagesSkipped;
      totalFailed += result.pagesFailed;
      if (!result.reachable) {
        unreachable++;
        await appendLog(job.id, 'warn', `${company.name}: site não respondeu. ${result.notes.join(' ')}`);
      } else {
        await appendLog(job.id, 'info', `${company.name}: ${result.pagesFetched} páginas, ${result.offerings} ofertas, ${result.prices} preços, ${result.socialProfiles} canais sociais.`);
      }

      const { changes, isFirst } = await snapshotAndDetect(company, job.id);
      if (changes.length > 0) {
        const alerts = await createAlertsFromChanges(job.organizationId, job.projectId, company.name, changes);
        await appendLog(job.id, 'info', `${company.name}: ${changes.length} mudança(s), ${alerts} alerta(s).`);
      } else if (isFirst) {
        await appendLog(job.id, 'info', `${company.name}: primeiro retrato registrado.`);
      }
    } catch (err) {
      unreachable++;
      const message = err instanceof Error ? err.message : String(err);
      await appendLog(job.id, 'error', `${company.name}: falha na coleta — ${message}`);
    }

    done++;
    await updateProgress(job.id, { done, total: totalSteps, pagesFetched: totalFetched, pagesSkipped: totalSkipped, pagesFailed: totalFailed });
  }

  await updateProgress(job.id, { done, total: totalSteps, step: 'Calculando scores e comparativos', status: JobStatus.PROCESSING });
  const analysis = await runProjectAnalysis(job.projectId);
  done++;
  await appendLog(job.id, 'info', `Análise concluída: ${analysis.engine.insights.length} insights, ${analysis.engine.recommendations.length} recomendações, ${analysis.alertsCreated} novo(s) alerta(s).`);

  await updateProgress(job.id, { done, total: totalSteps, step: 'Gerando síntese executiva' });
  const synthesis = await generateExecutiveSynthesis(job.projectId, job.organizationId);
  done++;
  // Sem chave de IA não é anomalia, é configuração: registrar como aviso
  // faria a etapa parecer uma falha da análise, que concluiu normalmente.
  await appendLog(job.id, 'info', synthesis.message);

  await updateProgress(job.id, { done, total: totalSteps });
  const status = unreachable === companies.length ? JobStatus.FAILED : unreachable > 0 ? JobStatus.PARTIAL : JobStatus.COMPLETED;
  await finishJob(job.id, status, unreachable > 0 ? `${unreachable} de ${companies.length} empresas não puderam ser coletadas.` : undefined);
}

async function runAiAnalysis(job: CrawlJob) {
  if (!job.projectId) {
    await finishJob(job.id, JobStatus.FAILED, 'Job de IA sem projeto associado.');
    return;
  }
  await updateProgress(job.id, { done: 0, total: 2, step: 'Recalculando análise', status: JobStatus.RUNNING });
  await runProjectAnalysis(job.projectId);
  await updateProgress(job.id, { done: 1, total: 2, step: 'Gerando síntese executiva', status: JobStatus.PROCESSING });
  const synthesis = await generateExecutiveSynthesis(job.projectId, job.organizationId);
  // Sem chave de IA não é anomalia, é configuração: registrar como aviso
  // faria a etapa parecer uma falha da análise, que concluiu normalmente.
  await appendLog(job.id, 'info', synthesis.message);
  await updateProgress(job.id, { done: 2, total: 2 });
  await finishJob(job.id, JobStatus.COMPLETED);
}
