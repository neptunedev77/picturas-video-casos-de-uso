# UC-VID-003 — Anonimizar rostos e matrículas (Diogo Macedo)

**Ferramenta:** Gemini (Google).
**Configuração:** nenhuma (ver o [README](README.md)).

Todos os _prompts_ são reconstruídos: o histórico das conversas não ficou disponível.

## 1. Estruturar o caso de uso [Reconstruído]

**Data:** 2026-10-05 · **Evidência:** `c75a3f6`

```text
Ajuda-me a estruturar o caso de uso de anonimização de rostos e matrículas num vídeo para o PictuRAS, com
RGPD em mente: fluxo principal, exceções (limites do plano, ficheiro inválido, tempo excedido) e regras.
```

**Resultado:** estrutura do caso de uso, exceções e regras de negócio.
**Validação:** revisão e adaptação à aplicação e ao template.

## 2. ERS completa [Reconstruído]

**Data:** 2026-10-15 · **Evidência:** `3d801b6`

```text
Expande a secção 4 para uma ERS completa: requisitos funcionais, não funcionais com ISO/IEC 25010 e alvos MVP
vs produção, decisões de qualidade e matriz de rastreabilidade.
```

**Resultado:** secção 4 do caso de uso (REQ-VID-BLUR, DQ, rastreabilidade).
**Validação:** revisão de cada requisito e dos alvos.

## 3. Suporte a vídeo na base [Reconstruído]

**Data:** 2026-10-15 · **Evidência:** `64e9e68`

```text
O PictuRAS só aceita imagens. O que tenho de alterar no frontend, no imageStorageService e no projects para
aceitar e reproduzir vídeos MP4?
```

**Resultado:** upload e reprodução de vídeo MP4 no frontend, no `imageStorageService` e no `projects`.
**Validação:** teste manual de upload e reprodução.

## 4. Ferramenta de anonimização [Reconstruído]

**Data:** 2026-10-16 · **Evidência:** `ff27352`

```text
Cria um worker privacy_blur, igual às ferramentas de imagem, que deteta rostos e matrículas com OpenCV em cada
fotograma e aplica desfocagem gaussiana ou mosaico, mantendo o áudio original.
```

**Resultado:** serviço `privacy_blur_tool`.
**Validação:** testes ponta a ponta com vídeos sintéticos (TST-BLUR-01 a 03), que revelaram os falsos positivos
dos classificadores Haar.

## 5. Intervalos de tempo [Reconstruído]

**Data:** 2026-10-16 · **Evidência:** `e614c2e`

```text
Acrescenta a opção de aplicar a anonimização só em intervalos de tempo e valida que o intervalo não passa da
duração do vídeo.
```

**Resultado:** anonimização por intervalos, com aviso e ajuste à duração do vídeo.
**Validação:** teste manual na interface.

## 6. Aplicar a revisão cruzada [Reconstruído]

**Data:** 2026-10-21 · **Evidência:** `f9201d1`, `fa176da`

```text
Aplica ao caso de uso as alterações deste PDF de revisão e deixa o documento com a mesma estrutura dos outros.
```

**Resultado:** caso de uso atualizado e uniformizado com os restantes.
**Validação:** confronto com o PDF da revisão.
