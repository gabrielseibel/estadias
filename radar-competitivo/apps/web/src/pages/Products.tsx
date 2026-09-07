import { Check, ShoppingBag, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useApi, useSelectedProject } from '../lib/hooks';
import type { GapAnalysis } from '../lib/types';
import { EmptyState, ErrorState, EvidenceLink, InfoNote, Loading, Panel, PanelHeader, PageHeader, Table, Chip } from '../components/ui';

/** GAP DE OFERTA — o que os concorrentes oferecem e você não. */
export function Products() {
  const [projectId] = useSelectedProject();
  const { data, error, loading, reload } = useApi<GapAnalysis>(projectId ? `/projects/${projectId}/gap` : null);

  if (!projectId) return <EmptyState title="Selecione um projeto" />;
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  if (!data.available) {
    return (
      <Panel>
        <EmptyState title="Comparação de oferta indisponível" description={data.note ?? 'Sem dados suficientes.'} icon={<ShoppingBag className="h-5 w-5" />} />
      </Panel>
    );
  }

  const competitors = data.rows[0]?.competitors ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Produtos e serviços"
        description="Matriz de oferta: o que cada empresa divulga publicamente. Comparação feita por nome normalizado — confira caso a caso, nomes comerciais variam."
      />

      {data.missingInSelf.length > 0 && (
        <Panel className="border-signal-medium/30 bg-signal-medium/5">
          <PanelHeader title="Lacunas na sua oferta" subtitle={`${data.missingInSelf.length} item(ns) divulgado(s) pela maioria dos concorrentes e ausente(s) na sua comunicação pública.`} />
          <ul className="divide-y divide-ink-800">
            {data.missingInSelf.map((row) => (
              <li key={row.normalized} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                <div>
                  <p className="text-sm font-medium text-ink-100">{row.label}</p>
                  <p className="mt-0.5 text-[11px] text-ink-400">
                    Oferecido por {row.competitorsWithCount} de {data.competitorCount} concorrentes analisados ({row.coveragePct}%)
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {row.competitors.filter((c) => c.has).map((c) => (
                    <span key={c.companyId} className="chip border-ink-700 bg-ink-850 text-ink-300">
                      {c.name}
                      <EvidenceLink url={c.url} label="" />
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {data.exclusiveToSelf.length > 0 && (
        <Panel className="border-radar-500/25 bg-radar-500/5">
          <PanelHeader title="Seus diferenciais exclusivos" subtitle="Presentes na sua oferta pública e ausentes em todos os concorrentes analisados." />
          <div className="flex flex-wrap gap-2 p-5">
            {data.exclusiveToSelf.map((row) => (
              <Chip key={row.normalized} className="border-radar-400/40 bg-radar-400/10 text-radar-200">{row.label}</Chip>
            ))}
          </div>
        </Panel>
      )}

      <Panel>
        <PanelHeader title="Matriz completa de oferta" subtitle={`${data.rows.length} itens identificados no conjunto de empresas do projeto.`} />
        <Table headers={['Oferta', 'Tipo', 'Minha empresa', ...competitors.map((c) => c.name)]}>
          {data.rows.map((row) => (
            <tr key={row.normalized} className="transition hover:bg-ink-850/40">
              <td className="td font-medium text-ink-100">{row.label}</td>
              <td className="td"><Chip>{row.kind === 'SERVICE' ? 'Serviço' : row.kind === 'PRODUCT' ? 'Produto' : 'Plano'}</Chip></td>
              <td className="td">{row.self ? <Check className="h-4 w-4 text-radar-400" /> : <X className="h-4 w-4 text-ink-600" />}</td>
              {row.competitors.map((c) => (
                <td key={c.companyId} className="td">
                  {c.has ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Check className="h-4 w-4 text-radar-400" />
                      <EvidenceLink url={c.url} label="" />
                    </span>
                  ) : (
                    <X className="h-4 w-4 text-ink-600" />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </Table>
      </Panel>

      {data.note && <InfoNote>{data.note}</InfoNote>}
      <InfoNote>
        A matriz reflete o que cada empresa <strong>publica</strong>. Um serviço prestado mas não divulgado não aparece aqui — e
        também não aparece para o cliente que está comparando. <Link className="link" to="/recommendations">Ver recomendações</Link>.
      </InfoNote>
    </div>
  );
}
