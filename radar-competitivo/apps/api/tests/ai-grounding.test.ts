import { describe, expect, it } from 'vitest';
import './setup.js';
import { verifyGrounding } from '../src/ai/grounding.js';

/**
 * TESTES ANTI-ALUCINAÇÃO.
 *
 * A especificação exige um teste específico contra "a IA inventou um dado?".
 * Estes testes exercitam o verificador que roda entre a resposta do modelo e a
 * exibição para o usuário: qualquer número que não apareça no retorno das
 * ferramentas bloqueia a resposta.
 */

const TOOL_TRACE = [
  {
    tool: 'get_reviews',
    input: { company: 'Academia Beta' },
    ok: true,
    result: { company: 'Academia Beta', rating: 4.7, reviewCount: 340, reviewsAnalyzed: 12 },
  },
  {
    tool: 'get_competitive_matrix',
    input: {},
    ok: true,
    result: { scores: [{ company: 'Academia Alfa', composite: 47 }, { company: 'Academia Beta', composite: 87 }] },
  },
  {
    tool: 'get_price_history',
    input: { company: 'Academia Beta' },
    ok: true,
    result: { history: { 'Plano Mensal': [{ amount: 129.9 }] } },
  },
];

describe('verificador de fundamentação — respostas legítimas', () => {
  it('aprova resposta cujos números vêm das ferramentas', () => {
    const report = verifyGrounding(
      'A Academia Beta tem nota 4,7 com 340 avaliações públicas e score competitivo 87, contra 47 da sua empresa.',
      TOOL_TRACE,
    );
    expect(report.verdict).toBe('PASS');
    expect(report.violations).toHaveLength(0);
  });

  it('aprova valor monetário presente nos dados', () => {
    const report = verifyGrounding('O Plano Mensal do concorrente é anunciado a R$ 129,90.', TOOL_TRACE);
    expect(report.verdict).toBe('PASS');
  });

  it('aprova resposta sem números', () => {
    const report = verifyGrounding('Não há dados suficientes para concluir sobre a presença social do concorrente.', TOOL_TRACE);
    expect(report.verdict).toBe('PASS');
    expect(report.checkedValues).toBe(0);
  });

  it('tolera arredondamento legítimo do modelo', () => {
    const trace = [{ tool: 'get_competitive_matrix', ok: true, input: {}, result: { composite: 47.4 } }];
    expect(verifyGrounding('O score competitivo é 47.', trace).verdict).toBe('PASS');
  });
});

describe('verificador de fundamentação — alucinações', () => {
  it('bloqueia nota inventada', () => {
    const report = verifyGrounding('A Academia Beta tem nota 4,9 no Google.', TOOL_TRACE);
    expect(report.verdict).toBe('BLOCK');
    expect(report.violations.some((v) => v.value.includes('4,9'))).toBe(true);
  });

  it('bloqueia volume de avaliações inventado', () => {
    const report = verifyGrounding('A Academia Beta acumula 1.250 avaliações.', TOOL_TRACE);
    expect(report.verdict).toBe('BLOCK');
  });

  it('bloqueia percentual não calculado pelas ferramentas', () => {
    const report = verifyGrounding('Sua empresa está 37% abaixo da média do mercado.', TOOL_TRACE);
    expect(report.verdict).toBe('BLOCK');
  });

  it('bloqueia preço inventado', () => {
    const report = verifyGrounding('O concorrente cobra R$ 199,90 pelo plano.', TOOL_TRACE);
    expect(report.verdict).toBe('BLOCK');
    expect(report.violations.some((v) => v.type === 'unsupported_currency')).toBe(true);
  });

  it('bloqueia faturamento — dado que a plataforma jamais coleta', () => {
    for (const answer of [
      'O concorrente tem faturamento estimado em R$ 2.000.000 por ano.',
      'A empresa fatura R$ 500.000 por mês.',
      'A receita de R$ 1.200.000 coloca o concorrente à frente.',
    ]) {
      const report = verifyGrounding(answer, TOOL_TRACE);
      expect(report.verdict, answer).toBe('BLOCK');
      expect(report.violations.some((v) => v.type === 'forbidden_claim'), answer).toBe(true);
    }
  });

  it('bloqueia número de clientes e de funcionários', () => {
    expect(verifyGrounding('O concorrente possui 3.400 clientes ativos.', TOOL_TRACE).verdict).toBe('BLOCK');
    expect(verifyGrounding('A empresa conta com 45 funcionários.', TOOL_TRACE).verdict).toBe('BLOCK');
  });

  it('bloqueia participação de mercado', () => {
    const report = verifyGrounding('O concorrente detém 32% do mercado local.', TOOL_TRACE);
    expect(report.verdict).toBe('BLOCK');
    expect(report.violations.some((v) => v.type === 'forbidden_claim')).toBe(true);
  });

  it('bloqueia número de seguidores — métrica que exige API oficial', () => {
    const report = verifyGrounding('O perfil do concorrente tem 15.400 seguidores no Instagram.', TOOL_TRACE);
    expect(report.verdict).toBe('BLOCK');
  });

  it('produz mensagem que nomeia os valores não confirmados', () => {
    const report = verifyGrounding('A nota é 4,9 e o preço é R$ 199,00.', TOOL_TRACE);
    expect(report.verdict).toBe('BLOCK');
    expect(report.violations.length).toBeGreaterThanOrEqual(2);
    expect(report.notes.join(' ')).toMatch(/não foram encontrados/i);
  });
});

describe('verificador de fundamentação — casos de borda', () => {
  it('não trata datas como métricas inventadas', () => {
    const report = verifyGrounding('A coleta ocorreu em 06/09/2026 e não encontrou mudanças.', TOOL_TRACE);
    expect(report.verdict).toBe('PASS');
  });

  it('não bloqueia horizontes de plano de ação (7, 30 e 90 dias)', () => {
    const report = verifyGrounding('Nos próximos 7 dias, priorize a coleta de avaliações; em 30 dias, publique as páginas de serviço; em 90 dias, avalie o resultado.', TOOL_TRACE);
    expect(report.verdict).toBe('PASS');
  });

  it('reconhece formatação pt-BR de milhar e decimal', () => {
    const trace = [{ tool: 'get_reviews', ok: true, input: {}, result: { reviewCount: 1284, rating: 4.68 } }];
    expect(verifyGrounding('São 1.284 avaliações com nota 4,7.', trace).verdict).toBe('PASS');
  });

  it('sem rastro de ferramentas, qualquer número é considerado infundado', () => {
    const report = verifyGrounding('A nota do concorrente é 4,5.', []);
    expect(report.verdict).toBe('BLOCK');
  });
});
