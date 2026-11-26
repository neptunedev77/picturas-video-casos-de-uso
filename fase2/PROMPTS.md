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

# Elasticidade (Bruno Sousa e Bruno Vale)

Em 25/11, este registo foi complementado com resumos fiéis das prompts disponíveis na conversa
com o Codex, incluindo o anexo da implementação do Bloco 6, as revisões dos Blocos 6 e 7 e os
pedidos explícitos de commit e push. O complemento identifica as decisões do utilizador e os
resultados do agente; não é uma exportação integral da conversa nem uma nova execução dos testes.
As entradas iniciais e as verificações atribuídas aos colegas foram preservadas.

**Papéis no complemento.** Utilizador (autor Git dos commits dos Blocos 6 e 7: `al81205`):
instruções, condições de segurança, limites de âmbito, pedidos de revisão e autorização explícita
para commit e push. Codex (modelo não registado): análise, implementação, correções, testes
automáticos e operações Git autorizadas. António: responsável designado para Docker real no
Ubuntu e benchmarks S1–S3. As prompts anteriores aos blocos disponíveis nesta conversa continuam
identificadas pelo registo reconstruído, sem inventar o seu texto original.

**Complemento dos Blocos 1–5 (25/11).** Os resumos seguintes completam as entradas iniciais com
os detalhes fornecidos por Bruno Sousa, confrontados com os commits de 19/11 e os ficheiros atuais
do repositório. As verificações são os resultados reportados desse
trabalho, sem nova execução nesta edição documental. A continuação de Bruno Vale, identificado
no histórico como `al81205`, mantém-se nas entradas posteriores.

---

## 2026-11-19 · Elasticidade · Codex (modelo não registado) · Bruno Sousa

**Tarefa:** Blocos 1–5 da implementação da Elasticidade: separação dos trabalhos de vídeo e autoscaler em observação.

**Prompt:** Prompt 2 do grupo (problemas medidos na baseline, alvos E-1…E-5, decisões DA-E1…DA-E4,
regras para as medições continuarem comparáveis), pedida por etapas.

### Bloco 1 — topologia da fila pesada

**Prompt (resumo):** acrescentar uma fila para trabalhos pesados de vídeo, preservando as
garantias de Fiabilidade das filas existentes.

**Resultado (agente), commit `2941dd4`:** criada `video_heavy_queue`, durable e quorum, com binding
no exchange `picturas` e routing key `video_heavy_queue`. A policy `work-queues-dead-letter`
passou a abrangê-la (pedido da frente de Fiabilidade), mantendo `delivery-limit: 5`,
`dead-letter-exchange: picturas.dlx`, `dead-letter-strategy: at-least-once` e
`overflow: reject-publish`.

**Ficheiros:** `rabbitMQ/definitions.json` e `fase2/tests/elasticity/test_topology.py` (este último
relativo à raiz do repositório).

**Verificações reportadas:** 8 testes aprovados; `docker compose config --quiet` e
`git diff --check` sem erros; RabbitMQ healthy, sem `PRECONDITION_FAILED`.

### Bloco 2 — worker de vídeo configurável

**Prompt (resumo):** permitir que o mesmo worker consuma a fila normal ou a pesada por
configuração, sem alterar o contrato das mensagens nem o consumidor fiável.

**Resultado (agente), commit `a54e568`:** leitura de `VIDEO_QUEUE`, com `video_queue` como valor
predefinido e possibilidade de consumir `video_heavy_queue`; o log identifica a fila selecionada.
Mantidos `procedure: "video"` e o `ReliableConsumer` sem alterações.

**Ficheiros:** `Tools/video/video.py` e `Tools/video/tests/test_video_worker.py`.

**Verificações reportadas:** 33 testes aprovados, com cobertura de ack manual, confirmações,
requeue e shutdown; `git diff --check` sem erros.

### Bloco 3 — dois pools de workers

**Prompt (resumo):** separar os consumidores em dois pools escaláveis, com limites de recursos
por réplica e encerramento compatível com a Fiabilidade.

