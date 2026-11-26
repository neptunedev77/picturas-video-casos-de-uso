#import "../template.typ": *

// Capítulo inteiro na horizontal (tabelas largas). Para voltar ao vertical, retirar o #paisagem[ ].
#paisagem[
= Cenários de Entrada e Táticas Candidatas

#orientacao[
  *Origem:* Exercício 7, secções 1 e 2 do _template_.

  *Objetivo do capítulo:* partir dos dois cenários já caracterizados e identificar as táticas arquiteturais que os podem
  melhorar. Os cenários vêm do capítulo 5 e os candidatos do capítulo 6 (`QS-nn`, `CAND-n`) e *não são reescritos*: o
  capítulo 5 é o único sítio onde os cenários se caracterizam. Se tiverem de corrigir uma medida da resposta, corrijam-na
  no capítulo 5 e registem a alteração na secção 7.2.

  Nas tabelas seguintes, `QS-01` e `QS-02` designam os cenários de `CAND-1` e `CAND-2`: substituam-nos pelos IDs reais.
]

== Candidatos e cenários de entrada

#tab([Candidatos e cenários de entrada],
  tabela(
    colunas: (1.8cm, 2.2cm, 3cm, 1.8cm, 2.8cm, 3cm, 3.4cm, 3.4cm),
    tamanho: 8pt,
    [Candidato], [Cenário (`QS-nn`)], [Característica / subcaracterística (ISO/IEC 25010)], [Evidência], [Origem (padrão global / vídeo / interação)], [Estímulo a que a tática reage], [Resposta e medida (resumo)], [Escala e método (cap. 6)],
    [CAND-1 · Elasticidade], [QS-01 (principal); QS-02],
      [Eficiência de desempenho: comportamento temporal, capacidade, utilização de recursos],
      [EV-06, EV-11, EV-19, EV-22], [Interação (_worker_ único do vídeo e capacidade fixa do padrão global)],
      [Um corte chega enquanto o único _worker_ está a legendar; uma rajada enche a fila],
      [O corte começa sem esperar; as réplicas aumentam com a fila e diminuem sem carga],
      [E-1 a E-5, cenários S1–S3, 5 repetições (@tab-quant-e)],
    [CAND-2 · Fiabilidade], [QS-03 (principal); QS-04],
      [Fiabilidade: tolerância a falhas, recuperabilidade],
      [EV-10, EV-15, EV-16, EV-17, EV-18, EV-21, EV-23], [Sobretudo o padrão global],
      [Um componente falha a meio de um lote; uma ferramenta dá erro ou fica parada],
      [Os trabalhos terminam com sucesso ou com o erro comunicado, sem duplicados],
      [R-1 a R-5, falhas F1–F6, 5 repetições (@tab-quant-r)],
  ),
)

== Alterações feitas ao capítulo 5 (se existirem)

#tab([Alterações aos cenários],
  tabela(
    colunas: (2cm, 1fr, 4cm),
    [Cenário], [O que mudou e porquê], [Onde foi atualizado],
    [QS-02], [A medida principal deixou de ser o tempo total da rajada e passou a ser a espera p95 dos vídeos. A medição
      inicial mostrou que o tempo total depende sobretudo de quando os pedidos são feitos (nunca desce muito abaixo de
      31,5 s) e não da espera que o utilizador sente. O tempo total ficou como medida secundária, e as imagens por
      minuto (E-5) como um efeito que não deve piorar.],
      [Capítulo 5 (QS-02) e capítulo 6 (E-2 e E-5)],
    [QS-04], [O plano fixou o alvo do R-4 para o F6 como «prazo do _watchdog_ + 10 s». Como o _watchdog_ só verifica os
      prazos de 10 em 10 s, um trabalho de imagem com prazo de 30 s pode ser detetado até 40 s depois de enviado; somando
      os 10 s do plano, o limite usado é 50 s (30 + 10 + 10). Esta forma de calcular foi acrescentada aos _scripts_
      depois da medição inicial e aplicada também à base, onde dá 0 %.],
      [Capítulo 6 (R-4) e `fase2/bench/README.md`],
  ),
)

== Táticas candidatas

#orientacao[
  Identifiquem *pelo menos três táticas por cenário*, de categorias de atributo adequadas (e.g., Desempenho → gerir
  recursos; Disponibilidade → recuperar de falhas). Para cada tática, expliquem como produz a resposta pretendida
  (estímulo → tática → resposta) e se já existe, total ou parcialmente, na base (com evidência).

  Classifiquem cada tática: *A* = _refactoring_ puro; *B* = alteração visível que é o objeto da melhoria; *C* =
  funcionalidade nova, a *rejeitar* nesta fase. Táticas de classe C podem constar da lista, mas não podem ser escolhidas.
]

