import { describe, expect, it } from 'vitest';
import './setup.js';
import { parseHtml } from '../src/parsers/html.js';
import { extractStructuredData } from '../src/parsers/structured-data.js';
import { parseFeed, parseSitemap, publishIntervalDays } from '../src/parsers/feeds.js';
import { attachPrices, extractOfferings } from '../src/parsers/offerings.js';
import { slugKey, topTerms, trigramSimilarity } from '../src/parsers/text.js';

const PAGE = `<!doctype html>
<html lang="pt-BR">
<head>
  <title>Contabilidade Sigma — Serviços em Erechim</title>
  <meta name="description" content="Contabilidade digital, abertura de empresa e departamento pessoal em Erechim.">
  <link rel="canonical" href="https://sigma.com.br/">
  <meta property="og:title" content="Contabilidade Sigma">
  <meta property="og:site_name" content="Contabilidade Sigma">
  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"AccountingService","name":"Contabilidade Sigma",
   "telephone":"(54) 3321-0000","email":"contato@sigma.com.br",
   "address":{"@type":"PostalAddress","streetAddress":"Rua das Flores, 200","addressLocality":"Erechim","addressRegion":"RS","addressCountry":"BR"},
   "aggregateRating":{"@type":"AggregateRating","ratingValue":"4.6","reviewCount":"212","bestRating":"5"},
   "sameAs":["https://instagram.com/sigma","https://facebook.com/sigma"],
   "openingHours":"Mo-Fr 08:00-18:00","priceRange":"$$"}
  </script>
</head>
<body>
  <h1>Contabilidade Sigma</h1>
  <h2>Contabilidade Digital</h2>
  <h2>Abertura de Empresa</h2>
  <a href="/servicos/contabilidade-digital">Contabilidade Digital</a>
  <a href="/servicos/abertura-de-empresa">Abertura de Empresa</a>
  <a href="https://instagram.com/sigma">Instagram</a>
  <a href="https://wa.me/5554999990000">WhatsApp</a>
  <a href="mailto:contato@sigma.com.br">E-mail</a>
  <a class="cta" href="/contato">Solicite um orçamento</a>
  <p>Plano MEI por R$ 99,90 /mês. Plano Simples por R$ 349,00 /mês.</p>
  <img src="/img/fachada.jpg" alt="Fachada do escritório">
  <img src="/img/equipe.jpg">
  <form><input type="email" name="email"><textarea name="mensagem"></textarea><button>Enviar mensagem</button></form>
  <time datetime="2026-08-01">1 de agosto</time>
</body></html>`;

describe('parser de HTML', () => {
  const parsed = parseHtml(PAGE, 'https://sigma.com.br/');

  it('extrai metadados básicos', () => {
    expect(parsed.title).toBe('Contabilidade Sigma — Serviços em Erechim');
    expect(parsed.metaDescription).toContain('Contabilidade digital');
    expect(parsed.canonical).toBe('https://sigma.com.br/');
    expect(parsed.lang).toBe('pt-BR');
    expect(parsed.h1).toEqual(['Contabilidade Sigma']);
    expect(parsed.h2).toContain('Abertura de Empresa');
  });

  it('separa links internos de externos e identifica redes sociais', () => {
    expect(parsed.links.some((l) => l.internal && l.href.includes('/servicos/contabilidade-digital'))).toBe(true);
    expect(parsed.socialLinks.map((s) => s.platform).sort()).toEqual(['instagram']);
  });

  it('coleta contatos públicos e caminhos de conversão', () => {
    expect(parsed.emails).toContain('contato@sigma.com.br');
    expect(parsed.whatsapp.length).toBeGreaterThan(0);
    expect(parsed.hasContactForm).toBe(true);
    expect(parsed.ctas.some((c) => /orçamento/i.test(c))).toBe(true);
  });

  it('extrai preços com contexto e posição', () => {
    const amounts = parsed.prices.map((p) => p.amount).sort((a, b) => a - b);
    expect(amounts).toEqual([99.9, 349]);
    expect(parsed.prices[0].offsetInContext).toBeGreaterThanOrEqual(0);
  });

  it('conta imagens com e sem texto alternativo', () => {
    expect(parsed.images).toHaveLength(2);
    expect(parsed.imagesWithAlt).toBe(1);
  });

  it('não deixa conteúdo de <script> vazar para o texto visível', () => {
    expect(parsed.text).not.toContain('@context');
  });
});

describe('dados estruturados', () => {
  const parsed = parseHtml(PAGE, 'https://sigma.com.br/');
  const data = extractStructuredData(parsed.jsonLd, parsed.openGraph, parsed.microdataTypes, 'https://sigma.com.br/');

  it('reconhece a empresa declarada em JSON-LD', () => {
    expect(data.company?.name).toBe('Contabilidade Sigma');
    expect(data.company?.city).toBe('Erechim');
    expect(data.company?.telephone).toBe('(54) 3321-0000');
    expect(data.company?.sameAs).toContain('https://instagram.com/sigma');
  });

  it('lê a avaliação agregada como dado confirmado', () => {
    expect(data.ratings[0].value).toBe(4.6);
    expect(data.ratings[0].count).toBe(212);
  });

  it('normaliza nota quando bestRating é diferente de 5', () => {
    const jsonLd = [{ '@type': 'LocalBusiness', name: 'X', aggregateRating: { ratingValue: 8, reviewCount: 10, bestRating: 10 } }];
    const out = extractStructuredData(jsonLd, {}, [], 'https://x.com');
    expect(out.ratings[0].value).toBe(8);
    expect(out.ratings[0].best).toBe(10);
  });

  it('ignora JSON-LD malformado sem quebrar a coleta', () => {
    const broken = parseHtml('<html><head><script type="application/ld+json">{quebrado</script></head><body><h1>x</h1></body></html>', 'https://x.com');
    expect(() => extractStructuredData(broken.jsonLd, {}, [], 'https://x.com')).not.toThrow();
  });
});

