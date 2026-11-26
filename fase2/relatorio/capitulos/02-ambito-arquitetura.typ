#import "../template.typ": *
#import "../diagramas/sequencia-pedido.typ": sequencia-pedido, ajustar-altura

= Âmbito e Vista da Arquitetura

#orientacao[
  *Origem:* Exercício 6, Bloco 1, secções 0 e 1 do _template_ (preparação, fontes, vista global e sequência).

  *Objetivo do capítulo:* situar o leitor. Mostra como a solução foi lançada, em que fontes se baseia a análise e como é
  a arquitetura da solução de base, com o caminho do vídeo em destaque. É a base factual dos capítulos seguintes.

  *Foco:* a *extensão de vídeo, enquadrada no padrão global* da solução. Não analisem o vídeo isoladamente: o que o vídeo
  faz só se percebe à luz do que a solução faz como um todo.

  *Rigor:* cada afirmação sobre o sistema atual cita uma evidência (`EV-nn`) ou é assumida como hipótese (`H-nn`). A
  secção 2.4 explica como se escreve uma evidência.
]

== Preparação e ambiente

#orientacao[
  Registem como a solução foi lançada, para que outra pessoa a consiga repetir e obtenha o mesmo resultado. Indiquem
  sempre o _commit_ de partida (o mesmo em todos os capítulos), os comandos exatos e o ambiente de execução. Se algum
  passo falhou ou exigiu um ajuste, escrevam-no: é informação útil para quem repetir o processo.

  A descrição do processamento em lote que se segue à tabela deve ser escrita pela equipa, com palavras próprias, e
  mostrar que perceberam o fluxo completo, do _Apply_ ao resultado, para imagens e vídeos.
]

#tab([Preparação e ambiente],
  tabela-campos(
    [Commit de partida], [`a2c0772`, que contém a solução de base (`picturas-27`, _commit_ `0523102`) sem alterações,
      na pasta `fase2/picturas-27`. As evidências `EV-nn` referem-se a este _commit_ e a caminhos dentro dessa
      pasta.],
    [Comando(s) de arranque], [`cd fase2/picturas-27 && docker compose up -d --build`. A aplicação fica disponível em
      `https://localhost:8080`, com um certificado autoassinado que o _browser_ pede para aceitar.],
    [Ambiente (SO, CPU, RAM, versões de Docker e Compose)], [Portátil com Ubuntu 26.04, Intel i7-13620H (16 _threads_),
      16 GB de RAM e SSD; Docker Engine 29.10 e Docker Compose 5.7. Durante as medições esteve ligado à corrente, em
      modo de desempenho e sem outras aplicações abertas.],
    [Passos que exigiram ajuste], [O certificado do nginx estava excluído pelo `.gitignore` do nosso repositório e, sem
      ele, o nginx não arranca; foi reposto a partir da base. A primeira construção demora, porque descarrega vários GB
      de imagens e dependências de IA.],
  ),
)

*Como é orquestrado o processamento em lote de imagens e de vídeos:*

Quando o utilizador carrega em _Apply_, o _frontend_ envia um único pedido ao serviço `projects`, que coordena todo o
processamento. O `projects` valida o _pipeline_ e copia cada ficheiro original do armazenamento (SeaweedFS) para uma
pasta partilhada com os _workers_. O tipo de cada ficheiro (imagem ou vídeo) foi registado quando foi carregado, e é
aqui que os dois caminhos se separam. Numa *imagem*, o `projects` envia um pedido por ferramenta, um de cada vez: só
quando recebe a resposta de uma ferramenta é que envia a imagem para a seguinte. Num *vídeo*, envia um único pedido
com todos os efeitos, e o único _worker_ de vídeo aplica-os de seguida, enviando o progresso diretamente para a
interface. No fim, o `projects` guarda o resultado e avisa o utilizador, que pode então descarregá-lo.

== Fontes consultadas

#orientacao[
  Listem os documentos e o código que sustentam a análise, com a versão ou a data de cada um (_commit_, número de versão,
  data de acesso) e para que foram usados. Isto permite ao leitor perceber de onde vêm as afirmações e detetar
  fontes desatualizadas. Incluam os documentos de apoio da unidade curricular que influenciaram a análise.
]

