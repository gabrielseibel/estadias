import { prisma } from '../lib/prisma.js';
import { loadProjectViews } from './company-view.js';
import { buildBenchmarks, buildMatrix, computeScores } from './competitive.js';
import { analyzeOfferGap } from './gap.js';
import { runInsightEngine } from './insight-engine.js';
import { computeDataQuality, persistDataQuality } from './data-quality.js';
import { createAlertsFromInsights } from './alerts.js';

/**
 * Pipeline analítico do projeto: consolida as visões das empresas, calcula
 * scores e comparativos, roda a engine de insights e persiste oportunidades,
 * ameaças e recomendações.
 *
 * É executado ao final de uma análise e pode ser reexecutado isoladamente sem
 * nova coleta (recálculo determinístico sobre os mesmos dados).
 */

export async function runProjectAnalysis(projectId: string) {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  const views = await loadProjectViews(projectId);
  const scores = computeScores(views);
  const matrix = buildMatrix(scores);
  const benchmarks = buildBenchmarks(scores);
  const gap = analyzeOfferGap(views);
  const engine = runInsightEngine({ views, scores, benchmarks, gap });

  // Métricas competitivas versionadas (memória analítica).
  for (const score of scores) {
    await prisma.competitiveMetric.create({
      data: {
        projectId,
        companyId: score.companyId,
        reputationScore: toPercent(score.dimensions.reputation.value),
        presenceScore: toPercent(score.dimensions.presence.value),
        offerScore: toPercent(score.dimensions.offer.value),
        contentScore: toPercent(score.dimensions.content.value),
        seoScore: toPercent(score.dimensions.seo.value),
        experienceScore: toPercent(score.dimensions.experience.value),
        activityScore: toPercent(score.dimensions.activity.value),
        priceScore: toPercent(score.dimensions.price.value),
        growthScore: toPercent(score.dimensions.growth.value),
        compositeScore: score.composite.score,
        threatScore: score.threat.score,
        coverage: score.composite.coverage,
        breakdown: {
          components: score.composite.components,
          methodology: score.composite.methodology,
          threat: score.threat,
        } as never,
      },
    });
  }

  // Data quality por empresa.
  for (const view of views) {
    await persistDataQuality(view.id, computeDataQuality(view));
  }

  // Insights (oportunidades, ameaças, forças, fraquezas, tendências).
  for (const insight of engine.insights) {
    await prisma.insight.upsert({
      where: { projectId_dedupeKey: { projectId, dedupeKey: insight.dedupeKey } },
      create: {
        organizationId: project.organizationId,
        projectId,
        companyId: insight.companyId ?? null,
        kind: insight.kind,
        title: insight.title.slice(0, 300),
        body: insight.body,
        evidenceRefs: insight.evidenceRefs as never,
        nature: insight.nature,
        confidence: insight.confidence,
        score: insight.score,
        dedupeKey: insight.dedupeKey,
      },
      update: {
        title: insight.title.slice(0, 300),
        body: insight.body,
        evidenceRefs: insight.evidenceRefs as never,
        confidence: insight.confidence,
        score: insight.score,
      },
    });
  }

  // Recomendações.
  for (const rec of engine.recommendations) {
    await prisma.recommendation.upsert({
      where: { projectId_dedupeKey: { projectId, dedupeKey: rec.dedupeKey } },
      create: {
        organizationId: project.organizationId,
        projectId,
        companyId: rec.companyId ?? null,
        problem: rec.problem,
        evidence: rec.evidence,
        potentialImpact: rec.potentialImpact,
        action: rec.action,
        successMetric: rec.successMetric,
        priority: rec.priority,
        effort: rec.effort,
        horizon: rec.horizon,
        evidenceRefs: rec.evidenceRefs as never,
        impactValue: rec.impactValue,
        effortValue: rec.effortValue,
        dedupeKey: rec.dedupeKey,
      },
      update: {
        problem: rec.problem,
        evidence: rec.evidence,
        potentialImpact: rec.potentialImpact,
        action: rec.action,
        successMetric: rec.successMetric,
        priority: rec.priority,
        effort: rec.effort,
        horizon: rec.horizon,
        evidenceRefs: rec.evidenceRefs as never,
        impactValue: rec.impactValue,
        effortValue: rec.effortValue,
      },
    });
  }

  // Insights removidos deixam de existir (evita "fantasmas" de execuções antigas).
  const liveKeys = engine.insights.map((i) => i.dedupeKey);
  await prisma.insight.deleteMany({ where: { projectId, dedupeKey: { notIn: liveKeys.length ? liveKeys : ['__none__'] } } });
  const liveRecKeys = engine.recommendations.map((r) => r.dedupeKey);
  await prisma.recommendation.deleteMany({ where: { projectId, status: 'OPEN', dedupeKey: { notIn: liveRecKeys.length ? liveRecKeys : ['__none__'] } } });

  const alertsCreated = await createAlertsFromInsights(project.organizationId, projectId, engine.insights);

  await prisma.project.update({ where: { id: projectId }, data: { lastAnalyzedAt: new Date() } });

  return { views, scores, matrix, benchmarks, gap, engine, alertsCreated };
}

function toPercent(value: number | null): number | null {
  return value === null ? null : Number((value * 100).toFixed(1));
}

export type ProjectAnalysis = Awaited<ReturnType<typeof runProjectAnalysis>>;
