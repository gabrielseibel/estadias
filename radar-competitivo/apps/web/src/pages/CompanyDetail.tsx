import { useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Activity, Clock, Database, Globe, Image as ImageIcon, MapPin, Phone, Play, Search, Share2, ShoppingBag, Star, Tags, Mail,
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { api } from '../lib/api';
import { useApi } from '../lib/hooks';
import type { CompanyView, Job } from '../lib/types';
import { EmptyState, ErrorState, EvidenceLink, InfoNote, Loading, Panel, PanelHeader, PageHeader, ScoreBar, ScoreBreakdown, Table, Unavailable, Chip, NatureBadge } from '../components/ui';
import { JobProgress } from '../components/JobProgress';
import { date, dateTime, money, num, relativeTime } from '../lib/format';

const TABS = ['Perfil', 'Reputação', 'Oferta', 'Preços', 'Site e SEO', 'Social', 'Galeria', 'Linha do tempo', 'Fontes'] as const;
type Tab = (typeof TABS)[number];

export function CompanyDetail() {
  const { id = '' } = useParams();
  const { data, error, loading, reload } = useApi<CompanyView>(`/companies/${id}`);
  const [tab, setTab] = useState<Tab>('Perfil');
  const [job, setJob] = useState<string | null>(null);

  if (loading && !data) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={data.name}
        description={[data.role === 'SELF' ? 'Minha empresa' : 'Concorrente', data.segment, data.city, data.state].filter(Boolean).join(' · ')}
        actions={
          <>
            <span className="text-xs text-ink-500">Coletado {relativeTime(data.lastCollectedAt)}</span>
            <button
              className="btn-primary"
              onClick={async () => {
                const res = await api.post<{ job: Job }>(`/companies/${id}/analyze`);
                setJob(res.job.id);
              }}
            >
              <Play className="h-4 w-4" />
              Coletar agora
            </button>
          </>
        }
      />

      {job && <JobProgress projectId={''} jobId={job} onFinished={reload} />}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Score do site" value={data.website_metrics?.score ?? null} coverage={data.website_metrics?.coverage} />
        <Metric label="Score de SEO" value={data.seo_metrics?.score ?? null} coverage={data.seo_metrics?.coverage} />
        <Panel className="p-5">
          <p className="label">Reputação</p>
          {data.reputation.rating !== null ? (
            <>
              <p className="stat mt-2">{data.reputation.rating.toFixed(1)}</p>
              <p className="mt-1 text-xs text-ink-400">{num(data.reputation.reviewCount)} avaliações · {data.reputation.sources[0]?.sourceLabel}</p>
            </>
          ) : (
            <div className="mt-3"><Unavailable reason="Nenhuma fonte pública de avaliação coletada" /></div>
          )}
        </Panel>
        <Panel className="p-5">
          <p className="label">Qualidade dos dados</p>
          {data.dataQuality ? (
            <>
              <p className="stat mt-2">{Math.round(data.dataQuality.score)}</p>
              <div className="mt-2"><ScoreBreakdown components={data.dataQuality.breakdown.map((b) => ({ ...b }))} /></div>
            </>
          ) : (
            <Unavailable />
          )}
        </Panel>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-ink-800">
        {TABS.map((t) => (
          <button
            key={t}
            className={`-mb-px border-b-2 px-3.5 py-2 text-sm transition ${
              tab === t ? 'border-radar-500 font-medium text-white' : 'border-transparent text-ink-400 hover:text-ink-200'
            }`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Perfil' && <ProfileTab data={data} />}
      {tab === 'Reputação' && <ReputationTab data={data} />}
      {tab === 'Oferta' && <OfferTab data={data} />}
      {tab === 'Preços' && <PricesTab data={data} />}
      {tab === 'Site e SEO' && <SiteTab data={data} />}
      {tab === 'Social' && <SocialTab data={data} />}
      {tab === 'Galeria' && <GalleryTab data={data} />}
      {tab === 'Linha do tempo' && <TimelineTab data={data} />}
      {tab === 'Fontes' && <SourcesTab data={data} />}
    </div>
  );
}

function Metric({ label, value, coverage }: { label: string; value: number | null; coverage?: number }) {
  return (
    <Panel className="p-5">
      <p className="label">{label}</p>
      {value === null ? (
        <div className="mt-3"><Unavailable reason="Site não coletado" /></div>
      ) : (
        <>
          <p className="stat mt-2">{Math.round(value)}</p>
          <div className="mt-2"><ScoreBar value={value} coverage={coverage} size="sm" /></div>
        </>
      )}
    </Panel>
  );
}

function ProfileTab({ data }: { data: CompanyView }) {
  const fields: { icon: React.ReactNode; label: string; value: string | null }[] = [
    { icon: <Globe className="h-3.5 w-3.5" />, label: 'Website', value: data.website },
    { icon: <MapPin className="h-3.5 w-3.5" />, label: 'Endereço', value: data.address },
    { icon: <MapPin className="h-3.5 w-3.5" />, label: 'Cidade/UF', value: [data.city, data.state].filter(Boolean).join('/') || null },
    { icon: <Phone className="h-3.5 w-3.5" />, label: 'Telefone público', value: data.phone },
    { icon: <Mail className="h-3.5 w-3.5" />, label: 'E-mail público', value: data.email },
    { icon: <Clock className="h-3.5 w-3.5" />, label: 'Horário', value: data.openingHours },
    { icon: <Tags className="h-3.5 w-3.5" />, label: 'Faixa de preço', value: data.priceRange },
    { icon: <Database className="h-3.5 w-3.5" />, label: 'Unidades', value: data.unitsCount !== null ? String(data.unitsCount) : null },
  ];
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Panel className="lg:col-span-2">
        <PanelHeader title="Perfil da empresa" subtitle="Campos preenchidos a partir de dados públicos. O que não foi encontrado permanece vazio." />
        <div className="grid gap-x-8 gap-y-4 p-5 sm:grid-cols-2">
          {fields.map((f) => (
            <div key={f.label}>
              <p className="label flex items-center gap-1.5">{f.icon} {f.label}</p>
              {f.value ? (
                f.label === 'Website' ? (
                  <a className="link mt-1 block break-all text-sm" href={f.value} target="_blank" rel="noreferrer noopener nofollow">{f.value}</a>
                ) : (
                  <p className="mt-1 break-words text-sm text-ink-100">{f.value}</p>
                )
              ) : (
                <p className="mt-1"><Unavailable reason="Não encontrado nas fontes públicas coletadas" /></p>
              )}
            </div>
          ))}
        </div>
        {data.description && (
          <div className="border-t border-ink-800 p-5">
            <p className="label mb-2">Descrição publicada</p>
            <p className="text-sm leading-relaxed text-ink-300">{data.description}</p>
          </div>
        )}
      </Panel>

      <Panel>
        <PanelHeader title="Indicadores comerciais" subtitle="Sinais observáveis. O Radar não estima faturamento nem vendas." icon={<Activity className="h-4 w-4 text-ink-500" />} />
        <div className="space-y-4 p-5">
          <div className="rounded-lg border border-ink-800 bg-ink-950/50 p-3.5">
            <p className="label">Receita</p>
            <p className="mt-1 text-sm text-ink-400">Dados de vendas não disponíveis publicamente.</p>
            <p className="label mt-3">Estimativa</p>
            <p className="mt-1 text-sm text-ink-400">Não calculada.</p>
          </div>

          <div>
            <p className="label mb-2">Sinais comerciais observados</p>
            {data.signals.length === 0 ? (
              <p className="text-xs text-ink-500">
                Nenhum sinal registrado ainda. Os sinais nascem da comparação entre coletas sucessivas — execute a análise novamente
                ao longo do tempo.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {data.signals.map((s, i) => (
                  <li key={i} className="rounded-lg border border-ink-800 bg-ink-950/40 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm text-ink-100">{s.label}</p>
                      <NatureBadge nature="ESTIMATED" />
                    </div>
                    {s.detail && <p className="mt-1 text-[11px] leading-relaxed text-ink-400">{s.detail}</p>}
                    {s.methodology && <p className="mt-1.5 border-t border-ink-800 pt-1.5 text-[11px] leading-relaxed text-ink-500"><strong className="text-ink-400">Metodologia:</strong> {s.methodology}</p>}
                    <p className="mt-1 text-[10px] text-ink-600">Observado em {date(s.observedAt)}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Panel>
    </div>
  );
}

function ReputationTab({ data }: { data: CompanyView }) {
  const r = data.reputation;
  if (!r.available) {
    return (
      <Panel>
        <EmptyState title="Sem dados de reputação" description={r.note ?? 'Nenhuma fonte pública de avaliação foi coletada para esta empresa.'} icon={<Star className="h-5 w-5" />} />
      </Panel>
    );
  }
  const positives = r.themes.filter((t) => t.polarity === 'POSITIVE');
  const negatives = r.themes.filter((t) => t.polarity === 'NEGATIVE');

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Panel>
        <PanelHeader title="Nota e volume" />
        <div className="p-5">
          <div className="flex items-baseline gap-3">
            <span className="text-4xl font-semibold text-white">{r.rating !== null ? r.rating.toFixed(1) : '—'}</span>
            <span className="text-sm text-ink-400">{num(r.reviewCount)} avaliações</span>
          </div>
          <div className="mt-4 space-y-2">
            {r.sources.map((s) => (
              <div key={s.sourceLabel} className="flex items-center justify-between gap-2 text-xs">
                <span className="min-w-0 truncate text-ink-400">{s.sourceLabel}</span>
                <span className="shrink-0 text-ink-200">
                  {s.rating?.toFixed(1) ?? '—'} · {num(s.reviewCount)}
                  <EvidenceLink url={s.sourceUrl} label="fonte" />
                </span>
              </div>
            ))}
          </div>
          {r.history.length > 1 && (
            <div className="mt-5 h-40">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={r.history.map((h) => ({ date: date(h.observedAt), nota: h.rating, avaliações: h.reviewCount }))}>
                  <CartesianGrid stroke="#1e2637" strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fill: '#5d6980', fontSize: 10 }} />
                  <YAxis tick={{ fill: '#5d6980', fontSize: 10 }} domain={[0, 5]} />
                  <Tooltip contentStyle={{ background: '#101522', border: '1px solid #2a3346', borderRadius: 8, fontSize: 12 }} />
                  <Line type="monotone" dataKey="nota" stroke="#34c79a" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </Panel>

      <Panel className="lg:col-span-2">
        <PanelHeader
          title="Voz do cliente"
          subtitle={`O que os clientes realmente falam. ${r.reviewsAnalyzed} avaliação(ões) textual(is) analisada(s) por classificação temática.`}
        />
        {r.reviewsAnalyzed === 0 ? (
          <EmptyState title="Sem texto de avaliações para analisar" description="Foram coletados apenas dados agregados (nota e volume). Textos de avaliação exigem fonte que os publique." />
        ) : (
          <div className="grid gap-5 p-5 sm:grid-cols-2">
            <ThemeColumn title="Principais elogios" themes={positives} tone="good" />
            <ThemeColumn title="Principais reclamações" themes={negatives} tone="bad" />
            <div className="sm:col-span-2">
              <p className="label mb-2">Sentimento agregado</p>
              <div className="flex h-2.5 overflow-hidden rounded-full bg-ink-800">
                {(['positive', 'mixed', 'neutral', 'negative'] as const).map((k) => {
                  const total = r.sentiment.positive + r.sentiment.negative + r.sentiment.neutral + r.sentiment.mixed || 1;
                  const color = k === 'positive' ? 'bg-radar-400' : k === 'negative' ? 'bg-signal-critical' : k === 'mixed' ? 'bg-signal-medium' : 'bg-ink-600';
                  return <div key={k} className={color} style={{ width: `${(r.sentiment[k] / total) * 100}%` }} />;
                })}
              </div>
              <p className="mt-2 text-[11px] text-ink-500">
                {r.sentiment.positive} positivas · {r.sentiment.mixed} mistas · {r.sentiment.neutral} neutras · {r.sentiment.negative} negativas
              </p>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}

function ThemeColumn({ title, themes, tone }: { title: string; themes: CompanyView['reputation']['themes']; tone: 'good' | 'bad' }) {
  return (
    <div>
      <p className="label mb-2">{title}</p>
      {themes.length === 0 ? (
        <p className="text-xs text-ink-500">Nenhum tema recorrente identificado.</p>
      ) : (
        <ul className="space-y-2">
          {themes.slice(0, 6).map((t) => (
            <li key={t.theme}>
              <div className="flex items-center justify-between gap-2">
                <span className={`text-sm capitalize ${tone === 'good' ? 'text-radar-200' : 'text-signal-high'}`}>{t.theme}</span>
                <span className="text-[11px] text-ink-500">{t.mentions} menção(ões)</span>
              </div>
              {t.sampleQuote && <p className="mt-0.5 line-clamp-2 text-[11px] italic leading-relaxed text-ink-500">“{t.sampleQuote}”</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OfferTab({ data }: { data: CompanyView }) {
  if (data.offerings.length === 0) {
    return (
      <Panel>
        <EmptyState title="Nenhum produto ou serviço identificado" description="A coleta não encontrou páginas de produtos/serviços nem dados estruturados. Isso pode significar que o site não publica essa informação." icon={<ShoppingBag className="h-5 w-5" />} />
      </Panel>
    );
  }
  const groups = ['SERVICE', 'PRODUCT', 'PLAN'] as const;
  const labels: Record<string, string> = { SERVICE: 'Serviços', PRODUCT: 'Produtos', PLAN: 'Planos' };
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {groups.map((kind) => {
        const items = data.offerings.filter((o) => o.kind === kind);
        if (items.length === 0) return null;
        return (
          <Panel key={kind}>
            <PanelHeader title={labels[kind]} subtitle={`${items.length} identificado(s) publicamente`} />
            <ul className="divide-y divide-ink-800">
              {items.map((o) => (
                <li key={o.normalized} className="flex items-start justify-between gap-3 px-5 py-3">
                  <span className="text-sm text-ink-100">{o.name}</span>
                  <EvidenceLink url={o.url} />
                </li>
              ))}
            </ul>
          </Panel>
        );
      })}
    </div>
  );
}

function PricesTab({ data }: { data: CompanyView }) {
  const labels = Object.keys(data.priceHistory);
  if (labels.length === 0) {
    return (
      <Panel>
        <EmptyState title="Preço não encontrado publicamente" description="Nenhum valor foi encontrado nas páginas coletadas. O Radar não estima preço — quando não há preço público, o campo permanece vazio." icon={<Tags className="h-5 w-5" />} />
      </Panel>
    );
  }
  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader title="Preços monitorados" subtitle="Valores exibidos publicamente nas páginas coletadas, com histórico por item." />
        <Table headers={['Item', 'Preço atual', 'Unidade', 'Promoção', 'Observações', 'Fonte']}>
          {data.prices.map((p) => {
            const history = data.priceHistory[p.label] ?? [];
            return (
              <tr key={p.label} className="transition hover:bg-ink-850/40">
                <td className="td font-medium text-ink-100">{p.label}</td>
                <td className="td tabular-nums text-white">{money(p.amount, p.currency)}</td>
                <td className="td text-xs text-ink-400">{p.unit ?? '—'}</td>
                <td className="td">{p.isPromo ? <Chip className="border-signal-medium/40 bg-signal-medium/10 text-signal-medium">Promoção</Chip> : '—'}</td>
                <td className="td text-xs text-ink-400">
                  {history.length > 1 ? `${history.length} observações · ${history.map((h) => money(h.amount, p.currency)).join(' → ')}` : `1 observação em ${date(p.observedAt)}`}
                </td>
                <td className="td"><EvidenceLink url={p.url} /></td>
              </tr>
            );
          })}
        </Table>
      </Panel>
      <InfoNote>
        O histórico registra cada valor observado em coletas distintas. Duas observações no mesmo dia representam itens diferentes
        da mesma página, não uma mudança de preço.
      </InfoNote>
    </div>
  );
}

function SiteTab({ data }: { data: CompanyView }) {
  const w = data.website_metrics;
  const s = data.seo_metrics;
  if (!w) {
    return (
      <Panel>
        <EmptyState title="Site não coletado" description="Nenhuma página foi coletada para esta empresa. Verifique se o website está cadastrado e acessível." icon={<Globe className="h-5 w-5" />} />
      </Panel>
    );
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel>
        <PanelHeader title="Website Score" subtitle="Presença, conteúdo, conversão, experiência e clareza da oferta." />
        <div className="p-5">
          <ScoreBar value={w.score} coverage={w.coverage} />
          <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-xs">
            <Fact label="Páginas coletadas" value={String(w.pagesCrawled)} />
            <Fact label="Páginas conhecidas" value={String(w.pagesDiscovered)} />
            <Fact label="Blog" value={w.hasBlog ? `Sim · ${w.blogPostsSeen} publicações` : 'Não identificado'} />
            <Fact label="Cadência editorial" value={w.publishIntervalDays !== null ? `~${w.publishIntervalDays} dias` : 'Não verificável'} />
            <Fact label="Formulário de contato" value={w.hasContactForm ? 'Presente' : 'Ausente'} />
            <Fact label="WhatsApp" value={w.hasWhatsapp ? 'Presente' : 'Ausente'} />
            <Fact label="CTAs distintos" value={String(w.ctaCount)} />
            <Fact label="HTTPS" value={w.httpsOk ? 'Sim' : 'Não'} />
            <Fact label="Tempo médio de resposta" value={w.avgResponseMs !== null ? `${w.avgResponseMs} ms (na coleta)` : 'Não medido'} />
          </div>
          <div className="mt-4"><ScoreBreakdown components={w.components} methodology={w.methodology} /></div>
        </div>
      </Panel>

      <Panel>
        <PanelHeader title="SEO" subtitle="Apenas o que é observável no HTML servido publicamente." icon={<Search className="h-4 w-4 text-ink-500" />} />
        <div className="p-5">
          {s ? (
            <>
              <ScoreBar value={s.score} coverage={s.coverage} />
              <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-xs">
                <Fact label="Páginas indexáveis" value={String(s.indexablePages)} />
                <Fact label="Cobertura de <title>" value={s.titleCoverage !== null ? `${Math.round(s.titleCoverage * 100)}%` : 'Não verificável'} />
                <Fact label="Meta description" value={s.descriptionCoverage !== null ? `${Math.round(s.descriptionCoverage * 100)}%` : 'Não verificável'} />
                <Fact label="H1" value={s.h1Coverage !== null ? `${Math.round(s.h1Coverage * 100)}%` : 'Não verificável'} />
                <Fact label="Dados estruturados" value={s.structuredDataTypes.join(', ') || 'Nenhum'} />
                <Fact label="Sinais locais" value={s.hasLocalSignals ? 'Presentes' : 'Ausentes'} />
                <Fact label="Palavras no conteúdo" value={num(s.wordCountTotal)} />
              </div>
              {s.keywords.length > 0 && (
                <div className="mt-4">
                  <p className="label mb-2">Termos mais frequentes no conteúdo</p>
                  <div className="flex flex-wrap gap-1.5">
                    {s.keywords.slice(0, 18).map((k) => (
                      <Chip key={k.term} title={`${k.count} ocorrências`}>{k.term}</Chip>
                    ))}
                  </div>
                </div>
              )}
              <div className="mt-4"><ScoreBreakdown components={s.components} methodology={s.methodology} /></div>
            </>
          ) : (
            <Unavailable reason="Sem métricas de SEO coletadas" />
          )}
        </div>
      </Panel>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-ink-500">{label}</p>
      <p className="mt-0.5 text-ink-100">{value}</p>
    </div>
  );
}

function SocialTab({ data }: { data: CompanyView }) {
  if (data.social.length === 0) {
    return (
      <Panel>
        <EmptyState title="Nenhum canal social identificado" description="A coleta não encontrou links para perfis sociais nas páginas do site." icon={<Share2 className="h-5 w-5" />} />
      </Panel>
    );
  }
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.social.map((s) => (
          <Panel key={s.url} className="panel-hover p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium capitalize text-white">{s.platform}</p>
              <EvidenceLink url={s.url} label="abrir" />
            </div>
            {s.handle && <p className="mt-0.5 text-xs text-ink-400">@{s.handle}</p>}
            <div className="mt-3 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-ink-500">Seguidores</span>
                <span className="text-ink-300">Não verificável</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-500">Frequência de publicação</span>
                <span className="text-ink-300">Não verificável</span>
              </div>
            </div>
            {s.note && <p className="mt-3 border-t border-ink-800 pt-2.5 text-[11px] leading-relaxed text-ink-500">{s.note}</p>}
          </Panel>
        ))}
      </div>
      <InfoNote>
        O Radar identifica quais canais a empresa divulga publicamente. Contagem de seguidores, alcance e frequência de publicação
        exigem APIs oficiais das plataformas e não são coletados — por isso aparecem como “não verificável” em vez de estimados.
      </InfoNote>
    </div>
  );
}

function GalleryTab({ data }: { data: CompanyView }) {
  if (data.images.length === 0) {
    return (
      <Panel>
        <EmptyState title="Nenhuma imagem pública referenciada" description="A coleta não encontrou imagens nas páginas públicas do site." icon={<ImageIcon className="h-5 w-5" />} />
      </Panel>
    );
  }
  const categories = [...new Set(data.images.map((i) => i.category))];
  return (
    <div className="space-y-4">
      {categories.map((cat) => (
        <Panel key={cat}>
          <PanelHeader title={cat.replace('_', ' ')} subtitle={`${data.images.filter((i) => i.category === cat).length} imagem(ns) referenciada(s)`} />
          <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-3 lg:grid-cols-5">
            {data.images.filter((i) => i.category === cat).map((img) => (
              <a key={img.url} href={img.pageUrl ?? img.url} target="_blank" rel="noreferrer noopener nofollow" className="group block overflow-hidden rounded-lg border border-ink-800 bg-ink-950">
                <img src={img.url} alt={img.alt ?? ''} loading="lazy" className="aspect-[4/3] w-full object-cover transition group-hover:opacity-80" referrerPolicy="no-referrer" />
                {img.alt && <p className="line-clamp-2 px-2 py-1.5 text-[10px] leading-tight text-ink-500">{img.alt}</p>}
              </a>
            ))}
          </div>
        </Panel>
      ))}
      <InfoNote>
        A galeria referencia URLs de imagens públicas e seus metadados. O Radar não baixa nem armazena os arquivos, e não coleta
        imagens de áreas privadas.
      </InfoNote>
    </div>
  );
}

function TimelineTab({ data }: { data: CompanyView }) {
  if (data.changes.length === 0) {
    return (
      <Panel>
        <EmptyState title="Sem mudanças registradas" description="A detecção compara coletas sucessivas. Execute a análise novamente ao longo do tempo para construir a linha do tempo." icon={<Activity className="h-5 w-5" />} />
      </Panel>
    );
  }
  return (
    <Panel>
      <PanelHeader title="Competitor Timeline" subtitle="Cada evento nasce da comparação entre dois retratos coletados." />
      <ol className="p-5">
        {data.changes.map((c, i) => (
          <li key={i} className="relative border-l border-ink-800 pb-5 pl-5 last:pb-0">
            <span className={`absolute -left-[5px] top-1 h-2.5 w-2.5 rounded-full ${
              c.impact === 'HIGH' ? 'bg-signal-critical' : c.impact === 'MEDIUM' ? 'bg-signal-medium' : 'bg-ink-600'
            }`} />
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-ink-500">{date(c.observedAt)}</span>
              <Chip>{c.kind}</Chip>
            </div>
            <p className="mt-1 text-sm text-ink-200">{c.summary}</p>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

function SourcesTab({ data }: { data: CompanyView }) {
  return (
    <Panel>
      <PanelHeader title="Fontes consultadas" subtitle="Toda informação exibida sobre esta empresa pode ser rastreada até uma destas URLs." />
      {data.sources.length === 0 ? (
        <EmptyState title="Nenhuma fonte registrada" description="Execute uma coleta para registrar as fontes." />
      ) : (
        <Table headers={['Fonte', 'Tipo', 'Confiança', 'Última vez vista']}>
          {data.sources.map((s) => (
            <tr key={s.url} className="transition hover:bg-ink-850/40">
              <td className="td">
                <a className="link break-all text-xs" href={s.url} target="_blank" rel="noreferrer noopener nofollow">{s.url}</a>
                {s.label && <p className="mt-0.5 text-[11px] text-ink-500">{s.label}</p>}
              </td>
              <td className="td"><Chip>{s.kind}</Chip></td>
              <td className="td text-xs text-ink-300">{Math.round(s.trust * 100)}%</td>
              <td className="td text-xs text-ink-400">{dateTime(s.lastSeenAt)}</td>
            </tr>
          ))}
        </Table>
      )}
    </Panel>
  );
}
