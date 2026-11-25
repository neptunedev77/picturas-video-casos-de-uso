# Registo de utilização de agentes de IA — Fase 2

Registo da utilização de agentes de IA na Fase 2 do PictuRAS, organizado por frente de trabalho.
Cada entrada indica a tarefa, a prompt principal (ou um resumo fiel), o resultado, as verificações
e a intervenção humana. As verificações feitas pelo agente não são apresentadas como testes
executados pela equipa, e os resultados obtidos em ambientes de desenvolvimento são preliminares:
não substituem as medições oficiais na máquina de referência.

Os caminhos de código são relativos a `fase2/picturas-27/`.

---

# Fiabilidade (Sérgio Vieira e Diogo Macedo)

**Papéis.** Sérgio: orientação, condições técnicas, decisões de âmbito, aprovação de cada etapa e
commits manuais. Claude Code (Opus 5.5): análise do código, propostas, implementação, testes e
relatórios. Diogo: revisão do pull request. António: medições oficiais.

**Método.** Para cada decisão do plano do grupo (DA-R1 a DA-R5), o agente apresentou primeiro um
plano, sem alterar código; o Sérgio analisou-o, impôs condições ou rejeitou partes; só depois
houve implementação, testes e um relatório, e só depois do relatório o Sérgio fez o commit.

---

## 2026-11-18 · Fiabilidade · Claude Code (Opus 5.5)

**Tarefa:** DA-R1 — consumidor RabbitMQ fiável (biblioteca, ferramentas de imagem, vídeo).

**Prompt:** Prompt de implementação da Fiabilidade do grupo (problemas medidos na baseline, alvos
R-1…R-5, decisões DA-R1…DA-R5, regras e método). Pedido em três etapas, cada uma com plano prévio,
aprovação e relatório.

**Resultado (agente):**
- `Tools/utils/reliable_consumer.py`: ack manual depois da resposta, `prefetch_count=1`, heartbeat
  de 60 s com o trabalho numa thread separada, reconexão com backoff e SIGTERM gracioso (até 8 s,
  depois devolve o trabalho à fila). 8 testes.
- `Tools/utils/tool_msg.py`: as 15 ferramentas de imagem passam a usar o consumidor sem alterações
  individuais; `read_msg` termina o processo depois do SIGTERM. 3 testes.
- `Tools/video/video.py`: o worker de vídeo passa a usar o consumidor (antes `heartbeat=0`). 5 testes.

**Verificações (agente):** `run-all.sh` com `ALL PASSED` em cada etapa (no fim: `projects` 8/8,
vídeo 90/90, regressão 30/30); SIGTERM em 0,6–0,7 s com código 0; legendagem interrompida devolvida
à fila e concluída. Preliminares `dev`: F1 1/1 (baseline 0/5), F2 1/1, F6 2/2, sem duplicados.

**Limitações:** tempos `dev` não comparáveis com a baseline (`REF-subs` 35,9 s contra 16,5 s); uma
análise do processamento direto, sem RabbitMQ, deu tempos semelhantes (33,8–36,2 s), sem sobrecarga
atribuível ao consumidor, mas a causa fica por confirmar na máquina de referência. `watermark` fora
do âmbito.

**Contributo e validação (Sérgio):**
- Aprovei a divisão em três etapas e as decisões D1–D3 (SIGTERM com 8 s, `prefetch_count=1`,
  testes no contentor de vídeo).
- Defini as regras de trabalho para toda a frente: o agente não faz commits, cada etapa termina
  com relatório, o registo de IA distingue o trabalho do agente do meu.
- Pedi uma revisão guiada do código antes do primeiro commit; na revisão foi encontrado um bloqueio
  do worker quando a publicação falhava, e autorizei a sua correção e a simplificação do código.
- Decidi manter o `rabbit_mq.py` legado sem alterações até a migração estar validada.
- Detetei que um ficheiro de testes tinha ficado com permissões de executável e pedi a correção.
- Ao ver tempos piores do que a baseline, pedi uma análise antes de aceitar o resultado; depois
  decidi não reconstruir a baseline no meu portátil e deixar a comparação para a máquina de
  referência.

---

## 2026-11-18 · Fiabilidade · Claude Code (Opus 5.5)

