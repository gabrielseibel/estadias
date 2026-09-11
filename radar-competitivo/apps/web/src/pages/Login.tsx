import { useState } from 'react';
import { Radar, Loader2 } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { ApiError } from '../lib/api';

export function Login() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({ name: '', email: '', password: '', organizationName: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'login') await login(form.email, form.password);
      else await register(form);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível concluir. Tente novamente.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-950 px-4 py-10">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-40 top-0 h-96 w-96 rounded-full bg-radar-600/10 blur-3xl" />
        <div className="absolute -right-32 bottom-0 h-96 w-96 rounded-full bg-signal-info/5 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="mb-7 flex items-center gap-3">
          <div className="relative">
            <Radar className="h-8 w-8 text-radar-400" />
            <span className="absolute inset-0 animate-pulse-ring rounded-full border border-radar-400/40" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-white">Radar Competitivo</h1>
            <p className="text-[11px] uppercase tracking-[0.14em] text-ink-500">Inteligência competitiva contínua</p>
          </div>
        </div>

        <div className="panel p-6 shadow-lift">
          <div className="mb-5 flex gap-1 rounded-lg border border-ink-800 bg-ink-950 p-1">
            {(['login', 'register'] as const).map((m) => (
              <button
                key={m}
                className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                  mode === m ? 'bg-ink-800 text-white' : 'text-ink-400 hover:text-ink-200'
                }`}
                onClick={() => {
                  setMode(m);
                  setError(null);
                }}
              >
                {m === 'login' ? 'Entrar' : 'Criar conta'}
              </button>
            ))}
          </div>

          <form className="space-y-3.5" onSubmit={submit}>
            {mode === 'register' && (
              <>
                <Field label="Seu nome">
                  <input className="input" value={form.name} onChange={set('name')} required minLength={2} autoComplete="name" />
                </Field>
                <Field label="Nome da empresa/organização">
                  <input className="input" value={form.organizationName} onChange={set('organizationName')} required minLength={2} autoComplete="organization" />
                </Field>
              </>
            )}
            <Field label="E-mail">
              <input className="input" type="email" value={form.email} onChange={set('email')} required autoComplete="email" />
            </Field>
            <Field label="Senha" hint={mode === 'register' ? 'Mínimo de 8 caracteres.' : undefined}>
              <input
                className="input"
                type="password"
                value={form.password}
                onChange={set('password')}
                required
                minLength={mode === 'register' ? 8 : 1}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              />
            </Field>

            {error && <p className="rounded-lg border border-signal-critical/30 bg-signal-critical/10 px-3 py-2 text-xs text-signal-critical">{error}</p>}

            <button className="btn-primary w-full justify-center" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === 'login' ? 'Entrar' : 'Criar conta e organização'}
            </button>
          </form>
        </div>

        <p className="mt-5 text-center text-[11px] leading-relaxed text-ink-500">
          A plataforma coleta apenas dados públicos de empresas, respeita robots.txt e não constrói perfis de pessoas físicas.
        </p>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label mb-1.5 block">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-ink-500">{hint}</span>}
    </label>
  );
}
