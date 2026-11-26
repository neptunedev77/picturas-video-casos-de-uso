#import "../template.typ": *

= Padrões Arquiteturais Atuais

#orientacao[
  *Origem:* Exercício 6, Bloco 1, secções 2.1 a 2.3 do _template_.

  *Objetivo do capítulo:* identificar o estilo (ou a combinação de estilos) arquitetural que organiza o PictuRAS como um
  todo, o padrão que o processamento de vídeo segue, e como os dois se relacionam. O padrão global é o *ponto de
  partida*: define o contexto e as restrições a que qualquer alternativa terá de responder (capítulo 4).

  *Rigor:* factos citam uma evidência (`EV-nn`, ver a explicação na secção 2.4); o que não tem evidência é uma hipótese
  (`H-nn`). Nunca reutilizem um ID eliminado. Benefícios e desafios classificam-se segundo a ISO/IEC 25010
  (característica e, quando aplicável, subcaracterística).
]

== Padrão global da solução

#orientacao[
  Nomeiem o estilo ou os estilos (e.g., microserviços, orientado a eventos, filas de mensagens) e descrevam-no em poucas
  linhas, com as vossas palavras. Depois, indiquem as *decisões globais* que condicionam o vídeo (e.g., comunicação
  assíncrona por filas, armazenamento partilhado) e o efeito que têm. Fechem com os benefícios e desafios do padrão,
  cada um ligado a um atributo de qualidade.
]

#tabela-campos(
  [Nome(s) do padrão / estilo], [Microsserviços que comunicam por filas de mensagens (RabbitMQ), com um orquestrador
    central (o serviço `projects`) e uma entrada única (nginx e API Gateway).],
  [Descrição], [Cada responsabilidade (utilizadores, subscrições, projetos, armazenamento, cada ferramenta de imagem e
    o vídeo) corre no seu próprio contentor, lançado com Docker Compose. Os pedidos do utilizador entram pelo nginx e
    pelo API Gateway. O processamento é assíncrono: o `projects` coloca os trabalhos nas filas das ferramentas, recebe
    as respostas e decide o passo seguinte; as notificações para a interface seguem por outra fila até ao WS Gateway.],
)

#tab([Decisões globais que condicionam o vídeo],
  tabela(
    colunas: (4.2cm, 4.6cm, 1fr),
    tamanho: 8.5pt,
    [Decisão global], [Evidência], [Efeito no vídeo],
    [Entrada única por HTTPS, com um limite de 1100 MB por pedido; o API Gateway guarda o ficheiro em memória],
      [*EV-14*: `nginx/nginx.conf:13, 24-114` — entrada única e limite de tamanho; EV-01],
      [Um vídeo de 1 GB passa inteiro pela memória de vários serviços antes de ser guardado.],
    [Comunicação assíncrona por filas, sem configuração para mensagens que falham],
      [*EV-10*: `rabbitMQ/definitions.json` — 20 filas sem fila de mensagens falhadas (DLQ) nem limite de entregas],
      [Uma mensagem de vídeo que falha sempre não tem para onde ir.],
    [O `projects` publica cada mensagem numa ligação nova, sem a tornar persistente nem esperar confirmação],
      [*EV-16*: `projects/utils/rabbit_mq.js:11-29` — uma ligação por mensagem, fechada ao fim de 500 ms, sem
      persistência],
      [Uma mensagem em trânsito perde-se se o RabbitMQ reiniciar.],
    [Orquestração centralizada: o `projects` guarda o estado de cada execução e decide o passo seguinte],
      [*EV-13*: `projects/routes/projects.js` (2732 linhas), em particular `:245-254`; *EV-18*:
      `projects/models/process.js:3-15` — um processo não tem estado nem prazo],
      [Se o _worker_ desaparecer, o vídeo fica "em processamento" para sempre.],
    [Armazenamento partilhado: SeaweedFS e uma pasta comum ao `projects` e aos _workers_],
      [*EV-12*: `docker-compose.yaml:151, 240, 272` (e restantes ferramentas) — volume partilhado],
      [As mensagens só levam o caminho do ficheiro, mas o original tem de ser copiado antes de o trabalho ser enviado
      (EV-04).],
    [Implantação com Docker Compose: um contentor fixo por serviço, sem limites de CPU nem de memória],
      [*EV-11*: `docker-compose.yaml:256-273` — um único `video_tool`, sem limites],
      [Há um único _worker_ de vídeo, e uma legendagem pode ocupar toda a CPU da máquina.],
  ),
)