describe('sitemap e feeds', () => {
  it('lê urlset', () => {
    const xml = `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url><loc>https://x.com/a</loc><lastmod>2026-08-01</lastmod></url>
      <url><loc>https://x.com/b</loc></url></urlset>`;
    const out = parseSitemap(xml);
    expect(out.urls).toHaveLength(2);
    expect(out.urls[0].lastmod).toBe('2026-08-01');
  });

  it('lê índice de sitemaps', () => {
    const xml = `<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <sitemap><loc>https://x.com/s1.xml</loc></sitemap></sitemapindex>`;
    expect(parseSitemap(xml).sitemaps).toEqual(['https://x.com/s1.xml']);
  });

  it('lê RSS e Atom', () => {
    const rss = `<rss><channel><item><title>Post A</title><link>https://x.com/a</link><pubDate>Mon, 01 Sep 2026 10:00:00 GMT</pubDate></item></channel></rss>`;
    expect(parseFeed(rss)[0].title).toBe('Post A');
    const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Post B</title><link href="https://x.com/b"/><published>2026-09-01T10:00:00Z</published></entry></feed>`;
    expect(parseFeed(atom)[0].link).toBe('https://x.com/b');
  });

  it('calcula cadência editorial apenas com amostra suficiente', () => {
    expect(publishIntervalDays(['2026-09-01', '2026-08-25'])).toBeNull();
    const interval = publishIntervalDays(['2026-09-01', '2026-08-25', '2026-08-18', '2026-08-11']);
    expect(interval).toBeCloseTo(7, 0);
  });
});

describe('extração de oferta e preços', () => {
  it('identifica serviços a partir de dados estruturados e páginas dedicadas', () => {
    const page = parseHtml(
      `<html><head><title>Contabilidade Digital — Sigma</title></head><body>
       <h1>Contabilidade Digital</h1><p>Descrição</p></body></html>`,
      'https://sigma.com.br/servicos/contabilidade-digital',
    );
    const offerings = extractOfferings(page, { company: null, ratings: [], offers: [], reviews: [], articles: [], types: [] }, 'https://sigma.com.br/servicos/contabilidade-digital');
    expect(offerings.some((o) => o.normalized === 'contabilidade digital' && o.kind === 'SERVICE')).toBe(true);
  });

  it('descarta rótulos genéricos que não são oferta', () => {
    const page = parseHtml(
      `<html><head><title>Serviços</title></head><body><h1>Serviços</h1><h2>Saiba mais</h2><h2>Fale conosco</h2></body></html>`,
      'https://sigma.com.br/servicos/x',
    );
    const offerings = extractOfferings(page, { company: null, ratings: [], offers: [], reviews: [], articles: [], types: [] }, 'https://sigma.com.br/servicos/x');
    expect(offerings.some((o) => ['saiba mais', 'fale conosco'].includes(o.normalized))).toBe(false);
  });

  it('associa cada preço ao item mencionado mais perto, não ao primeiro da página', () => {
    const html = `<html><head><title>Planos</title></head><body>
      <h1>Planos</h1>
      <div><h2>Plano MEI</h2><p>Plano MEI por R$ 99,90 /mês</p></div>
      <div><h2>Plano Simples</h2><p>Plano Simples por R$ 349,00 /mês</p></div>
      </body></html>`;
    const page = parseHtml(html, 'https://sigma.com.br/planos');
    const offerings = extractOfferings(page, { company: null, ratings: [], offers: [], reviews: [], articles: [], types: [] }, 'https://sigma.com.br/planos');
    const prices = attachPrices(page, offerings, 'https://sigma.com.br/planos');

    const mei = prices.find((p) => p.amount === 99.9);
    const simples = prices.find((p) => p.amount === 349);
    expect(mei?.label).toBe('Plano MEI');
    expect(simples?.label).toBe('Plano Simples');
    expect(mei?.unit).toBe('mensal');
  });
});

describe('utilitários de texto', () => {
  it('normaliza acentuação e pontuação para comparação', () => {
    expect(slugKey('Consultoria Tributária & Cia.')).toBe('consultoria tributaria cia');
  });

  it('mede similaridade entre nomes parecidos', () => {
    expect(trigramSimilarity('Academia Corpo Ideal', 'Academia Corpo Ideal Ltda')).toBeGreaterThan(0.7);
    expect(trigramSimilarity('Academia Alfa', 'Padaria Beta')).toBeLessThan(0.3);
  });

  it('extrai termos relevantes ignorando palavras vazias', () => {
    const terms = topTerms('contabilidade digital contabilidade digital contabilidade para empresas de contabilidade digital');
    expect(terms.map((t) => t.term)).toContain('contabilidade');
    expect(terms.map((t) => t.term)).not.toContain('para');
  });
});
