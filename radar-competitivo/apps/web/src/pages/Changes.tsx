import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity } from 'lucide-react';
import { useApi, useSelectedProject } from '../lib/hooks';
import type { ChangeRow } from '../lib/types';
import { EmptyState, ErrorState, EvidenceLink, InfoNote, Loading, Panel, PanelHeader, PageHeader, Chip } from '../components/ui';
import { dateTime } from '../lib/format';

const KIND_LABEL: Record<string, string> = {
  PAGE_ADDED: 'Nova página', PAGE_REMOVED: 'Página removida', CONTENT_CHANGED: 'Conteúdo alterado',
  TITLE_CHANGED: 'Título alterado', DESCRIPTION_CHANGED: 'Descrição alterada', CTA_CHANGED: 'CTA alterado',
  PRODUCT_ADDED: 'Novo produto', PRODUCT_REMOVED: 'Produto removido', PRICE_CHANGED: 'Preço alterado',
  SERVICE_ADDED: 'Novo serviço', SERVICE_REMOVED: 'Serviço removido',
  REVIEW_VOLUME_CHANGED: 'Volume de avaliações', RATING_CHANGED: 'Nota alterada',
  SOCIAL_PROFILE_ADDED: 'Novo canal', SOCIAL_PROFILE_REMOVED: 'Canal removido', SOCIAL_BIO_CHANGED: 'Bio alterada',
  CONTACT_CHANGED: 'Contato alterado', ADDRESS_CHANGED: 'Endereço alterado',
  JOB_POSTING_OBSERVED: 'Vaga observada', BLOG_ACTIVITY_CHANGED: 'Atividade editorial', POSITIONING_CHANGED: 'Posicionamento',
};

/** CHANGE DETECTION — todo movimento detectado entre coletas. */
export function Changes() {
  const [projectId] = useSelectedProject();
  const { data, error, loading, reload } = useApi<ChangeRow[]>(projectId ? `/projects/${projectId}/changes` : null);
  const [company, setCompany] = useState<string>('');
  const [impact, setImpact] = useState<string>('');

  if (!projectId) return <EmptyState title="Selecione um projeto" />;
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  const companies = [...new Map(data.map((c) => [c.company.id, c.company])).values()];
  const filtered = data.filter((c) => (!company || c.company.id === company) && (!impact || c.impact === impact));

  return (
    <div className="space-y-6">
      <PageHeader title="Mudanças detectadas" description="Cada evento nasce da comparação entre dois retratos coletados da mesma empresa. Clique em “ver fonte” para conferir a evidência." />

      {data.length === 0 ? (
        <Panel>
          <EmptyState
            title="Nenhuma mudança detectada ainda"
            description="A detecção compara coletas sucessivas: a primeira análise apenas registra o retrato inicial. Execute a análise novamente ao longo do tempo para que a linha do tempo comece a ser construída."
            icon={<Activity className="h-5 w-5" />}
          />
        </Panel>
      ) : (
        <>
          <Panel className="flex flex-wrap items-center gap-3 p-4">
            <select className="input w-auto py-1.5 text-xs" value={company} onChange={(e) => setCompany(e.target.value)}>
              <option value="">Todas as empresas</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <select className="input w-auto py-1.5 text-xs" value={impact} onChange={(e) => setImpact(e.target.value)}>
              <option value="">Todos os impactos</option>
              <option value="HIGH">Alto</option>
              <option value="MEDIUM">Médio</option>
              <option value="LOW">Baixo</option>
              <option value="INFO">Informativo</option>
            </select>
            <span className="text-xs text-ink-500">{filtered.length} evento(s)</span>
          </Panel>

          <Panel>
            <PanelHeader title="Linha do tempo competitiva" />
            <ol className="p-5">
              {filtered.map((c) => (
                <li key={c.id} className="relative border-l border-ink-800 pb-5 pl-5 last:pb-0">
                  <span className={`absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full ${
                    c.impact === 'HIGH' ? 'bg-signal-critical' : c.impact === 'MEDIUM' ? 'bg-signal-medium' : 'bg-ink-600'
                  }`} />
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-ink-500">{dateTime(c.observedAt)}</span>
                    <Link className="text-xs font-medium text-ink-200 hover:text-radar-300" to={`/companies/${c.company.id}`}>{c.company.name}</Link>
                    <Chip>{KIND_LABEL[c.kind] ?? c.kind}</Chip>
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-ink-200">{c.summary}</p>
                  {(c.previousValue || c.currentValue) && (
                    <p className="mt-1 font-mono text-[11px] text-ink-500">
                      {c.previousValue && <span className="text-signal-high line-through">{c.previousValue.slice(0, 80)}</span>}
                      {c.previousValue && c.currentValue && ' → '}
                      {c.currentValue && <span className="text-radar-300">{c.currentValue.slice(0, 80)}</span>}
                    </p>
                  )}
                  {c.evidence && <div className="mt-1"><EvidenceLink url={c.evidence.url} excerpt={c.evidence.excerpt} /></div>}
                </li>
              ))}
            </ol>
          </Panel>
        </>
      )}

      <InfoNote>
        Mudanças de conteúdo interno de página aparecem aqui, mas não geram alerta — só interrompem o usuário os movimentos que
        exigem decisão (novo produto ou serviço, mudança de preço, salto de avaliações, mudança de endereço ou de posicionamento).
      </InfoNote>
    </div>
  );
}
