# 📋 Relatório de Alterações e Funcionalidades Implementadas

**Projeto:** PictuRAS — Edição e Processamento de Imagem e Vídeo  
**Unidade Curricular:** Requisitos e Arquitetura de Software (RAS) — MEI, Universidade do Minho  
**Autor:** Diogo Macedo  
**Data:** Outubro de 2026  
**Ramo (Branch):** `diogo/setup-base-picturas` ➔ `main`  

---

## 🎯 1. Resumo Executivo

Este documento descreve detalhadamente todas as alterações, novos microsserviços, componentes de interface e melhorias de arquitetura implementadas na plataforma **PictuRAS**, com foco principal na especificação e implementação do **Caso de Uso UC-VID-003: Anonimização de Rostos e Matrículas em Vídeo (`privacy_blur`)**, bem como na reestruturação e suporte nativo a vídeo em toda a aplicação.

---

## 🏗️ 2. Nova Estrutura do Repositório

Para manter o repositório organizado e separar a documentação dos casos de uso da base de código:
```text
picturas-27/
├── casos-de-uso/                 # Documentação e especificações de requisitos da equipa
│   ├── FEATURE-001_...
│   ├── UC-VID-001-...
│   ├── UC-VID-003-anonimizar-rostos-matriculas.md
│   └── ...
├── projeto/                      # Todo o código-fonte, microsserviços e orquestração Docker
│   ├── Tools/                    # Ferramentas de processamento (incluindo privacy_blur)
│   ├── apiGateway/               # Gateway REST
│   ├── frontend/                 # Aplicação Web (Next.js 15, React 19, Tailwind)
│   ├── imageStorageService/      # Gestor de armazenamento S3 / SeaweedFS
│   ├── projects/                 # Microsserviço de gestão de projetos e pipelines
│   ├── subscriptions/            # Gestão de utilizadores e planos (Free / Premium)
│   ├── users/                    # Serviço de autenticação e contas
│   ├── wsGateway/                # Gateway WebSocket para eventos em tempo real
│   ├── docker-compose.yaml       # Ficheiro principal de orquestração Docker
│   └── ...
├── .gitignore
├── README.md
└── ALTERACOES_IMPLEMENTADAS.md   # Este documento explicativo
```

---

## 🔍 3. Detalhe das Alterações por Componente

### 3.1. Novo Microsserviço: Ferramenta de Anonimização (`projeto/Tools/privacy_blur/`)
Foi construído de raiz um novo serviço dedicado ao processamento e anonimização de vídeo:
* **Ficheiros adicionados:**
  * `privacy_blur.py`: Lógica central do worker.
  * `Dockerfile`: Container baseado em Python 3.10 com dependências de OpenCV, FFmpeg e Pika (RabbitMQ).
  * `requirements.txt`: Dependências (`opencv-python-headless`, `pika`, `requests`, `numpy`).
* **Principais Funcionalidades do Worker:**
  1. **Anonimização com IA / Visão Computacional:**
     - Deteção em tempo real de rostos e matrículas através de modelos Haar Cascade otimizados.
     - Suporte a múltiplos modos:
       - `auto`: IA deteta e anonimiza automaticamente todos os rostos/matrículas encontrados.
       - `manual`: O utilizador define uma área delimitadora (*bounding box*) específica para ofuscar.
       - `hybrid`: Combina a deteção automática com a caixa manual definida pelo utilizador.
     - **Deteção Facial Integral:** O efeito de blur é aplicado na totalidade da face (com margens de segurança para queixo, testa e orelhas) e não apenas na zona ocular.
     - **Rastreamento Temporal (*Object Tracking*):** Algoritmo que rastreia as posições dos rostos entre frames contíguos (`tracked_faces`), eliminando o efeito de *flicker* (piscar) quando uma pessoa se move ou vira ligeiramente a cara.
  2. **Controlo Temporal por Segundos:**
     - Suporte a parâmetros `timeIntervals` (ex: `0-3s, 5-6s`), permitindo que a anonimização seja aplicada **apenas nos intervalos de segundos desejados**, mantendo o resto do vídeo completamente nítido e original.
  3. **Validação Automática da Duração do Vídeo:**
     - O worker calcula a duração real através dos frames (`duration_sec = total_frames / fps`).
     - Intervalos que ultrapassem a duração do vídeo são automaticamente limitados (*clamped*) ao final do vídeo (`min(end, duration_sec)`).
     - Intervalos que comecem depois do final do vídeo são ignorados com aviso nos logs.
  4. **Preservação e Sincronização de Áudio Original:**
     - Utiliza `ffmpeg` para extrair a pista de áudio do vídeo original e fundi-la no vídeo de saída sem re-compressão de áudio (`-c:a copy` ou `-c:a aac`), garantindo que o vídeo final mantém o som intacto.
  5. **Estilos de Blur:**
     - Suporta `gaussian` (desfocagem suave), `pixelate` (mosaico clássico) e `black_box` (tarja preta opaca), com intensidades `light`, `medium` e `strong`.

---

