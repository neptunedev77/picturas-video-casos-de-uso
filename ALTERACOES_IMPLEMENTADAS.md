# 📋 Relatório de Alterações e Funcionalidades Implementadas

- **Projeto:** PictuRAS — Edição e Processamento de Imagem e Vídeo
- **Unidade Curricular:** Requisitos e Arquitetura de Software (RAS) — MEI, Universidade do Minho
- **Equipa:** Grupo 6 — António Sousa, Bruno Sousa, Bruno Vale, Diogo Macedo, Sérgio Vieira
- **Última atualização:** Outubro de 2026

---

## 🎯 1. Resumo Executivo

Este documento descreve as alterações, novos microsserviços e componentes de interface implementados na plataforma **PictuRAS** para suportar **vídeo**. É atualizado por cada elemento da equipa sempre que conclui uma funcionalidade (ver secção 3).

| Funcionalidade | Responsável | Branch | Estado |
|---|---|---|---|
| Base de suporte a vídeo e reorganização do repositório | Diogo Macedo | `diogo/setup-base-picturas` | ✅ Integrado |
| **UC-VID-003** — Anonimizar rostos e matrículas (`privacy_blur`) | Diogo Macedo | `diogo/setup-base-picturas` | ✅ Integrado |
| **UC-VID-001** — Remover silêncios e pausas (`silence_removal`) | António Sousa | `antonio/silencio-pausas` | ✅ Integrado |
| **UC-VID-002** — Comprimir e otimizar vídeo (`video_compression`) | Bruno Sousa | `bruno/video-compression` | ✅ Integrado |
| **UC-VID-004** — Gerar legendas automáticas (`subtitle_generation`) | Bruno Vale | `bruno/legendas-automaticas` | ✅ Integrado |
| **UC-VID-005** — Remoção e substituição de fundo por IA (`video_bg_remove`) | Sérgio Vieira | `sergio/remocao-fundo-video` | ✅ Integrado |

✅ Integrado = a branch foi juntada à `main`. As diferenças que ainda existem entre a implementação e os requisitos estão na secção 5.

---

## 🏗️ 2. Estrutura do Repositório

Para manter o repositório organizado e separar a documentação dos casos de uso da base de código:
```text
picturas-video-casos-de-uso/
├── casos-de-uso/                 # Documentação e especificações de requisitos da equipa
├── projeto/                      # Todo o código-fonte, microsserviços e orquestração Docker
│   ├── Tools/                    # Ferramentas (privacy_blur, silence_removal, video_compression, subtitle_generation, video_bg_remove, ...)
│   ├── apiGateway/               # Gateway REST
│   ├── frontend/                 # Aplicação Web (Next.js 15, React 19, Tailwind)
│   ├── imageStorageService/      # Gestor de armazenamento S3 / SeaweedFS
│   ├── projects/                 # Microsserviço de gestão de projetos e pipelines
│   ├── subscriptions/            # Gestão de planos (Free / Premium)
│   ├── users/                    # Serviço de autenticação e contas
│   ├── wsGateway/                # Gateway WebSocket para eventos em tempo real
│   ├── docker-compose.yaml       # Ficheiro principal de orquestração Docker
│   └── ...
├── .gitignore
├── README.md
└── ALTERACOES_IMPLEMENTADAS.md   # Este documento explicativo
```

Cada ferramenta de vídeo é um **microsserviço próprio** em `projeto/Tools/<ferramenta>/`, com a sua fila no RabbitMQ (`rabbitMQ/definitions.json`), o seu contentor no `docker-compose.yaml` e um botão na barra de ferramentas de vídeo do frontend.

---

## 🔍 3. Detalhe das Alterações

### 3.1. Base de Suporte a Vídeo
Alterações comuns, usadas por todas as funcionalidades de vídeo:
* **Frontend:**
  - O editor e a pré-visualização reproduzem vídeos `.mp4` com áudio e controlos de timeline.
  - Upload de vídeos até 100 MB.
  - Quando o item aberto é um vídeo, a barra de ferramentas mostra as ferramentas de vídeo.
  - A grelha atualiza-se em tempo real quando são adicionados ou removidos ficheiros (sem F5).
* **Projetos (`projects`):**
  - Eventos WebSocket `IMAGE_ADDED` e `IMAGE_REMOVED`.
  - Metadados de vídeo (`duration`, `width`, `height`) no modelo do projeto.
  - Utilizadores anónimos não podem processar vídeos (HTTP 403).
