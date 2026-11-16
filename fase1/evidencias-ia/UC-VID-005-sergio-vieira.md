# UC-VID-005 — Remover o fundo por IA (Sérgio Vieira)

**Ferramenta:** Antigravity (Google DeepMind).
**Configuração:** nenhuma (ver o [README](README.md)).

Todos os _prompts_ são reconstruídos: o histórico das conversas não ficou disponível.

## 1. Escolha da funcionalidade e caso de uso [Reconstruído]

**Data:** 2026-10-18 · **Evidência:** `b29288d`

```text
Quero trocar o meu caso de uso de recorte temporal por remoção de fundo em vídeo com IA. Propõe os modos de
substituição (fundo verde, cor sólida, bokeh) e escreve o caso de uso completo com o template.
```

**Resultado:** caso de uso UC-VID-005 com os três modos de substituição.
**Validação:** revisão e adaptação ao PictuRAS.

## 2. ERS [Reconstruído]

**Data:** 2026-10-18 · **Evidência:** `b29288d`

```text
Deriva a ERS (secção 4), as decisões de qualidade, a matriz de impacto e a rastreabilidade com testes.
```

**Resultado:** secção 4 do caso de uso (REQ-VID-BG, DQ, impacto e rastreabilidade).
**Validação:** revisão dos requisitos e dos limites por plano.

## 3. Implementação [Reconstruído]

**Data:** 2026-10-18 · **Evidência:** `b29288d`

```text
Implementa um worker video_bg_remove que usa rembg em cada fotograma, compõe o fundo escolhido e escreve o
vídeo com FFmpeg por pipe, sem ficheiros intermédios, mantendo o áudio sincronizado.
```

**Resultado:** serviço `video_bg_remove_tool`.
**Validação:** teste manual; o teste com o sistema completo mostrou depois que a inferência em todos os
fotogramas excedia o tempo máximo (corrigido no _commit_ `e134a50`).

## 4. Limites por plano e Bokeh [Reconstruído]

**Data:** 2026-10-21 · **Evidência:** `132efe3`

```text
Aplica os limites por plano (free 30 s/720p, premium 180 s/1080p) e bloqueia o Bokeh a utilizadores free no
servidor, de acordo com a revisão cruzada dos casos de uso.
```

**Resultado:** validação dos limites e do modo Bokeh no `projects`.
**Validação:** testes pela API (TST-VID-01).
