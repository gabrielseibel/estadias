import { Link } from 'react-router-dom';
import { Tags } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useApi, useSelectedProject } from '../lib/hooks';
import { NoProjectSelected } from '../lib/projects';
import type { CompanyView } from '../lib/types';
import { EmptyState, ErrorState, EvidenceLink, InfoNote, Loading, Panel, PanelHeader, PageHeader, Table, Chip } from '../components/ui';
import { colorFor, date, money } from '../lib/format';

/** PREÇOS — monitoramento e histórico de valores públicos. */
export function Prices() {
  const [projectId] = useSelectedProject();
  const { data, error, loading, reload } = useApi<CompanyView[]>(projectId ? `/projects/${projectId}/companies` : null);

  if (!projectId) return <NoProjectSelected />;
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  const withPrices = data.filter((c) => c.prices.length > 0);
  const withHistory = data.flatMap((c) =>
    Object.entries(c.priceHistory)
      .filter(([, h]) => new Set(h.map((x) => x.observedAt.slice(0, 10))).size > 1)
      .map(([label, history]) => ({ company: c.name, label, history })),
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Preços" description="Valores exibidos publicamente nas páginas coletadas, com histórico por item. O Radar não estima preço." />

      {withPrices.length === 0 ? (
        <Panel>
          <EmptyState
            title="Preço não encontrado publicamente"
            description="Nenhuma das empresas monitoradas publica valores nas páginas coletadas. Quando um preço aparecer, ele passa a ser acompanhado automaticamente a cada coleta."
            icon={<Tags className="h-5 w-5" />}
          />
        </Panel>
      ) : (
        <Panel>
          <PanelHeader title="Preços monitorados" subtitle={`${withPrices.reduce((n, c) => n + c.prices.length, 0)} item(ns) com preço público em ${withPrices.length} empresa(s).`} />
          <Table headers={['Empresa', 'Item', 'Preço', 'Unidade', 'Promoção', 'Observado em', 'Fonte']}>
            {withPrices.flatMap((c) =>
              c.prices.map((p) => (
                <tr key={`${c.id}-${p.label}`} className="transition hover:bg-ink-850/40">
                  <td className="td">
                    <Link className="text-ink-100 hover:text-radar-300" to={`/companies/${c.id}`}>{c.name}</Link>
                    {c.role === 'SELF' && <Chip className="ml-2 border-radar-400/40 bg-radar-400/10 text-radar-300">você</Chip>}
                  </td>
                  <td className="td max-w-xs truncate">{p.label}</td>
                  <td className="td tabular-nums font-medium text-white">{money(p.amount, p.currency)}</td>
                  <td className="td text-xs text-ink-400">{p.unit ?? '—'}</td>
                  <td className="td">{p.isPromo ? <Chip className="border-signal-medium/40 bg-signal-medium/10 text-signal-medium">Promoção</Chip> : '—'}</td>
                  <td className="td text-xs text-ink-400">{date(p.observedAt)}</td>
                  <td className="td"><EvidenceLink url={p.url} /></td>
                </tr>
              )),
            )}
          </Table>
        </Panel>
      )}

      {withHistory.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {withHistory.map((item) => (
            <Panel key={`${item.company}-${item.label}`}>
              <PanelHeader title={item.label} subtitle={`${item.company} · ${item.history.length} observações`} />
              <div className="h-52 p-4">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={item.history.map((h) => ({ data: date(h.observedAt), valor: h.amount }))}>
                    <CartesianGrid stroke="#1e2637" strokeDasharray="3 3" />
                    <XAxis dataKey="data" tick={{ fill: '#5d6980', fontSize: 10 }} />
                    <YAxis tick={{ fill: '#5d6980', fontSize: 10 }} />
                    <Tooltip contentStyle={{ background: '#101522', border: '1px solid #2a3346', borderRadius: 8, fontSize: 12 }} formatter={(v: number) => money(v)} />
                    <Line type="stepAfter" dataKey="valor" stroke={colorFor(item.company)} strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          ))}
        </div>
      )}

      <InfoNote>
        Mudança de preço só é registrada quando o mesmo item apresenta valores diferentes em <strong>coletas distintas</strong>.
        Valores diferentes vistos na mesma coleta são itens diferentes da mesma página, não uma alteração.
      </InfoNote>
    </div>
  );
}