* **Armazenamento e Nginx:** `client_max_body_size 100M;` e aceitação de `video/mp4`.

### 3.2. UC-VID-003 — Anonimizar Rostos e Matrículas *(Diogo Macedo)*
* **Microsserviço `Tools/privacy_blur/`** (OpenCV, FFmpeg, Pika):
  - Deteção de rostos e matrículas com Haar Cascade, nos modos `auto`, `manual` (área definida pelo utilizador) e `hybrid`.
  - Blur aplicado à face inteira, com rastreamento entre fotogramas para evitar *flicker*.
  - Anonimização só nos intervalos de tempo pedidos (ex.: `0-3s, 5-6s`), limitados à duração real do vídeo.
  - Áudio original preservado com `ffmpeg`.
  - Estilos `gaussian` e `pixelate`, com várias intensidades.
* **Frontend (`components/toolbar/privacy-blur-tool.tsx`):**
  - Escolha de alvos (rostos, matrículas, ambos), modo, estilo e intensidade.
  - Intervalos de tempo ("Todo o Vídeo" ou "Definir Segundos").
  - Alerta âmbar e botão de ajuste automático se o intervalo ultrapassar a duração do vídeo.
* **Regras de negócio:** Free até 60 s e 1080p; Premium até 300 s e 4K; HTTP 400 se o intervalo ultrapassar a duração do vídeo.
* **Infraestrutura:** contentor `privacy_blur_tool` e fila `privacy_blur_requests_queue`, com prioridade para pedidos Premium.

### 3.3. UC-VID-001 — Remover Silêncios e Pausas *(António Sousa)*
* **Microsserviço `Tools/silence_removal/`** (FFmpeg, Pika):
  - **Análise** do áudio que deteta as pausas, com os perfis Suave, Equilibrado e Agressivo e a opção de música de fundo.
  - **Cortes** no som e na imagem nos mesmos tempos, com suavização para não haver estalidos.
  - Verificação automática da sincronização (desfasamento ≤ 40 ms).
  - Até 2 pedidos em simultâneo, cancelamento a meio e tempos máximos.
* **Frontend:** botão **Remover silêncios** por baixo do blur, que abre um ecrã próprio:
  - opções de deteção;
  - progresso, com cancelar sempre visível;
  - **revisão** dos troços numa linha temporal (ouvir, desmarcar, ajustar início/fim);
  - resultado com o tempo poupado e o novo vídeo.
* **Projetos (`projects`):**
  - Novos endpoints `/silence` (analisar, rever, aplicar, cancelar, estado).
  - A revisão fica guardada 7 dias para retomar mais tarde.
  - O resultado é acrescentado ao projeto como `<nome>-sem-silencios.mp4`; o original não é alterado.
* **Regras de negócio:**
  - A análise não gasta operações (Free: até 15 por dia).
  - Aplicar gasta 1 operação no Free, devolvida se o pedido for cancelado ou falhar.
  - Free até 2 min e 1080p; Premium até 30 min e 4K, com prioridade na fila.
* **Infraestrutura:** contentor `silence_removal_tool`, filas `silence_removal_queue` e `silence_results_queue`, evento WebSocket `silence-update` e contador de análises no serviço `users`.
* Documentação técnica e testes automáticos em `projeto/Tools/silence_removal/README.md`.

### 3.4. UC-VID-005 — Remoção e Substituição Automática de Fundo por IA *(Sérgio Vieira)*
* **Microsserviço `Tools/video_bg_remove/`** (ONNX Runtime, OpenCV, FFmpeg, Pika):
  - Modelo neural leve `u2netp` (4,7 MB, formato ONNX), embutido na imagem Docker (sem descarga no arranque).
  - A IA corre num fotograma em cada três; os fotogramas intermédios recebem a interpolação das duas máscaras-chave vizinhas. Frame a frame, em CPU, a inferência demorava 6 a 12 vezes a duração do vídeo e esgotava o tempo máximo; agora um vídeo de 10,5 s demora 20 s.
  - *Feathering* localizado: suavização gaussiana seletiva restrita à banda de transição da máscara ($0.05 \le \alpha \le 0.95$), preservando o interior 100% nítido e o fundo limpo.
  - Três modos de substituição: **Chroma Key (verde `#00FF00`)**, **Cor Sólida** (paleta RGB personalizada) e **Desfocagem de Profundidade (*Portrait Bokeh*)** com aproximação multi-escala rápida.
  - Streaming em memória via pipe `stdin` direto para processo FFmpeg em paralelo, eliminando gigabytes de escrita e leitura temporária em SSD.
  - Junção do áudio com preservação da cadência e dos timestamps (meta de sincronismo ≤ 40 ms); o áudio é sempre recodificado em AAC; codificação H.264 com `+faststart` (índice no início) e tolerância a vídeos sem áudio.
  - Monitor de timeout de segurança proporcional à duração ($(3\times \text{duração} + 60\text{ s})$), com cancelamento gracioso e registo de deteção de sujeito.
