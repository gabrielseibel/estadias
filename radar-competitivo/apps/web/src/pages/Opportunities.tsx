import { Lightbulb } from 'lucide-react';
import { useApi, useSelectedProject } from '../lib/hooks';
import type { Insight } from '../lib/types';
import { EmptyState, ErrorState, InfoNote, Loading, PageHeader } from '../components/ui';
import { InsightList } from '../components/InsightList';

/** RADAR DE OPORTUNIDADES. */
export function Opportunities() {
  const [projectId] = useSelectedProject();
  const { data, error, loading, reload } = useApi<Insight[]>(projectId ? `/projects/${projectId}/insights?kind=OPPORTUNITY` : null);

  if (!projectId) return <EmptyState title="Selecione um projeto" />;
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  return (
    <div className="space-y-6">
      <PageHeader title="Oportunidades" description="Espaços pouco explorados no mercado analisado: lacunas de oferta, dores recorrentes dos clientes da concorrência e gaps de conteúdo." />
      <InsightList
        insights={data ?? []}
        emptyTitle="Nenhuma oportunidade identificada ainda"
        emptyDescription="A engine procura serviços ausentes na sua oferta, reclamações recorrentes nos concorrentes e gaps de conteúdo. Cadastre concorrentes e execute a análise para alimentar essa busca."
        icon={<Lightbulb className="h-5 w-5" />}
      />
      <InfoNote>
        Cada oportunidade é derivada de uma regra explícita sobre dados coletados e traz a evidência que a sustenta. Nada aqui é
        gerado por suposição.
      </InfoNote>
    </div>
  );
}
