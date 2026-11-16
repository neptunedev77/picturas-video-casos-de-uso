# silence_removal — Remoção de silêncios e pausas (UC-VID-001)

Serviço independente (REQ-VID-SIL-038) ligado ao RabbitMQ, com FFmpeg dentro do contentor (REQ-VID-SIL-039).

| Ficheiro | Responsabilidade |
|---|---|
| `config.py` | Filas, perfis Suave/Equilibrado/Agressivo, limites por plano, tempos máximos |
| `segments.py` | Lógica pura dos troços: margem, duração mínima, junção, poupança, validação |
| `analyzer.py` | Análise do áudio (níveis a cada 10 ms) e linha temporal |
| `cutter.py` | Cortes no som e na imagem, suavização de 10 ms, verificação da sincronização |
| `media.py` | ffprobe, limites RN2/RN9, cancelamento e tempo máximo dos processos FFmpeg |
| `worker.py` | Consumidor RabbitMQ (até 2 pedidos em simultâneo, cancelamento, resultados) |
| `cli.py` | Testes manuais sem o resto do sistema |

## Filas

- `silence_removal_queue` (prioridade 0–10): pedidos `silence_analyze` e `silence_apply` (formato em `worker.py`).
- `silence_results_queue`: respostas (`success` / `error` / `cancelled`) e progresso (`status: "progress"`), consumidas pelo serviço `projects`, que guarda o estado e o reencaminha para o browser.
- routing key `silence_cancel`: `{"jobId": "..."}` cancela um pedido em curso.

## API (serviço `projects`, via `/api-gateway/projects`)

| Pedido | Descrição |
|---|---|
| `GET /:user/:project/silence/:img` | Estado: `none`, `queued`, `analyzing`, `analyzed`, `processing`, `completed`, `failed`; análise, revisão, poupança, resultado, perfis e análises restantes |
| `POST .../analyze` `{options, confirmDiscard}` | Analisar (não gasta operações; free até 15/dia). `409 REVIEW_WILL_BE_LOST` se houver ajustes manuais |
| `PUT .../review` `{segments: [{start, end, selected}]}` | Guardar a revisão (sem sobreposições, dentro da duração) |
| `POST .../apply` `{segments?, confirmLargeRemoval}` | Aplicar (free: 1 operação). `400 NO_SEGMENTS_SELECTED`, `409 CONFIRM_LARGE_REMOVAL` (>80%), `429 NO_QUOTA` |
| `POST .../cancel` | Cancelar a análise (volta às opções) ou o processamento (volta à revisão e devolve a operação) |

O estado é guardado em `projects/models/silenceJob.js` (revisões expiram ao fim de 7 dias sem uso) e
cada mudança é enviada ao browser pelo evento WebSocket `silence-update`. O vídeo resultante é
acrescentado ao projeto como um novo vídeo (`<nome>-sem-silencios.mp4`); o original não é alterado.

## Testar

```bash
# testes da lógica dos troços
docker compose run --rm --no-deps silence_removal_tool python -m unittest discover -s tests -v
# teste completo com um vídeo sintético
docker compose run --rm --no-deps silence_removal_tool python cli.py demo
# com um vídeo próprio (a pasta do vídeo é montada em /videos)
docker compose run --rm --no-deps -v "C:\pasta\do\video:/videos" silence_removal_tool python cli.py analyze /videos/video.mp4
docker compose run --rm --no-deps -v "C:\pasta\do\video:/videos" silence_removal_tool python cli.py apply /videos/video.mp4 /videos/video-sem-silencios.mp4
# fluxo completo pela API (sistema a correr com docker compose up); cria um utilizador de teste
python Tools/silence_removal/tests/e2e_api.py C:\pasta\do\video\video.mp4
# robustez (parte 4): 300 troços, serviço morto a meio, apagar vídeo, ficheiros temporários (~4 min)
python Tools/silence_removal/tests/e2e_robustness.py
# vídeo sintético com muitas pausas (ex.: para testar a revisão com 300 troços no browser)
docker compose run --rm --no-deps -v "C:\videos:/videos" silence_removal_tool python cli.py make-test-video /videos/300-pausas.mp4 --pauses 300
# preparar um teste manual da interface: cria conta de teste + projeto com o vídeo
python Tools/silence_removal/tests/prepare_ui_test.py C:\pasta\do\video\video.mp4 [--premium]
```

## Robustez

- **Tempos máximos (REQ-031):** o serviço interrompe análises com mais de 5 min e processamentos com mais
  de 3× a duração + 1 min. O `projects` verifica a cada 30 s os pedidos em curso: sem notícias do serviço há
  90 s, acima do tempo máximo ou 15 min em fila → "falhado", com a análise/operação devolvida.
- **Sem repetição automática (DQ-004):** um pedido entregue de novo após um reinício do serviço não é refeito.
- **Ficheiros temporários (A6):** apagados no fim de cada pedido; uma limpeza a cada 30 min apaga o que tiver ficado esquecido.
- **Apagar vídeo/projeto (REQ-026):** apaga também a revisão guardada e os ficheiros de trabalho.

## Interface (frontend)

- `frontend/components/toolbar/silence-removal-tool.tsx`: botão por baixo do blur (só em vídeos).
- `frontend/components/silence/silence-removal-dialog.tsx`: opções/perfis, progresso, revisão, resultado.
- `frontend/components/silence/silence-timeline.tsx`: linha temporal com os troços (arrastar extremidades).
- `frontend/lib/silence.ts`: chamadas à API e estado em tempo real (evento `silence-update`).
