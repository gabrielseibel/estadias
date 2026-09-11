# Radar Competitivo

Plataforma de inteligência competitiva para pequenas e médias empresas: cadastre sua
empresa e seus concorrentes, e o sistema coleta dados públicos, organiza, acompanha
mudanças ao longo do tempo, compara e transforma isso em oportunidades, ameaças e
recomendações acionáveis.

O produto não é um crawler nem um painel bonito de concorrentes. É um **analista de
concorrência digital automatizado**: observa o mercado, entende o que os concorrentes
estão fazendo e transforma isso em decisões.

---

## O princípio que governa o sistema

Toda informação exibida carrega a sua natureza, e nenhuma delas é confundida com outra:

| Natureza | Significado | Exemplo |
|---|---|---|
| **Confirmado** | Encontrado em fonte pública verificável, com URL e data de coleta | "Dados estruturados do site apresentam nota 4,7 com 226 avaliações" |
| **Estimativa** | Calculado a partir de sinais — sempre rotulado, sempre com metodologia | "Crescimento de 46 avaliações públicas entre coletas" |
| **Análise** | Interpretação do sistema sobre os dados | "Reputação 27% abaixo da média dos concorrentes" |
| **Recomendação** | Ação sugerida, com problema, evidência, impacto e métrica | "Criar página para o serviço X e medir contatos originados dela" |

Consequências práticas disso no código:

- **Dimensão sem dado não vale zero.** Ela sai do cálculo e derruba a *cobertura*, que
  é exibida ao lado de todo score. Um site que não respondeu aparece como
  "não foi possível verificar", não como nota ruim.
- **Nada é preenchido por plausibilidade.** Sem preço público, o campo fica vazio.
  Sem fonte de avaliação, a reputação fica indisponível — com o motivo declarado.
- **Faturamento, vendas, número de clientes, funcionários, participação de mercado e
  seguidores nunca são estimados.** Não são coletáveis publicamente de forma
  confiável, então o sistema diz isso em vez de inventar.
- **A IA não pode contornar essas regras.** Toda resposta passa por um verificador
  que confere cada número contra o que as ferramentas retornaram e bloqueia o que
  não puder ser confirmado.

---

## Como executar

Pré-requisitos: **Node.js 20+** e **PostgreSQL 16** (ou Docker).

### Opção A — tudo em containers

Não exige Node instalado. Um comando sobe banco, migrations, API, worker e interface:

```bash
docker compose up
```

Abra <http://localhost:8080>. Para popular o modo demonstração:

```bash
docker compose run --rm migrate npm run db:seed:demo --workspace=apps/api
```

### Opção B — desenvolvimento local

```bash
# 1. Banco de dados
docker compose up -d db          # ou use um PostgreSQL já instalado

# 2. Configuração
cp .env.example .env             # ajuste DATABASE_URL e JWT_SECRET
cp .env apps/api/.env            # o Prisma lê o .env do workspace da API

# 3. Dependências e schema
npm install
npm run db:migrate --workspace=apps/api

# 4. Executar (API na 4000, interface na 5173)
npm run dev
```

Abra <http://localhost:5173>, crie uma conta e siga o fluxo: projeto → sua empresa →
concorrentes → **Analisar agora**.

### Conhecer a plataforma sem coletar nada

```bash
npm run db:seed:demo --workspace=apps/api
```

Cria uma organização **isolada** marcada como demonstração, com dados fictícios e duas
coletas simuladas (para que a detecção de mudanças, os alertas e a linha do tempo
tenham conteúdo). Acesso: `demo@radarcompetitivo.local` / `demonstracao123`.

Dados de demonstração nunca se misturam com dados reais: vivem em outra organização,
sob o mesmo isolamento aplicado a clientes distintos, e a interface exibe a faixa
**DEMONSTRAÇÃO** o tempo todo.

### Testes

```bash
npm test --workspace=apps/api
```

136 testes cobrindo segurança (SSRF), robots.txt, parsers, normalização, resolução de
entidades, motor analítico, detecção de mudanças, fundamentação da IA e integração da
API. O crawler é testado contra um **servidor HTTP local real** — não há simulação da
camada de rede.

O mesmo conjunto roda no CI (`.github/workflows/ci.yml`) a cada push e pull request,
contra um PostgreSQL de verdade: typecheck da API e da interface, migrations, os 136
testes e o build.

---

## O que o sistema faz

### Coleta