#tab([Fontes consultadas],
  tabela(
    colunas: (5.5cm, 3cm, 1fr),
    [Fonte], [Versão / data], [Usada para],
    [`README.md`, `AGENTS.md`], [_commit_ `a2c0772`], [Arrancar a solução e conhecer os serviços.],
    [`doc-ext-requisitos-2627.pdf`], [Fase 1 de 2026/27, Grupo 4], [Requisitos da extensão de vídeo, usados como origem
      de alvos e cenários.],
    [`doc-sol-arquitetural.pdf`], [Fase 2 de 2025/26], [Arquitetura de base e o que afirma sobre escalabilidade
      (secção 7.1), que comparámos com o código.],
    [Slides da aula 11 e documento de apoio sobre padrões arquiteturais], [Material da UC, 2026/27], [Identificar e
      comparar padrões (capítulos 3 e 4).],
    [Código da solução], [_commit_ `a2c0772`], [Todas as evidências `EV-nn`.],
    [Diagrama `arquitetura_global`], [Material de apoio da UC, 2026/27], [Vista da arquitetura global (secção 2.3).],
    [Diretrizes da Fase 2; enunciados e _templates_ dos Exercícios 6 e 7], [Versão 1; 1.1, 1.1 e 3.0], [Estrutura do
      trabalho e do relatório.],
  ),
)

== Vista da arquitetura global

#orientacao[
  A vista mostra o *padrão global* da solução (serviços, filas, armazenamento, fronteiras) com o *caminho do vídeo
  destacado*, de modo a que se veja onde o vídeo segue o resto do sistema e onde se afasta dele.

  Usem a notação e a ferramenta que preferirem (C4 de contentores, componentes UML, PlantUML, Mermaid, draw.io), mas
  incluam sempre uma *legenda* e indiquem a ferramenta. O diagrama tem de ser legível no documento impresso e
  consistente com o que foi observado na solução em execução, não apenas com a documentação.
]

#paisagem[
  #figure(
    image("../images/arquitetura_global_carlito.svg", width: 100%),
    caption: [Vista da arquitetura global com o caminho do vídeo destacado (fonte: material de apoio da UC; verificada
      no _commit_ `a2c0772`)],
  ) <fig-arquitetura-global>
]

*Ferramenta / notação:* PlantUML, diagrama de componentes. Usámos o diagrama do material de apoio da UC, depois de
confirmar que corresponde ao código e à solução em execução (por exemplo, o limite de 1100 MB por pedido, a única
réplica do _worker_ de vídeo e a forma como as ferramentas de imagem confirmam as mensagens). As vistas do capítulo 9
seguem o mesmo estilo.

#tab([Legenda da vista da arquitetura],
  tabela(
    colunas: (5cm, 1fr),
    [Elemento (cor, forma ou estilo)], [Significado],
    [Seta laranja grossa], [Caminho do vídeo, do carregamento ao resultado.],
    [Seta cinzenta], [Padrão global e caminho das imagens.],
    [Linha azul tracejada], [Acesso à pasta partilhada entre o `projects` e os _workers_.],
    [Caixa laranja-clara], [O `video_tool`, o único _worker_ de vídeo.],
    [Filas dentro da caixa amarela], [Filas do RabbitMQ.],
    [Cilindro], [Base de dados (MongoDB) ou armazenamento de ficheiros (SeaweedFS).],
    [Caixa com título], [Agrupamento lógico (entrada, camada de acesso, serviços de negócio, _workers_).],
  ),
)

== Sequência de um pedido completo

