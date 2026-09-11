import { describe, expect, it } from 'vitest';
import './setup.js';
import { compareEntities, dedupeCandidates, normalizeCompanyName, type EntityCandidate } from '../src/analytics/entity-resolution.js';

/**
 * Resolução de entidades.
 *
 * Postura conservadora: em inteligência competitiva, fundir duas empresas
 * distintas é pior do que manter duplicado — o usuário percebe a duplicata,
 * mas não percebe uma fusão errada corrompendo a comparação.
 */

describe('normalização de nome', () => {
  it('remove sufixos societários e ruído', () => {
    expect(normalizeCompanyName('Contabilidade Alfa LTDA')).toBe('contabilidade alfa');
    expect(normalizeCompanyName('Alfa Serviços S/A')).toBe('alfa');
  });
});

describe('comparação de entidades', () => {
  it('trata mesmo domínio como mesma empresa', () => {
    const result = compareEntities({ name: 'Contabilidade Alfa', domain: 'alfa.com.br' }, { name: 'Alfa Contabilidade Ltda', domain: 'alfa.com.br' });
    expect(result.match).toBe(true);
    expect(result.reason).toMatch(/domínio/i);
  });

  it('une nomes praticamente idênticos', () => {
    expect(compareEntities({ name: 'Academia Corpo Ideal' }, { name: 'Academia Corpo Ideal' }).match).toBe(true);
  });

  it('une quando o núcleo da marca coincide na mesma cidade', () => {
    const result = compareEntities({ name: 'Academia Corpo Ideal', city: 'Chapecó' }, { name: 'Corpo Ideal Fitness LTDA', city: 'Chapecó' });
    expect(result.match).toBe(true);
  });

  it('une por telefone público idêntico', () => {
    const result = compareEntities({ name: 'Alfa Contabil', phone: '(54) 3321-0000' }, { name: 'Alfa Contabilidade', phone: '5433210000' });
    expect(result.match).toBe(true);
  });

  it('NÃO une empresas diferentes do mesmo segmento e cidade', () => {
    expect(compareEntities({ name: 'Academia Alfa', city: 'Chapecó' }, { name: 'Academia Beta', city: 'Chapecó' }).match).toBe(false);
    expect(compareEntities({ name: 'Academia Corpo Ideal', city: 'Chapecó' }, { name: 'Academia Corpo Livre', city: 'Chapecó' }).match).toBe(false);
  });

  it('NÃO une empresas com domínios distintos e nomes diferentes', () => {
    expect(compareEntities({ name: 'Contabilidade Alfa', domain: 'alfa.com.br' }, { name: 'Contabilidade Beta', domain: 'beta.com.br' }).match).toBe(false);
  });

  it('NÃO une marcas iguais em cidades diferentes sem outro sinal', () => {
    expect(compareEntities({ name: 'Corpo Ideal', city: 'Chapecó' }, { name: 'Corpo Ideal Fitness', city: 'Erechim' }).match).toBe(false);
  });

  it('exige mais de um token distintivo em comum', () => {
    expect(compareEntities({ name: 'Academia Fitness Alfa', city: 'X' }, { name: 'Academia Fitness Beta', city: 'X' }).match).toBe(false);
  });
});

describe('deduplicação de candidatos', () => {
  it('mantém um registro por empresa e acumula apelidos', () => {
    const { unique, duplicates } = dedupeCandidates<EntityCandidate>([
      { name: 'Alfa Contabilidade', website: 'https://alfa.com.br' },
      { name: 'Alfa Contabilidade Ltda', domain: 'alfa.com.br' },
      { name: 'Beta Contabilidade', domain: 'beta.com.br' },
    ]);
    expect(unique).toHaveLength(2);
    expect(duplicates).toHaveLength(1);
    expect(unique[0].aliases).toContain('Alfa Contabilidade Ltda');
  });

  it('completa campos ausentes a partir do duplicado descartado', () => {
    const { unique } = dedupeCandidates<EntityCandidate>([
      { name: 'Alfa', domain: 'alfa.com.br' },
      { name: 'Alfa', domain: 'alfa.com.br', city: 'Erechim', phone: '5433210000' },
    ]);
    expect(unique[0].city).toBe('Erechim');
    expect(unique[0].phone).toBe('5433210000');
  });
});