**Resultado (agente), commit `daee237`:** `video_tool` consome `video_queue` e o novo
`video_heavy_tool` consome `video_heavy_queue`. Partilham imagem, código, volumes e dependências,
com `restart: on-failure`, sem portas adicionais nem `container_name` fixo. Cada réplica ficou
limitada a 2 CPUs e 3 GiB de RAM, com `WORKER_SHUTDOWN_GRACE_S = 8` e `stop_grace_period: 45s`.

**Decisão de recursos:** 2 CPUs coerentes com os dois threads do Whisper; face ao pico observado
de cerca de 1918 MiB, 3 GiB dão aproximadamente 60 % de margem. O Docker local dispunha de cerca
de 7,58 GiB, abaixo dos 16 GB da máquina de referência; estes dados não substituem as medições
oficiais. Os 2 CPUs são o valor deste bloco; a alteração posterior para 4 consta de `8ae172a`
(23/11, António Sousa).

**Ficheiros:** `docker-compose.yaml` e `fase2/tests/elasticity/test_compose.py` (este último
relativo à raiz do repositório).

**Verificações reportadas:** ambos os contentores Up, com um consumidor por fila; 15 testes de
Compose/topologia e 107 de vídeo/Fiabilidade aprovados; `docker compose config --quiet` e
`git diff --check` sem erros.

### Bloco 4 — routing normal/heavy

**Prompt (resumo):** encaminhar as pipelines com legendagem para a fila pesada, tanto na
pré-visualização como no processamento completo, preservando as mensagens existentes.

**Resultado (agente), commit `5f88e7a`:** criada a seleção em `projects/utils/videoRouting.js` e
integrada em `project_msg.js`: qualquer etapa com `procedure === "subtitles"` seleciona
`video_heavy_queue`; as restantes pipelines seguem para `video_queue`. As pipelines combinadas
com subtitles continuam heavy. Payload, identificadores, ordem da pipeline e `procedure: "video"`
foram preservados; a publicação continua pelo módulo fiável existente.

**Ficheiros:** `projects/utils/videoRouting.js`, `projects/utils/project_msg.js` e
`projects/tests/video-routing.test.js`.

**Verificações reportadas:** 11 testes novos de routing; 52 testes Node e 15 de topologia/Compose
aprovados; `git diff --check` sem erros.

### Bloco 5 — autoscaler em modo observação

**Prompt (resumo):** criar um autoscaler em modo observe/dry-run, recolhendo métricas e propondo
decisões sem criar, parar, remover ou escalar contentores.

**Resultado (agente), commit `7f9c331`:** criada a estrutura `fase2/autoscaler/`, com política
separada da recolha de métricas RabbitMQ/Docker. Apenas `observe` estava implementado neste bloco.
A política inicial previa normal 1–2, heavy 0–2 e orçamento global de 3 réplicas, com observação
a cada 1 s; intenção de scale-out de +1 por decisão/pool, cooldown de 5 s; intenção de scale-in
de -1 após 60 s sem mensagens ready/unacked, cooldown de 30 s.

**Decisões de segurança:** réplicas `starting`, `stopping` e `paused` contam para o orçamento;
uma intenção de scale-in não liberta capacidade. Métricas inválidas não são lidas como zero;
falhas de RabbitMQ/Docker mantêm a capacidade conhecida e bloqueiam decisões; capacidade
desconhecida permanece desconhecida. A atuação real ficou para os blocos posteriores.

**Ficheiros (relativos à raiz):** `fase2/autoscaler/autoscaler.py`, `policy.py`, `runtime.py`,
`config.json` e `README.md` na mesma pasta; testes em `fase2/autoscaler/tests/test_policy.py`,
`test_runtime.py` e `test_autoscaler.py`.

**Verificações reportadas:** 56 testes unitários aprovados e `git diff --check` sem erros.
Na observação real, normal 1 → 1 e heavy 1 → 1, total 2/3, `status: ok` e `actions_executed: 0`;
os contentores não foram alterados.

---

## 2026-11-19 · Elasticidade · Codex (modelo não registado)

**Tarefa:** DA-E1 e DA-E4 — autoscaler: modo de observação, scale-out e scale-in seguros.

