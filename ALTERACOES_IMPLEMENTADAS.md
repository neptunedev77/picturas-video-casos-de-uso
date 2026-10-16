# 📋 Relatório de Alterações e Funcionalidades Implementadas

- **Projeto:** PictuRAS — Edição e Processamento de Imagem e Vídeo
- **Unidade Curricular:** Requisitos e Arquitetura de Software (RAS) — MEI, Universidade do Minho
- **Equipa:** Grupo 25 — António Sousa, Bruno Sousa, Bruno Vale, Diogo Macedo, Sérgio Vieira
- **Última atualização:** Outubro de 2026

---

## 🎯 1. Resumo Executivo

Este documento descreve as alterações, novos microsserviços e componentes de interface implementados na plataforma **PictuRAS** para suportar **vídeo**. É atualizado por cada elemento da equipa sempre que conclui uma funcionalidade (ver secção 3).

| Funcionalidade | Responsável | Branch | Estado |
|---|---|---|---|
| Base de suporte a vídeo e reorganização do repositório | Diogo Macedo | `diogo/setup-base-picturas` | ✅ Integrado |
| **UC-VID-003** — Anonimizar rostos e matrículas (`privacy_blur`) | Diogo Macedo | `diogo/setup-base-picturas` | ✅ Integrado |
| **UC-VID-001** — Remover silêncios e pausas (`silence_removal`) | António Sousa | `antonio/silencio-pausas` | ✅ Implementado |
| UC-VID-002 — Comprimir e otimizar vídeo | Bruno Sousa | — | ⏳ Por implementar |
| UC-VID-004 — Gerar legendas automáticas | Bruno Vale | — | ⏳ Por implementar |
| FEATURE-001 — Recorte temporal de vídeo | Sérgio Vieira | — | ❓ A confirmar |
| FEATURE-002 — Captura de fotograma de vídeo | Sérgio Vieira | — | ❓ A confirmar |

⏳ Por implementar · ❓ Funcionalidade ainda a confirmar pelo responsável · ✅ Implementado / Integrado

---

## 🏗️ 2. Estrutura do Repositório

Para manter o repositório organizado e separar a documentação dos casos de uso da base de código:
```text
picturas-27/
├── casos-de-uso/                 # Documentação e especificações de requisitos da equipa
├── projeto/                      # Todo o código-fonte, microsserviços e orquestração Docker
│   ├── Tools/                    # Ferramentas de processamento (privacy_blur, silence_removal, ...)
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
* **Infraestrutura:** contentor `privacy_blur_tool` e fila `privacy_blur_queue`, com fila prioritária para Premium.

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

---

## 📌 5. Estado Atual do Git
* Cada funcionalidade é desenvolvida na sua branch e integrada na `main` à vez, para evitar conflitos.
* **Diogo Macedo** (`diogo/setup-base-picturas`): base de vídeo e UC-VID-003, integrados na `main`.
* **António Sousa** (`antonio/silencio-pausas`): UC-VID-001, desenvolvido a partir da `main` com o UC-VID-003, sem alterar o funcionamento do blur.
* Todo o código foi testado e validado em ambiente local antes da integração.