#tab([Benefícios e desafios do padrão global],
  tabela(
    colunas: (1.7cm, 1fr, 3.6cm, 3.8cm),
    tamanho: 8.5pt,
    [Tipo], [Descrição], [Característica / subcaracterística (ISO/IEC 25010)], [Facto / hipótese],
    [Benefício], [Quem pede e quem processa ficam desacoplados: o pedido é aceite de imediato e o trabalho espera na
      fila se a ferramenta estiver ocupada.],
      [Compatibilidade (coexistência); Fiabilidade (disponibilidade)], [EV-05, EV-10],
    [Benefício], [Cada ferramenta é um contentor independente, que pode ter mais réplicas sem mudar o código: uma
      segunda réplica de vídeo começa a trabalhar em 4,8 s.],
      [Eficiência de desempenho (capacidade); Manutenibilidade (modularidade)],
      [*EV-19*: `bench/results/baseline/E3-replica-startup.txt` — mediana de 3 medições],
    [Benefício], [Uma única entrada com TLS esconde os serviços internos.], [Segurança (confidencialidade)], [EV-14],
    [Desafio], [O número de réplicas é fixo e não acompanha a carga; todos os serviços estão sempre ligados (3 258 MB
      de memória sem carga).],
      [Eficiência de desempenho (capacidade, utilização de recursos)],
      [EV-11; *EV-22*: `bench/results/baseline/summary.md`, métricas E-1 a E-5],
    [Desafio], [As ferramentas de imagem confirmam a mensagem assim que a recebem, e o `projects` publica sem
      persistência: uma falha a meio perde o trabalho.],
      [Fiabilidade (tolerância a falhas, recuperabilidade)],
      [*EV-15*: `Tools/utils/rabbit_mq.py:36-41` — confirmação automática (`auto_ack`); EV-16],
    [Desafio], [Os erros das ferramentas de imagem nunca chegam ao utilizador, porque a resposta de erro troca os
      identificadores e o `projects` não encontra o trabalho.],
      [Fiabilidade (tolerância a falhas); Usabilidade (proteção contra erros do utilizador)],
      [*EV-17*: `Tools/utils/tool_msg.py:61-67` — identificadores trocados em relação à resposta de sucesso
      (`:46-49`)],
    [Desafio], [O orquestrador concentra a lógica de todos os fluxos num ficheiro de 2732 linhas.],
      [Manutenibilidade (modularidade, analisabilidade)], [EV-13],
  ),
)

== Padrão do processamento de vídeo

#orientacao[
  Identifiquem o padrão que organiza o processamento de vídeo (que pode coincidir com o global ou ser diferente) e
  contrastem-no com o caminho de imagens. Se o padrão do vídeo for diferente do global, expliquem porquê e que custos
  isso traz. Indiquem benefícios e desafios, com o mesmo critério da secção anterior.
]

#tabela-campos(
  [Nome do padrão], [_Worker_ único sobre uma fila (_Competing Consumers_ com um só consumidor), que recebe o
    _pipeline_ completo numa só mensagem (_Pipes and Filters_ dentro do próprio _worker_).],
  [Descrição], [O `projects` envia uma mensagem por vídeo com a lista de efeitos. O único `video_tool` trata um vídeo
    de cada vez: lê o vídeo uma vez, aplica todos os efeitos a cada imagem do vídeo e grava o resultado uma vez. A
    legendagem (com o modelo Whisper, em CPU) é feita dentro do mesmo processo. O progresso segue diretamente para a
    interface, e a mensagem só é confirmada no fim.],
  [Contraste com o caminho de imagens], [Nas imagens, é o `projects` que conduz o _pipeline_: envia uma mensagem por
    ferramenta, cada ferramenta tem a sua fila e o seu contentor, e cada resposta desencadeia o passo seguinte (EV-13).
    No vídeo, o `projects` só vê o início e o fim; todo o _pipeline_ corre dentro do _worker_.],
)

