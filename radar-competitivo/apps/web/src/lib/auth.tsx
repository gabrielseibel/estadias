import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, getToken, setToken } from './api';
import type { Organization, User } from './types';

type AuthState = {
  user: User | null;
  organization: Organization | null;
  organizations: { id: string; name: string; role: string; isDemo: boolean }[];
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: { name: string; email: string; password: string; organizationName: string }) => Promise<void>;
  logout: () => void;
  switchOrganization: (id: string) => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [organizations, setOrganizations] = useState<AuthState['organizations']>([]);
  const [loading, setLoading] = useState(true);

  const loadMe = useCallback(async () => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    try {
      const me = await api.get<{ user: User; organization: Organization; organizations: AuthState['organizations'] }>('/auth/me');
      setUser(me.user);
      setOrganization(me.organization);
      setOrganizations(me.organizations);
    } catch {
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMe();
  }, [loadMe]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      organization,
      organizations,
      loading,
      login: async (email, password) => {
        const res = await api.post<{ token: string; user: User; organization: Organization; organizations: AuthState['organizations'] }>('/auth/login', { email, password });
        setToken(res.token);
        setUser(res.user);
        setOrganization(res.organization);
        setOrganizations(res.organizations ?? []);
      },
      register: async (input) => {
        const res = await api.post<{ token: string; user: User; organization: Organization }>('/auth/register', input);
        setToken(res.token);
        setUser(res.user);
        setOrganization(res.organization);
        setOrganizations([{ id: res.organization.id, name: res.organization.name, role: 'OWNER', isDemo: res.organization.isDemo }]);
      },
      logout: () => {
        setToken(null);
        setUser(null);
        setOrganization(null);
        setOrganizations([]);
      },
      switchOrganization: async (id) => {
        const res = await api.post<{ token: string; organization: Organization }>('/auth/switch-organization', { organizationId: id });
        setToken(res.token);
        setOrganization(res.organization);
      },
    }),
    [user, organization, organizations, loading],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth precisa estar dentro de AuthProvider');
  return ctx;
}
