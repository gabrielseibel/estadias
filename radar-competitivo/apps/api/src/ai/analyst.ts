import type Anthropic from '@anthropic-ai/sdk';
import { AiRunKind, AiRunStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { config } from '../config.js';
import { aiLog } from '../lib/logger.js';
import { AI_UNAVAILABLE_MESSAGE, aiAvailable, aiClient } from './client.js';
import { TOOL_DEFINITIONS, executeTool, type ToolContext } from './tools.js';
import { blockedAnswerMessage, verifyGrounding, type GroundingReport } from './grounding.js';

/**
 * COMPETITIVE ANALYST — agente com ferramentas.
 *
 * Regras de operação:
 *  1. o modelo não recebe páginas HTML; só enxerga o retorno das ferramentas;
 *  2. é obrigado a consultar ferramentas antes de concluir qualquer coisa;
 *  3. a resposta passa pelo verificador de fundamentação antes de ser exibida;
 *  4. quando não há dado, a resposta correta é dizer que não há dado.
 */

const SYSTEM_PROMPT = `Você é o Competitive Analyst do Radar Competitivo, uma plataforma de inteligência competitiva para pequenas e médias empresas brasileiras.

CONTEXTO DE OPERAÇÃO
Você analisa dados públicos coletados pela plataforma sobre a empresa do usuário e seus concorrentes. Você NÃO tem acesso à internet e NÃO tem conhecimento prévio sobre essas empresas específicas. Tudo o que você sabe sobre elas vem das ferramentas.

REGRAS ABSOLUTAS
1. Consulte as ferramentas ANTES de afirmar qualquer coisa. Nunca responda de memória.
2. Todo número que você escrever deve ter aparecido literalmente no retorno de uma ferramenta. Se não apareceu, não escreva.
3. NUNCA invente ou estime: faturamento, receita, vendas, número de clientes, número de funcionários, participação de mercado, seguidores em redes sociais, posição em buscadores. Esses dados não são coletados. Se perguntarem, responda que não estão disponíveis publicamente e explique o que a plataforma tem no lugar.
4. Quando o dado não existir, escreva exatamente: "Não há dados suficientes para concluir." e diga o que seria necessário coletar.
5. Distinga sempre as quatro naturezas de informação:
   - DADO CONFIRMADO: veio de uma fonte pública coletada.
   - ESTIMATIVA: calculado a partir de sinais — rotule como "Estimativa" e explique o método.
   - ANÁLISE: sua interpretação sobre os dados.
   - RECOMENDAÇÃO: ação sugerida.
   Nunca apresente estimativa como fato.
6. Scores da plataforma são analíticos, calculados sobre dados públicos disponíveis. Nunca os apresente como medida objetiva de qualidade ou de tamanho da empresa.
7. Se a cobertura dos dados for baixa (veja get_data_quality), diga isso antes de comparar.

ESTILO
- Português do Brasil, direto, sem jargão de consultoria.
- Foque em decisão: o empresário precisa saber o que fazer, não admirar um gráfico.
- Cite a origem do dado ao afirmar algo relevante ("segundo os dados estruturados do site de X, coletados em …").
- Seja específico: "criar página para o serviço Y" vale mais que "melhorar o marketing".`;

type ToolTraceEntry = { tool: string; input: unknown; ok: boolean; result: unknown };

export type AnalystRun = {
  status: AiRunStatus;
  answer: string;
  toolTrace: ToolTraceEntry[];
  grounding: GroundingReport | null;
  model: string | null;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
};

const MAX_TURNS = 10;

/**
 * Executa o agente com o laço de ferramentas. Devolve resposta verificada ou o
 * motivo do bloqueio — nunca uma resposta não fundamentada.
 */
export async function runAnalyst(question: string, ctx: ToolContext, maxTurns = MAX_TURNS): Promise<AnalystRun> {
  const started = Date.now();
  const toolTrace: ToolTraceEntry[] = [];

  if (!aiAvailable()) {
    return { status: AiRunStatus.UNAVAILABLE, answer: AI_UNAVAILABLE_MESSAGE, toolTrace, grounding: null, model: null, latencyMs: 0 };
  }

  const client = aiClient();
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: question }];
  let inputTokens = 0;
  let outputTokens = 0;

  for (let turn = 0; turn < maxTurns; turn++) {
    const response = await client.messages.create({
      model: config.ai.model,
      max_tokens: config.ai.maxTokens,
      system: SYSTEM_PROMPT,
      tools: TOOL_DEFINITIONS as never,
      messages,
    });
    inputTokens += response.usage?.input_tokens ?? 0;
    outputTokens += response.usage?.output_tokens ?? 0;

    const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');

    if (toolUses.length === 0) {
      const answer = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();

      // Sem nenhuma consulta de ferramenta não há como fundamentar.
      if (toolTrace.length === 0) {
        return {
          status: AiRunStatus.REJECTED_UNGROUNDED,
          answer: 'A análise foi interrompida: o modelo respondeu sem consultar os dados coletados. Nenhuma conclusão é apresentada sem consulta às fontes do projeto.',
          toolTrace,
          grounding: { verdict: 'BLOCK', checkedValues: 0, supportedValues: 0, violations: [], notes: ['Nenhuma ferramenta foi consultada.'] },
          model: config.ai.model,
          latencyMs: Date.now() - started,
          inputTokens,
          outputTokens,
        };
      }

      const grounding = verifyGrounding(answer, toolTrace);
      if (grounding.verdict === 'BLOCK') {
        aiLog.warn({ violations: grounding.violations }, 'resposta bloqueada pelo verificador de fundamentação');
        return {
          status: AiRunStatus.REJECTED_UNGROUNDED,
          answer: blockedAnswerMessage(grounding),
          toolTrace,
          grounding,
          model: config.ai.model,
          latencyMs: Date.now() - started,
          inputTokens,
          outputTokens,
        };
      }

      return {
        status: AiRunStatus.SUCCEEDED,
        answer,
        toolTrace,
        grounding,
        model: config.ai.model,
        latencyMs: Date.now() - started,
        inputTokens,
        outputTokens,
      };
    }

    messages.push({ role: 'assistant', content: response.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const use of toolUses) {
      const result = await executeTool(use.name, (use.input ?? {}) as Record<string, unknown>, ctx);
      toolTrace.push({ tool: use.name, input: use.input, ok: result.ok, result: result.ok ? result.data : result.error });
      results.push({
        type: 'tool_result',
        tool_use_id: use.id,
        content: JSON.stringify(result.ok ? result.data : { erro: result.error }).slice(0, 120_000),
        is_error: !result.ok,
      });
    }
    messages.push({ role: 'user', content: results });
  }

  return {
    status: AiRunStatus.FAILED,
    answer: 'A análise excedeu o número máximo de consultas às ferramentas sem chegar a uma conclusão.',
    toolTrace,
    grounding: null,
    model: config.ai.model,
    latencyMs: Date.now() - started,
    inputTokens,
    outputTokens,
  };
}

