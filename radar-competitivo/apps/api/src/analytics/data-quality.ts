import { prisma } from '../lib/prisma.js';
import type { CompanyView } from './company-view.js';

/**
 * DATA QUALITY SCORE — quão confiável é o retrato que o Radar tem de uma empresa.
 *
 * Existe porque um score competitivo calculado sobre dados rasos não vale o
 * mesmo que um calculado sobre dados densos e recentes. A interface mostra os
 * dois lado a lado, e cada dimensão explica a própria nota.
 */

export type DataQualityResult = {
  score: number;
  sourcesCount: number;
  freshnessDays: number | null;
  completeness: number;
  consistency: number;
  reliability: number;
  duplication: number;
  breakdown: { key: string; label: string; weight: number; value: number; detail: string }[];
};

const PROFILE_FIELDS: (keyof CompanyView)[] = [
  'name', 'website', 'city', 'state', 'description', 'phone', 'email', 'address', 'segment', 'openingHours',
];

export function computeDataQuality(view: CompanyView): DataQualityResult {
  // Completude do perfil.
  const filled = PROFILE_FIELDS.filter((f) => {
    const v = view[f];
    return v !== null && v !== undefined && String(v).trim() !== '';
  }).length;
  const completeness = filled / PROFILE_FIELDS.length;

  // Diversidade de fontes: uma única fonte é frágil, ainda que rica.
  const distinctSources = new Set(view.sources.map((s) => s.kind)).size;
  const sourcesCount = view.sources.length;
  const sourceDiversity = Math.min(1, distinctSources / 3);

  // Frescor.
  const freshnessDays = view.lastCollectedAt ? (Date.now() - view.lastCollectedAt.getTime()) / 86_400_000 : null;
  const freshness = freshnessDays === null ? 0 : Math.max(0, Math.min(1, 1 - freshnessDays / 45));

  // Confiabilidade média ponderada das fontes registradas.
  const reliability = sourcesCount > 0 ? view.sources.reduce((s, src) => s + src.trust, 0) / sourcesCount : 0;

  // Consistência: sinais que se contradizem derrubam a nota.
  const inconsistencies: string[] = [];
  const ratings = view.reputation.sources.map((s) => s.rating).filter((r): r is number => r !== null);
  if (ratings.length >= 2 && Math.max(...ratings) - Math.min(...ratings) > 1) {
    inconsistencies.push('notas divergentes entre fontes');
  }
  if (view.website && view.domain && !view.website.includes(view.domain)) {
    inconsistencies.push('website e domínio cadastrados divergem');
  }
  if (view.website_metrics && view.website_metrics.pagesCrawled === 0) {
    inconsistencies.push('site cadastrado sem páginas coletadas');
  }
  const consistency = Math.max(0, 1 - inconsistencies.length * 0.34);

  // Duplicidade: ofertas com nomes praticamente iguais indicam extração ruidosa.
  const normalizedNames = view.offerings.map((o) => o.normalized);
  const duplicates = normalizedNames.length - new Set(normalizedNames).size;
  const duplication = normalizedNames.length > 0 ? Math.max(0, 1 - duplicates / normalizedNames.length) : 1;

  const breakdown = [
    { key: 'completeness', label: 'Completude do perfil', weight: 0.25, value: completeness, detail: `${filled} de ${PROFILE_FIELDS.length} campos do perfil preenchidos a partir de fontes públicas.` },
    { key: 'sources', label: 'Diversidade de fontes', weight: 0.2, value: sourceDiversity, detail: `${sourcesCount} fontes registradas em ${distinctSources} tipo(s) distinto(s).` },
    { key: 'freshness', label: 'Atualização', weight: 0.2, value: freshness, detail: freshnessDays === null ? 'Nenhuma coleta registrada.' : `Última coleta há ${freshnessDays.toFixed(1)} dias.` },
    { key: 'reliability', label: 'Confiabilidade das fontes', weight: 0.15, value: reliability, detail: sourcesCount > 0 ? `Confiança média das fontes: ${(reliability * 100).toFixed(0)}%.` : 'Sem fontes registradas.' },
    { key: 'consistency', label: 'Consistência', weight: 0.12, value: consistency, detail: inconsistencies.length ? `Inconsistências: ${inconsistencies.join('; ')}.` : 'Nenhuma inconsistência detectada entre as fontes.' },
    { key: 'duplication', label: 'Ausência de duplicidade', weight: 0.08, value: duplication, detail: duplicates > 0 ? `${duplicates} oferta(s) potencialmente duplicada(s).` : 'Nenhuma duplicidade detectada.' },
  ];

  const score = Number((breakdown.reduce((s, b) => s + b.value * b.weight, 0) * 100).toFixed(1));

  return { score, sourcesCount, freshnessDays: freshnessDays === null ? null : Number(freshnessDays.toFixed(2)), completeness, consistency, reliability, duplication, breakdown };
}

export async function persistDataQuality(companyId: string, result: DataQualityResult) {
  return prisma.dataQualityScore.create({
    data: {
      companyId,
      score: result.score,
      sourcesCount: result.sourcesCount,
      freshnessDays: result.freshnessDays,
      completeness: result.completeness,
      consistency: result.consistency,
      reliability: result.reliability,
      duplication: result.duplication,
      breakdown: result.breakdown as never,
    },
  });
}
