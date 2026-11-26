#import "../template.typ": *

#set heading(numbering: "A.1.")
#counter(heading).update(0)

= Instruções de execução

#orientacao[
  Indiquem os passos mínimos para lançar a solução a partir do repositório (pré-requisitos, comandos, projeto de teste) e
  para repetir as medições (antes e depois do _refactoring_) (_scripts_, dados, ambiente). Quem avalia, ou a equipa na fase seguinte, deve
  conseguir repetir o que descrevem sem ajuda. No glossário, definam os termos específicos do projeto ou da disciplina
  usados no relatório.
]

Todos os comandos partem da raiz do repositório
(#link("https://github.com/neptunedev77/picturas-video-casos-de-uso")[`neptunedev77/picturas-video-casos-de-uso`]).

== Pré-requisitos

Docker Engine e Docker Compose v2; Python 3.11 ou superior (para o _autoscaler_, os testes do _autoscaler_ e os
instrumentos de medição); `uv` para criar o ambiente Python das medições. As medições oficiais foram feitas num
portátil com Ubuntu 26.04, i7-13620H e 16 GB, ligado à corrente, em modo de desempenho e sem outras aplicações.

== Lançar a solução

```bash
cd fase2/picturas-27
docker compose up -d --build        # a 1.ª construção descarrega vários GB
```

A aplicação fica em `https://localhost:8080` (certificado autoassinado). Para o vídeo escalar, o _autoscaler_ tem de
estar a correr, a partir da raiz do repositório, com as credenciais do RabbitMQ definidas no `docker-compose.yaml`:

```bash
export RABBIT_USER=user RABBIT_PASS=password
python -B -m fase2.autoscaler.autoscaler --mode scale     # modos: observe (por omissão), scale-out, scale
```

== Testes de preservação funcional

```bash
fase2/tests/run-all.sh                                  # com a stack ligada; tem de acabar em ALL PASSED
python -B -m unittest discover -s fase2/autoscaler/tests  # testes do autoscaler
python -B -m unittest discover -s fase2/tests/elasticity  # topologia das filas e dos pools
```

== Repetir as medições

```bash
cd fase2/bench
uv venv .venv && uv pip install --python .venv/bin/python requests "python-socketio[client]==5.11.4" websocket-client
./data/make-data.sh                          # confirma os dados de teste versionados
./run-measurements.sh baseline 5             # medição inicial (código na tag baseline)
AUTOSCALER=scale ./run-measurements.sh final 5   # medição final, com o autoscaler ligado
python analyze/analyze.py results/final      # escreve results/final/summary.md
```

Cada corrida fica em `fase2/bench/results/<fase>/<cenário>/repN/`; a campanha pode ser interrompida e retomada. Uma
campanha completa demora cerca de 1 h 40 min. Os resultados usados neste relatório estão em
`fase2/bench/results/baseline/` e `fase2/bench/results/final/`.

= Glossário

#tabela(
  colunas: (4cm, 1fr),
  [Termo], [Definição],
  [Confirmação de mensagens (_ack_)], [Aviso ao RabbitMQ de que uma mensagem foi tratada. Se for enviado logo ao
    receber (confirmação automática), a mensagem perde-se quando o _worker_ falha; se só for enviado no fim, o RabbitMQ
    volta a entregá-la.],
  [_Autoscaler_], [Programa que ajusta o número de réplicas de um serviço à carga; aqui, à profundidade das filas de
    vídeo.],
  [_Baseline_ / medição inicial], [Medição feita sobre a solução de base, antes de qualquer alteração, que serve de
    termo de comparação.],
  [Cenário de qualidade (`QS-nn`)], [Descrição verificável de um requisito de qualidade com fonte, estímulo,
    artefacto, ambiente, resposta e medida da resposta.],
  [Consumidor fiável], [Biblioteca comum aos _workers_ (`Tools/utils/reliable_consumer.py`) que confirma as mensagens
    só no fim, mantém o _heartbeat_ e trata o SIGTERM.],
  [DLQ / DLX], [_Dead-letter queue_ e _dead-letter exchange_: destino das mensagens que esgotaram as entregas
    permitidas (`picturas.dlq` e `picturas.dlx`).],
  [Paragem controlada], [Ao receber o sinal de paragem (SIGTERM), o _worker_ deixa de aceitar trabalho e termina o que
    está a fazer antes de sair.],
  [Evidência (`EV-nn`) / hipótese (`H-nn`)], [Referência verificável (código, configuração, medição, documento) que
    sustenta uma afirmação; uma afirmação sem evidência é uma hipótese, com a indicação de como a confirmar.],
  [Fila _quorum_ (replicada)], [Tipo de fila do RabbitMQ persistente e replicada, que permite limitar o número de
    tentativas de cada mensagem.],
  [_Golden output_], [Resultado de referência de um caso de regressão, capturado na base, com o qual se comparam os
    resultados depois das alterações.],
  [Sinais de vida (_heartbeat_)], [Sinal periódico entre o _worker_ e o RabbitMQ; se deixar de chegar, o RabbitMQ
    fecha a ligação e volta a entregar a mensagem.],
  [Idempotência (gravação sem duplicados)], [Propriedade de uma operação que produz o mesmo efeito se for repetida;
    evita resultados duplicados quando uma mensagem é entregue duas vezes.],
  [_Makespan_], [Tempo total de um conjunto de trabalhos, do primeiro pedido ao último resultado.],
  [p95], [Valor abaixo do qual ficam 95 % das medições.],
  [_Pool_], [Conjunto de réplicas do mesmo _worker_ que consomem a mesma fila (normal ou pesado).],
  [RNF], [Requisito não funcional; classificado segundo a ISO/IEC 25010.],
  [_Scale-out_ / _scale-in_], [Acrescentar ou retirar réplicas de um serviço.],
  [Tática (`TAT-nn`)], [Decisão de desenho que melhora um atributo de qualidade (por exemplo, gerir recursos ou
    recuperar de falhas).],
  [_Watchdog_], [Mecanismo do `projects` que dá como falhado um trabalho sem resposta dentro do prazo e avisa o
    utilizador.],
)
