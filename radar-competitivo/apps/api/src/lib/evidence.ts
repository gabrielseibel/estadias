import { SourceKind } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { collapse } from '../parsers/text.js';

/**
 * Sistema de evidências.
 *
 * Qualquer afirmação exibida na interface precisa poder responder "de onde veio
 * isso?". Cada evidência guarda URL, rótulo da fonte, trecho textual, hash do
 * conteúdo, status HTTP, data de coleta e um nível de confiança.
 */

export type EvidenceInput = {
  organizationId: string;
  companyId?: string | null;
  sourceKind: SourceKind;
  sourceLabel?: string;
  url: string;
  excerpt?: string;
  contentHash?: string;
  httpStatus?: number;
  confidence?: number;
  collectedAt?: Date;
};

export async function recordEvidence(input: EvidenceInput) {
  return prisma.evidence.create({
    data: {
      organizationId: input.organizationId,
      companyId: input.companyId ?? null,
      sourceKind: input.sourceKind,
      sourceLabel: input.sourceLabel,
      url: input.url.slice(0, 2000),
      excerpt: input.excerpt ? collapse(input.excerpt).slice(0, 600) : null,
      contentHash: input.contentHash,
      httpStatus: input.httpStatus,
      confidence: Math.max(0, Math.min(1, input.confidence ?? 0.7)),
      collectedAt: input.collectedAt ?? new Date(),
    },
  });
}

/** Cria várias evidências em lote e devolve os ids na mesma ordem. */
export async function recordEvidenceBatch(inputs: EvidenceInput[]): Promise<string[]> {
  const ids: string[] = [];
  for (const input of inputs) {
    const ev = await recordEvidence(input);
    ids.push(ev.id);
  }
  return ids;
}