#orientacao[
  Descrevam, passo a passo, o que acontece num pedido completo para um projeto com vídeos: carregamento → definição do
  _pipeline_ → _Apply_ → progresso → resultado. O diagrama de sequência mostra a ordem das interações; a tabela
  identifica, para cada passo, quem fala com quem e através de que mensagem, _endpoint_ ou fila.

  *O que é uma evidência (`EV-nn`).* Uma evidência é a referência *verificável* que sustenta uma afirmação sobre o
  sistema atual. Deve permitir que outra pessoa, no _commit_ de partida, confirme o que afirmam sem ter de adivinhar.
  Pode ser:
  - *código*, com ficheiro e linhas (e.g., `video.py:8-9`);
  - *configuração*, com ficheiro e linha (e.g., `docker-compose.yml`, definição de uma fila ou de um volume);
  - *mensagem* observada (e.g., conteúdo de uma mensagem na fila, resposta de um _endpoint_);
  - *medição* ou *registo de execução*, com o comando usado e o resultado;
  - *documento*, com a secção (e.g., `doc-sol-arquitetural.pdf`, secção 3).

  Regras: o ID é sequencial (`EV-01`, `EV-02`, …), único, e nunca se reutiliza. Como o relatório não tem um registo
  separado, *descrevam a evidência no sítio onde a usam pela primeira vez* (formato: `EV-nn`: localização — o que
  mostra); nas ocorrências seguintes basta o ID. Uma afirmação sem evidência não é um facto: marquem-na como
  *hipótese* (`H-nn`) e indiquem como a confirmar ou refutar.
]

#figure(kind: image,
  ajustar-altura(text(size: 8pt, sequencia-pedido), 19cm),
  caption: [Sequência do processamento em lote de um projeto com vídeos. A partir do passo 2, os pedidos do _browser_
    continuam a passar pelo nginx e pelo API Gateway, mas foram omitidos para simplificar],
)

#tab([Passos do pedido completo],
  tabela(
    colunas: (2cm, 3cm, 1fr, 1fr),
    tamanho: 8.5pt,
    [Passo], [Origem → Destino], [Mensagem / _endpoint_ / fila], [Evidência],
    [Carregamento do vídeo], [Browser → nginx → API Gateway → `projects` → armazenamento],
      [`POST …/video`. O API Gateway recebe o ficheiro inteiro em memória e reenvia-o ao `projects`, que verifica a
      duração e o tamanho permitidos para o perfil do utilizador e guarda o original.],
      [*EV-01*: `apiGateway/routes/projects.js:23, 458-474` — o vídeo é guardado em memória e reenviado.
      *EV-02*: `projects/routes/projects.js:1299-1320, 1391-1394` — rota do vídeo e validação por perfil.],
    [Definição do _pipeline_], [Browser → API Gateway → `projects`],
      [`POST …/tool`, uma vez por efeito; cada efeito fica guardado no projeto com a sua posição e parâmetros.],
      [*EV-03*: `projects/routes/projects.js:1397` — rota que acrescenta um efeito.],
    [_Apply_], [Browser → `projects` → RabbitMQ → `video_tool`],
      [`POST …/process`. O `projects` copia o original para a pasta partilhada e publica uma única mensagem com todos
      os efeitos na `video_queue`; o `video_tool` trata um vídeo de cada vez.],
      [*EV-04*: `projects/routes/projects.js:1521, 1602-1622` — rota do _Apply_ e cópia dos originais.
      *EV-05*: `projects/routes/projects.js:1634-1640` e `projects/utils/project_msg.js:21, 26-39` — uma mensagem com
      o _pipeline_ inteiro. *EV-06*: `Tools/video/video.py:54, 172-173` — um vídeo de cada vez (`prefetch_count=1`).],
    [Progresso], [`video_tool` → RabbitMQ → WS Gateway → Browser],
      [O _worker_ publica a percentagem na `ws_queue` e o WS Gateway envia-a ao utilizador.],
      [*EV-07*: `Tools/video/video.py:112-116` e `wsGateway/index.js:55-66` — o progresso não passa pelo
      `projects`.],
    [Resultado], [`video_tool` → RabbitMQ → `projects` → WS Gateway → Browser],
      [O _worker_ responde na `project_queue` e só então confirma a mensagem; o `projects` guarda o resultado e avisa o
      utilizador, que pede os endereços dos resultados.],
      [*EV-08*: `Tools/video/video.py:76-81, 169-170` — resposta ao `projects` e confirmação só no fim.
      *EV-09*: `projects/utils/project_msg.js:42-51, 96`, `wsGateway/index.js:100` e
      `projects/routes/projects.js:1032` — aviso ao utilizador e endereços dos resultados.],
  ),
)
