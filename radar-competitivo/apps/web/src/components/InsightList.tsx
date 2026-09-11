import { Link } from 'react-router-dom';
import type { Insight } from '../lib/types';
import { EvidenceLink, NatureBadge, Panel, PanelHeader, EmptyState, Chip } from './ui';

/** Lista de insights com evidência — usada em Oportunidades, Ameaças e Insights. */
export function InsightList({ insights, emptyTitle, emptyDescription, icon }: {
  insights: Insight[]; emptyTitle: string; emptyDescription: string; icon?: React.ReactNode;
}) {
  if (insights.length === 0) {
    return (
      <Panel>
        <EmptyState title={emptyTitle} description={emptyDescription} icon={icon} />
      </Panel>
    );
  }
  return (
    <div className="space-y-3">
      {insights.map((insight) => {
        const level = (insight.score ?? 0) >= 70 ? 'ALTA' : (insight.score ?? 0) >= 45 ? 'MÉDIA' : 'BAIXA';
        const levelClass =
          level === 'ALTA' ? 'border-signal-critical/40 bg-signal-critical/10 text-signal-critical'
          : level === 'MÉDIA' ? 'border-signal-medium/40 bg-signal-medium/10 text-signal-medium'
          : 'border-ink-700 bg-ink-850 text-ink-300';
        return (
          <Panel key={insight.id} className="panel-hover">
            <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-white">{insight.title}</h3>
                {insight.company && (
                  <Link className="mt-0.5 inline-block text-[11px] text-ink-400 hover:text-radar-300" to={`/companies/${insight.company.id}`}>
                    {insight.company.name}
                  </Link>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Chip className={levelClass}>Relevância {level}</Chip>
                <NatureBadge nature={insight.nature} />
              </div>
            </div>
            <p className="px-5 pt-2 text-sm leading-relaxed text-ink-300">{insight.body}</p>
            {insight.evidenceRefs && insight.evidenceRefs.length > 0 && (
              <div className="mt-3 border-t border-ink-800 px-5 py-3">
                <p className="label mb-1.5">Baseado em</p>
                <ul className="space-y-1">
                  {insight.evidenceRefs.slice(0, 6).map((ref, i) => (
                    <li key={i} className="flex flex-wrap items-center gap-2 text-[11px] text-ink-400">
                      <span>{ref.label}</span>
                      {ref.value && <span className="tabular-nums text-ink-200">{ref.value}</span>}
                      <EvidenceLink url={ref.url} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Panel>
        );
      })}
    </div>
  );
}
