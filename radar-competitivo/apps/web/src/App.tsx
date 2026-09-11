import { Navigate, Route, Routes } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from './lib/auth';
import { Shell } from './components/Shell';
import { ProjectsProvider } from './lib/projects';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Projects } from './pages/Projects';
import { ProjectDetail } from './pages/ProjectDetail';
import { Companies } from './pages/Companies';
import { CompanyDetail } from './pages/CompanyDetail';
import { Compare } from './pages/Compare';
import { Reputation } from './pages/Reputation';
import { Products } from './pages/Products';
import { Prices } from './pages/Prices';
import { Social } from './pages/Social';
import { Seo } from './pages/Seo';
import { Changes } from './pages/Changes';
import { Alerts } from './pages/Alerts';
import { Opportunities } from './pages/Opportunities';
import { Threats } from './pages/Threats';
import { Insights } from './pages/Insights';
import { Recommendations } from './pages/Recommendations';
import { Reports } from './pages/Reports';
import { AskRadar } from './pages/AskRadar';
import { Settings } from './pages/Settings';

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-ink-400">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!user) return <Login />;

  return (
    <ProjectsProvider>
      <Shell>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/projects/:id" element={<ProjectDetail />} />
        <Route path="/companies" element={<Companies />} />
        <Route path="/companies/:id" element={<CompanyDetail />} />
        <Route path="/competitors" element={<Companies onlyCompetitors />} />
        <Route path="/competitors/:id" element={<CompanyDetail />} />
        <Route path="/compare" element={<Compare />} />
        <Route path="/reputation" element={<Reputation />} />
        <Route path="/products" element={<Products />} />
        <Route path="/prices" element={<Prices />} />
        <Route path="/social" element={<Social />} />
        <Route path="/seo" element={<Seo />} />
        <Route path="/changes" element={<Changes />} />
        <Route path="/alerts" element={<Alerts />} />
        <Route path="/opportunities" element={<Opportunities />} />
        <Route path="/threats" element={<Threats />} />
        <Route path="/insights" element={<Insights />} />
        <Route path="/recommendations" element={<Recommendations />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/ask" element={<AskRadar />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
      </Shell>
    </ProjectsProvider>
  );
}