**Tarefa:** DA-R5 (parte 1) — correção das respostas de erro das ferramentas de imagem.

**Prompt:** Plano para corrigir as respostas de erro, com as decisões E1 (argumentos nomeados),
E2 (identificadores como na resposta de sucesso e `error.msg`) e E3 (registo).

**Resultado (agente):** análise AST das 30 chamadas de erro: 23 chamadas em 12 ferramentas passavam
os argumentos desalinhados e o `ToolMSG` lançava uma exceção em vez de responder. Corrigidas com
`err_code=`, `err_msg=` e `og_img_uri=img_path`; no `tool_msg.py`, identificadores corrigidos e
`error.msg` acrescentado (mantendo `error.message`). Teste AST novo que deteta chamadas desalinhadas.

**Verificações (agente):** `run-all.sh` com `ALL PASSED`; preliminar F5: os 2 erros chegaram ao
cliente em 0,18 s e 0,32 s (R-4 100 %, baseline 50 %); F1 continua a recuperar.

**Limitações:** os erros de imagem passam a ser visíveis na interface (previsto no plano).
`watermark` não alterada.

**Contributo e validação (Sérgio):**
- Exigi que cada uma das 23 chamadas fosse confirmada individualmente, verificando o caminho da
  imagem original, e não uma substituição automática.
- Limitei a correção ao encaminhamento dos erros, sem tocar no processamento das ferramentas.
- Exigi que o teste AST fosse corrido à parte, por ficar ignorado dentro do contentor.

---

## 2026-11-18 · Fiabilidade · Claude Code (Opus 5.5)

**Tarefa:** DA-R2 — ligação longa, mensagens persistentes e confirmações no `projects`.

**Prompt:** Plano para uma ligação reutilizável com reconexão, mensagens persistentes, confirmações
do broker e ack só no fim do handler, com as decisões R2-a a R2-c.

**Resultado (agente):** `projects/utils/rabbit_mq.js` reescrito com a mesma API: ligação longa com
reconexão, publicação persistente num canal de confirmações, fila em memória durante desconexões, ack
depois do handler e de `waitForConfirms()`. 5 testes.

**Verificações (agente):** `run-all.sh` com `ALL PASSED`; preliminares: F3 3/3 (baseline 5/15) e
F4 3/3 (baseline 10/15), sem duplicados.

**Limitações:** a fila em memória perde-se se o `projects` morrer com o RabbitMQ em baixo.

**Contributo e validação (Sérgio):**
- Exigi que o ack depois do handler fosse verificado com os chamadores reais, que não usam `await`,
  antes de manter a API.
- **Não aprovei** a proposta de rejeitar sem requeue as mensagens cujo handler falhava, por poder
  perder mensagens antes de existir DLQ; analisei as duas alternativas apresentadas e escolhi a
  provisória, deixando a política definitiva para a DA-R3.
- Aceitei a fila em memória mas exigi que a limitação ficasse documentada; recusei uma outbox
  persistente por estar fora do plano.

---

## 2026-11-18 · Fiabilidade · Claude Code (Opus 5.5)

**Tarefa:** DA-R3 — dead-letter queue e reentregas limitadas.

**Prompt:** Plano com filas quorum, DLQ e limite de reentregas (decisões R3-a a R3-e), sem
operações destrutivas sem autorização.

**Resultado (agente):** `rabbitMQ/definitions.json` com 17 filas quorum, `picturas.dlx`,
`picturas.dlq` e a policy `work-queues-dead-letter` (`delivery-limit: 5`, `at-least-once`,
`overflow: reject-publish`); consumidores declaram as filas como quorum e fazem requeue limitado
quando o handler falha; `projects/utils/dead_letter.js` avisa o utilizador e só depois confirma a
mensagem; procedimento de migração no `README.md`. Testes atualizados e novos.

**Verificações (agente):** policy validada num RabbitMQ 4.0.5 isolado (6 entregas e depois DLQ);
migração local com todas as verificações a zero; teste de integração com uma mensagem venenosa;
`run-all.sh` com `ALL PASSED` (a 1.ª execução falhou por o modelo `u2net` ter de ser descarregado;
repetida); preliminares F1, F2 e F3 concluídos, sem duplicados.

