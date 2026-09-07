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

export const AI_UNAVAILABLE_MESSAGE =
  'Camada de IA não configurada. Defina ANTHROPIC_API_KEY para habilitar a síntese executiva e o chat Ask Radar. Todo o restante da plataforma — scores, matriz competitiva, GAP de oferta, oportunidades, ameaças, recomendações e relatórios — continua funcionando com o motor analítico determinístico.';
