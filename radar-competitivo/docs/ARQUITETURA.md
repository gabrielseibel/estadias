# Arquitetura

Documento de decisões: o que foi escolhido, e principalmente **por quê**.

## Visão geral

```
┌────────────┐   HTTP    ┌──────────────┐   fila em banco   ┌──────────────┐
│  Interface │ ────────► │     API      │ ────────────────► │    Worker    │
│React + Vite│ ◄──────── │   Express    │ ◄──────────────── │   (coleta)   │
└────────────┘   JSON    └──────┬───────┘   estado do job   └──────┬───────┘
                                │                                  │
                                ▼                                  ▼
                         ┌─────────────┐                   ┌──────────────┐
                         │ PostgreSQL  │                   │ Sites        │
                         │  (Prisma)   │                   │ públicos     │
                         └─────────────┘                   └──────────────┘
```

O caminho de um dado, do site até a recomendação:

```
site público
  → fetcher (SSRF, robots, rate limit, cache)
  → parsers (HTML, JSON-LD, OpenGraph, sitemap, RSS)
  → normalizador (oferta, preço, contato, social, imagem)
  → persistência + evidência (URL, trecho, hash, data, confiança)
  → snapshot imutável
  → diff entre snapshots → mudanças → alertas + sinais comerciais
  → motor analítico (scores, matriz, GAP, benchmark, SWOT)
  → insights + recomendações
  → [opcional] IA com ferramentas → verificador de fundamentação → resposta
```

## Decisões e razões

### Fila de jobs em PostgreSQL, não Redis/BullMQ

Menos infraestrutura para operar, transações reais e visibilidade direta do estado dos
jobs na interface (a mesma tabela que o worker consome alimenta a tela de progresso).
A reivindicação usa `FOR UPDATE SKIP LOCKED`, o que permite vários workers concorrentes
sem processar o mesmo job duas vezes. Se o volume exigir, trocar por Redis é uma
mudança contida em `src/jobs/queue.ts`.

### Progresso real, nunca sintético

O job reporta etapas concretas concluídas sobre o total conhecido. Quando o total ainda
não é conhecido, a interface mostra a etapa atual e uma barra indeterminada — não uma
porcentagem inventada. A especificação proíbe progresso falso, e a implementação torna
isso estrutural: não existe contador de tempo fingindo avanço.

### Motor determinístico primeiro, IA depois

A plataforma inteira — scores, matriz, GAP, oportunidades, ameaças, recomendações,
plano de ação, relatório — funciona **sem nenhum provedor de IA**. Três razões:

1. **Honestidade.** Regras explícitas sobre dados coletados são auditáveis; o usuário
   pode ver exatamente por que uma oportunidade apareceu.
2. **Disponibilidade.** Sem chave configurada, o produto continua entregando valor em
   vez de exibir telas vazias ou respostas simuladas.
3. **Fundamentação.** A IA trabalha sobre as mesmas estruturas que o motor produz, o
   que reduz drasticamente a superfície de alucinação — ela não tem HTML bruto de onde
   inventar números.

### Camada de ferramentas entre a IA e os dados

O agente nunca recebe páginas HTML. Recebe apenas o retorno de ferramentas que devolvem
estruturas normalizadas, com fonte e confiança. Isso torna cada resposta rastreável
(o rastro de chamadas é exibido na interface e persistido em `ai_analyses`) e permite
que o verificador confira número por número.

### Verificador de fundamentação por comparação numérica

A primeira versão comparava strings — reprovava arredondamento legítimo (dado 4,68,
modelo escreve "4,7") e deixava passar números com separador de milhar. A versão atual
extrai os números do texto em português (milhar com ponto, decimal com vírgula), extrai
todos os números do rastro de ferramentas e compara **numericamente**, com tolerância
para arredondamento à precisão escrita. Um único valor não confirmado bloqueia a
resposta inteira.

### Retratos imutáveis + diff, em vez de campos mutáveis

