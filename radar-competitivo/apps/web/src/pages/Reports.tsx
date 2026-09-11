import { useState } from 'react';
import { Download, FileText, Loader2, Plus } from 'lucide-react';
import { api, apiUrl, getToken } from '../lib/api';
import { useApi, useSelectedProject } from '../lib/hooks';
import { NoProjectSelected } from '../lib/projects';
import type { ReportDocument, ReportSection } from '../lib/types';
import { ErrorState, InfoNote, Loading, Panel, PanelHeader, PageHeader, Table, Chip } from '../components/ui';
import { dateTime } from '../lib/format';

type ReportRow = { id: string; title: string; status: string; aiEnriched: boolean; createdAt: string };

/** RELATÓRIO EXECUTIVO — pré-visualização, geração e exportação. */
export function Reports() {
  const [projectId] = useSelectedProject();
  const { data, error, loading, reload } = useApi<ReportRow[]>(projectId ? `/projects/${projectId}/reports` : null);
  const { data: preview, loading: previewLoading } = useApi<ReportDocument>(projectId ? `/projects/${projectId}/reports/preview` : null);
  const [generating, setGenerating] = useState(false);

  if (!projectId) return <NoProjectSelected />;
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  async function generate() {
    setGenerating(true);
    try {
      await api.post(`/projects/${projectId}/reports`);
      await reload();
    } finally {
      setGenerating(false);
    }
  }

  /**
   * A exportação abre o HTML do relatório em nova aba para impressão/PDF.
   * O token vai por cabeçalho, então o arquivo é buscado e aberto como blob.
   */
  async function exportReport(id: string) {
    const res = await fetch(apiUrl(`/reports/${id}/export.html`), { headers: { authorization: `Bearer ${getToken()}` } });
    const html = await res.text();
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    const win = window.open(url, '_blank');
    win?.addEventListener('load', () => setTimeout(() => win.print(), 400));
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Relatórios"
        description="Documento executivo em 14 seções, montado a partir dos dados coletados e das análises do projeto."
        actions={
          <button className="btn-primary" onClick={generate} disabled={generating}>
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Gerar relatório
          </button>
        }
      />

      {data && data.length > 0 && (
        <Panel>
          <PanelHeader title="Relatórios gerados" />
          <Table headers={['Título', 'Gerado em', 'Síntese de IA', '']}>
            {data.map((r) => (
              <tr key={r.id} className="transition hover:bg-ink-850/40">
                <td className="td font-medium text-ink-100">{r.title}</td>
                <td className="td text-xs text-ink-400">{dateTime(r.createdAt)}</td>
                <td className="td">{r.aiEnriched ? <Chip className="border-radar-400/40 bg-radar-400/10 text-radar-300">Incluída</Chip> : <Chip>Não incluída</Chip>}</td>
                <td className="td text-right">
                  <button className="btn-ghost text-xs" onClick={() => exportReport(r.id)}>
                    <Download className="h-3.5 w-3.5" />
                    Exportar PDF
                  </button>
                </td>
              </tr>
            ))}
          </Table>
        </Panel>
      )}

      <Panel>
        <PanelHeader title="Pré-visualização" subtitle="Conteúdo atual do relatório, com os dados coletados até agora." icon={<FileText className="h-4 w-4 text-ink-500" />} />
        {previewLoading && <Loading />}
        {preview && (
          <div className="space-y-6 p-6">
            {preview.sections.map((section) => (
              <Section key={section.id} section={section} />
            ))}
            <p className="rounded-lg border border-ink-800 bg-ink-950/60 p-4 text-[11px] leading-relaxed text-ink-500">{preview.disclaimer}</p>
          </div>
        )}
      </Panel>

      <InfoNote>
        A exportação abre uma versão para impressão do navegador — escolha “Salvar como PDF”. O texto permanece selecionável e
        acessível, e o relatório não depende de renderização headless no servidor.
      </InfoNote>
    </div>
  );
}

function Section({ section }: { section: ReportSection }) {
  return (
    <section>
      <h3 className="mb-2 border-b border-ink-800 pb-1.5 text-sm font-semibold text-white">{section.title}</h3>
      {section.kind === 'text' && <p className="whitespace-pre-line text-sm leading-relaxed text-ink-300">{section.body}</p>}
      {(section.kind === 'list' || section.kind === 'timeline') &&
        (section.items?.length ? (
          <ul className={`space-y-1.5 text-sm text-ink-300 ${section.kind === 'timeline' ? '' : 'list-disc pl-5'}`}>
            {section.items.map((item, i) => (
              <li key={i} className={section.kind === 'timeline' ? 'border-l border-ink-800 pl-3' : ''}>{item}</li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-ink-500">Sem itens para exibir.</p>
        ))}
      {section.kind === 'table' &&
        (section.table && section.table.rows.length ? (
          <Table headers={section.table.headers}>
            {section.table.rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, k) => (
                  <td key={k} className="td text-xs">{cell === null || cell === undefined ? '—' : String(cell)}</td>
                ))}
              </tr>
            ))}
          </Table>
        ) : (
          <p className="text-xs text-ink-500">Sem dados suficientes para esta seção.</p>
        ))}
      {section.note && <p className="mt-2 text-[11px] italic leading-relaxed text-ink-500">{section.note}</p>}
    </section>
  );
}
