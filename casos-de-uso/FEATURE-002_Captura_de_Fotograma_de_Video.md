# 📝 Exercício 1 — Especificação de Funcionalidade
## FEATURE-002: Captura de Fotograma de Vídeo para Edição (*Video-to-Image Frame Extraction*)

---

## 0. Identificação

| **Campo** | **Valor** |
|---|---|
| **Grupo / Equipa** | Grupo 25 |
| **Autores** | Sérgio Vieira (PG65442); António Sousa (PG63923); Rafael Sousa (PG63927); Bruno Vale (PG63926); Diogo Macedo (PG63947) |
| **Data** | 2026-10-08 |
| **Versão do documento** | v1.0 |
| **Unidade Curricular** | Requisitos e Arquiteturas de Software — MEI, Universidade do Minho |

---

## 1. Funcionalidade de vídeo escolhida

| **Campo** | **Valor** |
|---|---|
| **Funcionalidade** | Captura de Fotograma de Vídeo para Edição (*Video-to-Image Frame Extraction*) |
| **Perfil(s) de utilizador abrangido(s)** | Utilizador Registado e Utilizador Premium (o utilizador anónimo não possui persistência de projetos nem acesso a ferramentas de edição no pipeline de processamento) |

### Justificação no contexto do MVP *(2–3 linhas)*
A extração de fotogramas estabelece o elo fundamental de ligação entre o novo módulo de vídeo e o ecossistema maduro de edição gráfica do PictuRAS: permite isolar com precisão cirúrgica qualquer instante de um vídeo e convertê-lo instantaneamente numa imagem nativa de alta fidelidade, pronta para alimentar as 16 ferramentas existentes de processamento e inteligência artificial da plataforma.

---

## 2. Caso de Uso

### 2.1 Cabeçalho

| **Secção** | **Detalhes** |
|---|---|
| **ID do Caso de Uso** | UC-VID-FRAME-001 |
| **Nome** | Capturar Fotograma de Vídeo para Edição (*Frame Extraction*) |
| **Versão** | v1.0 |
| **Autor** | Sérgio Vieira (PG65442) e Equipa do Grupo 25 |
| **Data** | 2026-10-08 |
| **Objetivo** | Permitir ao utilizador navegar na reprodução de um vídeo existente na biblioteca do projeto, selecionar um fotograma estático específico através de um instante temporal ($t$), extraí-lo na resolução espacial nativa e integrá-lo automaticamente na galeria de imagens do projeto como novo artefacto editável. |
| **Âmbito** | Interface Web (Next.js/React), API Gateway, Microsserviço de Projetos (`projects` com motor FFmpeg) e Repositório de Objetos S3 (`imageStorageService` / SeaweedFS). |
| **Ator Principal** | Utilizador Registado ou Premium |
| **Stakeholders e Interesses** | - **Utilizador Final:** Pretende congelar momentos-chave de vídeos (ex.: rostos, detalhes de paisagens ou slides), visualizando a amostra com fidelidade e gerando a imagem de trabalho com um único clique sem degradação visual.<br>- **Equipa de Arquitetura e Engenharia:** Pretende assegurar reutilização transparente do modelo de dados (`project.imgs`), garantindo compatibilidade imediata com o barramento de eventos (RabbitMQ) e ferramentas do `Tools`.<br>- **Administrador da Plataforma:** Pretende garantir controlo de versão concorrente, limpeza rigorosa de artefactos temporários em disco e integridade do repositório de dados. |
| **Pré-condições** | 1. O utilizador encontra-se autenticado com sessão JWT válida.<br>2. O utilizador tem permissões de acesso e edição no projeto ativo.<br>3. O projeto possui pelo menos um ficheiro de vídeo suportado disponível no repositório S3.<br>4. O utilizador dispõe de saldo na sua quota diária de operações (se aplicável ao perfil). |
| **Trigger** | O utilizador acede ao leitor de vídeo ou ao menu de opções do cartão de vídeo na galeria e seleciona **Capturar Fotograma** (*Capture Frame*). |

