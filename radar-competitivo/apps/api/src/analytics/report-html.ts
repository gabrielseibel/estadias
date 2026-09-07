import type { ReportDocument, ReportSection } from './report.js';

/**
 * Renderização do relatório executivo em HTML pronto para impressão/PDF.
 *
 * Optou-se por HTML imprimível em vez de uma engine de PDF headless: o
 * resultado é idêntico, não exige navegador no servidor e mantém o texto
 * selecionável e acessível. O usuário exporta com "Imprimir → Salvar como PDF".
 */

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderSection(section: ReportSection): string {
  const note = section.note ? `<p class="note">${escapeHtml(section.note)}</p>` : '';
  switch (section.kind) {
    case 'text':
      return `<section><h2>${escapeHtml(section.title)}</h2><p>${escapeHtml(section.body).replace(/\n/g, '<br>')}</p>${note}</section>`;
    case 'list':
    case 'timeline':
      return `<section><h2>${escapeHtml(section.title)}</h2>${
        section.items?.length
          ? `<ul class="${section.kind}">${section.items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`
          : '<p class="empty">Sem itens para exibir.</p>'
      }${note}</section>`;
    case 'table':
      return `<section><h2>${escapeHtml(section.title)}</h2>${
        section.table && section.table.rows.length
          ? `<div class="table-wrap"><table><thead><tr>${section.table.headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${section.table.rows
              .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell === null || cell === undefined ? '—' : cell)}</td>`).join('')}</tr>`)
              .join('')}</tbody></table></div>`
          : '<p class="empty">Sem dados suficientes para esta seção.</p>'
      }${note}</section>`;
    case 'kv':
      return `<section><h2>${escapeHtml(section.title)}</h2><dl>${(section.kv ?? [])
        .map((e) => `<dt>${escapeHtml(e.label)}</dt><dd>${escapeHtml(e.value)}${e.note ? ` <span class="note">${escapeHtml(e.note)}</span>` : ''}</dd>`)
        .join('')}</dl>${note}</section>`;
    default:
      return '';
  }
}

export function renderReportHtml(doc: ReportDocument): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>${escapeHtml(doc.title)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #151b2b; margin: 0; padding: 48px 56px; line-height: 1.55; background: #fff; }
  header { border-bottom: 3px solid #12ad81; padding-bottom: 20px; margin-bottom: 32px; }
  h1 { font-size: 26px; margin: 0 0 6px; letter-spacing: -0.02em; }
  .meta { color: #5d6980; font-size: 13px; }
  .demo { display: inline-block; background: #fff3cd; color: #7a5b00; border: 1px solid #f0d68a; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; margin-top: 8px; letter-spacing: .06em; }
  .ai-badge { display:inline-block; background:#eefbf6; color:#056f56; border:1px solid #a8ebd2; padding:4px 10px; border-radius:6px; font-size:12px; margin-top:8px; }
  section { margin-bottom: 30px; break-inside: avoid; }
  h2 { font-size: 16px; margin: 0 0 10px; padding-bottom: 6px; border-bottom: 1px solid #e6e9f0; color: #0b0e16; }
  p { margin: 0 0 8px; font-size: 13.5px; }
  ul { margin: 0 0 8px; padding-left: 20px; font-size: 13.5px; }
  li { margin-bottom: 5px; }
  ul.timeline { list-style: none; padding-left: 0; }
  ul.timeline li { border-left: 2px solid #d3f5e7; padding-left: 12px; margin-bottom: 8px; }
  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border: 1px solid #e6e9f0; padding: 7px 9px; text-align: left; vertical-align: top; }
  th { background: #f4f6fa; font-weight: 600; }
  .note { font-size: 11.5px; color: #5d6980; font-style: italic; margin-top: 6px; }
  .empty { font-size: 12.5px; color: #8b95ab; }
  .disclaimer { margin-top: 40px; padding: 16px; background: #f4f6fa; border-radius: 8px; font-size: 11.5px; color: #3b4658; }
  dl { font-size: 13px; } dt { font-weight: 600; } dd { margin: 0 0 8px; }
  @media print { body { padding: 24px; } section { page-break-inside: avoid; } }
</style>
</head>
<body>
<header>
  <h1>${escapeHtml(doc.title)}</h1>
  <div class="meta">Gerado em ${escapeHtml(new Date(doc.generatedAt).toLocaleString('pt-BR'))} · Radar Competitivo</div>
  ${doc.isDemo ? '<div class="demo">DEMONSTRAÇÃO — dados de exemplo, não representam empresas reais</div>' : ''}
  ${doc.aiEnriched ? '<div class="ai-badge">Inclui síntese do Competitive Analyst (IA), verificada contra as fontes coletadas</div>' : ''}
</header>
${doc.sections.map(renderSection).join('\n')}
<div class="disclaimer">${escapeHtml(doc.disclaimer)}</div>
</body>
</html>`;
}