**Limitações:** a migração tem de ser feita uma vez em cada máquina do grupo; o teste de integração
não cobriu o aviso a um utilizador com processo associado (só testes unitários); `watermark` fora.

**Contributo e validação (Sérgio):**
- Antes de autorizar a migração, exigi a confirmação de que a policy incluía `overflow:
  reject-publish` e de que o procedimento impedia novas publicações.
- **Corrigi a ordem da migração proposta:** parar o `projects` primeiro deixaria trabalhos pendentes
  na `project_queue`; exigi que fosse mantido ativo até as filas esvaziarem.
- Exigi que uma falha das consultas ao MongoDB ou ao RabbitMQ não pudesse ser lida como "zero", e
  que o total de processos pendentes fosse explicitamente zero.
- Autorizei a remoção apenas do volume `picturas_rabbitmq_data`, só no meu ambiente; exigi que a
  migração nas máquinas dos colegas fosse coordenada.
- Exigi que o consumidor da DLQ não descartasse mensagens em silêncio perante falhas transitórias.

---

## 2026-11-19 · Fiabilidade · Claude Code (Opus 5.5)

**Tarefa:** DA-R4 — watchdog no `projects`.

**Prompt:** Plano para marcar como falhados os processos sem resposta dentro de um prazo, avisar o
utilizador e repor as operações reservadas (decisões W1 a W4).

**Resultado (agente):** `projects/utils/watchdog.js`: a cada 10 s, um processo cujo prazo desde o
despacho expirou (imagem 30 s; vídeo máximo(120 s, 1 × duração)) é reportado, as operações são
repostas uma vez com controlo otimista de versão, e o processo é removido; uma falha em qualquer
passo mantém o processo para nova tentativa. Aviso partilhado com a DLQ. Testes novos.

**Verificações (agente):** 19/19 testes; `run-all.sh` com `ALL PASSED`; preliminar F6: lote de imagem
parado reportado aos 38,4 s, legendagem concluída.

**Limitações:** mede o tempo desde o despacho, não a ausência real de progresso; concorrência com a
rota de cancelamento por resolver; a métrica R-4 do F6 dá sempre 0 % (conta só erros até 10 s).

**Contributo e validação (Sérgio):**
- Antes de aprovar o prazo de vídeo, pedi a confirmação de onde está a duração, se existe sempre e se
  o `updatedAt` mudava durante o processamento; como não muda, exigi que ficasse documentado que não
  é uma deteção real de ausência de progresso.
- Exigi testes para três condições: aviso não confirmado, reembolso falhado e dois ciclos seguidos
  sem reembolso duplicado.
- Proibi alterações à rota de cancelamento e ao benchmark, mesmo que isso deixasse o R-4 do F6 em 0 %.

---

## 2026-11-19 · Fiabilidade · Claude Code (Opus 5.5)

**Tarefa:** DA-R5 (parte 2) — idempotência no tratamento das respostas, e revisão técnica de toda a
Fiabilidade.

**Prompt:** Plano para que respostas reentregues não criem sucessores ou resultados duplicados nem
percam trabalho (decisões I1 a I4); depois, revisão técnica das DA-R1 a DA-R5 antes do commit.

**Resultado (agente):**
- `projects/utils/idempotency.js` e `projects/routes/projects.js`: bloqueio em memória por `msg_id`;
  o processo só é removido no fim do tratamento; ids determinísticos para os sucessores; um sucessor
  existente não é recriado nem reenviado; resultados e fotogramas já guardados não são repetidos.
  5 testes, incluindo a mesma resposta entregue duas vezes.
- Revisão técnica: nenhum problema crítico; dois importantes (A e B) e quatro menores. Corrigido o A:
  o watchdog podia expirar um processo cuja resposta estava a ser tratada, gerando erro e sucesso e
  uma reposição indevida; passou a usar o mesmo bloqueio do `process_msg`. 3 testes da corrida.

**Verificações (agente):** `run-all.sh` com `ALL PASSED` antes e depois da correção A (`projects`
35/35, vídeo 90 e 1 ignorado, regressão 30/30); preliminares F4 3/3 e F1 1/1 com R-5 = 0.