---

### 2.2 Fluxo Principal

| **Passo** | **Ação do Ator** | **Resposta do Sistema** |
|:---:|---|---|
| **1** | O utilizador visualiza o vídeo no leitor integrado (ou seleciona o menu de contexto do vídeo na biblioteca) e escolhe a opção **Capturar Fotograma** | Pausa o vídeo no instante corrente ($t$) e abre o modal dedicado de captura de fotograma, apresentando a imagem congelada, a linha de navegação fina e os campos de configuração da imagem |
| **2** | O utilizador ajusta finamente o cursor temporal na barra de navegação (ou introduz o instante numérico exato no formato `mm:ss.ms`) | Renderiza dinamicamente a pré-visualização do fotograma correspondente ao instante selecionado e calcula o nome sugerido para o novo ficheiro (ex.: `{nome_original}_frame_{timestamp}s.png`) |
| **3** | O utilizador define/confirma o nome pretendido para a nova imagem (mantendo o formato PNG sem perdas) | Valida que o nome do ficheiro cumpre a nomenclatura aceitável e não entra em colisão destrutiva com ficheiros existentes |
| **4** | O utilizador confirma a extração premindo **Extrair Fotograma** | Valida a elegibilidade da quota, submete o pedido à API Gateway (`POST /projects/:user/:project/video/:videoId/capture-frame`) com o instante temporal e o cabeçalho de concorrência `X-Project-Version`, e apresenta indicador de processamento |
| **5** | — | O serviço `projects` transfere o fluxo do vídeo a partir do SeaweedFS S3, invoca o binário FFmpeg com posicionamento exato (`-ss {t} -vframes 1`) e extrai a imagem na resolução nativa do vídeo |
| **6** | — | O serviço carrega a nova imagem PNG gerada para o bucket S3 do projeto (`/src/`), regista a nova entrada no array de imagens (`project.imgs`), debita a quota diária e incrementa a versão do projeto no MongoDB |
| **7** | — | Notifica a conclusão com sucesso via HTTP `201 Created` e emite evento WebSocket de atualização do projeto |
| **8** | — | O Frontend fecha o modal de captura, atualiza a galeria de imagens via cache reativa e apresenta uma notificação de sucesso (*Toast*), disponibilizando a nova imagem imediatamente para aplicação de filtros e ferramentas de IA |

---

### 2.3 Fluxos Alternativos

| **Fluxo** | **Descrição** |
|---|---|
| **FA1 — Cancelamento da captura** | No Passo 1, 2 ou 3, o utilizador clica em **Cancelar** ou fecha a janela modal → O sistema descarta a captura, não gera qualquer ficheiro no S3 nem debita quota, regressando à visualização normal do projeto. |
| **FA2 — Ajuste fino fotograma a fotograma (*Frame-by-Frame Stepping*)** | No Passo 2, o utilizador utiliza os botões de passo fino ($\pm 1$ frame) ou as setas do teclado → O sistema avança ou recua no vídeo com a granularidade temporal de 1 único fotograma (baseado no framerate do vídeo, tipicamente $\pm 0.033\text{ s}$ ou $\pm 0.04\text{ s}$), permitindo isolar a expressão exata pretendida. |
| **FA3 — Seleção alternativa de formato JPEG/WebP** | No Passo 3, o utilizador opta por selecionar formato comprimido com perdas (JPEG com qualidade 90%) em vez de PNG → O sistema ajusta os parâmetros de codificação na chamada FFmpeg, reduzindo a pegada de armazenamento do artefacto gerado no S3. |

---

### 2.4 Exceções