Varre o site público da empresa a partir da home e do `sitemap.xml`, priorizando as
páginas que respondem a perguntas competitivas: planos e preços, serviços, produtos,
sobre, contato, unidades, blog. De cada página extrai metadados, cabeçalhos, links,
formulários, CTAs, contatos, canais sociais, imagens e dados estruturados
(JSON-LD/Schema.org, OpenGraph, microdata).

O crawler é educado por construção:

- respeita `robots.txt` (inclusive `Crawl-delay`) — não há caminho de código que ignore
  uma regra `Disallow`;
- espaça requisições por domínio, com backoff exponencial e circuit breaker;
- limita páginas por execução, profundidade, tamanho de resposta e tempo;
- usa `ETag`/`Last-Modified` para não recoletar o que não mudou;
- **não** tenta contornar CAPTCHA, autenticação, paywall ou qualquer proteção.

### Acompanhamento

Cada coleta gera um retrato imutável da empresa. O diff entre retratos produz a linha
do tempo, os alertas e os sinais comerciais indiretos: nova página, novo serviço,
mudança de preço, salto de avaliações, novo canal, mudança de endereço, alteração de
posicionamento.

É isso que diferencia o produto de uma fotografia: **o concorrente não é analisado uma
vez, ele é acompanhado.**

### Análise

Um motor determinístico calcula, sobre os dados coletados:

- scores de site, SEO, reputação, presença, oferta, conteúdo, experiência, atividade e
  crescimento — cada um com composição auditável;
- matriz competitiva e benchmarking contra a média, o melhor e o pior concorrente;
- GAP de oferta (o que os concorrentes divulgam e você não);
- Voz do Cliente: temas recorrentes de elogio e reclamação, por classificação léxica em
  português, auditável termo a termo;
- SWOT, oportunidades, ameaças com Threat Score explicado fator a fator;
- recomendações com problema, evidência, impacto, ação, esforço, prioridade, prazo e
  métrica de sucesso, organizadas em plano de 7, 30 e 90 dias;
- Data Quality Score por empresa, para calibrar o quanto confiar em cada comparação.

Esse motor é a base da plataforma — e funciona sem nenhum provedor de IA configurado.

### IA (opcional)

Com `ANTHROPIC_API_KEY` configurada, entram a síntese executiva e o chat **Ask Radar**.
O agente não recebe HTML: só enxerga o retorno de ferramentas (`get_company_profile`,
`get_reviews`, `get_price_history`, `get_competitive_matrix`, `get_offer_gap`,
`get_market_opportunities`, `get_market_threats`, `get_evidence`, `get_historical_data`,
`get_data_quality`, entre outras) e é obrigado a consultá-las antes de concluir
qualquer coisa.

Antes de chegar ao usuário, a resposta passa pelo verificador de fundamentação, que
extrai cada número citado e o confere numericamente contra os dados das ferramentas.
Número não confirmado bloqueia a resposta inteira — com a lista do que não pôde ser
verificado. Sem chave configurada, a interface diz exatamente isso, em vez de simular
uma resposta.

---

## Estrutura

```
radar-competitivo/
├── apps/
│   ├── api/                      # Node.js + Express + Prisma + PostgreSQL
│   │   ├── prisma/               # schema, migrations e seed de demonstração
│   │   ├── src/
│   │   │   ├── lib/              # segurança de URL, fetcher, robots, rate limit, evidências
│   │   │   ├── parsers/          # HTML, dados estruturados, feeds, oferta, avaliações
│   │   │   ├── crawler/          # coleta de site, robots, coletor de empresa, descoberta
│   │   │   ├── analytics/        # scores, matriz, GAP, insights, snapshots, relatório
│   │   │   ├── ai/               # ferramentas, agente e verificador de fundamentação
│   │   │   ├── jobs/             # fila em banco, worker e handlers
│   │   │   └── http/             # auth multi-tenant, middlewares e rotas
│   │   └── tests/                # 136 testes, com servidor HTTP de fixtures
│   └── web/                      # React + Vite + Tailwind + Recharts + Lucide
└── docs/                         # arquitetura, metodologia, privacidade, roadmap
```

Documentação detalhada:

- [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md) — decisões técnicas e fluxo de dados
- [`docs/METODOLOGIA.md`](docs/METODOLOGIA.md) — como cada score é calculado
- [`docs/PRIVACIDADE.md`](docs/PRIVACIDADE.md) — LGPD, ética de coleta e retenção
- [`docs/DEPLOY.md`](docs/DEPLOY.md) — como colocar no ar (Render e alternativas)
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — o que vem depois do MVP

---

## Configuração relevante