**Limitações:** o bloqueio só protege uma instância do `projects`; nas corridas não houve respostas
repetidas, por isso a idempotência está demonstrada pelos testes unitários; não é uma garantia
exactly-once; pré-visualizações fora; ficheiros órfãos possíveis; o problema B (confirmações do
broker nos consumidores Python) fica para um commit separado.

**Contributo e validação (Sérgio):**
- Exigi que o bloqueio em memória não criasse uma janela de perda e que a interação com o ack da
  DA-R2 fosse verificada.
- **Rejeitei o reenvio automático de pedidos** quando o sucessor já existe e exigi distinguir passos
  concluídos, em processamento e pendentes.
- Exigi que a extração de fotogramas fosse avaliada antes de aceitar duplicados nessa funcionalidade.
- **Pedi uma revisão técnica de toda a Fiabilidade antes do último commit**, em vez de fechar a etapa.
  Analisei os problemas encontrados, aprovei a correção do A com condições (mesma chave de bloqueio,
  libertação em exceções, nova verificação no ciclo seguinte, testes da corrida) e decidi tratar o B
  num commit separado.

---

## 2026-11-19 · Fiabilidade · Claude Code (Opus 5.5)

**Tarefa:** Correção do problema B da revisão técnica — confirmações do broker nas respostas
publicadas pelos workers Python.

**Prompt:** Correção mínima e localizada em `Tools/utils/reliable_consumer.py`: ativar
`confirm_delivery()`, avaliar `mandatory=True` face aos destinos atuais, garantir que `NackError`,
`UnroutableError` e falhas de ligação não levam a ack do trabalho, e verificar que a espera pela
confirmação dentro do callback do pika não afeta o heartbeat, a reconexão nem o SIGTERM; sem
mudanças de arquitetura nem novos benchmarks.

**Resultado (agente):** `confirm_delivery()` ativado em cada (re)ligação e `mandatory=True` nas
publicações (os workers só publicam para `project_queue` e `ws_queue`, ambas com binding). Uma
resposta recusada (`NackError`), sem destino (`UnroutableError`) ou perdida por falha de ligação
lança uma exceção já tratada: o trabalho volta à fila sem ack. 3 testes novos em
`test_reliable_consumer.py`.

**Verificações (agente):** 14/14 testes afetados; 15 ferramentas e `video_tool` reconstruídos, com
os 16 consumidores ativos; `run-all.sh` com `ALL PASSED` e código 0 (`projects` 35/35, worker de
vídeo 93 e 1 ignorado, regressão 30/30), com 0 erros de publicação ou de ligação nos logs dos
workers. Sem benchmarks novos.

**Limitações:** a espera pela confirmação dentro do callback foi validada pela regressão com o
RabbitMQ real, não por um cenário de falha do broker (o F3 não foi repetido); cada publicação passa
a esperar a confirmação do broker (custo de milissegundos por mensagem, não medido).

**Contributo e validação (Sérgio):** Autorizei a correção do problema B antes de abrir o PR, com as
condições acima, e aprovei o uso de `confirm_delivery()` e `mandatory=True` depois da verificação
de compatibilidade com as filas de destino atuais, mantendo a correção localizada, sem alterar a
arquitetura nem o tratamento existente das exceções. Revi os resultados apresentados pelo agente
(14/14 testes específicos, reconstrução dos consumidores afetados e `run-all.sh` com `ALL
PASSED`, código 0), executados pelo agente. Reconheço as limitações: validação com o broker real
apenas em condições normais, sem repetir o F3, e impacto das confirmações no desempenho não
medido.

---

## 2026-11-19 · Fiabilidade · Claude (Opus 5.5) · revisão do pull request

**Tarefa:** Revisão do ramo `feat/reliability` antes do pull request para `main`, contra a Prompt 1
e o plano do grupo, e correção dos problemas encontrados num ramo próprio
(`feat/reliability-review`, com PR para `feat/reliability`).

**Prompt:** Analisar o projeto da Fase 2 e verificar se a Fiabilidade cumpre a prompt de
implementação e o plano; depois, corrigir os três problemas de código encontrados, com testes,
sem mexer em `bench/` nem nos golden outputs.