#tab([Táticas candidatas],
  tabela(
    colunas: (1.6cm, 1.8cm, 3.6cm, 3.4cm, 5cm, 3.4cm, 1.8cm),
    tamanho: 8pt,
    [ID], [Cenário], [Atributo → categoria], [Tática], [Como produz a resposta (estímulo → tática → resposta)], [Já existe na base? (evidência)], [Classe (A/B/C)],
    [TAT-01], [QS-01, QS-02], [Desempenho → gerir recursos (várias cópias do mesmo serviço)],
      [Ajustar o número de réplicas ao tamanho da fila (_autoscaler_)],
      [A fila de vídeo cresce → o _autoscaler_ cria uma réplica → o trabalho seguinte é tratado pela réplica nova;
      quando deixa de haver trabalho, a réplica é retirada.],
      [Parcial — é possível acrescentar réplicas à mão (EV-19), mas nada o faz automaticamente (EV-11)], [A],
    [TAT-02], [QS-01], [Desempenho → gerir recursos (separar o trabalho por tipo)],
      [Fila e _pool_ próprios para os vídeos com legendagem],
      [Chega um corte enquanto outro vídeo é legendado → o `projects` envia cada um para a sua fila → o corte não
      espera pela legendagem.], [Não — uma só fila para todos os vídeos (EV-05, EV-06)], [A],
    [TAT-03], [QS-02], [Desempenho → gerir recursos (limitar recursos)],
      [Limites de CPU e memória por réplica e um número máximo de réplicas],
      [Uma rajada pede mais réplicas → o _autoscaler_ só as cria até ao máximo, cada uma com recursos limitados → as
      réplicas não se prejudicam umas às outras nem esgotam a máquina.], [Não — nenhum serviço tem limites (EV-11)],
      [A],
    [TAT-04], [QS-01], [Desempenho → controlar a procura (definir prioridades)],
      [Fila com prioridades para os cortes curtos], [Chega um corte → passa à frente da legendagem que ainda espera →
      mas, se a legendagem já está a ser feita pelo único _worker_, o corte espera na mesma. *Posta de parte*
      (capítulo 4).], [Não (EV-10)], [A],
    [TAT-05], [QS-01], [Desempenho → gerir recursos (aumentar recursos)],
      [Dar mais CPU (ou uma GPU) ao único _worker_], [A legendagem fica mais rápida e o corte espera menos, mas continua
      a esperar; não há elasticidade, e a máquina não tem uma GPU utilizável. *Posta de parte*.],
      [Não — sem limites, o _worker_ já pode usar toda a CPU (EV-11)], [A],
    [TAT-06], [QS-01], [Usabilidade → informar o utilizador],
      [Mostrar a posição na fila e uma estimativa de espera], [O utilizador sabe quanto vai esperar, mas a espera é a
      mesma. *Rejeitada*: é uma funcionalidade nova.], [Não], [C],
    [TAT-07], [QS-03], [Disponibilidade → recuperar de falhas (nova tentativa)],
      [Confirmar a mensagem só no fim do trabalho], [Uma ferramenta falha a meio → como a mensagem não foi
      confirmada, o RabbitMQ volta a entregá-la → o trabalho é refeito e termina.],
      [Parcial — o vídeo já confirma no fim (EV-08), as imagens não (EV-15)], [A],
    [TAT-08], [QS-03], [Disponibilidade → prevenir falhas (persistência e redundância)],
      [Mensagens persistentes, confirmadas pelo RabbitMQ, e filas replicadas (_quorum_)], [O RabbitMQ reinicia com
      mensagens em trânsito → as mensagens persistentes sobrevivem → o `projects` só dá o envio por feito quando o
      RabbitMQ confirma → nada se perde.], [Não — envios sem persistência nem confirmação (EV-16); filas simples
      (EV-10)], [A],
    [TAT-09], [QS-03, QS-04], [Disponibilidade → recuperar de falhas (tratar exceções)],
      [Limite de tentativas e fila de mensagens falhadas (DLQ)], [Uma mensagem falha sempre → depois de algumas
      tentativas vai para a DLQ → o `projects` marca o trabalho como falhado e avisa o utilizador.],
      [Não — sem DLQ nem limite (EV-10)], [B],
    [TAT-10], [QS-03, QS-04], [Disponibilidade → detetar falhas (prazos e sinais de vida)],
      [Prazos no `projects` (_watchdog_) e sinais de vida (_heartbeat_) entre os _workers_ e o RabbitMQ], [Um _worker_
      morre ou fica parado → o RabbitMQ deixa de receber sinais de vida e volta a entregar a mensagem; se não houver
      resposta dentro do prazo, o `projects` marca o trabalho como falhado e avisa o utilizador.],
      [Não — trabalhos sem prazo (EV-18) e sinais de vida desligados no vídeo (EV-21)], [B],
    [TAT-11], [QS-03], [Disponibilidade → prevenir falhas (operações repetíveis sem efeitos duplicados)],
      [Gravar os resultados sem duplicados (idempotência)], [Uma resposta chega duas vezes → a segunda é reconhecida
      como repetida → o resultado não é gravado de novo.], [Parcial — já existe um identificador por execução
      (*EV-26*: `projects/routes/projects.js:441-460`), mas as respostas repetidas não são reconhecidas], [A],
    [TAT-12], [QS-03, QS-02], [Disponibilidade → prevenir falhas (paragem controlada)],
      [Ao receber o sinal de paragem (SIGTERM), o _worker_ termina o trabalho em curso antes de sair],
      [O _autoscaler_ retira uma réplica → o _worker_ acaba o que está a fazer e só depois para → nenhum trabalho se
      perde.], [Não — nenhum _worker_ trata o sinal de paragem (*EV-25*: `Tools/video/video.py`,
      `Tools/utils/rabbit_mq.py` e `docker-compose.yaml`)], [A],
    [TAT-13], [QS-04], [Disponibilidade → recuperar de falhas (tratar exceções)],
      [Corrigir as respostas de erro das ferramentas de imagem], [Uma ferramenta falha → a resposta de erro leva o
      identificador certo → o `projects` encontra o trabalho e avisa o utilizador.], [Não — identificadores trocados
      (EV-17)], [B],
    [TAT-14], [QS-03], [Usabilidade → apoiar o utilizador],
      [Botão «tentar de novo» para trabalhos que falharam], [O trabalho falha → o utilizador repete-o com um clique.
      *Rejeitada*: é uma funcionalidade nova e não evita a perda.], [Não], [C],
  ),
)
]
