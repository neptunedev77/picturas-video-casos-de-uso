# Registo de utilização de agentes de IA — Fase 2

Uma entrada por tarefa principal, com: data, frente, ferramenta/modelo, a prompt principal (ou
um resumo fiel), o resultado e a validação. O **Resultado** descreve o que o agente fez; a
**Validação** é preenchida pela equipa e regista apenas o que foi realmente revisto, testado ou
corrigido por pessoas.

Os caminhos de código são relativos a `fase2/picturas-27/`.

---

## 2026-11-18 · Fiabilidade · Claude Code (Opus 5.5)

**Tarefa:** DA-R1 — biblioteca de consumidor partilhada.

| Etapa | Âmbito | Estado |
| --- | --- | --- |
| 1 | Biblioteca `ReliableConsumer` e testes | Concluída |
| 2 | Ferramentas de imagem passam a usá-la (via `ToolMSG`) | Concluída |
| 3 | Worker de vídeo passa a usá-la | Concluída |

**Prompt:** Prompt de implementação da Fiabilidade do grupo, fornecida ao agente como ficheiro
com o plano da fase 2 (problemas medidos na baseline, alvos R-1…R-5, decisões DA-R1…DA-R5, regras
e método de trabalho). Pedidos principais: propor um plano do DA-R1 sem alterar código;
implementar a etapa 1; fazer uma revisão guiada do código antes do commit; planear e
implementar as etapas 2 e 3.

**Resultado (feito pelo agente):**
- Decisões aprovadas: no SIGTERM, esperar até 8 s pelo trabalho em curso e depois devolvê-lo à
  fila; `prefetch_count=1`; testes da biblioteca em `Tools/video/tests/`, para correrem no
  `run-all.sh` sem o alterar.
- `Tools/utils/reliable_consumer.py` (novo): ack manual só depois de publicada a resposta;
  handler numa thread separada com heartbeat ativo (60 s, antes `heartbeat=0`); operações no
  canal apenas na thread da ligação; publicação persistente; reconexão com backoff; SIGTERM
  gracioso. Um handler que lança exceção é rejeitado sem requeue; uma resposta que não chega ao
  broker devolve o trabalho à fila.
- `Tools/video/tests/test_reliable_consumer.py` (novo): 8 testes com um broker em memória.
  `Tools/video/requirements-dev.txt`: acrescentado o `pika`.
- Correção na revisão: com `prefetch_count=1`, uma resposta não publicada com a ligação ainda
  aberta deixava o worker parado; passou a devolver o trabalho à fila. Foram também removidos
  código não usado e uma exceção redundante.
- Testes corridos pelo agente após as correções: 8/8 no WSL; `video_tool` reconstruído e
  `fase2/tests/run-all.sh` com `ALL PASSED` (`projects` 8/8, worker de vídeo 82/82, regressão
  30/30).
- Etapa 2 — `Tools/utils/tool_msg.py`: o `ToolMSG` passa a usar o `ReliableConsumer`; o
  `read_msg` termina o processo (`sys.exit(0)`) depois do SIGTERM, para não voltar ao ciclo de
  consumo das ferramentas. Interface e formato das mensagens inalterados; nenhuma das 15
  ferramentas foi alterada. `Tools/utils/rabbit_mq.py` mantido, sem uso (decisão D4).
- Etapa 2 — `Tools/video/tests/test_tool_msg.py` (novo): 3 testes (fila consumida e saída no
  stop; resposta de sucesso inalterada em `project_queue`; formato atual da resposta de erro).
- Etapa 2 — verificações feitas pelo agente, depois de reconstruir as 15 ferramentas e o
  `video_tool`: `run-all.sh` com `ALL PASSED` (`projects` 8/8, worker de vídeo 85/85,
  regressão 30/30); teste do SIGTERM: `docker compose stop contrast_tool` termina em 0,7 s
  com código 0; verificação preliminar `dev` (1 repetição): F1 recuperou, com 1/1 trabalhos
  concluídos (baseline: 0/5) e atraso de 3,4 s face ao `REF-img10`.
- Etapa 3 — `Tools/video/video.py`: o worker de vídeo passa a usar o `ReliableConsumer`
  (heartbeat de 60 s em vez de `heartbeat=0`, trabalho numa thread separada, respostas
  persistentes, reconexão, SIGTERM gracioso); saem a ligação própria e os `basic_ack`. Uma
  resposta que não chega ao broker deixa de ser convertida numa resposta de erro e devolve o
  trabalho à fila. Formato das mensagens e eventos `video-progress` inalterados.
