# Roadmap

O MVP entrega o ciclo completo — cadastrar, coletar, comparar, acompanhar, analisar e
recomendar — com dados públicos e sem dependências externas obrigatórias. O que segue é
o que a arquitetura já comporta e ainda não foi implementado.

## Integrações que exigem APIs externas

Deliberadamente fora do MVP: cada uma exige credenciais, custo ou aprovação de
plataforma. A arquitetura de fontes (`sources`, `SourceKind`, `evidence`) foi desenhada
para recebê-las sem alteração no modelo.

| Integração | O que destrava | Onde encaixa |
|---|---|---|
| Google Business Profile API | Nota, volume e avaliações reais | Nova fonte em `review_summaries`/`reviews` |
| APIs oficiais de redes sociais | Seguidores, frequência e engajamento | `social_snapshots` (hoje `UNAVAILABLE`) |
| Search Console / Analytics (dados próprios) | Posição real e tráfego da sua empresa | Nova fonte de métricas próprias |
| Ferramentas de SEO (Ahrefs, Semrush) | Backlinks, autoridade, volume de busca | Enriquecimento de `seo_metrics` |
| Monitoramento de anúncios | Investimento em mídia dos concorrentes | Novo tipo de `commercial_signals` |
| CRM e e-commerce próprios | Dados de venda reais do usuário | Novo módulo de indicadores comerciais |

Enquanto não existirem, a interface declara a indisponibilidade no lugar exato onde o
dado faria falta — nunca com número estimado.

## Produto

- **Agendamento nativo.** A frequência já é registrada por projeto; falta o agendador
  que dispara a análise (hoje depende de um cron externo chamando a rota).
- **Notificações.** Alertas por e-mail, WhatsApp e Slack, com resumo periódico.
- **Relatórios automáticos.** Envio recorrente do executivo em PDF.
- **Comparação visual.** Galeria lado a lado (minha empresa × concorrente) usando as
  imagens já referenciadas.
- **Mapas competitivos.** Distribuição geográfica a partir das coordenadas coletadas.
- **White-label (plano AGENCY).** Marca própria e gestão de múltiplos clientes — o
  isolamento multi-tenant já suporta.
- **Cobrança.** Assinatura ligada à organização; os limites por plano já são aplicados.

## Engenharia

- **Cache de leitura** nas rotas analíticas mais pesadas.
- **Particionamento de `crawl_pages`** por data quando o histórico crescer.
- **Fila em Redis** caso o volume justifique — a interface de `queue.ts` já isola isso.
- **Code splitting** no front (o bundle passa de 500 kB por incluir os gráficos).
- **Métricas operacionais** exportadas em formato Prometheus, além do painel atual.

## Inteligência

- **Previsão de tendências** sobre a série histórica de `competitive_metrics`, com
  intervalo de confiança explícito e rotulada como estimativa.
- **Detecção de novos entrantes** por descoberta periódica no segmento e região.
- **Classificação de posicionamento** a partir da evolução de títulos e descrições.
- **Refino da Voz do Cliente por IA** sobre a base léxica, mantendo a auditabilidade
  atual como referência.