| **Condição** | **Comportamento do Sistema** |
|---|---|
| **E1 — Instante temporal inválido ($t < 0$ ou $t > \text{duração}$)** | O sistema valida o tempo selecionado; se exceder a duração total ou for negativo, bloqueia a submissão, mantendo o botão inativo e apresentando o alerta: *“O instante selecionado excede a duração do ficheiro de vídeo.”* |
| **E2 — Quota diária de operações esgotada** | No Passo 4, ao validar a quota no serviço de subscrições, verifica-se saldo zero de operações diárias (perfil gratuito). O sistema recusa o processamento com HTTP `403 Forbidden`, exibe aviso modal com sugestão de upgrade para Premium e não executa o FFmpeg. |
| **E3 — Conflito de versão concorrente (*Optimistic Locking*)** | Caso outro colaborador ou separador tenha alterado o projeto em simultâneo, o cabeçalho `X-Project-Version` difere do registo na base de dados. O sistema responde com HTTP `409 Conflict`, recarrega os dados do projeto no frontend e solicita reconfirmação da operação. |
| **E4 — Erro de descodificação do fluxo de vídeo pelo FFmpeg** | Se o ficheiro contiver corrupção num setor ou índice inacessível no instante $t$, o FFmpeg devolve código de erro. O serviço elimina ficheiros temporários em `/tmp`, não altera a base de dados e devolve HTTP `500 Internal Server Error` com a mensagem: *“Não foi possível descodificar o fotograma no instante indicado.”* |
| **E5 — Espaço em disco temporário insuficiente no contentor** | O servidor esgota a capacidade de armazenamento local temporário durante o buffering do vídeo. A rotina falha graciosamente, executa o bloco `finally` de limpeza e devolve HTTP `507 Insufficient Storage`. |

---

### 2.5 Pós-condições

| **Tipo** | **Resultado** |
|---|---|
| **Garantia de Sucesso** | Uma nova imagem estática com resolução espacial nativa idêntica ao vídeo é gravada com sucesso no SeaweedFS S3 e associada ao projeto (`project.imgs`). A versão do projeto é incrementada no MongoDB, é debitada 1 operação na quota diária e o artefacto fica imediatamente disponível na galeria para edição gráfica e IA. O vídeo original permanece intacto. |
| **Garantia Mínima** | Em caso de falha ou cancelamento, nenhum registo órfão é introduzido em `project.imgs`, quaisquer ficheiros temporários no disco do servidor são integralmente eliminados, o saldo de quota mantém-se inalterado e o vídeo original permanece inalterado. |

---

### 2.6 Regras de Negócio e Restrições

| **ID** | **Regra / Restrição** |
|---|---|
| **RN1** | **Preservação Não Destrutiva:** A extração de fotograma é estritamente não destrutiva; o vídeo de origem nunca é alterado, cortado ou substituído no repositório S3. |
| **RN2** | **Fidelidade Espacial Nativa:** A imagem gerada deve preservar integralmente as dimensões originais (largura $\times$ altura em píxeis) e a proporção de aspeto do vídeo de origem, sem interpolação forçada. |
| **RN3** | **Interoperabilidade Total com o Ecossistema:** A imagem resultante é registada com estrutura idêntica a qualquer imagem carregada manualmente pelo utilizador, suportando de imediato a aplicação de todas as 16 ferramentas de processamento gráfico e IA do PictuRAS. |
| **RN4** | **Dedução Condicional de Quota:** É debitada exatamente 1 operação da quota diária de operações apenas e só após a geração e persistência bem-sucedida da imagem na base de dados. |
| **RN5** | **Prevenção de Colisão de Nomenclatura:** Se o nome sugerido para o fotograma colidir com um ficheiro existente na galeria, o sistema apende automaticamente um timestamp em milissegundos para evitar sobreposição involuntária. |
| **RT1** | **Precisão Temporal e Seeking Rápido:** A chamada ao FFmpeg deve utilizar a flag `-ss {timestamp}` antes da entrada (`-i`) para posicionamento ultra-rápido via keyframe de referência mais próximo com descodificação precisa do fotograma pretendido (`-vframes 1`). |
| **RT2** | **Higiene e Limpeza de Ficheiros Temporários:** Todos os ficheiros temporários alocados no diretório `/tmp` do contentor devem ser obrigatoriamente limpos no bloco `finally` do ciclo de vida da requisição. |

