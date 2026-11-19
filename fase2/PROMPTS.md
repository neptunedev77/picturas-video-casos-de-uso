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

## 2026-11-20 · Fiabilidade · Claude Code (Opus 5.5)

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

## Estado

As DA-R1 a DA-R5 estão implementadas no ramo `feat/reliability`, com as verificações locais do agente
a passar. Falta: o commit da correção B, a revisão do pull request pelo Diogo, a migração do RabbitMQ nas
máquinas do grupo e as medições oficiais na máquina de referência.