**Prompt:** continuação da Prompt 2 do grupo, por blocos (observação, scale-out, scale-in).

**Resultado (agente), commits `3a479ce` e `c059ecf` (al81205), em continuação do Bloco 5 acima:**
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
de topologia passaram (António, com o Claude). A validação com Docker real foi feita na mesma
máquina: na medição final (23/11, 5 repetições, modo `scale`), o autoscaler criou e removeu réplicas de
vídeo reais (123 ações executadas, registadas em `fase2/bench/results/final/autoscaler.jsonl`).

**Intervenção e validação:** as instruções e autorizações do utilizador (`al81205`) estão
registadas no complemento abaixo. A execução local dos testes foi feita pelo agente; a
confirmação da equipa é a indicada acima. A validação com Docker real não foi executada nesta
conversa, mas sim depois, na máquina de referência (ver acima).

---

## 2026-11-25 · Elasticidade · Codex (modelo não registado) · complemento das prompts

Registo retrospetivo dos pedidos disponíveis nesta conversa para os Blocos 6 e 7. Os commits de
implementação são de 19/11; a data deste complemento é a do registo das prompts, não a de novos
testes ou de uma nova implementação. Os caminhos `fase2/autoscaler/` e `fase2/tests/elasticity/`
referidos abaixo são relativos à raiz do repositório.

### Preparação — analisar antes de implementar

**Prompt (resumo fiel):** confirmar `git status`, branch e referências remotas; verificar se a
Fiabilidade da `main` já está integrada, sem fazer merge ou rebase automaticamente; ler
`AGENTS.md`, todo o autoscaler, os serviços `video_tool` e `video_heavy_tool` no Compose e o
graceful shutdown do `ReliableConsumer`. Rever a política, os 56 testes existentes e o modo
`observe`, as garantias da `video_heavy_queue`, as medições iniciais e os scripts S1–S3. Apresentar
estado real, divergências, ficheiros a alterar, solução técnica, riscos e plano de testes antes
de implementar scale-out. Preservar os 335 artefactos não rastreados e não alterar a Fiabilidade.

**Contributo e decisões do utilizador:** separei a análise da implementação e fixei o âmbito na
Elasticidade de vídeo. Proibi alterações a ack manual, heartbeat, requeue, quorum queues, DLQ,
watchdog, idempotência, refund, graceful shutdown e tratamento de respostas no `projects`.

### Bloco 6 — implementação e revisão do scale-out

**Prompt de implementação (resumo fiel do anexo original):** implementar exclusivamente
scale-out num atuador separado, preferencialmente `fase2/autoscaler/actuator.py`. Manter
`observe` predefinido e exigir ativação explícita para atuar; nunca executar scale-in neste
bloco. Normal: mínimo 1, máximo 2; heavy: mínimo 0, máximo 2; orçamento global máximo 3.
Contabilizar réplicas `starting`, `stopping` e `paused`, acrescentar no máximo uma réplica por
decisão/pool e respeitar cooldown. Usar Compose com projeto, configuração e diretório explícitos,
apenas para os dois serviços de vídeo, sem eliminar ou recriar contentores existentes. Exigir
observações válidas, exclusão mútua, nova observação antes da criação, reserva persistente,
reconciliação pelos IDs reais e confirmação do arranque e do consumidor RabbitMQ. Código zero
do Docker não prova prontidão. Tratar repetição, concorrência, falhas, timeouts, criação parcial,
métricas inválidas e reinício sem inventar capacidade nem libertar reservas incertas. Acrescentar
testes determinísticos, correr os existentes e os de topologia, verificar o diff e apresentar
limitações. Não alterar Fiabilidade, routing, baseline ou benchmarks; não fazer commit, push,
merge ou rebase automaticamente, nem começar o Bloco 7.

