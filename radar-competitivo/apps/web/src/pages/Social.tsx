import { Link } from 'react-router-dom';
import { Share2 } from 'lucide-react';
import { useApi, useSelectedProject } from '../lib/hooks';
import type { CompanyView } from '../lib/types';
import { EmptyState, ErrorState, EvidenceLink, InfoNote, Loading, Panel, PanelHeader, PageHeader, Table, Chip } from '../components/ui';

const PLATFORMS = ['instagram', 'facebook', 'linkedin', 'youtube', 'tiktok', 'x'];

/** SOCIAL RADAR — quais canais cada empresa mantém publicamente. */
export function Social() {
  const [projectId] = useSelectedProject();
  const { data, error, loading, reload } = useApi<CompanyView[]>(projectId ? `/projects/${projectId}/companies` : null);

  if (!projectId) return <EmptyState title="Selecione um projeto" />;
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  const anySocial = data.some((c) => c.social.length > 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Social Radar" description="Presença por plataforma, a partir dos perfis que cada empresa divulga no próprio site." />

      {!anySocial ? (
        <Panel>
          <EmptyState title="Nenhum canal social identificado" description="A coleta não encontrou links para perfis sociais nas páginas das empresas monitoradas." icon={<Share2 className="h-5 w-5" />} />
        </Panel>
      ) : (
        <Panel>
          <PanelHeader title="Cobertura de canais" subtitle="Presença declarada publicamente. Métricas de audiência exigem API oficial e não são coletadas." />
          <Table headers={['Empresa', ...PLATFORMS.map((p) => p[0].toUpperCase() + p.slice(1)), 'Total']}>
            {data.map((c) => (
              <tr key={c.id} className="transition hover:bg-ink-850/40">
                <td className="td">
                  <Link className="text-ink-100 hover:text-radar-300" to={`/companies/${c.id}`}>{c.name}</Link>
                  {c.role === 'SELF' && <Chip className="ml-2 border-radar-400/40 bg-radar-400/10 text-radar-300">você</Chip>}
                </td>
                {PLATFORMS.map((p) => {
                  const profile = c.social.find((s) => s.platform === p);
                  return (
                    <td key={p} className="td">
                      {profile ? <EvidenceLink url={profile.url} label={profile.handle ? `@${profile.handle}` : 'perfil'} /> : <span className="text-ink-600">—</span>}
                    </td>
                  );
                })}
                <td className="td font-medium tabular-nums text-white">{c.social.length}</td>
              </tr>
            ))}
          </Table>
        </Panel>
      )}

      <InfoNote>
        Seguidores, alcance, engajamento e frequência de publicação exigem as APIs oficiais das plataformas. O Radar não raspa
        conteúdo de redes sociais nem estima esses números: o que ele afirma é apenas quais canais a empresa divulga publicamente.
      </InfoNote>
    </div>
  );
}
