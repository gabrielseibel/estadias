# Metodologia dos scores

Todo score exibido pela plataforma é **analítico**: uma leitura comparativa dos dados
públicos disponíveis. Nenhum deles mede faturamento, participação de mercado ou
qualidade intrínseca de uma empresa.

## Três regras comuns a todos os scores

1. **Dimensão sem dado sai do cálculo.** Ela não vira zero. O peso é redistribuído entre
   as dimensões medidas e a **cobertura** cai.
2. **A cobertura é exibida junto do score.** Score 80 com 40% de cobertura e score 80
   com 100% de cobertura significam coisas diferentes, e a interface mostra as duas.
3. **A composição é sempre visível.** Cada dimensão exibe peso, valor e a frase que
   explica de onde ele veio ("14 publicações observadas; cadência ~9 dias").

## Website Score

| Dimensão | Peso | O que mede |
|---|---|---|
| Presença | 15% | Site acessível e servido por HTTPS |
| Conteúdo | 20% | Páginas conhecidas, existência de blog e publicações observadas |
| Clareza da oferta | 20% | Quantidade de produtos/serviços identificados publicamente |
| Conversão | 20% | Formulário de contato, WhatsApp, telefone e CTAs |
| Experiência | 15% | Tempo de resposta na coleta e cobertura de meta description |
| Sinais de autoridade | 10% | Canais sociais vinculados, sitemap e feed |

O tempo de resposta reflete a coleta do Radar, não uma medição de performance de usuário
real (que exigiria RUM ou Lighthouse no navegador do visitante).

## SEO Score

| Dimensão | Peso | O que mede |
|---|---|---|
| Títulos | 18% | Cobertura de `<title>` e adequação de comprimento (alvo ~55 caracteres) |
| Meta descriptions | 15% | Proporção de páginas com descrição |
| Cabeçalhos | 12% | Proporção de páginas com H1 |
| Dados estruturados | 15% | Tipos Schema.org encontrados e OpenGraph |
| Indexabilidade | 15% | `sitemap.xml`, `robots.txt`, canonical e páginas indexáveis |
| Profundidade de conteúdo | 15% | Volume textual e links internos |
| Sinais locais | 10% | Endereço/cidade em dados estruturados locais |
| Acessibilidade de imagens | 5% | Cobertura de atributo `alt` |

**Não inclui** posição em buscadores, volume de busca, backlinks ou autoridade de
domínio: exigem APIs externas pagas. O Radar não estima essas métricas — quando não é
possível verificar, ele diz que não é possível verificar.

## Score competitivo

Composto de nove dimensões, cada uma normalizada **em relação ao melhor valor observado
entre as empresas do projeto** (comparação relativa é o que importa em inteligência
competitiva):

| Dimensão | Peso | Como é medida |
|---|---|---|
| Reputação | 20% | Nota (70%) + volume relativo de avaliações (30%) |
| Oferta | 15% | Quantidade de produtos/serviços relativa ao melhor do projeto |
| SEO | 15% | Score de SEO da empresa |
| Presença digital | 12% | Canais sociais, HTTPS e páginas conhecidas |
| Conteúdo | 10% | Publicações observadas, existência de blog e cadência |
| Atividade | 10% | Mudanças detectadas nos últimos 90 dias |
| Experiência | 8% | Componentes de experiência e conversão do site |
| Transparência de preço | 5% | Preços públicos monitorados |
| Crescimento observado | 5% | Variação do volume de avaliações entre coletas |

Atividade e crescimento exigem **mais de uma coleta**. Na primeira execução aparecem
como "não verificável" — o produto não simula histórico que ainda não tem.

## Threat Score (0–100)

Mede movimento competitivo recente, não tamanho nem saúde financeira do concorrente.
Soma de contribuições por fatores observados nos últimos 90 dias:

| Fator | Contribuição |
|---|---|
| Novas ofertas divulgadas | até 25 (8 por oferta) |
| Movimentação de preços | até 20 (7 por mudança) |
| Crescimento de avaliações | até 20 (10 por evento) |
| Reputação forte (≥ 0,8 normalizada) | 15 |
| Novos canais digitais | até 12 (6 por canal) |
| SEO acima da média (≥ 0,75) | 10 |
| Mudança de endereço/unidade | 10 |
| Mudança de posicionamento | até 10 (4 por alteração) |

Cada fator é exibido com sua contribuição e a frase que o justifica. Sem histórico
suficiente, o score é nulo com o motivo declarado — nunca zero silencioso.

## Data Quality Score

Quanto o retrato de uma empresa pode sustentar uma decisão:

| Dimensão | Peso | O que mede |
|---|---|---|
| Completude do perfil | 25% | Campos preenchidos a partir de fontes públicas |
| Diversidade de fontes | 20% | Tipos distintos de fonte registrados |
| Atualização | 20% | Dias desde a última coleta (decai em 45 dias) |
| Confiabilidade das fontes | 15% | Confiança média das fontes registradas |
| Consistência | 12% | Sinais contraditórios entre fontes |
| Ausência de duplicidade | 8% | Ofertas potencialmente duplicadas |

## Voz do Cliente

Classificação temática e de sentimento por **léxico em português**, determinística.
Doze temas: atendimento, preço, qualidade, prazo, localização, ambiente, produto,
suporte, entrega, pós-venda, confiança e experiência.

A análise é feita **por oração**, não por avaliação inteira. Uma mesma frase costuma
misturar elogio e reclamação ("atendimento excelente, mas o preço é caro"): avaliar o
texto todo atribuiria a polaridade errada a um dos temas. Negações invertem a
polaridade local, e a nota — quando existe — pesa mais que o léxico.

A escolha por léxico em vez de IA tem três razões: funciona sem provedor configurado, é
auditável (cada tema aponta o termo que o disparou) e é reproduzível. A camada de IA,
quando disponível, refina essa base; não a substitui.

## Impacto e prioridade das recomendações

O impacto é uma pontuação relativa derivada do tamanho da lacuna medida — **não** uma
projeção de receita:

- lacuna de oferta: `40 + 18 × (concorrentes que oferecem)`, limitado a 95;
- dimensão abaixo da média: `35 + |diferença percentual|`, limitado a 90;
- reclamação recorrente do mercado: `45 + 12 × (concorrentes afetados)`, limitado a 90.

A prioridade cruza impacto e esforço: impacto ≥ 80 com esforço não-alto é **crítica**;
≥ 60 é **alta**; ≥ 35 é **média**; abaixo disso é **baixa**. A matriz Impacto × Esforço
na interface mostra essa distribuição.

## Benchmarking

Só é calculado com **pelo menos dois concorrentes com dado disponível** naquela
dimensão. Abaixo disso, a interface informa "amostra insuficiente" em vez de exibir uma
média de um elemento só — que pareceria uma comparação de mercado sem ser uma.

Concorrentes cujo site não pôde ser coletado ficam fora do denominador do GAP de oferta:
dizer "1 de 3" quando um deles nunca foi coletado distorceria a leitura. A exclusão é
declarada junto do resultado.