**Resultado (agente):**
- Revisão: as DA-R1 a DA-R5 e as regras da prompt estão cumpridas. Encontrados três problemas no
  `projects` e uma métrica que não mede o alvo.
- `projects/utils/rabbit_mq.js` (commit `5101189`): uma publicação recusada pelo broker (nack) com
  a ligação ativa ficava no buffer até à próxima reconexão e a promise nunca resolvia; passa a ser
  reenviada após 1 s. Uma mensagem cujas publicações não eram confirmadas ficava sem ack nem nack
  num canal aberto (o broker não a reentregava); passa a ser devolvida à fila, limitada pelo
  `delivery-limit`. 3 testes (2 novos, 1 reforçado).
- `projects/utils/refund.js`, `dead_letter.js`, `watchdog.js` (commit `a0ed568`): a DLQ não
  repunha as operações reservadas, ao contrário do watchdog e do cancelamento. O `refundOnce` passa
  para um módulo partilhado e a DLQ usa-o com a mesma ordem (avisar, repor, remover) e o mesmo
  bloqueio por `msg_id`, para os dois nunca atuarem sobre o mesmo processo nem reporem duas vezes.
  4 testes novos.
- Medição: o R-4 do F6 no `analyze.py` conta erros até 10 s, mas o alvo é "prazo do watchdog
  + 10 s". Com a definição do alvo, a baseline dá o mesmo valor (0 %, a imagem nunca é avisada),
  por isso basta acrescentar a métrica à análise, sem medir de novo. Proposta a combinar com o António;
  `bench/` não foi alterado.

**Verificações (agente):** `node --test` do `projects` com 41/41 (35 anteriores e 6 novos); os
testes novos falham com o código anterior; testes do consumidor Python 14/14. Não corrido pelo
agente: `run-all.sh` com a stack (sem Docker no ambiente do agente) nem as falhas F1–F6.

**Limitações:** o F6 passa a dar erro no lote de imagem parado 60 s (prazo de 30 s), que na
baseline acabava com sucesso aos 59,5 s: o utilizador é avisado, mas tem de repetir o pedido.
Fica para a análise do relatório.

**Contributo e validação (Diogo):**
- Pedi a verificação da Fiabilidade contra a Prompt 1 e o plano, e escolhi quais dos problemas
  encontrados corrigir agora e quais ficam como limitações no relatório.
- Decidi fazer as correções num ramo separado, com PR para `feat/reliability`, para não misturar
  com os commits do Sérgio.
- Pedi primeiro uma análise de todo o projeto da Fase 2, sem alterações, e só depois a revisão da
  Fiabilidade contra a Prompt 1 e o plano.
- Das conclusões da revisão, aprovei a correção dos três problemas de código e a atualização deste
  registo; os restantes pontos (prazo do watchdog que inclui a espera na fila, ferramenta de marca
  d'água com o consumidor antigo, 8 s de SIGTERM num vídeo, duplo reembolso com o cancelamento,
  bloqueio só numa instância do `projects`) ficam como limitações no relatório.
- Decidi que a correção da métrica R-4 do F6 é combinada com o António, responsável pelas medições,
  e não feita por nós em `bench/`, para respeitar a regra de não mudar os instrumentos entre a
  baseline e a medição final.
- Corri `tests/run-all.sh` com a stack no meu Mac (Apple Silicon, arm64), primeiro na `main` como
  controlo e depois neste ramo, depois da migração do volume `rabbitmq_data` para filas quorum.
  Na `main`: `projects` 8/8, worker de vídeo 74/74, regressão 19/30. Neste ramo: `projects` 41/41,
  worker de vídeo 93 (1 ignorado), regressão 19/30, com os mesmos 11 casos a falhar nos dois
  (vídeo, `bg_remove_ai`, `upgrade_ai`, `obj_ai`). Estes casos falham por diferenças de bytes entre
  arm64 e a máquina de referência x86 onde os golden outputs foram capturados, e não por
  regressão. A regressão 30/30 tem de ser confirmada na máquina de referência.

---

## Estado