---

### 2.7 Assunções

| **ID** | **Assunção** |
|---|---|
| **A1** | O contentor do serviço `projects` possui a suite binária `ffmpeg` instalada e configurada na variável de ambiente `PATH`. |
| **A2** | O reprodutor multimédia HTML5 expõe a propriedade temporal `currentTime` e permite pausa precisa com eventos de frame estáveis. |
| **A3** | O tempo de extração de 1 fotograma individual pelo FFmpeg para vídeos standard não excede $1.5\text{ s}$. |
| **A4** | A rede interna entre os contentores e o SeaweedFS S3 garante largura de banda suficiente para leitura rápida do ficheiro de vídeo. |

---

### 2.8 Questões em Aberto

| **ID** | **Questão** |
|---|---|
| **Q1** | Caso o vídeo original esteja em formato 4K (3840×2160), a imagem deve ser mantida na resolução total ou redimensionada opcionalmente para poupar memória nos workers de IA existentes? |
| **Q2** | Deve a extração de fotogramas ser permitida em projetos partilhados por colaboradores com permissão apenas de leitura (*View Only*)? |
| **Q3** | Deve ser disponibilizada uma funcionalidade de extração contínua em lote (*Burst Extraction* - ex.: 1 fotograma por segundo durante 10 segundos)? |

---

## 3. Utilização de agentes de IA

| **Ferramenta / *skill*** | **Tarefa apoiada** | **Validação realizada pela equipa** |
|---|---|---|
| **Antigravity (Google DeepMind)** | **Estruturação do Caso de Uso e Fluxos:** Delineação do fluxo nominal de captura de fotograma e identificação de fluxos alternativos (navegação frame a frame e seleção de formatos). | A equipa confirmou a importância estratégica de unir o vídeo ao catálogo de ferramentas de imagem do PictuRAS; garantiu que o formato de saída padrão é PNG sem perdas para manter a qualidade necessária aos modelos de IA do `Tools`. |
| **Antigravity (Google DeepMind)** | **Mapeamento de Restrições Técnicas:** Análise dos parâmetros de execução do FFmpeg (`-ss` rápido vs exato) e isolamento de exceções concorrentes com `X-Project-Version`. | A equipa inspecionou a implementação real do endpoint `POST /video/:videoId/capture-frame` no serviço `projects`, validando que os ficheiros temporários em `/tmp` são destruídos com garantia em blocos `finally`. |
| **Antigravity (Google DeepMind)** | **Derivação Formal de Requisitos (Secção 4):** Elaboração da especificação de requisitos funcionais e não-funcionais mensuráveis, matriz de impacto arquitetural e matriz de rastreabilidade bidirecional. | Revisão integral pela equipa; verificação de 100% de rastreabilidade entre os passos do caso de uso e os requisitos; validação dos limites de desempenho ($\le 1.5\text{ s}$ de extração e latência $\le 200\text{ ms}$). |

---
---

## 4. Esboço de requisitos derivados

### 4.1 Requisitos de Sistema

