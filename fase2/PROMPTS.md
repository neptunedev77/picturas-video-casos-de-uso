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
| 3 | Worker de vídeo passa a usá-la | Pendente |

**Prompt:** Prompt de implementação da Fiabilidade do grupo, fornecida ao agente como ficheiro
com o plano da fase 2 (problemas medidos na baseline, alvos R-1…R-5, decisões DA-R1…DA-R5, regras
e método de trabalho). Pedidos principais: propor um plano do DA-R1 sem alterar código;
implementar a etapa 1; fazer uma revisão guiada do código antes do commit; planear e
implementar a etapa 2.

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

**Limitações e observações:**
- O worker de vídeo ainda não usa a biblioteca (etapa 3).
- Os resultados `dev` são uma verificação preliminar, não a validação dos requisitos: foram
  obtidos no portátil do Sérgio (Docker Desktop sobre WSL). O `REF-img10` deu 1,58 s (mediana
  de 3 repetições) contra 0,63 s na baseline; a comparação não é conclusiva, devido às
  diferenças de hardware e de ambiente. A validação fica para a medição final na máquina de
  referência.
- A ferramenta `watermark` é uma imagem externa e fica fora do DA-R1.
- Diagnóstico para uma etapa posterior da Fiabilidade, ainda não corrigido: em 12 das 15
  ferramentas de imagem, a resposta de erro chama `send_msg` com argumentos posicionais desalinhados e
  `tool_msg.py` lança uma exceção em vez de enviar o erro ao utilizador.

**Validação (Sérgio):** Analisei e aprovei o plano da DA-R1 e as decisões D1–D3. Acompanhei a
revisão guiada da etapa 1 e autorizei a correção do problema identificado e a simplificação do
código. Consultei os resultados dos testes apresentados pelo agente (`ALL PASSED`) e confirmei o
alinhamento do trabalho descrito com a metodologia definida pelo grupo.

**Validação da etapa 2 (Sérgio):** Aprovei o plano da etapa 2 e decidi manter o
`rabbit_mq.py` sem uso até a etapa 3 estar validada. Aprovei a configuração temporária do Docker
usada para desbloquear as compilações. Analisei o relatório da etapa e aprovei os resultados
apresentados pelo agente, tratando as medições `dev` como preliminares e deixando a comparação
com a baseline para a medição final na máquina de referência.