- Etapa 3 — `Tools/video/tests/test_video_worker.py` (novo): 5 testes com consumidor e
  processamento simulados. `test_tool_msg.py` corrigido de `100755` para `100644`.
- Etapa 3 — verificações feitas pelo agente: 16/16 testes unitários no contentor;
  `run-all.sh` com `ALL PASSED` (`projects` 8/8, worker de vídeo 90/90, regressão 30/30);
  SIGTERM com o worker inativo: 0,6 s, código 0; SIGTERM a meio de uma legendagem: o trabalho
  volta à fila após 8 s e é concluído depois de reiniciado o worker (1/1, sem duplicados).
  Verificação preliminar `dev` (1 repetição): F2 1/1 concluído; F6 2/2 concluídos, sem
  duplicados e sem reentrega do vídeo durante a pausa de 60 s (o risco do heartbeat de 60 s
  não se verificou nesta corrida).

**Limitações e observações:**
- Os resultados `dev` são uma verificação preliminar, não a validação dos requisitos: foram
  obtidos no portátil do Sérgio (Docker Desktop sobre WSL). O `REF-img10` deu 1,58 s (mediana
  de 3 repetições) contra 0,63 s na baseline; a comparação não é conclusiva, devido às
  diferenças de hardware e de ambiente. A validação fica para a medição final na máquina de
  referência.
- Tempos de vídeo na verificação preliminar da etapa 3, obtidos no portátil do Sérgio e não
  comparáveis com a baseline: `REF-trim` 1,2 s (baseline 0,8 s); `REF-subs` 35,9 s (baseline 16,5 s);
  atraso do F2 face ao `REF-subs` +32,9 s (baseline +26,1 s); atraso do F6 +109,1 s (baseline
  +60,7 s). A causa da diferença ainda não foi determinada: não é atribuída apenas ao
  ambiente nem apenas ao código. O desempenho não está validado; a comparação definitiva fica
  para a medição final na máquina de referência, nas condições da baseline. O F6 continua sem aviso ao utilizador (R-4: 0 %),
  como esperado antes do watchdog.
- Análise adicional feita pelo agente, sem alterar código: no mesmo ambiente, o
  processamento direto do vídeo (`process_video`, sem RabbitMQ) teve tempos semelhantes aos
  do processamento completo (legendas 33,8–36,2 s contra 35,9 s; corte 1,25–1,31 s contra
  1,2 s). Não foi identificada sobrecarga significativa atribuível ao `ReliableConsumer` nos
  cenários analisados. A causa da diferença face à baseline continua por confirmar e o
  desempenho das ferramentas de imagem (`REF-img10`) ainda não foi esclarecido; a comparação
  definitiva será feita na máquina de referência do António.
- Os testes do worker de vídeo precisam do `pytz`, que não está no `requirements-dev.txt`:
  correm no contentor (`run-all.sh`), mas não no venv de desenvolvimento.
- A ferramenta `watermark` é uma imagem externa e fica fora do DA-R1.
- Diagnóstico para uma etapa posterior da Fiabilidade, ainda não corrigido: em 12 das 15
  ferramentas de imagem, a resposta de erro chama `send_msg` com argumentos posicionais desalinhados e
  `tool_msg.py` lança uma exceção em vez de enviar o erro ao utilizador. Corrigido depois:
  ver a entrada «DA-R5 (parte 1)».

**Validação (Sérgio):** Analisei e aprovei o plano da DA-R1 e as decisões D1–D3. Acompanhei a
revisão guiada da etapa 1 e autorizei a correção do problema identificado e a simplificação do
código. Consultei os resultados dos testes apresentados pelo agente (`ALL PASSED`) e confirmei o
alinhamento do trabalho descrito com a metodologia definida pelo grupo.

**Validação da etapa 2 (Sérgio):** Aprovei o plano da etapa 2 e decidi manter o
`rabbit_mq.py` sem uso até a etapa 3 estar validada. Aprovei a configuração temporária do Docker
usada para desbloquear as compilações. Analisei o relatório da etapa e aprovei os resultados
apresentados pelo agente, tratando as medições `dev` como preliminares e deixando a comparação
com a baseline para a medição final na máquina de referência.