| **ID** | **Requisito** | **Tipo** | **Prioridade** | **Novo/Alt** | **Origem** | **Como verificar** |
|---|---|---|---|---|---|---|
| **REQ-VID-FRAME-001** | O sistema deve disponibilizar um botão de captura de fotograma no leitor de vídeo e no menu de opções de cada vídeo na biblioteca do projeto. | F | Deve ter | NOVO | Passo 1 | *Dado* que o utilizador acede a um projeto com vídeos, *Quando* visualiza o vídeo ou o seu menu, *Então* a opção de capturar fotograma está visível e acessível. |
| **REQ-VID-FRAME-002** | O sistema deve abrir um modal de captura apresentando a imagem congelada no instante atual ($t$) e uma barra de navegação temporal precisa. | F | Deve ter | NOVO | Passo 1, Passo 2 | *Dado* um vídeo em reprodução no instante 00:04.2, *Quando* o utilizador clica em Capturar Fotograma, *Então* o modal abre congelado exatamente nesse instante com os respetivos controlos. |
| **REQ-VID-FRAME-003** | O sistema deve permitir a navegação temporal fina fotograma a fotograma através de controlos de passo ($\pm 1$ frame) e atalhos de teclado. | F | Deveria ter | NOVO | Passo 2, FA2 | *Dado* o modal de captura aberto, *Quando* o utilizador aciona o botão de próximo fotograma ou prime a tecla seta direita, *Então* a pré-visualização avança no incremento exato de 1 fotograma. |
| **REQ-VID-FRAME-004** | O sistema deve sugerir automaticamente um nome descritivo para o ficheiro e permitir a personalização manual do nome pelo utilizador. | F | Deve ter | NOVO | Passo 2, Passo 3, RN5 | *Dado* um vídeo chamado `aula.mp4` e o instante 12.5s, *Quando* o modal abre, *Então* o campo de nome apresenta `aula_frame_12.5s.png` e permite edição. |
| **REQ-VID-FRAME-005** | O sistema deve validar a quota disponível do utilizador e o controlo de concorrência (`X-Project-Version`) antes de despachar a extração. | F | Deve ter | ALT | Passo 4, E2, E3, RN4 | *Dado* a confirmação da extração, *Quando* a requisição é enviada, *Então* o sistema verifica o saldo de quota e a versão do projeto antes de alocar recursos. |
| **REQ-VID-FRAME-006** | O sistema deve invocar o utilitário binário FFmpeg com procura rápida (`-ss`) para extrair o fotograma na resolução nativa do vídeo de origem. | F | Deve ter | NOVO | Passo 5, RN2, RT1 | *Dado* um vídeo 1080p, *Quando* o FFmpeg executa a extração da frame, *Então* a imagem produzida mantém estritamente as dimensões $1920\times 1080$ píxeis. |
| **REQ-VID-FRAME-007** | O sistema deve persistir a imagem gerada no repositório SeaweedFS S3 e registá-la no catálogo do projeto (`project.imgs`). | F | Deve ter | NOVO | Passo 6, Garantia de Sucesso, RN3 | *Dado* a extração bem-sucedida, *Quando* o processo conclui, *Então* a imagem fica guardada no S3 e registada no MongoDB como entidade de imagem do projeto. |
| **REQ-VID-FRAME-008** | O sistema deve notificar o utilizador da conclusão da extração via eventos em tempo real e atualizar a galeria do projeto. | F | Deve ter | NOVO | Passo 7, Passo 8, Garantia de Sucesso | *Dado* a conclusão da tarefa, *Quando* o evento WebSocket é recebido, *Então* a nova imagem surge na galeria sem recarregar a página e exibe mensagem Toast de sucesso. |
| **REQ-VID-FRAME-009** | O sistema deve permitir o cancelamento da operação em qualquer momento antes da confirmação sem produzir ficheiros nem consumir quota. | F | Deveria ter | NOVO | FA1, Garantia Mínima | *Dado* o modal de captura aberto, *Quando* o utilizador prime Cancelar, *Então* o modal fecha-se e nenhum recurso ou quota é debitado. |
| **REQ-VID-FRAME-010** | O sistema deve permitir a escolha de formato de imagem entre PNG (sem perdas) e JPEG (comprimido). | F | Poderia ter | NOVO | FA3 | *Dado* o ecrã de confirmação, *Quando* o utilizador seleciona o formato JPEG, *Então* o ficheiro gerado é codificado em `.jpg` com taxa de compressão adequada. |
| **REQ-VID-FRAME-011** | O sistema deve impedir a extração e apresentar mensagem de erro quando o instante temporal for negativo ou superior à duração total do vídeo. | F | Deve ter | NOVO | E1 | *Dado* um vídeo com duração de 30 s, *Quando* o utilizador insere um tempo de 35 s, *Então* o sistema rejeita a operação com aviso de limite temporal. |
| **REQ-VID-FRAME-012** | O sistema deve garantir que o vídeo original permanece integralmente inalterado após qualquer operação de extração de fotograma. | NF (Fiabilidade) | Deve ter | NOVO | RN1, Garantia de Sucesso, Garantia Mínima | *Dado* a extração de fotogramas executada com sucesso ou com erro, *Quando* o vídeo original é verificado, *Então* o seu checksum e conteúdo permanecem idênticos. |
| **REQ-VID-FRAME-013** | O sistema deve eliminar impreterivelmente todos os ficheiros temporários em disco após a conclusão ou falha da operação. | NF (Fiabilidade) | Deve ter | NOVO | RT2, E4, E5, Garantia Mínima | *Dado* o processamento da frame no contentor, *Quando* a rotina termina (com sucesso ou exceção), *Então* o diretório `/tmp` não retém quaisquer ficheiros residuais. |
| **REQ-VID-FRAME-014** | A nova imagem registada deve ser 100% interoperável com as ferramentas de processamento gráfico e IA do ecossistema PictuRAS. | NF (Interoperabilidade) | Deve ter | NOVO | RN3 | *Dado* um fotograma recém-extraído, *Quando* o utilizador seleciona uma ferramenta (ex.: Binarização ou Remoção de Fundo AI), *Então* o pipeline processa a imagem normalmente. |
| **REQ-VID-FRAME-015** | O sistema deve concluir o processo completo de extração e registo do fotograma em tempo total $\le 1.5\text{ s}$ para vídeos Full HD. | NF (Desempenho) | Deveria ter | NOVO | A3 | *Dado* um vídeo 1080p, *Quando* o utilizador confirma a extração, *Então* a resposta HTTP 201 é emitida em menos de 1.5 segundos. |
| **REQ-VID-FRAME-016** | O sistema deve atualizar a renderização do fotograma na interface em $\le 150\text{ ms}$ durante a navegação temporal no modal. | NF (Usabilidade) | Deveria ter | NOVO | Passo 2 | *Dado* a barra de navegação no modal, *Quando* o utilizador move o cursor temporal, *Então* a frame correspondente é atualizada no ecrã em tempo $\le 150\text{ ms}$. |

