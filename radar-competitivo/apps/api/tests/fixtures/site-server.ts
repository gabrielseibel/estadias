import http from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * Servidor HTTP local que serve sites de teste reais (HTML, robots.txt,
 * sitemap.xml, feed RSS). Usado para exercitar o crawler de ponta a ponta sem
 * depender da internet e sem simular a camada de rede: as requisições são
 * HTTP de verdade.
 */

export type FixtureSite = {
  routes: Record<string, { body: string; contentType?: string; status?: number; etag?: string }>;
  robots?: string;
  delayMs?: number;
};

export type RunningSite = {
  origin: string;
  port: number;
  requests: string[];
  close: () => Promise<void>;
};

export async function startFixtureSite(site: FixtureSite): Promise<RunningSite> {
  const requests: string[] = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    requests.push(url.pathname);

    const send = (status: number, body: string, contentType = 'text/html; charset=utf-8', extra: Record<string, string> = {}) => {
      res.writeHead(status, { 'content-type': contentType, ...extra });
      res.end(body);
    };

    const respond = () => {
      if (url.pathname === '/robots.txt') {
        if (site.robots === undefined) return send(404, 'not found', 'text/plain');
        return send(200, site.robots, 'text/plain; charset=utf-8');
      }
      const key = url.pathname.replace(/\/$/, '') || '/';
      const route = site.routes[key] ?? site.routes[url.pathname];
      if (!route) return send(404, '<html><body><h1>404</h1></body></html>');

      if (route.etag && req.headers['if-none-match'] === route.etag) {
        res.writeHead(304, { etag: route.etag });
        return res.end();
      }
      return send(route.status ?? 200, route.body, route.contentType ?? 'text/html; charset=utf-8', route.etag ? { etag: route.etag } : {});
    };

    if (site.delayMs) setTimeout(respond, site.delayMs);
    else respond();
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${port}`,
    port,
    requests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** Site completo de uma empresa fictícia de teste (não é dado de produção). */
export function buildCompanySite(opts: {
  name: string;
  services: string[];
  products?: string[];
  rating?: number;
  reviewCount?: number;
  prices?: { label: string; amount: number }[];
  social?: string[];
  blogPosts?: { title: string; date: string }[];
  city?: string;
  phone?: string;
}): FixtureSite {
  const {
    name, services, products = [], rating, reviewCount, prices = [], social = [],
    blogPosts = [], city = 'Chapecó', phone = '(49) 3300-0000',
  } = opts;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name,
    description: `${name} atende empresas em ${city}.`,
    telephone: phone,
    url: '/',
    address: { '@type': 'PostalAddress', streetAddress: 'Rua Central, 100', addressLocality: city, addressRegion: 'SC', addressCountry: 'BR' },
    ...(rating ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: rating, reviewCount: reviewCount ?? 0, bestRating: 5 } } : {}),
    sameAs: social,
    priceRange: '$$',
    openingHours: 'Mo-Fr 08:00-18:00',
  };

  const nav = `<nav>
    <a href="/">Home</a>
    <a href="/servicos">Serviços</a>
    ${products.length ? '<a href="/produtos">Produtos</a>' : ''}
    ${prices.length ? '<a href="/planos">Planos</a>' : ''}
    <a href="/sobre">Sobre</a>
    <a href="/contato">Contato</a>
    ${blogPosts.length ? '<a href="/blog">Blog</a>' : ''}
  </nav>`;

  const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const routes: FixtureSite['routes'] = {
    '/': {
      body: `<!doctype html><html lang="pt-BR"><head>
        <title>${name} — Soluções em ${city}</title>
        <meta name="description" content="${name}: ${services.slice(0, 3).join(', ')} em ${city}.">
        <link rel="canonical" href="/">
        <meta property="og:title" content="${name}">
        <meta property="og:description" content="${name} em ${city}">
        <meta property="og:site_name" content="${name}">
        <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
      </head><body>${nav}
        <h1>${name}</h1>
        <h2>Nossos serviços</h2>
        <ul>${services.map((s) => `<li><a href="/servicos/${slug(s)}">${s}</a></li>`).join('')}</ul>
        <p>Atendimento em ${city}. Telefone ${phone}.</p>
        <a class="cta" href="/contato">Solicite um orçamento</a>
        ${social.map((u) => `<a href="${u}">social</a>`).join('')}
        <img src="/img/fachada.jpg" alt="Fachada da ${name}">
      </body></html>`,
      etag: `"home-${slug(name)}"`,
    },
    '/servicos': {
      body: `<!doctype html><html lang="pt-BR"><head><title>Serviços — ${name}</title>
        <meta name="description" content="Serviços oferecidos por ${name}."></head><body>${nav}
        <h1>Serviços</h1>
        ${services.map((s) => `<h2><a href="/servicos/${slug(s)}">${s}</a></h2><p>Descrição de ${s}.</p>`).join('')}
      </body></html>`,
    },
    '/sobre': {
      body: `<!doctype html><html lang="pt-BR"><head><title>Sobre — ${name}</title>
        <meta name="description" content="Quem somos"></head><body>${nav}<h1>Sobre a ${name}</h1>
        <p>Atuamos em ${city} desde 2010, com foco em ${services[0] ?? 'atendimento'}.</p></body></html>`,
    },
    '/contato': {
      body: `<!doctype html><html lang="pt-BR"><head><title>Contato — ${name}</title></head><body>${nav}
        <h1>Contato</h1>
        <form><input type="email" name="email"><textarea name="mensagem"></textarea><button>Enviar mensagem</button></form>
        <a href="https://wa.me/554933000000">WhatsApp</a>
        <p>E-mail: contato@${slug(name)}.com.br — Telefone ${phone}</p></body></html>`,
    },
  };

  for (const s of services) {
    routes[`/servicos/${slug(s)}`] = {
      body: `<!doctype html><html lang="pt-BR"><head><title>${s} — ${name}</title>
        <meta name="description" content="${s} com ${name} em ${city}."></head><body>${nav}
        <h1>${s}</h1><p>Como funciona o serviço de ${s}.</p>
        <a href="/contato">Fale conosco</a></body></html>`,
    };
  }

  if (products.length) {
    routes['/produtos'] = {
      body: `<!doctype html><html lang="pt-BR"><head><title>Produtos — ${name}</title></head><body>${nav}
        <h1>Produtos</h1>${products.map((p) => `<h2><a href="/produtos/${slug(p)}">${p}</a></h2>`).join('')}</body></html>`,
    };
    for (const p of products) {
      routes[`/produtos/${slug(p)}`] = {
        body: `<!doctype html><html><head><title>${p}</title>
        <script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'Product', name: p, offers: { '@type': 'Offer', price: 199.9, priceCurrency: 'BRL' } })}</script>
        </head><body>${nav}<h1>${p}</h1></body></html>`,
      };
    }
  }

  if (prices.length) {
    routes['/planos'] = {
      body: `<!doctype html><html lang="pt-BR"><head><title>Planos e preços — ${name}</title></head><body>${nav}
        <h1>Planos</h1>
        ${prices.map((p) => `<div><h2>${p.label}</h2><p>${p.label} por R$ ${p.amount.toFixed(2).replace('.', ',')} /mês</p></div>`).join('')}
      </body></html>`,
    };
  }

  if (blogPosts.length) {
    routes['/blog'] = {
      body: `<!doctype html><html lang="pt-BR"><head><title>Blog — ${name}</title></head><body>${nav}
        <h1>Blog</h1>${blogPosts.map((b, i) => `<article><h2><a href="/blog/post-${i}">${b.title}</a></h2><time datetime="${b.date}">${b.date}</time></article>`).join('')}
      </body></html>`,
    };
    blogPosts.forEach((b, i) => {
      routes[`/blog/post-${i}`] = {
        body: `<!doctype html><html><head><title>${b.title}</title>
          <meta property="article:published_time" content="${b.date}"></head><body>${nav}
          <h1>${b.title}</h1><time datetime="${b.date}">${b.date}</time><p>Conteúdo do artigo.</p></body></html>`,
      };
    });
  }

  const sitemapUrls = Object.keys(routes).map((p) => `<url><loc>${p}</loc></url>`).join('');
  routes['/sitemap.xml'] = {
    body: `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${sitemapUrls}</urlset>`,
    contentType: 'application/xml',
  };

  return { routes, robots: 'User-agent: *\nDisallow: /admin\nAllow: /\nSitemap: /sitemap.xml\n' };
}
