import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';

/**
 * Cliente do provedor de IA.
 *
 * A plataforma funciona sem IA: a engine determinística gera scores, gaps,
 * oportunidades, ameaças e recomendações. Quando há chave configurada, a IA
 * acrescenta síntese narrativa e o chat. Sem chave, a interface diz exatamente
 * isso — em vez de simular uma resposta.
 */

let client: Anthropic | null = null;

export function aiAvailable(): boolean {
  return Boolean(config.ai.apiKey);
}

export function aiClient(): Anthropic {
  if (!config.ai.apiKey) {
    throw new Error('Provedor de IA não configurado (ANTHROPIC_API_KEY ausente).');
  }
  client ??= new Anthropic({ apiKey: config.ai.apiKey, maxRetries: 2, timeout: 120_000 });
  return client;
}

/**
 * Texto exibido onde a IA entraria.
 *
 * Começa pelo que existe, não pelo que falta: a ausência da chave não degrada
 * a análise, e uma mensagem que abre com "defina ANTHROPIC_API_KEY" faz um
 * passo opcional parecer um pré-requisito da plataforma.
 */
export const AI_UNAVAILABLE_MESSAGE =
  'Camada de IA não configurada — ela é opcional. A análise é produzida pelo motor determinístico e não depende de IA: scores, matriz competitiva, GAP de oferta, oportunidades, ameaças, recomendações, alertas e relatórios continuam completos. Com ANTHROPIC_API_KEY definida, a IA acrescenta duas coisas: a síntese executiva em texto e o chat Ask Radar.';
