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
| 2 | Ferramentas de imagem passam a usá-la (via `ToolMSG`) | Pendente |
| 3 | Worker de vídeo passa a usá-la | Pendente |

**Prompt:** Prompt de implementação da Fiabilidade do grupo, fornecida ao agente como ficheiro
com o plano da fase 2 (problemas medidos na baseline, alvos R-1…R-5, decisões DA-R1…DA-R5, regras
e método de trabalho). Pedidos principais: propor um plano do DA-R1 sem alterar código;
implementar a etapa 1; fazer uma revisão guiada do código antes do commit.

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

**Limitações e observações:**
- Até às etapas 2 e 3, nenhum worker usa a biblioteca; o comportamento do sistema não muda.
- A ferramenta `watermark` é uma imagem externa e fica fora do DA-R1.
- Diagnóstico para uma etapa posterior da Fiabilidade, ainda não corrigido: em 12 das 15
  ferramentas de imagem, a resposta de erro chama `send_msg` com argumentos posicionais desalinhados e
  `tool_msg.py` lança uma exceção em vez de enviar o erro ao utilizador.

**Validação (Sérgio):** Analisei e aprovei o plano da DA-R1 e as decisões D1–D3. Acompanhei a
revisão guiada da etapa 1 e autorizei a correção do problema identificado e a simplificação do
código. Consultei os resultados dos testes apresentados pelo agente (`ALL PASSED`) e confirmei o
alinhamento do trabalho descrito com a metodologia definida pelo grupo.
