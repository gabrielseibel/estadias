# Deploy

O Radar Competitivo precisa de dois processos e um banco: **Node** (API e coleta) e
**PostgreSQL**. Qualquer plataforma que ofereça os dois serve; este documento cobre a
Render, para a qual o repositório já traz um blueprint pronto.

> **GitHub Pages não serve.** Ele hospeda apenas arquivos estáticos: não executa Node,
> não roda PostgreSQL e não sustenta o worker de coleta. Publicar só o frontend lá
> produziria uma interface que falha em toda tela, por não haver API respondendo.

## Render (blueprint pronto)

O arquivo [`render.yaml`](../../render.yaml) declara banco, API e interface. Nenhum
campo precisa ser preenchido à mão: senha do banco, segredo de JWT e as URLs que os
serviços trocam entre si são resolvidos pela própria Render.

O blueprint fica na **raiz do repositório**, e não dentro de `radar-competitivo/`:
a Render procura `render.yaml` apenas na raiz, e não encontra o arquivo em
subdiretório — o erro é "Blueprint file render.yaml not found on <branch>". O campo
`rootDir` de cada serviço é que aponta para a pasta do projeto.

1. Acesse **Render → New → Blueprint**
2. Conecte este repositório e escolha o branch
3. Confirme

A Render cria três recursos:

| Recurso | O que é | Plano |
|---|---|---|
| `radar-db` | PostgreSQL gerenciado | free |
| `radar-api` | API + worker embutido | free |
| `radar-web` | Interface (site estático) | free |

Ao final, a interface fica na URL de `radar-web`. Crie a conta pela própria tela de
cadastro e siga o fluxo: projeto → sua empresa → concorrentes → **Analisar agora**.

### O que o blueprint resolve sozinho

- **`DATABASE_URL`** — injetada a partir do banco criado.
- **`JWT_SECRET`** — gerado pela Render, forte e único. A API se recusa a subir em
  produção com um segredo de menos de 32 caracteres.
- **`VITE_API_URL`** — a interface é servida de um domínio e a API de outro, então o
  bundle precisa saber o endereço da API. A Render devolve apenas o hostname; o
  cliente completa o esquema.
- **`CORS_ORIGINS`** — a API recebe o hostname da interface e completa o esquema.
  Origem não declarada não recebe cabeçalho de liberação.
- **Migrations** — aplicadas no start da API, antes da primeira requisição.

### Se o build falhar com `TS2688: Cannot find type definition file for 'node'`

Sintoma de um ambiente que instalou apenas as dependências de produção. Com
`NODE_ENV=production`, o `npm ci` pula as `devDependencies` — e `typescript`,
`@types/node` e a CLI do Prisma estão lá, porque são ferramentas de build, não de
execução.

O blueprint usa `npm ci --include=dev` justamente por isso. Se você configurou os
serviços à mão em vez de usar o blueprint, ajuste o comando de build para incluir as
dependências de desenvolvimento.

O CI executa os comandos de build lidos do próprio `render.yaml`, com
`NODE_ENV=production`, para que essa divergência entre ambiente de teste e de deploy
não volte a passar despercebida.

### Limitações do plano gratuito

Ditas aqui porque afetam o que você vai observar, não porque impeçam o uso:

- **A API hiberna após inatividade.** A primeira requisição depois de um período
  parado leva cerca de um minuto para responder, enquanto o serviço acorda.
- **O worker roda embutido na API** (`WORKER_INLINE=true`). A Render não oferece
  serviços de background no plano gratuito, então a coleta divide processo com o
  servidor HTTP. Funciona para avaliar a plataforma; não é a configuração
  recomendada em produção.
- **Menos páginas por coleta.** O blueprint reduz `CRAWLER_MAX_PAGES_PER_SITE` para
  15 e a concorrência para 2, respeitando os limites de CPU e memória do plano.
- **O banco gratuito tem prazo de validade.** A Render altera esses termos com
  alguma frequência — confirme o prazo atual no painel antes de depender dele.

### Ao migrar para um plano pago

No fim do `render.yaml` há um bloco comentado com o serviço `radar-worker`.
Descomente-o e troque `WORKER_INLINE` para `'false'` na API: a coleta passa a rodar em
processo separado, que é a configuração recomendada — crawling pesado não deve
competir por CPU com o servidor HTTP.

### Habilitar a camada de IA

Opcional. Sem chave, a plataforma funciona completa com o motor analítico
determinístico e declara a indisponibilidade na interface.

Para ligar a síntese executiva e o chat Ask Radar, defina `ANTHROPIC_API_KEY` no
painel do serviço `radar-api`. O blueprint já declara a variável como preenchimento
manual, justamente para que a chave não passe pelo repositório.

## Outras plataformas

O que qualquer alternativa precisa oferecer:

| Necessidade | Por quê |
|---|---|
| Node 20+ | Runtime da API e do worker |
| PostgreSQL | O projeto usa arrays escalares, `FOR UPDATE SKIP LOCKED` e busca case-insensitive |
| Processo de background (ideal) | Para a coleta não dividir CPU com o servidor HTTP |
| Saída HTTP para a internet | Sem ela o crawler não alcança os sites dos concorrentes |

Variáveis mínimas para subir em qualquer lugar:

```bash
DATABASE_URL=postgresql://…      # obrigatória
JWT_SECRET=…                     # obrigatória, mínimo 32 caracteres
CORS_ORIGINS=https://sua-interface.com
WORKER_INLINE=false              # com worker dedicado; true se for processo único
VITE_API_URL=https://sua-api.com/api   # no build da interface, se a origem for outra
```

O último item vale destacar: `VITE_API_URL` é lida **no momento do build** da
interface, não em tempo de execução. Trocar o endereço da API exige reconstruir o
frontend.

## Autohospedagem com Docker

Se o destino é uma VPS própria, o `docker-compose.yml` na raiz sobe a pilha completa —
banco, migrations, API, worker e interface — com um comando:

```bash
docker compose up -d
```

Nesse arranjo interface e API compartilham origem (o nginx encaminha `/api`), então
nem `VITE_API_URL` nem `CORS_ORIGINS` precisam de ajuste. Troque `JWT_SECRET` antes de
expor à internet.