**Prompts de validação e revisão (resumo fiel):** verificar Docker Engine Linux, credenciais,
Compose, IDs iniciais, recursos, filas e consumidores; observar sem ações; provocar crescimento
controlado e verificar exatamente uma réplica adicional, preservação dos IDs anteriores,
consumidor novo, processamento real, limites e cooldowns. Se o Docker estiver inacessível,
interromper a validação real e indicar o bloqueio. Depois, fazer revisão técnica final do atuador,
runtime, CLI, configuração, README e testes, corrigindo apenas defeitos comprovados com a menor
alteração e testes de regressão. Não exigir Docker real nesta máquina; os testes reais e S1–S3
ficam a cargo do António no Ubuntu. Preparar a lista exata de ficheiros, sem executar o commit.

**Resultado e verificações (agente):** implementação do modo explícito `scale-out`, lock por
projeto/daemon, journal persistente e reconciliação, com criação através de Compose sem recriar
as réplicas existentes. O relatório passou de 111 para 114 testes do autoscaler após duas
correções na revisão final; os 15 testes de Compose/topologia e `git diff --check` passaram.
Estes números são totais sucessivos da suite, não testes a somar. O Docker Engine Linux estava
inacessível no Windows; não foi demonstrada criação ou processamento real de contentores nesta
sessão. O resultado foi guardado no commit `3a479ce`.

**Contributo e decisões do utilizador:** exigi revisão antes do commit, preservação dos 335
artefactos, limites e reservas também em estados transitórios, e nenhuma mudança à Fiabilidade.
Determinei que o António faria a validação real. Só depois dos resultados autorizei um único
commit, com oito caminhos explícitos, sem `git add .` e sem push nessa etapa.

### Bloco 7 — implementação e revisão do scale-in seguro

**Prompt de implementação (resumo fiel):** partir da branch `feat/elasticity-video` e do commit
`3a479ce`; reler o código, Compose, política e graceful shutdown, sem alterar a Fiabilidade.
Implementar scale-in com normal 1–2, heavy 0–2 e orçamento global 3; exigir 60 segundos sem
mensagens ready/unacked, cooldown de 30 segundos e redução máxima de uma réplica por decisão/pool,
mantendo os parâmetros configuráveis. Nunca remover a última normal. Revalidar métricas e
estados imediatamente antes da atuação; bloquear métricas inválidas, operações pendentes e
transições incompatíveis. Persistir um ID real antes da operação, enviar SIGTERM, respeitar o
prazo de encerramento do Compose, confirmar a paragem e só depois remover esse contentor.
Falhas ou timeouts mantêm capacidade reservada até reconciliação e remoção confirmada. Não usar
Compose para escolher o contentor a reduzir nem eliminar volumes, redes ou outros serviços.
Reutilizar ack/requeue e os 8 segundos internos da Fiabilidade. Preservar `observe` e o modo
exclusivo `scale-out`; criar um modo explícito para ambas as direções, reutilizando lock,
reservas e reconciliação, sem decisões contraditórias. Testar mínimos, máximos, inatividade,
cooldown, ready/unacked, estados transitórios, concorrência, falhas, reinícios e modos existentes.
Não fazer commit, push, merge ou rebase automaticamente, nem afinação ou benchmarks.

**Prompt de revisão final (resumo fiel):** rever os seis ficheiros do Bloco 7 e confirmar
persistência do ID, stop normal sem force, rm apenas após paragem, reservas e modos de atuação.
Analisar três cenários: mensagem nova entre decisão e remoção; último heavy 1 → 0 seguido de
trabalho novo e recuperação 0 → 1; interrupções antes, durante e depois de stop/remove. Não perder
trabalho, remover outro contentor, libertar capacidade fictícia nem bloquear permanentemente sem
condição justificável. Demonstrar cada defeito, aplicar a correção mínima, acrescentar regressão
e repetir todos os testes e verificações de âmbito, sem Docker real nesta máquina.

**Resultado e correções (agente):** modo explícito `scale` para ambas as direções e máquina de
estados em `fase2/autoscaler/scale_in.py`, integrada com o atuador e o journal existentes.
Na revisão final foram encontrados e corrigidos dois bloqueios de recuperação:

