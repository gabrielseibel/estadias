import { useRef, useState } from 'react';
import { CheckCircle2, Loader2, MessageSquareText, Send, ShieldAlert, Wrench } from 'lucide-react';
import { api } from '../lib/api';
import { useApi, useSelectedProject } from '../lib/hooks';
import type { AskResponse } from '../lib/types';
import { EmptyState, InfoNote, Panel, PanelHeader, PageHeader, Chip } from '../components/ui';

const SUGGESTIONS = [
  'Por que o concorrente à minha frente está ganhando?',
  'Qual concorrente devo observar de perto?',
  'Quais serviços eu deveria adicionar?',
  'O que os clientes mais reclamam dos concorrentes?',
  'Quem mudou preços recentemente?',
  'Qual é a minha maior oportunidade agora?',
];

type Turn = { question: string; response: AskResponse | null; error?: string };

/** ASK RADAR — chat sobre os dados do projeto, com rastro de ferramentas. */
export function AskRadar() {
  const [projectId] = useSelectedProject();
  const { data: status } = useApi<{ available: boolean; message: string }>('/ai/status');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  if (!projectId) return <EmptyState title="Selecione um projeto" description="O Ask Radar responde sobre os dados de um projeto específico." />;

  async function ask(text: string) {
    if (!text.trim() || busy) return;
    setBusy(true);
    setQuestion('');
    const index = turns.length;
    setTurns((t) => [...t, { question: text, response: null }]);
    try {
      const res = await api.post<AskResponse>(`/projects/${projectId}/ask`, { question: text });
      setTurns((t) => t.map((turn, i) => (i === index ? { ...turn, response: res } : turn)));
    } catch (err) {
      setTurns((t) => t.map((turn, i) => (i === index ? { ...turn, error: err instanceof Error ? err.message : 'Falha ao consultar.' } : turn)));
    } finally {
      setBusy(false);
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Ask Radar" description="Pergunte sobre o seu mercado. O analista consulta as ferramentas da plataforma antes de responder e cada resposta passa por um verificador de fundamentação." />

      {status && !status.available && (
        <Panel className="border-signal-medium/30 bg-signal-medium/5 p-5 text-sm leading-relaxed text-signal-medium">{status.message}</Panel>
      )}

      {turns.length === 0 && (
        <Panel>
          <PanelHeader title="Comece por aqui" subtitle="Perguntas que o Radar responde com os dados do seu projeto." icon={<MessageSquareText className="h-4 w-4 text-ink-500" />} />
          <div className="grid gap-2 p-5 sm:grid-cols-2">
            {SUGGESTIONS.map((s) => (
              <button key={s} className="rounded-lg border border-ink-800 bg-ink-950/40 px-4 py-3 text-left text-sm text-ink-300 transition hover:border-ink-700 hover:text-ink-100" onClick={() => ask(s)} disabled={busy || !status?.available}>
                {s}
              </button>
            ))}
          </div>
        </Panel>
      )}

      <div className="space-y-4">
        {turns.map((turn, i) => (
          <div key={i} className="space-y-3">
            <div className="flex justify-end">
              <p className="max-w-2xl rounded-2xl rounded-br-sm bg-radar-500/15 px-4 py-2.5 text-sm text-radar-100">{turn.question}</p>
            </div>
            <Panel className="p-5">
              {!turn.response && !turn.error && (
                <p className="flex items-center gap-2 text-sm text-ink-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Consultando os dados do projeto…
                </p>
              )}
              {turn.error && <p className="text-sm text-signal-critical">{turn.error}</p>}
              {turn.response && (
                <>
                  {turn.response.status === 'REJECTED_UNGROUNDED' && (
                    <div className="mb-3 flex items-start gap-2 rounded-lg border border-signal-critical/30 bg-signal-critical/10 p-3 text-xs text-signal-critical">
                      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>Resposta bloqueada pelo verificador de fundamentação — o conteúdo não pôde ser confirmado nos dados coletados.</span>
                    </div>
                  )}
                  <p className="whitespace-pre-line text-sm leading-relaxed text-ink-200">{turn.response.answer}</p>

                  {turn.response.toolsUsed.length > 0 && (
                    <div className="mt-4 border-t border-ink-800 pt-3">
                      <p className="label mb-2 flex items-center gap-1.5"><Wrench className="h-3 w-3" /> Ferramentas consultadas</p>
                      <div className="flex flex-wrap gap-1.5">
                        {turn.response.toolsUsed.map((t, k) => (
                          <Chip key={k} className={t.ok ? '' : 'border-signal-high/40 text-signal-high'} title={JSON.stringify(t.input)}>
                            {t.tool}
                          </Chip>
                        ))}
                      </div>
                    </div>
                  )}

                  {turn.response.grounding && (
                    <p className="mt-3 flex items-center gap-1.5 text-[11px] text-ink-500">
                      {turn.response.grounding.verdict === 'PASS' ? <CheckCircle2 className="h-3.5 w-3.5 text-radar-400" /> : <ShieldAlert className="h-3.5 w-3.5 text-signal-critical" />}
                      Verificação: {turn.response.grounding.supportedValues}/{turn.response.grounding.checkedValues} valores numéricos confirmados nos dados das ferramentas
                      {turn.response.model && ` · ${turn.response.model}`}
                      {` · ${(turn.response.latencyMs / 1000).toFixed(1)}s`}
                    </p>
                  )}
                </>
              )}
            </Panel>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <form
        className="sticky bottom-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(question);
        }}
      >
        <input
          className="input flex-1 shadow-lift"
          placeholder={status?.available ? 'Pergunte sobre seus concorrentes…' : 'Configure a camada de IA para usar o chat'}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          disabled={busy || !status?.available}
        />
        <button className="btn-primary" disabled={busy || !question.trim() || !status?.available}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Perguntar
        </button>
      </form>

      <InfoNote>
        O analista não tem acesso à internet e não conhece essas empresas previamente: tudo o que ele afirma vem das ferramentas da
        plataforma. Respostas com números que não constam nos dados coletados são bloqueadas antes de chegar até você.
      </InfoNote>
    </div>
  );
}