---

### 4.2 Impacto no sistema existente

| **Elemento existente afetado** | **Impacto (Manter / Estender / Alterar)** | **Descrição do impacto** | **Requisitos relacionados** |
|---|---|---|---|
| **Gestão de Projetos e Imagens** (`projects`) | **Estender** | O controlador de projetos ganha o novo endpoint `POST /video/:videoId/capture-frame`, que orquestra a descodificação via FFmpeg e injeta o artefacto diretamente no array `project.imgs` com preservação de versão. | REQ-VID-FRAME-005, REQ-VID-FRAME-006, REQ-VID-FRAME-007, REQ-VID-FRAME-014 |
| **Repositório de Armazenamento** (`imageStorageService` / SeaweedFS S3) | **Manter** | Reutiliza as rotas e clientes S3 existentes para gravação de novos ficheiros no bucket do projeto sob a pasta `/src/`. | REQ-VID-FRAME-007, REQ-VID-FRAME-012 |
| **Sistema de Quotas e Subscrições** (`subscriptions` / `users`) | **Alterar** | O consumo diário de operações do perfil registado debita 1 crédito aquando da persistência com sucesso de cada fotograma extraído. | REQ-VID-FRAME-005, REQ-VID-FRAME-008 |
| **Notificações em Tempo Real** (`wsGateway`) | **Manter** | Utiliza a infraestrutura WebSockets existente para difundir a atualização do catálogo de imagens a todos os clientes ligados ao projeto. | REQ-VID-FRAME-008 |
| **Interface de Utilizador e Galeria** (`frontend`) | **Estender** | Adiciona o componente modal `video-capture-frame-modal.tsx` e botões de ação dedicados no leitor de vídeo e nos cartões de vídeo da galeria. | REQ-VID-FRAME-001, REQ-VID-FRAME-002, REQ-VID-FRAME-003, REQ-VID-FRAME-004 |