* **Frontend (`components/toolbar/video-bg-remove-tool.tsx`):**
  - Janela modal com pré-visualização de vídeo e seletores dinâmicos de modo (Chroma Key, Seletor de cor hexadecimal e Slider de intensidade Bokeh).
  - Configuração de intervalo temporal (Todo o Vídeo ou Segmento $T_{start}$ a $T_{end}$) com validação de duração e botão de ajuste rápido (FA4).
  - Bloqueio de seleção de modo Desfocagem Bokeh para contas Free com alerta visual e badge PRO/cadeado (REQ-VID-BG-030).
  - Alerta de duração excedida para contas Free (> 30s).
  - Painel de acompanhamento com estados e notificações Toast via WebSocket.
* **Projetos / Regras de negócio (`projects/routes/projects.js`):**
  - `video_bg_remove` integrado no catálogo de `advanced_tools` para validação e consumo de quotas diárias.
  - Bloqueio no backend do modo Bokeh para contas Free com HTTP 403 (REQ-VID-BG-030).
  - Free até 30 s e 720p; Premium até 180 s e 1080p, com prioridade na fila RabbitMQ.
  - Acesso exclusivo a utilizadores autenticados (Anónimos bloqueados com HTTP 401/403 - RN0).
  - Edição estritamente não-destrutiva: o ficheiro gerado é registado como `<nome>_sem_fundo.mp4`; o vídeo original permanece intacto.
  - Quota pelo circuito genérico das ferramentas avançadas: a operação é reservada na submissão e devolvida em caso de erro (a especificação pede desconto só no sucesso).
* **Infraestrutura:** contentor `video_bg_remove_tool` e fila durável `video_bg_remove_requests_queue`, com prioridade para pedidos Premium (`definitions.json`).

### 3.5. UC-VID-002 — Comprimir e Otimizar Vídeo *(Bruno Sousa)*
* **Microsserviço `Tools/video_compression/`** (FFmpeg, Pika):
  - Três níveis de qualidade em H.264: **Alta** (CRF 23, resolução original), **Equilibrada** (CRF 28, resolução original) e **Tamanho reduzido** (CRF 32, no máximo 720p, sem aumentar a resolução).
  - Valida o vídeo real (MP4/H.264, áudio opcional) e o espaço em disco antes de arrancar; nunca altera o original (trabalha numa cópia).
  - Tempo máximo do FFmpeg de 3× a duração + 60 s (igual às restantes ferramentas); cancelamento em fila e em processamento, com o FFmpeg terminado e os temporários apagados.
  - Detalhes técnicos em `projeto/Tools/video_compression/README.md`.
* **Projetos (`projects`):**
  - Novas rotas `/:user/:project/compression` (criar, listar, estado, transferir resultado, cancelar) para o dono e para quem tem link de partilha (edição para criar e cancelar, leitura só para consultar); anónimos recusados.
  - Limites por plano: Free até 500 MB e 10 min; Premium até 2 GB e 60 min (na prática limitados pelo _upload_ de 100 MB).
  - Quota de quem executa o pedido: um Free sem operações é recusado antes de entrar na fila; a operação é reservada quando o FFmpeg arranca e devolvida se o pedido falhar, for cancelado ou exceder o tempo máximo.
  - O vídeo comprimido é acrescentado ao projeto como `<nome>-comprimido.mp4` (evento `IMAGE_ADDED`) e também pode ser transferido pelo diálogo.
* **Frontend (`components/compression/compression-dialog.tsx`, `lib/compression.ts`):** escolha da qualidade, estado em tempo real (com os cinco estados comuns), cancelamento, mensagens de erro em português, tamanho final e redução, aviso quando o resultado fica maior do que o original, transferência autenticada e uso em projetos partilhados.
* **Infraestrutura:** contentor `video_compression_tool`, filas `video_compression_requests_queue` (com prioridade para Premium) e `video_compression_results_queue`, e evento WebSocket `compression-update`.

