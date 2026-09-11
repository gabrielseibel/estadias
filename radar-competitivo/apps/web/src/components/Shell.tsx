import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import {
  Activity, AlertTriangle, BarChart3, Bell, Building2, ChevronsUpDown, FileText, FolderKanban,
  Gauge, GitCompareArrows, Lightbulb, LogOut, Menu, MessageSquareText, Radar, Settings, ShieldAlert,
  ShoppingBag, Sparkles, Star, Tags, TrendingUp, Users, Share2, Search, X,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useSelectedProject } from '../lib/hooks';
import { useProjects } from '../lib/projects';
import { DemoBadge } from './ui';

/** Estrutura de navegação — espelha as páginas definidas na especificação. */
const NAV = [
  {
    group: 'Visão geral',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: Gauge },
      { to: '/projects', label: 'Projetos', icon: FolderKanban },
      { to: '/companies', label: 'Empresas', icon: Building2 },
      { to: '/competitors', label: 'Concorrentes', icon: Users },
      { to: '/compare', label: 'Comparar', icon: GitCompareArrows },
    ],
  },
  {
    group: 'Inteligência',
    items: [
      { to: '/reputation', label: 'Reputação', icon: Star },
      { to: '/products', label: 'Produtos e serviços', icon: ShoppingBag },
      { to: '/prices', label: 'Preços', icon: Tags },
      { to: '/social', label: 'Social Radar', icon: Share2 },
      { to: '/seo', label: 'SEO Battle', icon: Search },
    ],
  },
  {
    group: 'Movimento',
    items: [
      { to: '/changes', label: 'Mudanças', icon: Activity },
      { to: '/alerts', label: 'Alertas', icon: Bell },
      { to: '/opportunities', label: 'Oportunidades', icon: Lightbulb },
      { to: '/threats', label: 'Ameaças', icon: ShieldAlert },
    ],
  },
  {
    group: 'Decisão',
    items: [
      { to: '/insights', label: 'Insights', icon: TrendingUp },
      { to: '/recommendations', label: 'Recomendações', icon: Sparkles },
      { to: '/ask', label: 'Ask Radar', icon: MessageSquareText },
      { to: '/reports', label: 'Relatórios', icon: FileText },
      { to: '/settings', label: 'Configurações', icon: Settings },
    ],
  },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const { user, organization, organizations, logout, switchOrganization } = useAuth();
  const navigate = useNavigate();
  const [projectId, setProjectId] = useSelectedProject();
  const [orgOpen, setOrgOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // A seleção automática vive no provider: a barra lateral não é o único lugar
  // que depende dela, e em telas estreitas esta barra sequer é renderizada.
  const { projects, error: projectsError, reload: reloadProjects } = useProjects();

  const current = projects?.find((p) => p.id === projectId) ?? null;

  /**
   * Seletor do projeto ativo.
   *
   * Renderiza sempre: quando a listagem falha ou ainda não existe projeto, o
   * lugar onde o usuário procuraria a seleção precisa dizer o que aconteceu.
   * Antes, o bloco inteiro sumia quando a lista não vinha — e as telas pediam
   * para escolher um projeto em uma barra que não oferecia nenhum.
   */
  function ProjectPicker() {
    if (projectsError) {
      return (
        <div className="rounded-lg border border-signal-critical/30 bg-signal-critical/5 px-2.5 py-2">
          <p className="text-[11px] leading-snug text-signal-critical">Não foi possível carregar os projetos.</p>
          <button className="mt-1 text-[11px] text-ink-300 underline" onClick={() => void reloadProjects()}>
            Tentar novamente
          </button>
        </div>
      );
    }
    if (!projects) return <p className="px-1 text-[11px] text-ink-500">Carregando…</p>;
    if (projects.length === 0) {
      return (
        <Link className="block truncate rounded-lg border border-ink-800 px-2.5 py-2 text-[11px] text-ink-300 hover:border-ink-700" to="/projects">
          Criar o primeiro projeto
        </Link>
      );
    }
    return (
      <select className="input py-1.5 text-xs" value={projectId ?? ''} onChange={(e) => setProjectId(e.target.value || null)}>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    );
  }

  return (
    <div className="flex h-full min-h-screen bg-ink-950">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-ink-800 bg-ink-900/50 lg:flex">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="relative">
            <Radar className="h-6 w-6 text-radar-400" />
            <span className="absolute inset-0 animate-pulse-ring rounded-full border border-radar-400/50" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold tracking-tight text-white">Radar Competitivo</p>
            <p className="text-[10px] uppercase tracking-[0.14em] text-ink-500">Competitive Intelligence</p>
          </div>
        </div>

        <div className="px-3 pb-3">
          <button
            className="flex w-full items-center justify-between gap-2 rounded-lg border border-ink-800 bg-ink-850 px-3 py-2 text-left transition hover:border-ink-700"
            onClick={() => setOrgOpen((v) => !v)}
          >
            <span className="min-w-0">
              <span className="block truncate text-xs font-medium text-ink-100">{organization?.name ?? '—'}</span>
              <span className="block text-[10px] uppercase tracking-wider text-ink-500">Plano {organization?.plan ?? '—'}</span>
            </span>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-ink-500" />
          </button>
          {orgOpen && organizations.length > 0 && (
            <div className="mt-1.5 space-y-0.5 rounded-lg border border-ink-800 bg-ink-900 p-1.5">
              {organizations.map((o) => (
                <button
                  key={o.id}
                  className={`flex w-full items-center justify-between rounded px-2.5 py-1.5 text-left text-xs transition ${
                    o.id === organization?.id ? 'bg-radar-500/15 text-radar-200' : 'text-ink-300 hover:bg-ink-850'
                  }`}
                  onClick={async () => {
                    await switchOrganization(o.id);
                    setOrgOpen(false);
                    setProjectId(null);
                    navigate(0);
                  }}
                >
                  <span className="truncate">{o.name}</span>
                  {o.isDemo && <span className="ml-2 shrink-0 text-[9px] font-semibold text-signal-medium">DEMO</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="px-3 pb-4">
          <label className="label mb-1.5 block px-1">Projeto ativo</label>
          <ProjectPicker />
          {current && (
            <p className="mt-1.5 px-1 text-[10px] text-ink-500">
              {current.counts.competitors} concorrente(s) · {current.counts.alerts} alerta(s)
            </p>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          {NAV.map((group) => (
            <div key={group.group} className="mb-4">
              <p className="label mb-1.5 px-2">{group.group}</p>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors ${
                        isActive ? 'bg-radar-500/12 font-medium text-radar-200' : 'text-ink-300 hover:bg-ink-850 hover:text-ink-100'
                      }`
                    }
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-ink-800 px-3 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-ink-100">{user?.name}</p>
              <p className="truncate text-[10px] text-ink-500">{user?.email}</p>
            </div>
            <button className="btn-subtle px-2 py-1.5" onClick={logout} title="Sair">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-ink-800 bg-ink-950/85 px-6 py-3 backdrop-blur lg:hidden">
          <div className="flex items-center gap-2">
            <Radar className="h-5 w-5 text-radar-400" />
            <span className="text-sm font-semibold text-white">Radar Competitivo</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-40">
              <ProjectPicker />
            </div>
            <button className="btn-subtle px-2 py-1.5" onClick={() => setMenuOpen((v) => !v)} aria-label="Abrir menu" aria-expanded={menuOpen}>
              {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </header>

        {/* Em telas estreitas a barra lateral não é renderizada; sem este menu
            não haveria como sair do dashboard. */}
        {menuOpen && (
          <div className="border-b border-ink-800 bg-ink-900/95 px-4 py-3 lg:hidden">
            {NAV.map((group) => (
              <div key={group.group} className="mb-3">
                <p className="label mb-1.5 px-1">{group.group}</p>
                <div className="grid grid-cols-2 gap-1">
                  {group.items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      onClick={() => setMenuOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] transition-colors ${
                          isActive ? 'bg-radar-500/12 font-medium text-radar-200' : 'text-ink-300 hover:bg-ink-850'
                        }`
                      }
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between border-t border-ink-800 pt-3">
              <span className="truncate text-xs text-ink-400">{user?.email}</span>
              <button className="btn-subtle px-2 py-1.5" onClick={logout}>
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {organization?.isDemo && (
          <div className="flex items-center gap-2 border-b border-signal-medium/30 bg-signal-medium/10 px-6 py-2 text-xs text-signal-medium">
            <AlertTriangle className="h-3.5 w-3.5" />
            <DemoBadge />
            <span>Esta organização usa um conjunto de dados de demonstração. Nada aqui representa empresas reais.</span>
          </div>
        )}

        <main className="flex-1 px-6 py-7">
          <div className="mx-auto w-full max-w-[1500px] animate-fade-up">{children}</div>
        </main>

        <footer className="border-t border-ink-800 px-6 py-4 text-[11px] leading-relaxed text-ink-500">
          <span className="inline-flex items-center gap-1.5">
            <BarChart3 className="h-3 w-3" />
            Scores são analíticos, calculados sobre dados públicos coletados. Não representam faturamento, participação de mercado
            ou qualidade intrínseca das empresas. Toda informação relevante possui fonte verificável.
          </span>
        </footer>
      </div>
    </div>
  );
}
