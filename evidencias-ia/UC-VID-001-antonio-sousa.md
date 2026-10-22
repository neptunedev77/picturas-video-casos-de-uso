# UC-VID-001 — Remover silêncios e pausas (António Sousa)

**Ferramentas:** Claude (chat) e Claude Code (Claude Opus 5.5, Anthropic).
**Configuração:** nenhuma (ver o [README](README.md)).

Todos os _prompts_ são reconstruídos: o histórico das conversas não ficou disponível.

## 1. Estruturar o caso de uso [Reconstruído]

**Data:** 2026-10-05 · **Evidência:** `43aa7e6`

```text
Ajuda-me a estruturar um caso de uso para o PictuRAS que permita remover silêncios e pausas de um vídeo:
fluxo principal, fluxos alternativos, exceções (limites do plano, vídeo sem áudio, tempo excedido),
regras de negócio, assunções e questões em aberto.
```

**Resultado:** estrutura do caso de uso, exceções e regras de negócio.
**Validação:** revisão e confronto com o README e o código da solução de base; o que não estava confirmado
ficou como assunção ou questão em aberto.

## 2. ERS completa [Reconstruído]

**Data:** 2026-10-15 · **Evidência:** `4fa02c4`

```text
Expande a secção 4 para uma ERS completa: requisitos funcionais, não funcionais com ISO/IEC 25010 e alvos
MVP vs produção, decisões de qualidade, análise de impacto e matriz de rastreabilidade.
```

**Resultado:** secção 4 do caso de uso (REQ-VID-SIL, DQ, impacto e rastreabilidade).
**Validação:** revisão de cada requisito face ao caso de uso e ao enunciado; valores sem origem confirmada
ficaram como assunções a validar com testes.

## 3. Implementação da remoção de silêncios [Reconstruído]

**Data:** 2026-10-16 · **Evidência:** `5478fc9`

```text
Implementa o UC-VID-001: um worker silence_removal igual às ferramentas existentes, que deteta os silêncios
com FFmpeg e devolve os troços para o utilizador rever antes de cortar, as rotas e o trabalho no projects,
a contagem de análises no users, os eventos no WS Gateway e a interface de revisão no frontend.
```

**Resultado:** serviço `silence_removal_tool`, rotas no `projects`, contagem no `users`, eventos no
WS Gateway e interface de revisão.
**Validação:** revisão do código antes do _commit_ e teste manual do fluxo completo no browser.

## 4. Testes do UC-VID-001 [Reconstruído]

**Data:** 2026-10-16 · **Evidência:** `5478fc9`

```text
Escreve os testes do UC-VID-001: unitários da lógica dos troços, uma demonstração com um vídeo sintético,
o fluxo completo pela API e casos de robustez (muitos troços, serviço parado a meio, apagar o vídeo,
ficheiros temporários).
```

**Resultado:** testes TST-SIL-01 a 05.
**Validação:** confronto de cada teste com o critério de aceitação do requisito e execução dos testes.

## 5. Revisão cruzada dos casos de uso [Reconstruído]

**Data:** 2026-10-19 · **Evidência:** `eaea9c7`, `587783b`

```text
Compara os cinco casos de uso e indica as incoerências entre eles (quota, estados, limites, formatos) e os
critérios de aceitação que não são verificáveis.
```

**Resultado:** lista de incoerências e documentos alinhados; no UC-VID-001, Q1 e Q3 encerradas, critério
mensurável no REQ-021 e REQ-040 reclassificado como Segurança.
**Validação:** cada ponto foi analisado pelo autor do caso de uso; os pontos comuns foram decididos pelo grupo.

## 6. Alinhar as ferramentas com os requisitos comuns [Reconstruído]

**Data:** 2026-10-22 · **Evidência:** `e134a50`

```text
Alinha as cinco ferramentas de vídeo com os requisitos comuns: quota reservada no pedido, descontada só no
sucesso e devolvida na falha ou cancelamento, os mesmos estados, tempo máximo, prioridade Premium e
mensagens de erro iguais. Corrige também os problemas do teste manual: a remoção de fundo esgota o tempo
máximo e o erro não aparece na interface, e as legendas falham num vídeo curto.
```

**Resultado:** ferramentas alinhadas, três correções (remoção de fundo, mensagens de erro, legendas) e testes
novos TST-QUOTA-01/02, TST-FAIL-01, TST-BG-02, TST-LEG-04 e TST-VID-01.
**Validação:** revisão do código, execução dos testes, verificação da prioridade num RabbitMQ real e novo
teste manual no browser.
