# Privacidade, LGPD e ética de coleta

## Escopo do que é coletado

O Radar Competitivo coleta **dados empresariais publicados publicamente** por empresas
sobre si mesmas: site institucional, páginas de serviços e produtos, dados estruturados
(Schema.org), links para canais oficiais e conteúdo editorial próprio.

### O que o sistema não coleta

- CPF, RG ou qualquer documento de pessoa física
- Endereço residencial, telefone pessoal ou e-mail pessoal
- Dados biométricos ou reconhecimento facial
- Conteúdo atrás de autenticação, paywall ou área restrita
- Bases de dados de pessoas físicas de qualquer natureza

### Avaliações públicas

Quando o site de uma empresa publica avaliações (por exemplo, em dados estruturados
`Review`), o Radar analisa **o conteúdo** para extrair temas recorrentes de elogio e
reclamação. A tabela `reviews` **não possui coluna de autor**: nome, identificador ou
qualquer atributo do avaliador não é coletado nem armazenado.

A finalidade é entender a percepção sobre a **empresa**, não construir perfil de pessoa.

### Imagens

A galeria competitiva armazena **URL e metadados** (texto alternativo, dimensões,
categoria inferida por pistas textuais). Arquivos de imagem não são baixados nem
armazenados, e não há análise de conteúdo visual — portanto não há reconhecimento facial
nem tratamento de dado biométrico.

## Ética de coleta

O crawler é educado por construção, não por configuração:

- **`robots.txt` é respeitado**, inclusive `Crawl-delay`. Não existe caminho de código
  que ignore uma regra `Disallow` com `CRAWLER_RESPECT_ROBOTS=true`. Quando o
  `robots.txt` está indisponível por erro de servidor, o host é tratado como restrito —
  a postura conservadora é não coletar.
- **Intervalo mínimo entre requisições por domínio**, com backoff exponencial e circuit
  breaker após falhas repetidas.
- **Limites** de páginas por execução, profundidade, tamanho de resposta e tempo.
- **Cache** por `ETag`/`Last-Modified`: página que não mudou não é recoletada.
- **User-Agent identificável**, com URL de contato.
- **Nunca** contornar CAPTCHA, autenticação, paywall ou qualquer mecanismo de proteção.
- **Nunca** acessar áreas privadas ou conteúdo que exija login.

## Retenção

| Dado | Retenção | Justificativa |
|---|---|---|
| HTML bruto (`crawl_pages.rawHtml`) | `RAW_CONTENT_RETENTION_DAYS` (padrão 30 dias) | Necessário só para reprocessamento recente |
| Texto extraído | Enquanto o projeto existir | Base de parsers e análises |
| Evidências (URL, trecho, hash, data) | Enquanto o projeto existir | Auditoria: "de onde veio este dado?" |
| Snapshots e mudanças | Enquanto o projeto existir | Memória analítica e linha do tempo |

O descarte do HTML bruto é aplicado automaticamente a cada coleta. Excluir um projeto
remove em cascata páginas, snapshots, evidências, métricas e análises associadas.

## Isolamento entre organizações

O `organizationId` é derivado do token de autenticação e revalidado contra a tabela de
membros a cada requisição — nunca vem do corpo da requisição. Todas as consultas a dados
de projeto são escopadas por ele.

Isso é verificado por testes de integração que tentam, com o token de uma organização,
acessar projetos, dashboards, matrizes, empresas, evidências e disparar coletas de
outra. Todas as tentativas devem receber 403.

## Modo demonstração

Dados de demonstração vivem em uma **organização separada**, marcada com `isDemo`, sob o
mesmo isolamento aplicado a clientes distintos. Cada empresa e cada fonte carrega a
marcação de demonstração, e a interface exibe permanentemente a faixa **DEMONSTRAÇÃO**.
Não há caminho pelo qual esses dados apareçam misturados a dados reais.

## Direitos do titular

Como o sistema trata dados empresariais públicos e não constrói perfis de pessoas
físicas, o volume de dados pessoais é intencionalmente mínimo. Para os dados de conta
(nome, e-mail e senha com hash bcrypt do usuário da plataforma):

- **Acesso**: `GET /api/auth/me` devolve os dados da conta.
- **Exclusão**: remover a organização remove em cascata usuários vinculados e todo o
  conteúdo produzido.

Se uma avaliação pública coletada contiver dados pessoais no corpo do texto, a exclusão
do projeto elimina o registro; a evidência correspondente é removida junto.
