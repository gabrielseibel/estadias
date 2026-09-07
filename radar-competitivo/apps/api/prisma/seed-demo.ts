import { CompanyRole, DataNature, SourceKind } from '@prisma/client';
import { prisma } from '../src/lib/prisma.js';
import { hashPassword } from '../src/http/auth.js';
import { runProjectAnalysis } from '../src/analytics/pipeline.js';
import { snapshotAndDetect } from '../src/analytics/snapshot.js';
import { createAlertsFromChanges } from '../src/analytics/alerts.js';
import { websiteScore, seoScore } from '../src/analytics/metrics.js';
import { slugKey, topTerms } from '../src/parsers/text.js';

/**
 * MODO DEMONSTRAÇÃO.
 *
 * Cria uma organização isolada, marcada como `isDemo`, com um conjunto de dados
 * declaradamente fictício. Duas garantias que a especificação exige:
 *
 *  1. os dados de demonstração NUNCA se misturam com dados reais — vivem em
 *     outra organização, e o isolamento multi-tenant é o mesmo aplicado a
 *     clientes distintos;
 *  2. tudo é rotulado: a organização, cada empresa (`isDemo`) e cada fonte
 *     (`SourceKind.DEMO_DATASET`), e a interface exibe a faixa "DEMONSTRAÇÃO".
 *
 * O dataset simula DUAS coletas em datas diferentes, para que a detecção de
 * mudanças, a linha do tempo e os alertas tenham o que mostrar — exatamente o
 * mesmo caminho de código usado com dados reais.
 */

const DEMO_SLUG = 'demonstracao-radar';
const DEMO_EMAIL = 'demo@radarcompetitivo.local';
const DEMO_PASSWORD = 'demonstracao123';

const DAY = 86_400_000;
const FIRST_COLLECTION = new Date(Date.now() - 21 * DAY);
const SECOND_COLLECTION = new Date(Date.now() - 1 * DAY);

type DemoOffering = { kind: 'SERVICE' | 'PRODUCT' | 'PLAN'; name: string };
type DemoCompany = {
  key: string;
  name: string;
  role: CompanyRole;
  domain: string;
  city: string;
  description: string;
  phone: string;
  address: string;
  rating: [number, number];
  reviewCount: [number, number];
  offerings: { first: DemoOffering[]; second: DemoOffering[] };
  prices: { label: string; first: number; second: number }[];
  social: { first: string[]; second: string[] };
  site: {
    pagesCrawled: number; pagesDiscovered: number; hasBlog: boolean; blogPostsSeen: number;
    publishIntervalDays: number | null; hasContactForm: boolean; hasWhatsapp: boolean;
    ctaCount: number; formCount: number; httpsOk: boolean; avgResponseMs: number; hasSitemap: boolean; hasRss: boolean;
  };
  seo: { titleCoverage: number; descriptionCoverage: number; h1Coverage: number; indexablePages: number; structuredDataTypes: string[]; hasLocalSignals: boolean; wordCountTotal: number; internalLinks: number };
  reviews: { text: string; rating: number }[];
  content: string;
};