### 3.6. UC-VID-004 — Gerar Legendas Automáticas *(Bruno Vale)*
* **Microsserviço `Tools/subtitle_generation/`** (faster-whisper, FFmpeg, Pika):
  - Extrai o áudio, faz o reconhecimento de fala em CPU (modelos `base` ou `small`) e produz segmentos com tempos; depois da confirmação gera o ficheiro SRT.
  - Recusa vídeos sem faixa de áudio utilizável e volta a verificar os limites no ficheiro real (10 minutos, 100 MB); tempo máximo de 3× a duração + 60 s, sem repetição automática; um trabalho ativo por vídeo.
* **Projetos (`projects`):**
  - Novas rotas `/:user/:project/subtitles` (pedir, estado, confirmar, rejeitar, cancelar), com suporte a projetos partilhados (paga quem executa); idioma (PT ou EN) e duração (até 10 minutos) verificados antes de criar o pedido.
  - Quota: uma operação reservada ao arrancar e devolvida em falha, cancelamento ou rejeição; o Premium não desconta.
  - O SRT é guardado no armazenamento do projeto como `<nome>-legendas-<idioma>.srt`, validado contra os segmentos confirmados.
* **Frontend (`components/subtitles/`, `lib/subtitles.ts`):** escolha do idioma (PT ou EN), acompanhamento do estado, pré-visualização sincronizada com o vídeo (também em ecrã inteiro), confirmar, rejeitar e gerar de novo, e transferência do SRT.
* **Infraestrutura:** contentor `subtitle_generation_tool`, filas `subtitle_generation_queue` (com prioridade), `subtitle_results_queue` e `subtitle_cancel_queue`, evento WebSocket `subtitle-update` e volumes para a cache do modelo e o estado do serviço.

### 3.X. Nova funcionalidade (modelo)
Para acrescentar uma funcionalidade, atualizar a tabela da secção 1 e copiar este modelo:
```markdown
### 3.X. <ID> — <Nome> *(<Responsável>)*
* **Microsserviço `Tools/<servico>/`:** ...
* **Frontend:** ...
* **Projetos / Regras de negócio:** ...
* **Infraestrutura:** contentor e filas ...
```
E acrescentar os passos de teste na secção 4.

---

## 🚀 4. Como Executar e Testar

### 4.1. Iniciar os Serviços
Os serviços estão dentro da pasta `projeto/`:
```bash
cd projeto
docker compose up -d --build
```

### 4.2. Aceder à Aplicação
1. Abrir o browser em **`https://localhost:8080`** (aceitar o certificado autoassinado).
2. Fazer login ou registar uma conta (as ferramentas de vídeo exigem conta Free ou Premium).
3. Criar ou abrir um projeto e fazer upload de um vídeo `.mp4`.
4. Abrir o vídeo: aparecem as ferramentas de vídeo na barra lateral.

### 4.3. Testar o UC-VID-003 (Anonimização)
1. Clicar em **Anonimização de Vídeo** (ícone de olho).
2. Escolher **"Definir Segundos"** e testar um tempo superior à duração do vídeo (ver o alerta âmbar e o ajuste automático).
3. Definir um intervalo (ex.: `0-3`), clicar em **Aplicar** e executar o processamento.
4. Confirmar no vídeo final que os rostos ficam tapados só nesse intervalo e que o som se mantém.

### 4.4. Testar o UC-VID-001 (Remoção de Silêncios)
1. Usar um vídeo **com som** e clicar em **Remover silêncios** (ícone de onda sonora, por baixo do blur).
2. Escolher um perfil (ex.: **Equilibrado**) e clicar em **Analisar**.
3. Rever os troços: ouvir (▶), desmarcar ou ajustar o início e o fim.
4. Clicar em **Aplicar cortes** e confirmar o novo vídeo `<nome>-sem-silencios.mp4` no projeto: pausas removidas, sem estalidos e com a voz sincronizada; o original mantém-se.

### 4.5. Testar o UC-VID-005 (Remoção e Substituição de Fundo por IA)
1. Abrir um vídeo com pessoa/sujeito humano na biblioteca do projeto.
2. Clicar em **Remover Fundo de Vídeo (IA)** na barra de ferramentas.
3. Escolher o modo pretendido (ex.: **Chroma Key `#00FF00`**, **Cor Sólida** ou **Desfocagem de Profundidade**).
4. Opcionalmente definir um intervalo temporal (ou aplicar ao vídeo completo) e clicar em **Processar Vídeo**.
5. Acompanhar a notificação em tempo real via WebSocket e verificar o novo vídeo `<nome>_sem_fundo.mp4` gerado no catálogo com áudio e sincronismo preservados.

