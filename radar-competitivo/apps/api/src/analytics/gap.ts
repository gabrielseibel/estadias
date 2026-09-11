import type { CompanyView } from './company-view.js';

/**
 * GAP DE OFERTA — quais produtos/serviços os concorrentes divulgam e a empresa
 * do usuário não. Comparação por nome normalizado; a matriz completa é exibida
 * para que o usuário confira caso a caso (nomes comerciais variam).
 */

export type GapRow = {
  normalized: string;
  label: string;
  kind: string;
  self: boolean;
  competitors: { companyId: string; name: string; has: boolean; url: string | null; evidenceId: string | null }[];
  competitorsWithCount: number;
  coveragePct: number;
};

export type GapAnalysis = {
  rows: GapRow[];
  missingInSelf: GapRow[];
  exclusiveToSelf: GapRow[];
  selfOfferingCount: number;
  competitorCount: number;
  available: boolean;
  note: string | null;
};

export function analyzeOfferGap(views: CompanyView[]): GapAnalysis {
  const self = views.find((v) => v.role === 'SELF');
  const competitors = views.filter((v) => v.role === 'COMPETITOR');

  if (!self || competitors.length === 0) {
    return {
      rows: [], missingInSelf: [], exclusiveToSelf: [], selfOfferingCount: self?.offerings.length ?? 0,
      competitorCount: competitors.length, available: false,
      note: !self ? 'Defina qual empresa do projeto é a sua para comparar ofertas.' : 'Nenhum concorrente cadastrado para comparar.',
    };
  }

  const hasAnyOffering = views.some((v) => v.offerings.length > 0);
  if (!hasAnyOffering) {
    return {
      rows: [], missingInSelf: [], exclusiveToSelf: [], selfOfferingCount: 0, competitorCount: competitors.length,
      available: false,
      note: 'Nenhuma oferta pública foi identificada nas coletas. Execute uma análise ou verifique se os sites publicam páginas de produtos/serviços.',
    };
  }

  // Concorrentes sem nenhuma oferta coletada (site fora do ar, coleta bloqueada)
  // não entram no denominador: dizer "1 de 3" quando um deles nunca foi coletado
  // distorce o gap. Eles seguem visíveis na matriz, com o motivo declarado.
  const measured = competitors.filter((c) => c.offerings.length > 0);
  const denominator = measured.length;

  const catalog = new Map<string, { label: string; kind: string }>();
  for (const view of views) {
    for (const off of view.offerings) {
      if (!catalog.has(off.normalized)) catalog.set(off.normalized, { label: off.name, kind: off.kind });
    }
  }

  const rows: GapRow[] = [...catalog.entries()]
    .map(([normalized, meta]) => {
      const selfHas = self.offerings.some((o) => o.normalized === normalized);
      const cells = competitors.map((c) => {
        const found = c.offerings.find((o) => o.normalized === normalized);
        return { companyId: c.id, name: c.name, has: Boolean(found), url: found?.url ?? null, evidenceId: found?.evidenceId ?? null };
      });
      const withCount = cells.filter((c) => c.has).length;
      return {
        normalized,
        label: meta.label,
        kind: meta.kind,
        self: selfHas,
        competitors: cells,
        competitorsWithCount: withCount,
        coveragePct: denominator > 0 ? Number(((withCount / denominator) * 100).toFixed(1)) : 0,
      };
    })
    .sort((a, b) => b.competitorsWithCount - a.competitorsWithCount || a.label.localeCompare(b.label));

  return {
    rows,
    // Um gap só é relevante quando mais de um concorrente oferece: item isolado
    // costuma ser especialização, não lacuna.
    missingInSelf: rows.filter((r) => !r.self && r.competitorsWithCount >= Math.min(2, denominator)),
    exclusiveToSelf: rows.filter((r) => r.self && r.competitorsWithCount === 0),
    selfOfferingCount: self.offerings.length,
    competitorCount: denominator,
    available: true,
    note:
      denominator < competitors.length
        ? `${competitors.length - denominator} concorrente(s) não entraram na comparação por não terem oferta pública coletada.`
        : null,
  };
}