### 3.2. Frontend (`projeto/frontend/`)
A interface web foi significativamente expandida para permitir manipulação nativa de vídeos e uma experiência interativa:
* **Nova Ferramenta na Toolbar (`components/toolbar/privacy-blur-tool.tsx`):**
  - Controlo de alvos: *Rostos*, *Matrículas* ou *Ambos*.
  - Controlo de Modo: *Automático (IA)*, *Manual (Caixa)* ou *Híbrido*.
  - Desenho interativo na imagem/vídeo: permite ao utilizador clicar e arrastar para definir a caixa de anonimização diretamente no ecrã.
  - Seletor de tempo:
    - Botão **"Todo o Vídeo"**.
    - Botão **"Definir Segundos"**: permite adicionar múltiplos intervalos (ex: `De 0s a 3s`, `De 5s a 6.5s`), com atalhos de texto rápido (`0-3, 5-6`).
  - **Validação de Duração no Ecrã:**
    - O frontend deteta a duração do vídeo ativo.
    - Se o utilizador inserir um valor superior à duração real do vídeo (ex: colocar 20s num vídeo de 5s), é apresentado um **alerta visual em tom âmbar** e os campos ficam destacados.
    - Inclui um botão inteligente de 1 clique: `➜ Ajustar intervalos para o limite do vídeo (0-Xs)` que corrige automaticamente os valores.
* **Suporte Completo a Vídeo em Todo o Editor:**
  - `components/project-page/project-image.tsx` e `project-image-list.tsx`: Atualizados para suportar elementos `<video controls>` lado a lado com imagens tradicionais.
  - `components/image-preview.tsx`: Modal de pré-visualização agora reproduz ficheiros `.mp4` com áudio e controlos de timeline.
  - `components/project-page/add-images-dialog.tsx`: Limite de upload aumentado para vídeos (até 100MB e aceitação de extensões `.mp4`).
* **Sincronização em Tempo Real (Sem necessidade de recarregar a página):**
  - Em `providers/project-provider.tsx`, foi adicionado o listener de WebSockets para novos ficheiros adicionados ou removidos, atualizando a grelha de mídia instantaneamente sem ser necessário fazer F5 / refresh no browser.
* **Tipos de Dados (`lib/tool-types.ts` e `lib/projects.ts`):**
  - Adicionadas interfaces TypeScript `TimeInterval`, `ManualBoundingBox` e propriedades `duration`, `width`, `height` na estrutura do projeto.

---

### 3.3. Microsserviço de Projetos e Orquestração (`projeto/projects/`)
* **Validação de Regras de Negócio (`routes/projects.js`):**
  - **Limites de Perfil:**
    - Contas **Gratuitas (Free):** Vídeos até 60 segundos e resolução máxima Full HD (1080p).
    - Contas **Premium:** Vídeos até 300 segundos e resolução máxima 4K.
    - Utilizadores anónimos são impedidos de processar vídeos (HTTP 403).
  - **Validação de Intervalos:** Rejeição do pedido com HTTP 400 se o intervalo de tempo ultrapassar a duração do vídeo.
  - **Notificações WebSocket:** Envio de eventos `IMAGE_ADDED` e `IMAGE_REMOVED` via RabbitMQ / WebSocket Gateway para que o frontend se atualize automaticamente.
* **Modelos:** Atualização do schema Mongoose em `models/project.js` para persistir os novos metadados de vídeo (`duration`, `fps`, `width`, `height`).

---

### 3.4. Armazenamento e Nginx (`imageStorageService` e `nginx`)
* **Suporte a Arquivos de Grande Dimensão:**
  - `nginx/nginx.conf`: Configurado `client_max_body_size 100M;` para permitir upload de vídeos de alta resolução.
  - `imageStorageService`: Multer e endpoints de upload configurados para aceitar `video/mp4` até 100MB.

---

### 3.5. Infraestrutura RabbitMQ e Docker Compose
* **`docker-compose.yaml`:**
  - Adicionado o contentor `privacy_blur_tool` ligado à rede interna e volumes partilhados de imagem.
* **`rabbitMQ/definitions.json`:**
  - Criação da fila `privacy_blur_queue` durável e respetiva ligação (*binding*) à exchange central `picturas`.
  - Configuração da fila prioritária para utilizadores Premium.

---

## 🚀 4. Como Executar e Testar

### 4.1. Iniciar os Serviços
Como os serviços estão agora dentro da pasta `projeto/`:
```bash
cd /Users/diogomacedo/picturas-27/projeto
docker compose up -d
```

### 4.2. Aceder à Aplicação
1. Abrir o browser em: **`https://localhost:8080`** (aceitar o certificado autoassinado).
2. Fazer login ou registar uma conta (para ter permissões de vídeo, usar conta Free ou Premium).
3. Criar ou abrir um projeto.
4. Fazer upload de um vídeo `.mp4` (ex: um vídeo de teste de 5 a 10 segundos).
5. Na barra de ferramentas, clicar em **Anonimização de Vídeo** (ícone de escudo/olho):
   - Escolher **"Definir Segundos"**.
   - Testar colocar um tempo superior à duração do vídeo (ver o alerta âmbar e o botão de ajuste automático).
   - Definir um intervalo (ex: `0-3`).
   - Clicar em **Aplicar**.
6. Executar o processamento e verificar no vídeo final gerado:
   - Rostos completamente tapados durante os segundos definidos.
   - Resto do vídeo sem blur.
   - Som e áudio original 100% preservados!

---

## 📌 5. Estado Atual do Git
* Todo o código foi testado e validado em ambiente local.
* As alterações da branch de trabalho foram organizadas e integradas na branch `main`, em harmonia com a pasta `casos-de-uso/` da restante equipa.