Todas as opções estão documentadas em [`.env.example`](.env.example). As que mais
mudam o comportamento:

| Variável | Padrão | Efeito |
|---|---|---|
| `CRAWLER_MAX_PAGES_PER_SITE` | `25` | Páginas coletadas por site em cada execução |
| `CRAWLER_DOMAIN_DELAY_MS` | `1500` | Intervalo mínimo entre requisições ao mesmo domínio |
| `CRAWLER_RESPECT_ROBOTS` | `true` | Respeito ao `robots.txt`. Manter ligado |
| `CRAWLER_ALLOW_PRIVATE_HOSTS` | `false` | Libera alvos internos. **Só para testes locais** |
| `SEARCH_PROVIDER` | `none` | Descoberta automática: `searxng`, `brave` ou `google_cse` |
| `ANTHROPIC_API_KEY` | vazio | Habilita síntese executiva e Ask Radar |
| `RAW_CONTENT_RETENTION_DAYS` | `30` | Prazo de descarte do HTML bruto coletado |
| `VITE_API_URL` | `/api` | Endereço da API no **build** da interface. Só é necessária quando interface e API ficam em origens diferentes |

### Descoberta automática de concorrentes

O usuário escreve "academias em Chapecó" e o sistema propõe candidatos. Isso depende de
um mecanismo de busca, e nenhum permite raspagem direta de resultados. Por isso a
descoberta usa provedores configuráveis com API ou instância própria. **Sem provedor
configurado, o sistema informa que a fonte não está disponível e orienta o cadastro
manual** — jamais devolve resultados inventados.

### Produção

```bash
npm run build
npm run start   --workspace=apps/api    # API
npm run worker  --workspace=apps/api    # worker de coleta em processo separado
```

Defina `WORKER_INLINE=false` para que a API não execute jobs no próprio processo.
`JWT_SECRET` com pelo menos 32 caracteres é obrigatório — a API se recusa a subir sem
isso em produção.

### Colocar no ar

O repositório traz um blueprint da Render ([`render.yaml`](../render.yaml)) que cria
banco, API e interface sem preenchimento manual: **Render → New → Blueprint**, conecte
o repositório, confirme.

O passo a passo, as limitações do plano gratuito e o que qualquer outra plataforma
precisa oferecer estão em [`docs/DEPLOY.md`](docs/DEPLOY.md).

GitHub Pages não serve para hospedar o Radar: ele publica apenas arquivos estáticos e
não executa Node nem PostgreSQL. Só a interface subiria — e falharia em toda tela, por
não haver API respondendo.

---

## Segurança

- **SSRF**: toda URL — cadastrada, descoberta ou encontrada em link de terceiro — passa
  por validação de protocolo, porta e credenciais, e tem o hostname resolvido em DNS com
  verificação de **todos** os endereços contra faixas privadas, loopback, link-local,
  CGNAT, multicast e endpoints de metadados de nuvem. Redirecionamentos são seguidos
  manualmente e revalidados a cada salto.
- **Multi-tenant**: o `organizationId` nunca vem do corpo da requisição; é derivado do
  token e revalidado contra a tabela de membros a cada chamada. Não existe caminho em
  que uma organização alcance dados de outra — verificado por testes de integração.
- **Injeção**: acesso a dados exclusivamente via Prisma (consultas parametrizadas);
  entrada validada com Zod; sem execução de shell a partir de entrada do usuário.
- **Abuso**: rate limit por IP na API, limite estrito no login, limite de jobs
  simultâneos por organização, corpo de requisição limitado e cabeçalhos de segurança
  via Helmet.

---

## Limites conhecidos

Ditos aqui porque o sistema também os diz na interface, no lugar exato onde o dado
faria falta:

- **Portais de avaliação de terceiros** (Google, Reclame Aqui, TripAdvisor) exigem API
  oficial ou integração própria. O Radar coleta reputação quando o site da empresa
  publica dados estruturados de avaliação; caso contrário, informa a ausência.
- **Métricas de redes sociais** (seguidores, alcance, frequência) exigem APIs oficiais.
  O Radar identifica quais canais a empresa divulga e diz o resto como não verificável.
- **Posição em buscadores, volume de busca e backlinks** exigem ferramentas pagas. A
  análise de SEO cobre o que é observável no HTML servido publicamente.
- **Agendamento recorrente** está registrado por projeto, mas a execução periódica
  depende de um agendador externo chamando a rota de análise. No MVP, a execução é sob
  demanda pelo botão **Analisar agora**.