/** Empresas fictícias de um mercado de contabilidade em Erechim/RS. */
const COMPANIES: DemoCompany[] = [
  {
    key: 'propria',
    name: '[DEMO] Contabilidade Horizonte',
    role: CompanyRole.SELF,
    domain: 'demo-horizonte.exemplo',
    city: 'Erechim',
    description: 'Escritório de contabilidade para pequenas e médias empresas em Erechim.',
    phone: '(54) 3321-1000',
    address: 'Rua Demonstração, 100 — Centro',
    rating: [4.1, 4.2],
    reviewCount: [38, 44],
    offerings: {
      first: [
        { kind: 'SERVICE', name: 'Contabilidade Digital' },
        { kind: 'SERVICE', name: 'Abertura de Empresa' },
        { kind: 'SERVICE', name: 'Imposto de Renda' },
      ],
      second: [
        { kind: 'SERVICE', name: 'Contabilidade Digital' },
        { kind: 'SERVICE', name: 'Abertura de Empresa' },
        { kind: 'SERVICE', name: 'Imposto de Renda' },
      ],
    },
    prices: [],
    social: { first: ['https://instagram.com/demo-horizonte'], second: ['https://instagram.com/demo-horizonte'] },
    site: { pagesCrawled: 9, pagesDiscovered: 11, hasBlog: false, blogPostsSeen: 0, publishIntervalDays: null, hasContactForm: false, hasWhatsapp: true, ctaCount: 2, formCount: 0, httpsOk: true, avgResponseMs: 420, hasSitemap: false, hasRss: false },
    seo: { titleCoverage: 1, descriptionCoverage: 0.44, h1Coverage: 0.78, indexablePages: 9, structuredDataTypes: ['Organization'], hasLocalSignals: false, wordCountTotal: 2400, internalLinks: 28 },
    reviews: [
      { text: 'Atendimento cordial e equipe atenciosa, resolveram minha abertura de empresa rapidamente.', rating: 5 },
      { text: 'Bom serviço, mas o retorno das dúvidas demora bastante às vezes.', rating: 3 },
      { text: 'Preço justo para a região e profissionais competentes.', rating: 4 },
      { text: 'Demorou para enviar as guias, tive problema com prazo.', rating: 2 },
    ],
    content: 'contabilidade digital abertura de empresa imposto de renda escritório contábil erechim contabilidade para pequenas empresas',
  },
  {
    key: 'alfa',
    name: '[DEMO] Contabilidade Alfa',
    role: CompanyRole.COMPETITOR,
    domain: 'demo-alfa.exemplo',
    city: 'Erechim',
    description: 'Contabilidade consultiva com atendimento digital para todo o Rio Grande do Sul.',
    phone: '(54) 3321-2000',
    address: 'Av. Demonstração, 500 — Centro',
    rating: [4.7, 4.8],
    reviewCount: [180, 226],
    offerings: {
      first: [
        { kind: 'SERVICE', name: 'Contabilidade Digital' },
        { kind: 'SERVICE', name: 'Abertura de Empresa' },
        { kind: 'SERVICE', name: 'Departamento Pessoal' },
        { kind: 'SERVICE', name: 'Consultoria Tributária' },
        { kind: 'PLAN', name: 'Plano MEI' },
        { kind: 'PLAN', name: 'Plano Simples Nacional' },
      ],
      second: [
        { kind: 'SERVICE', name: 'Contabilidade Digital' },
        { kind: 'SERVICE', name: 'Abertura de Empresa' },
        { kind: 'SERVICE', name: 'Departamento Pessoal' },
        { kind: 'SERVICE', name: 'Consultoria Tributária' },
        { kind: 'SERVICE', name: 'BPO Financeiro' },
        { kind: 'PLAN', name: 'Plano MEI' },
        { kind: 'PLAN', name: 'Plano Simples Nacional' },
      ],
    },
    prices: [
      { label: 'Plano MEI', first: 89.9, second: 99.9 },
      { label: 'Plano Simples Nacional', first: 349, second: 349 },
    ],
    social: {
      first: ['https://instagram.com/demo-alfa', 'https://facebook.com/demo-alfa', 'https://linkedin.com/company/demo-alfa'],
      second: ['https://instagram.com/demo-alfa', 'https://facebook.com/demo-alfa', 'https://linkedin.com/company/demo-alfa', 'https://youtube.com/@demo-alfa'],
    },
    site: { pagesCrawled: 24, pagesDiscovered: 38, hasBlog: true, blogPostsSeen: 14, publishIntervalDays: 9, hasContactForm: true, hasWhatsapp: true, ctaCount: 9, formCount: 3, httpsOk: true, avgResponseMs: 240, hasSitemap: true, hasRss: true },
    seo: { titleCoverage: 1, descriptionCoverage: 0.96, h1Coverage: 1, indexablePages: 24, structuredDataTypes: ['AccountingService', 'LocalBusiness', 'FAQPage'], hasLocalSignals: true, wordCountTotal: 9800, internalLinks: 96 },
    reviews: [
      { text: 'Excelente atendimento, equipe muito atenciosa e sempre disponível.', rating: 5 },
      { text: 'Profissionais competentes, resolveram uma questão tributária complexa.', rating: 5 },
      { text: 'O preço é mais alto que a concorrência, mas a qualidade compensa.', rating: 4 },
      { text: 'Demorou para responder no início, depois melhorou bastante.', rating: 4 },
      { text: 'Atendimento rápido e transparente, recomendo.', rating: 5 },
      { text: 'Caro para quem está começando, mas o serviço é impecável.', rating: 4 },
    ],
    content: 'contabilidade digital consultoria tributária departamento pessoal bpo financeiro planejamento tributário abertura de empresa erechim contabilidade consultiva',
  },
  {
    key: 'beta',
    name: '[DEMO] Escritório Beta Contábil',
    role: CompanyRole.COMPETITOR,
    domain: 'demo-beta.exemplo',
    city: 'Erechim',
    description: 'Escritório contábil tradicional com foco em comércio e serviços.',
    phone: '(54) 3321-3000',
    address: 'Rua Demonstração, 900 — Bairro Modelo',
    rating: [4.3, 4.3],
    reviewCount: [96, 101],
    offerings: {
      first: [
        { kind: 'SERVICE', name: 'Contabilidade Digital' },
        { kind: 'SERVICE', name: 'Departamento Pessoal' },
        { kind: 'SERVICE', name: 'Consultoria Tributária' },
      ],
      second: [
        { kind: 'SERVICE', name: 'Contabilidade Digital' },
        { kind: 'SERVICE', name: 'Departamento Pessoal' },
        { kind: 'SERVICE', name: 'Consultoria Tributária' },
      ],
    },
    prices: [{ label: 'Plano Comércio', first: 299, second: 279 }],
    social: { first: ['https://instagram.com/demo-beta', 'https://facebook.com/demo-beta'], second: ['https://instagram.com/demo-beta', 'https://facebook.com/demo-beta'] },
    site: { pagesCrawled: 14, pagesDiscovered: 17, hasBlog: true, blogPostsSeen: 5, publishIntervalDays: 32, hasContactForm: true, hasWhatsapp: false, ctaCount: 5, formCount: 1, httpsOk: true, avgResponseMs: 610, hasSitemap: true, hasRss: false },
    seo: { titleCoverage: 0.93, descriptionCoverage: 0.71, h1Coverage: 0.93, indexablePages: 14, structuredDataTypes: ['LocalBusiness'], hasLocalSignals: true, wordCountTotal: 5200, internalLinks: 52 },
    reviews: [
      { text: 'Atendimento bom, mas a demora no retorno atrapalha.', rating: 3 },
      { text: 'Equipe experiente, resolveu meu problema com o fisco.', rating: 5 },
      { text: 'Preço acessível e atendimento correto.', rating: 4 },
      { text: 'Demorou muito para entregar os documentos que pedi.', rating: 2 },
      { text: 'Escritório sério e confiável, uso há anos.', rating: 5 },
    ],
    content: 'contabilidade departamento pessoal consultoria tributária escritório contábil erechim comércio e serviços',
  },
];

