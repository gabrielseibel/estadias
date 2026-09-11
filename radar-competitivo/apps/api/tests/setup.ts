/**
 * Ambiente de testes.
 *
 * Os testes de integração usam um PostgreSQL real (banco `radar_test`) e um
 * servidor HTTP local de fixtures. Nada é simulado na camada de rede nem na de
 * banco: o objetivo é exercitar o comportamento verdadeiro do crawler, dos
 * parsers e das regras de negócio.
 */
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.JWT_SECRET ||= 'segredo-de-teste-com-mais-de-32-caracteres-aqui';
process.env.DATABASE_URL ||= 'postgresql://radar:radar@localhost:5432/radar_test?schema=public';
process.env.CRAWLER_DOMAIN_DELAY_MS ||= '0';
process.env.CRAWLER_TIMEOUT_MS ||= '5000';
process.env.WORKER_INLINE = 'false';