As DA-R1 a DA-R5, a correção B (`25d868b`) e a revisão do Diogo (`5101189`, `a0ed568`) estão na
`main` desde `cbd1290` (merge fast-forward de `feat/reliability-review`). O `AGENTS.md` descreve
as novas regras de mensagens. Falta: a migração do RabbitMQ nas máquinas do grupo, a confirmação
da regressão 30/30 e as medições oficiais (`after-reliability`) na máquina de referência, e
acordar com o António o cálculo do R-4 do F6.

---

# Elasticidade (Rafael Sousa)

**Fonte deste registo.** As prompts originais da frente de Elasticidade não foram guardadas no
repositório. As entradas abaixo foram reconstruídas pelo António (com apoio do Claude) a partir dos
commits do ramo `feat/elasticity-video`, das mensagens da equipa e do documento de validação
`validacao_elasticidade_ubuntu_antonio.md`. O ponto de partida foi a prompt de implementação da
Elasticidade do grupo (`docs/prompts-implementacao.md`, Prompt 2). Os números de testes citados
são os do relatório do agente; os que foram confirmados pela equipa estão assinalados.

---

## 2026-11-19 · Elasticidade · Codex (modelo não registado)

**Tarefa:** DA-E2 e DA-E3 — fila pesada para a legendagem, pools de vídeo separados e limites.

**Prompt:** Prompt 2 do grupo (problemas medidos na baseline, alvos E-1…E-5, decisões DA-E1…DA-E4,
regras para as medições continuarem comparáveis), pedida por etapas.

**Resultado (agente), commits `2941dd4`, `a54e568`, `daee237`, `5f88e7a` (Rafael Sousa):**
- `rabbitMQ/definitions.json`: fila `video_heavy_queue` (quorum), ligação ao exchange e inclusão na
  política de dead-letter `work-queues-dead-letter` (pedido da frente de Fiabilidade).
- `Tools/video/video.py`: a fila consumida passa a vir da variável `VIDEO_QUEUE`.
- `docker-compose.yaml`: serviço `video_heavy_tool` com a mesma imagem e configuração do
  `video_tool`; limites de 2 CPUs e 3 GB por réplica; `stop_grace_period` de 45 s.
- `projects/utils/videoRouting.js` e `project_msg.js`: os vídeos cujo pipeline tem legendagem vão
  para a fila pesada; os restantes para a `video_queue`. Testes em `projects/tests/video-routing.test.js`.
- `fase2/tests/elasticity/`: 15 testes de Compose e topologia.

**Validação:** _a preencher pela equipa (o que foi revisto, testado ou corrigido)._

---

## 2026-11-19 · Elasticidade · Codex (modelo não registado)

**Tarefa:** DA-E1 e DA-E4 — autoscaler: modo de observação, scale-out e scale-in seguros.

**Prompt:** continuação da Prompt 2 do grupo, por blocos (observação, scale-out, scale-in).

**Resultado (agente), commits `7f9c331` (Rafael Sousa), `3a479ce` e `c059ecf` (al81205):**
- `fase2/autoscaler/`: programa Python sem dependências externas que lê a API do RabbitMQ e o
  Docker a cada segundo e aplica a política de `config.json` (pool normal 1–2 réplicas, pool
  pesado 0–2, no máximo 3 réplicas de vídeo; scale-out de 1 réplica com 5 s de cooldown; scale-in
  depois de um período sem trabalho, com 30 s de cooldown).
- Três modos: `observe` (predefinido, não altera nada), `scale-out` e `scale`. O scale-out usa
  `docker compose up --scale`; o scale-in envia SIGTERM a um contentor identificado, espera que
  pare e só depois o remove (sem `--force`), com bloqueio e registo (journal) das operações.
- Diferença em relação ao plano: o autoscaler corre como programa no anfitrião, e não como
  serviço do Docker Compose; só o vídeo escala e tem limites.
- 180 testes automáticos do autoscaler (relatório do agente).

**Verificações (equipa):** a 23/11, na máquina de referência, os 180 testes do autoscaler e os 15
de topologia passaram (António, com o Claude). A validação com Docker real (réplicas criadas e
removidas de verdade) está por fazer.

**Validação:** _a preencher pela equipa._

---

# Medição e qualidade (António Sousa)