### 4.6. Testar o UC-VID-002 (Compressão)
1. Abrir um vídeo MP4 e clicar em **Comprimir/otimizar vídeo**.
2. Escolher a qualidade (ex.: **Tamanho reduzido**) e iniciar; acompanhar o estado e experimentar **Cancelar**.
3. No fim, ver o tamanho final e a redução e transferir o resultado.

### 4.7. Testar o UC-VID-004 (Legendas)
1. Abrir um vídeo falado e clicar em **Gerar legendas**.
2. Escolher o idioma (**Português** ou **Inglês**) e confirmar.
3. Rever a pré-visualização sincronizada, **Confirmar** (ou **Rejeitar** e gerar de novo) e transferir o ficheiro SRT.

### 4.8. Testes automáticos
A partir de `projeto/` (resultados de 21-10-2026 registados no capítulo 10 do relatório):
```bash
node --test Tools/video_compression/tests/test_api.cjs Tools/video_compression/tests/test_quota.cjs
cd frontend && node --test tests/compression.test.cjs tests/subtitles.test.cjs   # precisa do typescript instalado
cd Tools/silence_removal && python -m unittest discover -s tests -v && python cli.py demo   # precisa do FFmpeg
cd Tools/video_compression && python -m unittest discover -s tests -v                    # precisa do FFmpeg e do pika
cd Tools/subtitle_generation && python -m unittest discover -s tests -v
cd Tools && python -m unittest discover -s utils/tests -v
node --test projects/tests/priority_queues.test.cjs
docker run --rm --entrypoint python -w /app picturas-video_bg_remove_tool -m unittest discover -s tests -v
```
Sem FFmpeg no computador, os testes Python correm dentro da imagem do serviço, por exemplo:
`docker run --rm -v "$PWD/Tools/video_compression:/app" -w /app picturas-video_compression_tool python -m unittest discover -s tests -v`.

---

## 📌 5. Estado Atual do Git e Diferenças Conhecidas
* As branches `diogo/setup-base-picturas`, `antonio/silencio-pausas`, `sergio/remocao-fundo-video`, `bruno/legendas-automaticas` e `bruno/video-compression` estão todas integradas na `main`.
* Diferenças entre a implementação e os requisitos comuns, a alinhar quando a equipa fechar as regras comuns (ver o capítulo 6 do relatório, "Conflitos entre funcionalidades"):
  - **Compressão:** já alinhada com todas as regras comuns (quota, estados, tempo máximo, prioridade, tempo real, resultado no projeto e projetos partilhados).
  - **Legendas:** já alinhadas com as regras comuns (tempo máximo, estados, limites e idioma verificados antes da fila); falta a marcação de resultados parciais (REQ-VID-LEG-022).
  - **Estados:** alinhados em todas as ferramentas; a interface usa os cinco nomes comuns (Em fila, A processar, Concluída, Falhada, Cancelada) definidos em `frontend/lib/video-status.ts`, incluindo o painel de processamento do editor usado pela anonimização e pela remoção de fundo.
  - **Remoção de fundo:** sem classificação de falhas nem repetição automática; sem sujeito humano só regista um aviso.
  - **Anonimização:** os classificadores Haar não aplicam o limiar de confiança de 0,65.
  - **Formatos (RNG-02):** a especificação aceita MP4 e MOV em todas as ferramentas, mas o _upload_ (frontend, `imageStorageService`, `projects`) e as ferramentas só aceitam MP4.
  - **Corrigido depois do teste manual (21-10-2026):** (1) a remoção de fundo esgotava o tempo máximo até num vídeo de 10 s e o erro não chegava à interface (agora `u2netp` com fotogramas-chave e interpolação, e o FFmpeg é terminado sem ficar processo zombie); (2) as mensagens de erro das ferramentas da fila do `projects` (anonimização, remoção de fundo e imagem) traziam o identificador do pedido no campo errado e eram ignoradas, pelo que a interface nunca mostrava "Falhada"; (3) as legendas falhavam quando o reconhecimento fazia acabar o último segmento depois do fim do vídeo; agora esse fim é ajustado à duração.
  - **Prioridade Premium:** corrigido. Os pedidos Premium da anonimização e da remoção de fundo iam para a `high_priority_queue`, que nenhum serviço consumia; agora cada ferramenta tem uma fila de pedidos com prioridade (`privacy_blur_requests_queue`, `video_bg_remove_requests_queue`) e as legendas passaram a enviar a prioridade com o pedido.
