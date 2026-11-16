# UC-VID-004 — Gerar legendas automáticas (Bruno Vale)

**Ferramenta:** ChatGPT (OpenAI).
**Configuração:** nenhuma (ver o [README](README.md)).

Todos os _prompts_ são reconstruídos: o histórico das conversas não ficou disponível.

## 1. Caso de uso [Reconstruído]

**Data:** 2026-10-05 · **Evidência:** `941b920`

```text
Escreve o caso de uso "Gerar legendas automáticas para um vídeo" segundo este template: ator, pré-condições,
fluxo com revisão das legendas antes de gerar o SRT e exceções (sem áudio, idioma não suportado).
```

**Resultado:** primeira versão do caso de uso UC-VID-004.
**Validação:** revisão e ajuste ao PictuRAS.

## 2. ERS [Reconstruído]

**Data:** 2026-10-16 · **Evidência:** `b264b0d`

```text
Evolui a secção 4 para uma ERS completa, separando funcionais de qualidade, com ISO/IEC 25010 e alvos MVP e
produção. Quero idiomas PT e EN e limites de 100 MB e 10 minutos.
```

**Resultado:** ERS do UC-VID-004 (REQ-VID-LEG).
**Validação:** revisão dos requisitos e das questões em aberto.

## 3. Núcleo da geração [Reconstruído]

**Data:** 2026-10-19 · **Evidência:** `08e146f`

```text
Implementa um serviço Python que extrai o áudio com FFmpeg, transcreve com faster-whisper em CPU e gera um SRT
válido, recusando segmentos sobrepostos ou fora da duração.
```

**Resultado:** núcleo do serviço `subtitle_generation` (`media.py`, `stt.py`, `srt.py`).
**Validação:** execução com vídeos falados.

## 4. Integração com o PictuRAS [Reconstruído]

**Data:** 2026-10-19 · **Evidência:** `df6e4be`, `0acd917`, `6131ddc`

```text
Liga o serviço de legendas ao RabbitMQ e ao projects: pedido de transcrição, confirmação, rejeição e
cancelamento, com o estado enviado por WebSocket.
```

**Resultado:** filas, rotas no `projects` e eventos em tempo real.
**Validação:** testes do `projects` e do _frontend_ (TST-LEG-01).

## 5. Pré-visualização sincronizada [Reconstruído]

**Data:** 2026-10-19 · **Evidência:** `c853b31`, `274bafe`

```text
No frontend, mostra as legendas por cima do vídeo sincronizadas com o tempo de reprodução, também em ecrã
inteiro.
```

**Resultado:** componente de pré-visualização das legendas.
**Validação:** teste manual na interface.