---

### 4.3 Matriz de Rastreabilidade

| **Elemento do Caso de Uso** | **Descrição abreviada** | **Requisito(s) de Sistema** |
|---|---|---|
| **Passo 1** | Acesso à opção e abertura do modal de captura | REQ-VID-FRAME-001, REQ-VID-FRAME-002 |
| **Passo 2** | Navegação temporal fina e cálculo do nome sugerido | REQ-VID-FRAME-002, REQ-VID-FRAME-003, REQ-VID-FRAME-004, REQ-VID-FRAME-016 |
| **Passo 3** | Confirmação e validação do nome do ficheiro | REQ-VID-FRAME-004 |
| **Passo 4** | Submissão com validação de quota e versão concorrente | REQ-VID-FRAME-005 |
| **Passo 5** | Execução da extração via FFmpeg na resolução nativa | REQ-VID-FRAME-006, REQ-VID-FRAME-015 |
| **Passo 6** | Armazenamento no S3, registo em `project.imgs` e dedução de quota | REQ-VID-FRAME-007 |
| **Passo 7** | Emissão de evento em tempo real e resposta HTTP | REQ-VID-FRAME-008 |
| **Passo 8** | Atualização reativa da galeria e feedback Toast | REQ-VID-FRAME-008 |
| **FA1** | Cancelamento da operação sem custos nem persistência | REQ-VID-FRAME-009 |
| **FA2** | Navegação frame a frame com atalhos de teclado | REQ-VID-FRAME-003 |
| **FA3** | Seleção alternativa de formato comprimido (JPEG) | REQ-VID-FRAME-010 |
| **E1** | Instante temporal fora dos limites do vídeo | REQ-VID-FRAME-011 |
| **E2** | Quota diária esgotada com bloqueio prévio | REQ-VID-FRAME-005 |
| **E3** | Conflito de versão concorrente no projeto | REQ-VID-FRAME-005 |
| **E4** | Erro de descodificação com limpeza de temporários | REQ-VID-FRAME-013 |
| **E5** | Esgotamento de espaço temporário em disco | REQ-VID-FRAME-013 |
| **Garantia de Sucesso** | Nova imagem no S3, catálogo atualizado, interoperabilidade e integridade | REQ-VID-FRAME-007, REQ-VID-FRAME-008, REQ-VID-FRAME-012, REQ-VID-FRAME-014 |
| **Garantia Mínima** | Sem artefactos residuais, vídeo intacto e quota preservada | REQ-VID-FRAME-009, REQ-VID-FRAME-012, REQ-VID-FRAME-013 |
| **RN1** | Operação não destrutiva | REQ-VID-FRAME-012 |
| **RN2** | Resolução nativa e fidelidade geométrica | REQ-VID-FRAME-006 |
| **RN3** | Interoperabilidade total com ferramentas existentes | REQ-VID-FRAME-007, REQ-VID-FRAME-014 |
| **RN4** | Dedução de quota apenas após sucesso | REQ-VID-FRAME-005 |
| **RN5** | Prevenção de colisão de nomes | REQ-VID-FRAME-004 |
| **RT1** | Parâmetro `-ss` e precisão temporal no FFmpeg | REQ-VID-FRAME-006 |
| **RT2** | Limpeza mandatória de ficheiros temporários | REQ-VID-FRAME-013 |
| **A3** | Tempo de resposta para extração de fotograma | REQ-VID-FRAME-015 |