- Trabalho novo podia impedir a limpeza do último heavy já parado, mantendo a operação pendente
  e bloqueando scale-out. A limpeza pode agora terminar depois de confirmar o mesmo ID parado,
  sobreviventes válidos e consumidor desligado, mesmo que haja trabalho novo. As observações com
  ready/unacked impedem iniciar uma nova paragem; o autoscaler não confirma nem descarta mensagens.
  Terminar a limpeza desbloqueia o scale-out posterior, respeitando cooldown e orçamento.
- Interrupções e falhas transitórias de stop/remove podiam deixar a operação pendente
  indefinidamente. A reconciliação permite tentativas controladas sobre o mesmo ID persistido:
  stop exige inatividade e observações válidas, cooldown e prazo anterior decorrido; rm exige
  confirmação de paragem, cooldown e observação final. Os instantes das tentativas são persistidos,
  não há mais de uma tentativa de cada operação por ciclo e o orçamento só é libertado depois
  da remoção confirmada. Estados inválidos ou identidades inconsistentes continuam bloqueados.

**Verificações (agente):** 171 testes após a implementação inicial; 180 após nove novos testes
de regressão da revisão final, além dos 15 testes de Compose/topologia, sintaxe de 10 ficheiros
Python e `git diff --check`, todos aprovados. Foram simulados heavy 1 → 0 → 1, chegadas de trabalho,
falhas, reinícios e respostas perdidas; mocks não provam funcionamento com Docker real. A revisão
confirmou o scale-out existente e o âmbito limitado aos seis ficheiros autorizados. Resultado
guardado no commit `c059ecf`.

**Contributo e decisões do utilizador:** defini os dez requisitos de segurança da revisão e os
três cenários críticos; pedi correções apenas para defeitos demonstrados, com regressão. Mantive
a Fiabilidade, workers, RabbitMQ, routing, Compose e benchmarks fora do âmbito. Pedi relatório e
lista exata de ficheiros antes de autorizar o commit; deixei os testes reais para o António.

**Parâmetros históricos:** os 60 segundos são o requisito da prompt e da revisão do Bloco 7.
A alteração posterior para 40 segundos é do commit `5689aac`, de 23/11, por António Sousa, e está
descrita na secção de Medição e qualidade. Não foi parte das correções desta revisão nem uma
decisão de afinação tomada nesta conversa.

### Commit e publicação — autorizações separadas

**Prompts (resumo fiel):** depois de cada revisão, criar um único commit com a mensagem indicada
e apenas os caminhos autorizados: oito ficheiros no Bloco 6, seis no Bloco 7. Confirmar branch,
HEAD e staging exato; interromper perante ficheiros inesperados; executar a verificação do diff
em staging; excluir os 335 artefactos e não fazer push. Num pedido posterior e separado, verificar
remoto, fetch, HEAD e divergência; publicar apenas os dois commits locais se não existir nenhum
commit remoto em falta, sem force, e confirmar hashes local/remoto iguais.

**Resultado (agente, autorizado pelo utilizador):** criados os commits `3a479ce` e `c059ecf`, com
as mensagens `feat(elasticity): implement safe video scale-out` e
`feat(elasticity): implement safe video scale-in`. No pedido de publicação, a divergência era
0 commits remotos em falta e 2 locais por publicar; após `git push origin feat/elasticity-video`
e novo fetch, passou a 0/0, com HEAD local e remoto
`c059ecfb65928351cb74b87564225765a2861d6e`. Não houve novos commits de código, force push,
merge/rebase ou alteração à `main` nessa publicação. Os 335 artefactos permaneceram excluídos.

**Limitações e validação humana:** as instruções, condições e autorizações acima são decisões
do utilizador registadas na conversa. Os testes locais foram executados pelo agente; não são
apresentados como execução manual do utilizador. A confirmação de 23/11 pelo António e Claude
consta da entrada anterior, preservada. Na conclusão destes blocos, a validação de réplicas e
processamento com Docker real e os benchmarks S1–S3 foram entregues ao António no Ubuntu; não
foram executados nesta sessão. Este complemento documental não acrescenta resultados dessas
validações nem altera o registo da frente de Medição e qualidade.

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
apresentar; decidi assumir as correções finais, as medições e o relatório.