export async function persistRun(params: {
  organizationId: string;
  projectId?: string | null;
  userId?: string | null;
  kind: AiRunKind;
  question: string;
  run: AnalystRun;
}) {
  return prisma.aiAnalysis.create({
    data: {
      organizationId: params.organizationId,
      projectId: params.projectId ?? null,
      userId: params.userId ?? null,
      kind: params.kind,
      status: params.run.status,
      model: params.run.model,
      question: params.question.slice(0, 4000),
      answer: params.run.answer.slice(0, 30_000),
      toolTrace: params.run.toolTrace as never,
      groundingReport: (params.run.grounding ?? undefined) as never,
      inputTokens: params.run.inputTokens,
      outputTokens: params.run.outputTokens,
      latencyMs: params.run.latencyMs,
      error: params.run.status === AiRunStatus.FAILED ? params.run.answer.slice(0, 1000) : null,
    },
  });
}

const SYNTHESIS_QUESTION = `Produza a síntese executiva deste projeto para o dono da empresa.

Consulte, no mínimo: list_companies, get_company_profile, get_competitive_matrix, get_offer_gap, get_market_opportunities, get_market_threats e get_data_quality.

Estruture a resposta em:
1. O que está acontecendo — os fatos observados nas coletas mais recentes.
2. Por que isso importa — consequência prática para o negócio.
3. Onde a empresa está atrás — dimensões, com números das ferramentas.
4. Onde a empresa está à frente.
5. As três prioridades — ações concretas, na ordem em que devem ser feitas.

Se a cobertura de dados for baixa em alguma dimensão, diga isso explicitamente antes de comparar. Não use nenhum número que não tenha vindo das ferramentas.`;

export async function generateExecutiveSynthesis(projectId: string, organizationId: string) {
  if (!aiAvailable()) {
    await prisma.aiAnalysis.create({
      data: {
        organizationId,
        projectId,
        kind: AiRunKind.EXECUTIVE_SYNTHESIS,
        status: AiRunStatus.UNAVAILABLE,
        question: 'Síntese executiva',
        answer: AI_UNAVAILABLE_MESSAGE,
      },
    });
    return { status: 'UNAVAILABLE' as const, message: AI_UNAVAILABLE_MESSAGE };
  }

  const run = await runAnalyst(SYNTHESIS_QUESTION, { organizationId, projectId });
  await persistRun({ organizationId, projectId, kind: AiRunKind.EXECUTIVE_SYNTHESIS, question: 'Síntese executiva', run });

  return {
    status: run.status,
    message:
      run.status === AiRunStatus.SUCCEEDED
        ? `Síntese executiva gerada (${run.toolTrace.length} consultas às ferramentas, ${run.grounding?.supportedValues ?? 0}/${run.grounding?.checkedValues ?? 0} valores confirmados).`
        : `Síntese executiva não publicada: ${run.status}.`,
  };
}