Guardar apenas o estado atual da empresa perderia a história. Cada coleta grava um
snapshot com hash; a comparação entre dois snapshots produz os eventos. Como efeito,
"nada mudou" é detectado por comparação de hash, sem custo de diff.

### Evidência como entidade de primeira classe

Toda afirmação relevante aponta para um registro com URL, rótulo da fonte, trecho
exato, hash do conteúdo, status HTTP, confiança e data. É o que sustenta o "ver fonte"
da interface e o que permite auditar uma recomendação meses depois.

### Fixtures HTTP reais nos testes

Os testes de crawler sobem um servidor HTTP local que serve HTML, `robots.txt`,
`sitemap.xml`, feed e `ETag`. Nada da camada de rede é simulado: o objetivo é exercitar
redirecionamento, 304, timeout, limite de tamanho e respeito a `robots.txt` como
acontecem de verdade. Esses testes já encontraram três defeitos reais durante o
desenvolvimento — 304 tratado como redirect, resposta truncada devolvida como sucesso e
literal IPv6 escapando do guarda SSRF.

## Modelo de dados

Entidades principais e o papel de cada uma:

| Grupo | Tabelas | Papel |
|---|---|---|
| Tenancy | `organizations`, `users`, `memberships` | Isolamento e acesso |
| Projeto | `projects`, `companies`, `sources` | Recorte de mercado e empresas |
| Coleta | `crawl_jobs`, `job_logs`, `crawl_pages`, `robots_cache` | Execução e páginas coletadas |
| História | `company_snapshots`, `company_changes` | Retratos e mudanças |
| Reputação | `reviews`, `review_summaries`, `review_themes` | Nota, volume e Voz do Cliente |
| Oferta | `offerings`, `price_observations` | Produtos, serviços, planos e preços |
| Presença | `social_profiles`, `social_snapshots`, `company_images` | Canais e galeria |
| Métricas | `website_metrics`, `seo_metrics`, `competitive_metrics`, `data_quality_scores` | Scores versionados |
| Saídas | `alerts`, `insights`, `recommendations`, `reports`, `commercial_signals` | Resultado analítico |
| Rastro | `evidence`, `ai_analyses` | Proveniência e execuções de IA |

Detalhes que sustentam as regras do produto:

- `DataNature` (`CONFIRMED`/`ESTIMATED`/`ANALYSIS`/`RECOMMENDATION`/`UNAVAILABLE`)
  acompanha os registros que podem ser confundidos entre si.
- `dedupeKey` único por projeto em `alerts`, `insights` e `recommendations` garante
  idempotência: reexecutar a análise não duplica nada.
- `reviews` **não** tem coluna de autor. Avaliações são analisadas como conteúdo, não
  transformadas em perfis de pessoas.
- `competitive_metrics` é versionado por execução — é o que sustenta a memória analítica
  ("há 3 meses o concorrente tinha score 71; hoje tem 82").

## Escala

O que muda quando o volume crescer, e onde mexer:

| Gargalo | Caminho |
|---|---|
| Volume de coleta | Vários processos `npm run worker` — a fila já suporta concorrência |
| Latência de leitura | Cache de leitura nas rotas analíticas (dados já são materializados) |
| Páginas por site | `CRAWLER_MAX_PAGES_PER_SITE` e profundidade, por plano |
| Histórico | Particionamento de `crawl_pages` por data; `rawHtml` já tem retenção |
| Fila | Substituir `queue.ts` por Redis mantendo a mesma interface |

## Modelo de negócio

Os limites de plano (`FREE`, `PRO`, `BUSINESS`, `AGENCY`) já são aplicados na criação de
projetos e no cadastro de concorrentes. Cobrança não faz parte do MVP, mas a arquitetura
multi-tenant permite adicioná-la sem alterar o modelo de dados: basta ligar assinatura à
organização e ler o plano onde os limites já são consultados.