**Validação da etapa 3 (Sérgio):** Aprovei o plano da etapa 3, mantive o heartbeat de 60 s
com verificação preliminar do F6 e decidi manter o `rabbit_mq.py` sem alterações. Pedi a
correção das permissões do `test_tool_msg.py`. Analisei o relatório e aprovei os resultados
funcionais apresentados pelo agente (`run-all.sh`, SIGTERM, F2 e F6). Decidi não reconstruir
a versão original no meu computador para comparar a legendagem, deixando a comparação para a
medição final na máquina de referência.

---

## 2026-11-18 · Fiabilidade · Claude Code (Opus 5.5)

**Tarefa:** DA-R5 (parte 1) — correção das respostas de erro das ferramentas de imagem. A
idempotência (restante DA-R5) fica para depois, conforme o plano do grupo.

**Prompt:** Pedido de um plano curto para corrigir as respostas de erro das ferramentas, seguido
da aprovação das decisões E1 (argumentos nomeados nas chamadas afetadas, confirmando caso a caso
o caminho da imagem original), E2 (identificadores com a mesma convenção da resposta de sucesso e
`error.msg`, mantendo `error.message`) e E3 (este registo).

**Resultado (feito pelo agente):**
- Diagnóstico por análise estática (AST) das 30 chamadas de erro das 15 ferramentas: 23 chamadas
  em 12 ferramentas passavam os argumentos de erro por posição, desalinhados (o código de erro caía
  em `type` e o `og_img_uri` ficava vazio), e o `ToolMSG` lançava uma exceção em vez de responder.
- `Tools/utils/tool_msg.py`: na resposta de erro, `messageId`/`correlationId` passam a seguir a
  convenção da resposta de sucesso (o `projects` encontra o processo pelo `correlationId`); passa
  a enviar `error.msg`, o campo lido pelo `projects`, mantendo `error.message`.
- 12 ferramentas (`bg_remove_ai`, `binarization`, `border`, `brightness`, `contrast`, `cut`,
  `cut_ai`, `resize`, `rotate`, `saturation`, `text_ai`, `upgrade_ai`): as 23 chamadas passam
  `err_code=`, `err_msg=` e `og_img_uri=img_path` por nome. Em todas, `img_path` é o
  `inputImageURI` da própria função. Em `cut.py`, que passava duas mensagens, ficou
  `err_msg=str(e)`, como nas outras ferramentas que usam a exceção. As restantes 7 chamadas já
  estavam corretas e não foram alteradas.
- Testes: `test_tool_msg.py` passa a exigir os identificadores corretos e o `error.msg`;
  `test_tool_error_calls.py` (novo) verifica por AST que nenhuma chamada de erro fica desalinhada
  (falha no código anterior, passa no corrigido; é ignorado no contentor, que não tem o código das
  ferramentas, e corrido à parte no WSL).
- Verificações feitas pelo agente: teste AST e testes do `ToolMSG` no WSL (4/4); 16 imagens
  reconstruídas; `run-all.sh` com `ALL PASSED` e código 0 (`projects` 8/8, worker de vídeo 90 e
  1 ignorado, regressão 30/30). Verificação preliminar `dev` (1 repetição): F5 com os 2 erros
  comunicados ao cliente em ≤ 10 s (imagem 0,18 s, código 1501; vídeo 0,32 s, código 2003), R-4
  de 100 % (baseline: 50 %); F1 continua a recuperar (10/10 resultados).

**Limitações e observações:**
- Alteração visível prevista no plano: os erros das ferramentas de imagem passam a chegar à
  interface.
- A ferramenta `watermark` é uma imagem externa e não foi alterada.
- A primeira execução do `run-all.sh` falhou porque o teste AST não era ignorado no contentor
  (encontrava ficheiros que não são ferramentas); corrigida a condição do teste, sem tocar no
  código das ferramentas.
- Os resultados `dev` são preliminares (portátil do Sérgio); a validação fica para a medição final
  na máquina de referência.

**Validação (Sérgio):** Aprovei as decisões E1, E2 e E3, acompanhei a implementação e revi o
relatório final e os resultados apresentados pelo agente: o `run-all.sh` e as verificações
preliminares F5 e F1, todos executados pelo agente.