**Papéis.** António: decisões de método, condições da máquina de referência, execução das
campanhas, revisão dos resultados, commits manuais. Claude (Opus 5.5, Claude Code na app de
desktop): análise do código, scripts de medição e de testes, análise dos resultados e propostas.
Regra fixada pelo António: o agente não faz commits, push nem merges; prepara as alterações e
dá os comandos.

---

## 2026-11-17 · Medição · Claude Code (Opus 5.5)

**Tarefa:** instrumentos de medição e medição inicial (baseline).

**Prompt (resumo):** a partir do plano da Fase 2, explicar como fazer a medição inicial no Ubuntu
de referência, escrever os instrumentos necessários e guardar os resultados.

**Resultado (agente):** `fase2/bench/` (gerador de carga pela API pública, amostragem do RabbitMQ
e do Docker, cenários S1–S3 e falhas F1–F6, referências sem carga, script da campanha e análise
das métricas E-1…E-5 e R-1…R-5); dados de teste fixos; medição de 5 repetições por cenário; medição
do tempo de arranque de uma réplica de vídeo (4,8 s), origem do alvo do E-3.

**Contributo e validação (António):**
- Preparei a máquina de referência (cluster de outro projeto parado, corrente, modo de desempenho,
  sem suspensão) e corri a campanha.
- Na revisão dos resultados ficou claro que o F1, o F4 e o F6 injetavam a falha depois de os
  trabalhos acabarem; esses resultados foram postos de lado (`results/baseline/_discarded-v1/`) e
  os cenários repetidos com a falha a apanhar trabalho em curso.
- Aceitei fixar os alvos propostos com origem identificada e redefinir o E-2 e o E-5.

---

## 2026-11-17 · Medição · Claude Code (Opus 5.5)

**Tarefa:** suite de regressão, golden outputs e prompts de implementação para as duas frentes.

**Resultado (agente):** `fase2/tests/regression/` (30 casos pela API com golden outputs
capturados duas vezes na base), `fase2/tests/run-all.sh` (testes unitários existentes + regressão,
`ALL PASSED` na base); dados de teste versionados; revisão das prompts de implementação.

**Contributo e validação (António):** confirmei com um clone limpo que a regressão passava 30/30;
corrigi o processo de trabalho com o agente depois de ele ter feito commits e merges sem eu pedir
(regra: os commits passam a ser meus).

---

## 2026-11-23 · Medição · Claude Code (Opus 5.5)

**Tarefa:** revisão da implementação das duas frentes antes da medição final e correções.

**Prompt (resumo):** reler o plano, as mensagens da equipa e o enunciado, analisar o código novo,
dar parecer e dizer se está tudo pronto para a medição final; depois implementar as correções,
de forma simples de explicar.

**Resultado (agente):**
- Parecer (PDF `analise-antes-medicao-final.pdf`): Fiabilidade conforme o plano; Elasticidade
  sólida mas diferente do plano (autoscaler fora do Compose, só vídeo); cinco problemas que
  afetavam a medição final.
- `bench/analyze/analyze.py`: cálculo do E-3 (tempo de scale-out) e do E-4 (tempo de scale-in) por
  fila de vídeo; R-4 do F6 com o limite do plano (prazo do watchdog + 10 s = 50 s, contando o
  intervalo de 10 s entre verificações). Os 50 valores anteriores da baseline ficam iguais.
- `bench/run-measurements.sh`: com `AUTOSCALER=scale`, liga o autoscaler durante a campanha,
  guarda as decisões, espera pelo estado de repouso antes de cada repetição e não volta a ligar
  réplicas desligadas pelo scale-in; `REF-f4mix` passa a fazer parte da campanha.
- `fase2/autoscaler/config.json`: período sem trabalho antes do scale-in de 60 s para 40 s (com 60 s
  o alvo do E-4, ≤ 60 s, era impossível); testes do scale-in passam a fixar os seus próprios 60 s.

**Verificações (agente):** analyze reaplicado à baseline sem mudar valores; cálculos novos testados
com dados simulados; arranque e paragem do autoscaler a partir do script; 180 testes do
autoscaler e 15 de topologia a passar.

**Contributo e validação (António):** pedi explicações acessíveis e correções simples de
apresentar; decidi assumir as correções finais, as medições e o relatório. _Completar com o que
foi revisto e testado._
