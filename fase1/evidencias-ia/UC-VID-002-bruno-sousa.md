# UC-VID-002 — Comprimir/otimizar vídeo (Bruno Sousa)

**Ferramenta:** ChatGPT (OpenAI).
**Configuração:** nenhuma (ver o [README](README.md)).

Todos os _prompts_ são reconstruídos: o histórico das conversas não ficou disponível.

## 1. Estruturar o caso de uso [Reconstruído]

**Data:** 2026-10-05 · **Evidência:** `78662ab`

```text
Tenho este template de caso de uso e o enunciado da fase 1. Ajuda-me a estruturar o caso de uso "Comprimir
vídeo" para o PictuRAS: o que deve ir no fluxo principal e que fluxos alternativos fazem sentido.
```

**Resultado:** estrutura do caso de uso e fluxos alternativos (alterar qualidade, cancelar, outro vídeo).
**Validação:** comparação com os templates e o enunciado; adaptação à aplicação real.

## 2. Requisitos funcionais [Reconstruído]

**Data:** 2026-10-05 · **Evidência:** `78662ab`

```text
Deriva os requisitos funcionais deste caso de uso a partir dos passos, regras de negócio e exceções. Um
requisito por linha, atómico, com a origem (passo ou RN) e critério de aceitação.
```

**Resultado:** requisitos REQ-VID-COMP com origem e critério.
**Validação:** verificação da origem de cada requisito e da numeração.

## 3. Requisitos não funcionais e alvos [Reconstruído]

**Data:** 2026-10-05 · **Evidência:** `78662ab`

```text
Classifica estes requisitos de qualidade segundo a ISO/IEC 25010 e propõe um alvo para produção e outro para o
MVP, sem GPU. Explica de onde vem cada valor.
```

**Resultado:** classificação ISO/IEC 25010 e alvos MVP/produção.
**Validação:** revisão dos valores propostos face ao ambiente do MVP.

## 4. Backend da compressão [Reconstruído]

**Data:** 2026-10-17 · **Evidência:** `8dad364`

```text
Implementa o fluxo de compressão: serviço Python com FFmpeg com os perfis Alta (CRF 23), Equilibrada (CRF 28) e
Tamanho reduzido (CRF 32, máx. 720p), fila RabbitMQ e rotas no projects para criar, consultar e transferir.
```

**Resultado:** serviço `video_compression` e rotas no `projects`.
**Validação:** compressão testada com vídeos reais e revisão do código.

## 5. Limites, quota e dono [Reconstruído]

**Data:** 2026-10-17 · **Evidência:** `973ee6e`

```text
Acrescenta a validação dos limites por plano (500 MB/10 min free, 2 GB/60 min premium), a quota diária e a
verificação do dono do projeto, com testes unitários e de contrato.
```

**Resultado:** validação de limites, quota e propriedade, com `test_authorization.py` e `test_quota.cjs`.
**Validação:** execução dos testes.

## 6. Alinhamento com a revisão [Reconstruído]

**Data:** 2026-10-21 · **Evidência:** `b1c3e14`, `dd4739b`, `039380e`, `44c20dd`

```text
Revê a implementação face aos requisitos atualizados: perfis de qualidade, cancelamento durante o
processamento, tempo máximo e falta de capacidade. Diz o que falta e corrige com testes.
```

**Resultado:** perfis alinhados, cancelamento durante o processamento, tempo máximo e tratamento da falta de
capacidade.
**Validação:** testes automáticos (TST-COMP-01 a 04).
