import { AlertSeverity, ChangeKind, type CompanyChange } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import type { EngineInsight } from './insight-engine.js';

/**
 * Alertas.
 *
 * Cada alerta nasce de um fato observado (uma mudança detectada) ou de um
 * insight da engine, e carrega a evidência correspondente. A chave de
 * deduplicação impede que a mesma mudança gere alerta repetido a cada execução.
 */

const SEVERITY_BY_KIND: Partial<Record<ChangeKind, AlertSeverity>> = {
  PRODUCT_ADDED: AlertSeverity.CRITICAL,
  SERVICE_ADDED: AlertSeverity.CRITICAL,
  PRICE_CHANGED: AlertSeverity.HIGH,
  REVIEW_VOLUME_CHANGED: AlertSeverity.MEDIUM,
  RATING_CHANGED: AlertSeverity.MEDIUM,
  PAGE_ADDED: AlertSeverity.INFO,
  DESCRIPTION_CHANGED: AlertSeverity.POSITIONING,
  TITLE_CHANGED: AlertSeverity.POSITIONING,
  SOCIAL_PROFILE_ADDED: AlertSeverity.INFO,
  ADDRESS_CHANGED: AlertSeverity.HIGH,
  PRODUCT_REMOVED: AlertSeverity.INFO,
  SERVICE_REMOVED: AlertSeverity.INFO,
  BLOG_ACTIVITY_CHANGED: AlertSeverity.INFO,
};

export const SEVERITY_EMOJI: Record<AlertSeverity, string> = {
  CRITICAL: '🔴',
  HIGH: '🟠',
  MEDIUM: '🟡',
  INFO: '🔵',
  POSITIONING: '🟣',
  OPPORTUNITY: '🟢',
};

export async function createAlertsFromChanges(
  organizationId: string,
  projectId: string,
  companyName: string,
  changes: CompanyChange[],
): Promise<number> {
  const payload = changes
    .filter((change) => {
      // Ruído de baixo valor não vira alerta: alteração de conteúdo interno de
      // página aparece na linha do tempo, mas não interrompe o usuário.
      if (change.kind === ChangeKind.CONTENT_CHANGED) return false;
      return Boolean(SEVERITY_BY_KIND[change.kind]);
    })
    .map((change) => ({
      organizationId,
      projectId,
      companyId: change.companyId,
      severity: SEVERITY_BY_KIND[change.kind]!,
      title: `${companyName}: ${titleForKind(change.kind)}`,
      body: change.summary,
      changeKind: change.kind,
      evidenceId: change.evidenceId,
      // Chave de idempotência: o mesmo fato nunca gera dois alertas.
      dedupeKey: `change:${change.companyId}:${change.kind}:${change.field ?? ''}:${(change.currentValue ?? '').slice(0, 80)}`,
      observedAt: change.observedAt,
    }));

  if (payload.length === 0) return 0;
  const result = await prisma.alert.createMany({ data: payload, skipDuplicates: true });
  return result.count;
}

export async function createAlertsFromInsights(
  organizationId: string,
  projectId: string,
  insights: EngineInsight[],
): Promise<number> {
  // Apenas oportunidades de alto impacto viram alerta; o restante vive na
  // página de oportunidades, sem interromper o usuário.
  const payload = insights
    .filter((i) => i.kind === 'OPPORTUNITY' && i.score >= 70)
    .slice(0, 5)
    .map((insight) => ({
      organizationId,
      projectId,
      companyId: insight.companyId ?? null,
      severity: AlertSeverity.OPPORTUNITY,
      title: `Nova oportunidade identificada: ${insight.title}`,
      body: insight.body,
      dedupeKey: `insight:${insight.dedupeKey}`,
    }));

  if (payload.length === 0) return 0;
  const result = await prisma.alert.createMany({ data: payload, skipDuplicates: true });
  return result.count;
}

function titleForKind(kind: ChangeKind): string {
  const map: Partial<Record<ChangeKind, string>> = {
    PRODUCT_ADDED: 'lançou novo produto',
    SERVICE_ADDED: 'lançou novo serviço',
    PRODUCT_REMOVED: 'removeu um produto da oferta',
    SERVICE_REMOVED: 'removeu um serviço da oferta',
    PRICE_CHANGED: 'alterou preços',
    REVIEW_VOLUME_CHANGED: 'recebeu novas avaliações',
    RATING_CHANGED: 'teve alteração de nota',
    PAGE_ADDED: 'criou nova página',
    PAGE_REMOVED: 'removeu uma página',
    DESCRIPTION_CHANGED: 'mudou o posicionamento comunicado',
    TITLE_CHANGED: 'mudou títulos do site',
    SOCIAL_PROFILE_ADDED: 'passou a usar um novo canal',
    SOCIAL_PROFILE_REMOVED: 'deixou de divulgar um canal',
    ADDRESS_CHANGED: 'alterou endereço',
    CONTACT_CHANGED: 'alterou dados de contato',
    BLOG_ACTIVITY_CHANGED: 'publicou novos conteúdos',
  };
  return map[kind] ?? 'apresentou mudança';
}