async function main() {
  console.log('Preparando o conjunto de dados de DEMONSTRAÇÃO…\n');

  // Recria do zero: o dataset de demonstração é descartável por definição.
  await prisma.organization.deleteMany({ where: { slug: DEMO_SLUG } });
  await prisma.user.deleteMany({ where: { email: DEMO_EMAIL } });

  const org = await prisma.organization.create({
    data: { name: 'Organização de Demonstração', slug: DEMO_SLUG, plan: 'BUSINESS', isDemo: true },
  });
  const user = await prisma.user.create({
    data: { name: 'Usuário de Demonstração', email: DEMO_EMAIL, passwordHash: await hashPassword(DEMO_PASSWORD) },
  });
  await prisma.membership.create({ data: { userId: user.id, organizationId: org.id, role: 'OWNER' } });

  const project = await prisma.project.create({
    data: {
      organizationId: org.id,
      name: '[DEMO] Contabilidade — Erechim',
      segment: 'contabilidade',
      city: 'Erechim',
      state: 'RS',
      description: 'Projeto de demonstração. As empresas abaixo são fictícias e não representam negócios reais.',
      frequency: 'MONTHLY',
    },
  });

  for (const demo of COMPANIES) {
    const company = await prisma.company.create({
      data: {
        organizationId: org.id,
        projectId: project.id,
        role: demo.role,
        name: demo.name,
        website: `https://${demo.domain}`,
        domain: demo.domain,
        segment: 'contabilidade',
        city: demo.city,
        state: 'RS',
        country: 'BR',
        address: demo.address,
        phone: demo.phone,
        description: demo.description,
        isDemo: true,
        lastCollectedAt: SECOND_COLLECTION,
      },
    });

    for (const round of [0, 1] as const) {
      const at = round === 0 ? FIRST_COLLECTION : SECOND_COLLECTION;

      const evidence = await prisma.evidence.create({
        data: {
          organizationId: org.id,
          companyId: company.id,
          sourceKind: SourceKind.DEMO_DATASET,
          sourceLabel: 'Conjunto de dados de DEMONSTRAÇÃO',
          url: `https://${demo.domain}/`,
          excerpt: 'Registro do conjunto de demonstração — não corresponde a uma coleta real na internet.',
          confidence: 0.5,
          collectedAt: at,
        },
      });

      await prisma.source.upsert({
        where: { companyId_url: { companyId: company.id, url: `https://${demo.domain}/` } },
        create: { companyId: company.id, kind: SourceKind.DEMO_DATASET, url: `https://${demo.domain}/`, label: 'DEMONSTRAÇÃO', trust: 0.5, lastSeenAt: at },
        update: { lastSeenAt: at },
      });

      await prisma.reviewSummary.create({
        data: {
          companyId: company.id,
          sourceLabel: 'Perfil público (DEMONSTRAÇÃO)',
          sourceUrl: `https://${demo.domain}/avaliacoes`,
          rating: demo.rating[round],
          reviewCount: demo.reviewCount[round],
          nature: DataNature.CONFIRMED,
          evidenceId: evidence.id,
          observedAt: at,
        },
      });

      for (const offering of demo.offerings[round === 0 ? 'first' : 'second']) {
        await prisma.offering.upsert({
          where: { companyId_kind_normalized: { companyId: company.id, kind: offering.kind, normalized: slugKey(offering.name) } },
          create: {
            companyId: company.id, kind: offering.kind, name: offering.name, normalized: slugKey(offering.name),
            url: `https://${demo.domain}/servicos/${slugKey(offering.name).replace(/\s+/g, '-')}`,
            evidenceId: evidence.id, nature: DataNature.CONFIRMED, firstSeenAt: at, lastSeenAt: at,
          },
          update: { lastSeenAt: at },
        });
      }

      for (const price of demo.prices) {
        const amount = round === 0 ? price.first : price.second;
        const offering = await prisma.offering.findFirst({ where: { companyId: company.id, normalized: slugKey(price.label) } });
        await prisma.priceObservation.create({
          data: {
            companyId: company.id, offeringId: offering?.id ?? null, label: price.label, amount, currency: 'BRL',
            unit: 'mensal', isPromo: false, url: `https://${demo.domain}/planos`, evidenceId: evidence.id,
            nature: DataNature.CONFIRMED, observedAt: at,
          },
        });
      }

      for (const url of demo.social[round === 0 ? 'first' : 'second']) {
        const platform = new URL(url).hostname.replace(/^www\./, '').split('.')[0];
        const profile = await prisma.socialProfile.upsert({
          where: { companyId_platform_url: { companyId: company.id, platform, url } },
          create: { companyId: company.id, platform, url, handle: new URL(url).pathname.split('/').filter(Boolean).pop() ?? null, evidenceId: evidence.id, firstSeenAt: at, lastSeenAt: at },
          update: { lastSeenAt: at },
        });
        await prisma.socialSnapshot.create({
          data: {
            profileId: profile.id, followers: null, posts: null, bio: null, nature: DataNature.UNAVAILABLE,
            note: 'Contagem de seguidores exige API oficial da plataforma — não disponível nem no conjunto de demonstração.',
            observedAt: at,
          },
        });
      }

      const web = websiteScore({
        reachable: true, httpsOk: demo.site.httpsOk, pagesCrawled: demo.site.pagesCrawled, pagesDiscovered: demo.site.pagesDiscovered,
        hasSitemap: demo.site.hasSitemap, hasRss: demo.site.hasRss, hasBlog: demo.site.hasBlog, blogPostsSeen: demo.site.blogPostsSeen,
        publishIntervalDays: demo.site.publishIntervalDays, hasContactForm: demo.site.hasContactForm, hasWhatsapp: demo.site.hasWhatsapp,
        hasPhone: true, ctaCount: demo.site.ctaCount, formCount: demo.site.formCount,
        socialLinks: demo.social[round === 0 ? 'first' : 'second'].length, avgResponseMs: demo.site.avgResponseMs,
        descriptionCoverage: demo.seo.descriptionCoverage, offeringsCount: demo.offerings[round === 0 ? 'first' : 'second'].length,
      });

      await prisma.websiteMetric.create({
        data: {
          companyId: company.id, pagesCrawled: demo.site.pagesCrawled, pagesDiscovered: demo.site.pagesDiscovered,
          hasSitemap: demo.site.hasSitemap, hasRss: demo.site.hasRss, hasBlog: demo.site.hasBlog, blogPostsSeen: demo.site.blogPostsSeen,
          publishIntervalDays: demo.site.publishIntervalDays, hasContactForm: demo.site.hasContactForm, hasWhatsapp: demo.site.hasWhatsapp,
          hasPhone: true, ctaCount: demo.site.ctaCount, formCount: demo.site.formCount,
          socialLinks: demo.social[round === 0 ? 'first' : 'second'].length, avgResponseMs: demo.site.avgResponseMs,
          httpsOk: demo.site.httpsOk, score: web.score,
          breakdown: { components: web.components, coverage: web.coverage, methodology: web.methodology } as never,
          observedAt: at,
        },
      });

      const seo = seoScore({
        indexablePages: demo.seo.indexablePages, titleCoverage: demo.seo.titleCoverage, descriptionCoverage: demo.seo.descriptionCoverage,
        h1Coverage: demo.seo.h1Coverage, avgTitleLength: 58, structuredDataTypes: demo.seo.structuredDataTypes, hasOpenGraph: true,
        hasCanonical: true, hasRobotsTxt: true, hasSitemap: demo.site.hasSitemap, hasLocalSignals: demo.seo.hasLocalSignals,
        imageAltCoverage: 0.8, internalLinks: demo.seo.internalLinks, wordCountTotal: demo.seo.wordCountTotal, pagesCrawled: demo.site.pagesCrawled,
      });

      await prisma.seoMetric.create({
        data: {
          companyId: company.id, indexablePages: demo.seo.indexablePages, titleCoverage: demo.seo.titleCoverage,
          descriptionCoverage: demo.seo.descriptionCoverage, h1Coverage: demo.seo.h1Coverage, avgTitleLength: 58,
          structuredDataTypes: demo.seo.structuredDataTypes, hasOpenGraph: true, hasCanonical: true, hasRobotsTxt: true,
          hasLocalSignals: demo.seo.hasLocalSignals, imageAltCoverage: 0.8, internalLinks: demo.seo.internalLinks,
          keywords: topTerms(demo.content.repeat(3), 20) as never, wordCountTotal: demo.seo.wordCountTotal, score: seo.score,
          breakdown: { components: seo.components, coverage: seo.coverage, methodology: seo.methodology } as never,
          observedAt: at,
        },
      });

      if (round === 1) {
        for (const review of demo.reviews) {
          await prisma.review.upsert({
            where: { companyId_contentHash: { companyId: company.id, contentHash: slugKey(review.text).slice(0, 200) } },
            create: {
              companyId: company.id, sourceUrl: `https://${demo.domain}/avaliacoes`,
              sourceLabel: 'Avaliação pública (DEMONSTRAÇÃO)', rating: review.rating, text: review.text,
              contentHash: slugKey(review.text).slice(0, 200), evidenceId: evidence.id, collectedAt: at,
            },
            update: {},
          });
        }
      }

      // Cada rodada gera um retrato; a segunda produz as mudanças da timeline.
      const { changes } = await snapshotAndDetect(company);
      if (changes.length > 0) {
        const alerts = await createAlertsFromChanges(org.id, project.id, company.name, changes);
        console.log(`  ${demo.name}: ${changes.length} mudança(s), ${alerts} alerta(s).`);
      }
    }
  }

  const analysis = await runProjectAnalysis(project.id);

  console.log('\nConjunto de DEMONSTRAÇÃO criado.');
  console.log(`  Organização: ${org.name} (isDemo=true)`);
  console.log(`  Projeto:     ${project.name}`);
  console.log(`  Empresas:    ${COMPANIES.length}`);
  console.log(`  Insights:    ${analysis.engine.insights.length}`);
  console.log(`  Recomendações: ${analysis.engine.recommendations.length}`);
  console.log('\nAcesso:');
  console.log(`  e-mail: ${DEMO_EMAIL}`);
  console.log(`  senha:  ${DEMO_PASSWORD}`);
  console.log('\nEstes dados são fictícios, ficam isolados em uma organização própria e');
  console.log('são exibidos na interface com a faixa DEMONSTRAÇÃO.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