#tab([Benefícios e desafios do padrão do vídeo],
  tabela(
    colunas: (1.7cm, 1fr, 3.6cm, 3.8cm),
    tamanho: 8.5pt,
    [Tipo], [Descrição], [Característica / subcaracterística (ISO/IEC 25010)], [Facto / hipótese],
    [Benefício], [O vídeo é lido e gravado uma única vez, seja qual for o número de efeitos, sem ficheiros intermédios
      nem perda de qualidade entre passos.],
      [Eficiência de desempenho (comportamento temporal, utilização de recursos)],
      [*EV-20*: `Tools/video/video_processor.py:1-5, 167-185` — uma leitura, os efeitos por imagem e uma gravação],
    [Benefício], [Como a mensagem só é confirmada no fim, um vídeo interrompido por uma falha do _worker_ volta a ser
      entregue e é refeito (na base, no F2, os 5 vídeos terminaram, com mais 26 s).],
      [Fiabilidade (recuperabilidade)],
      [EV-08; *EV-23*: `bench/results/baseline/summary.md`, métricas R-1 a R-5],
    [Benefício], [O utilizador vê o progresso em percentagem.], [Usabilidade (operabilidade)], [EV-07],
    [Desafio], [Uma legendagem ocupa o único _worker_ e todos os outros vídeos esperam, por mais curtos que sejam: na
      base, um corte de 0,8 s esperava 12,3 s.],
      [Eficiência de desempenho (comportamento temporal, capacidade)], [EV-06, EV-11, EV-22],
    [Desafio], [O _worker_ não envia sinais de vida ao RabbitMQ (_heartbeat_ desligado): se ficar parado, ninguém dá
      por isso e o utilizador não é avisado (no F6, 60 s parado sem qualquer aviso).],
      [Fiabilidade (tolerância a falhas)],
      [*EV-21*: `Tools/video/video.py:57-64` — `heartbeat=0`; EV-23],
    [Desafio], [Trabalhos pesados (legendagem) e leves (cortes) partilham a mesma fila e o mesmo _worker_.],
      [Eficiência de desempenho (comportamento temporal)], [EV-05, EV-06],
  ),
)

== Relação entre o padrão global e o padrão do vídeo

#orientacao[
  Esta secção responde a: em que pontos o vídeo *segue* o padrão global, em que pontos se *afasta* dele e com que
  consequências? Cada linha da tabela é um aspeto concreto (e.g., comunicação entre serviços, gestão de estado,
  tratamento de falhas, armazenamento). É aqui que costumam surgir as fragilidades que alimentam os cenários de
  qualidade do capítulo 5, por isso escrevam as consequências com cuidado e com evidência.

  Terminem com um parágrafo de síntese: o que o vídeo herda do padrão global, que restrições este lhe impõe e que
  fragilidades resultam do desvio.
]

#tab([Relação entre o padrão global e o padrão do vídeo],
  tabela(
    colunas: (2.2cm, 2.9cm, 2.6cm, 1.6cm, 1fr, 2.2cm),
    tamanho: 8pt,
    [Aspeto], [O que o padrão global prescreve], [O que o vídeo faz], [Segue / afasta-se], [Consequência], [Evidência],
    [Comunicação entre serviços], [Assíncrona, por filas], [Recebe na `video_queue` e responde na
      `project_queue`], [Segue], [Herda o desacoplamento, mas também a falta de proteção para mensagens que falham ou
      se perdem.], [EV-05, EV-10, EV-16],
    [Granularidade das mensagens], [Uma mensagem por ficheiro e por ferramenta], [Uma mensagem com o _pipeline_
      inteiro], [Afasta-se], [Menos leituras e gravações do vídeo, mas um trabalho pesado ocupa o _worker_ do início ao
      fim e o `projects` não vê os passos intermédios.], [EV-05, EV-13, EV-20],
    [Confirmação de mensagens], [Confirmação automática ao receber (imagens)], [Confirmação só no fim], [Afasta-se],
      [O vídeo recupera de uma falha do _worker_; as imagens não.], [EV-08, EV-15, EV-23],
    [Progresso], [As notificações partem do `projects`], [O _worker_ envia o progresso diretamente], [Afasta-se],
      [Progresso mais detalhado, mas uma segunda origem de notificações.], [EV-07],
    [Capacidade], [Um contentor fixo por serviço, sem limites], [Um único `video_tool`, um vídeo de cada vez],
      [Segue], [Os vídeos curtos ficam presos atrás dos longos e não há forma automática de aumentar a capacidade.],
      [EV-06, EV-11, EV-22],
    [Estado e falhas], [Trabalhos sem estado nem prazo], [Igual], [Segue], [Um vídeo perdido ou parado fica
      pendurado sem aviso.], [EV-18, EV-21, EV-23],
    [Armazenamento], [SeaweedFS e pasta partilhada], [Lê e grava na pasta partilhada], [Segue], [Mensagens pequenas,
      mas o original tem de ser copiado antes de o trabalho ser enviado.], [EV-04, EV-12],
  ),
)

O vídeo herda do padrão global a comunicação por filas, o armazenamento partilhado e a implantação em contentores,
e com isso herda também as suas fragilidades: uma réplica fixa sem limites, filas sem proteção para mensagens que
falham, publicações que se podem perder e trabalhos sem prazo. O seu próprio padrão, um _worker_ único que executa o
_pipeline_ completo, é eficiente para um vídeo isolado e até recupera melhor de falhas do que as imagens, mas faz com
que qualquer trabalho pesado bloqueie todos os outros vídeos. Daqui resultam as duas fragilidades que tratamos neste
trabalho: a falta de *elasticidade* (capacidade fixa e bloqueio por trabalhos pesados) e a falta de *fiabilidade*
(trabalhos perdidos ou pendurados sem aviso).
