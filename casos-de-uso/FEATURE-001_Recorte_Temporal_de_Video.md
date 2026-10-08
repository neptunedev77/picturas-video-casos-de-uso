# 📝 Exercício 1 — Template de Entrega
### Casos de Uso · Fase 1: Suporte a Vídeo no PictuRAS

---

## 0. Identificação

| **Campo** | **Valor** |
|---|---|
| **Grupo / Equipa** | 25 |
| **Autores** | António Sousa (PG63923), Bruno Sousa (PG63927), Bruno Vale (PG63926), Diogo Macedo (PG63947), Sérgio Vieira (PG65442) |
| **Data** | 2026-10-08 |
| **Versão do documento** | v1.1 |
| **Unidade Curricular** | Requisitos e Arquiteturas de Software — MEI, Universidade do Minho |

---

## 1. Funcionalidade de vídeo escolhida

| **Campo** | **Valor** |
|---|---|
| **Funcionalidade** | Recorte Temporal de Vídeo (*Video Trim*) |
| **Perfil(s) de utilizador abrangido(s)** | Utilizador Registado e Utilizador Premium (o utilizador anónimo não possui persistência de projetos nem acesso a ferramentas de edição no pipeline de processamento) |

### Justificação no contexto do MVP *(2–3 linhas)*
O recorte temporal (*trim*) é a operação de manipulação de vídeo mais elementar e de maior valor imediato num editor multimédia: permite ao utilizador descartar segmentos desnecessários e isolar excertos relevantes de gravações longas. Sem esta capacidade de segmentação básica, qualquer processamento posterior mais avançado sobre vídeo torna-se computacionalmente ineficiente e pesado para a plataforma.

---

## 2. Caso de Uso

### 2.1 Cabeçalho

| **Secção** | **Detalhes** |
|---|---|
| **ID do Caso de Uso** | UC-VID-005 |
| **Nome** | Recortar Segmento Temporal de Vídeo (*Video Trim*) |
| **Versão** | v1.1 |
| **Autor** | Sérgio Vieira (PG65442) |
| **Data** | 2026-10-08 |
| **Objetivo** | Permitir ao utilizador delimitar um intervalo de tempo (início e fim) num vídeo existente na biblioteca do seu projeto e gerar um novo vídeo correspondente exclusivamente a esse excerto. |
| **Âmbito** | Módulo de vídeo do PictuRAS — processamento e edição multimédia |
| **Ator Principal** | Utilizador Registado ou Premium |
| **Stakeholders e Interesses** | - **Utilizador Final:** Pretende selecionar o intervalo de corte de forma visual e precisa, com pré-visualização imediata antes de confirmar, obtendo o novo ficheiro rapidamente.<br>- **Proprietário da Plataforma:** Pretende que a operação de corte seja computacionalmente eficiente, minimizando o impacto no cluster de processamento e garantindo o cumprimento das quotas de utilização.<br>- **Equipa de Operações / Arquitetura:** Pretende que operações pesadas de vídeo sejam processadas de forma assíncrona, desacopladas do fluxo HTTP principal, com garantia de integridade dos ficheiros originais. |
| **Pré-condições** | 1. O utilizador tem sessão iniciada na plataforma.<br>2. O utilizador acede a um projeto existente do qual é proprietário (ou tem permissões de edição).<br>3. O projeto já contém pelo menos um ficheiro de vídeo suportado e disponível na sua biblioteca.<br>4. O utilizador possui saldo disponível na sua quota diária de operações (se aplicável ao seu perfil). |
| **Trigger** | O utilizador seleciona um vídeo na biblioteca do projeto e escolhe a opção **Recortar vídeo** (*Trim*). |

---

### 2.2 Fluxo Principal

| **Passo** | **Ação do Ator** | **Resposta do Sistema** |
|:---:|---|---|
| **1** | O utilizador seleciona um vídeo na biblioteca do projeto e escolhe **Recortar vídeo** | Carrega a interface da ferramenta de recorte, apresentando o leitor de vídeo com uma linha temporal (*timeline*), controlos de reprodução e seletores deslizantes de início ($T_{start}$) e fim ($T_{end}$) |
| **2** | O utilizador ajusta os marcadores $T_{start}$ e $T_{end}$ na linha temporal (ou introduz diretamente os valores de tempo no formato `hh:mm:ss.ms`) | Atualiza dinamicamente a área selecionada na linha temporal, apresenta a duração resultante ($T_{end} - T_{start}$) e os fotogramas de pré-visualização dos instantes inicial e final |
| **3** | O utilizador seleciona a opção **Pré-visualizar recorte** | Reproduz o vídeo em ciclo contínuo (*loop*) exclusivamente entre os marcadores $T_{start}$ e $T_{end}$ definidos |
| **4** | O utilizador confirma a operação escolhendo **Aplicar recorte** | Valida os parâmetros temporais e a elegibilidade da quota, apresenta o indicador de processamento assíncrono e coloca a tarefa de recorte na fila de processamento |
| **5** | — | Processa o recorte do vídeo, armazena o novo ficheiro de vídeo resultante e regista o novo recurso na biblioteca do projeto |
| **6** | — | Notifica o utilizador da conclusão do processamento em tempo real, fecha o painel de recorte e apresenta o novo vídeo recortado na biblioteca do projeto |

---

### 2.3 Fluxos Alternativos

| **Fluxo** | **Descrição** |
|---|---|
| **FA1 — Cancelamento da operação de recorte** | No Passo 1, 2 ou 3, o utilizador seleciona **Cancelar** → O sistema descarta a seleção temporal, fecha o painel de edição e regressa à biblioteca do projeto sem gerar ficheiros nem debitar quota. |
| **FA2 — Substituição do vídeo original** | No Passo 4, se o utilizador selecionar a opção **Substituir ficheiro original** → O sistema gera o recorte e substitui a referência do vídeo original pelo novo recorte na biblioteca do projeto, preservando o histórico de alterações. |
| **FA3 — Ajuste fino por fotograma (*Frame Stepping*)** | No Passo 2, o utilizador prime os atalhos de teclado (teclas de seta esquerda/direita) → O sistema ajusta a posição do marcador ativo fotograma a fotograma ($\pm 1$ fotograma), permitindo precisão cirúrgica na definição de $T_{start}$ e $T_{end}$. |

---

### 2.4 Exceções

| **Condição** | **Comportamento do Sistema** |
|---|---|
| **E1 — Instante inicial superior ou igual ao final ($T_{start} \ge T_{end}$)** | Apresenta a mensagem: *“O instante final deve ser superior ao instante inicial”* e mantém o botão de confirmação desativado. |
| **E2 — Duração do segmento inferior ao mínimo permitido ($< 1.0\text{ s}$)** | Apresenta a mensagem: *“O excerto selecionado tem de ter uma duração mínima de 1 segundo”* e impede a submissão. |
| **E3 — Duração do recorte excede o limite do perfil** | O utilizador Registado seleciona uma duração $> 60\text{ s}$ → Apresenta a mensagem: *“O plano Registado permite recortes com duração máxima de 60 segundos. Atualize para o plano Premium para durações superiores”* e bloqueia a submissão. |
| **E4 — Quota diária de processamento esgotada** | Ao tentar aplicar o recorte, a quota do utilizador está esgotada → Apresenta a mensagem: *“Atingiu o limite diário de operações. Tente novamente amanhã ou subscreva o plano Premium”* e não inicia o processamento. |
| **E5 — Falha durante o processamento do vídeo** | Ocorre uma falha técnica ou corrupção de dados durante a execução do recorte → Apresenta o erro: *“Não foi possível processar o recorte do vídeo. O ficheiro original mantém-se inalterado.”*, não debita a quota e mantém a biblioteca no estado anterior. |

---

### 2.5 Pós-condições

| **Tipo** | **Resultado** |
|---|---|
| **Garantia de Sucesso** | O novo vídeo contendo exclusivamente o intervalo $[T_{start}, T_{end}]$ é gerado e fica disponível na biblioteca do projeto com os seus metadados (duração, resolução e tamanho); o ficheiro de vídeo original mantém-se inalterado; é debitada 1 operação na quota diária do utilizador. |
| **Garantia Mínima** | Em caso de erro, cancelamento ou falha técnica, o ficheiro de vídeo original mantém-se inalterado na biblioteca, nenhum ficheiro incompleto ou corrompido é adicionado, e a quota do utilizador não é debitada. |

---

### 2.6 Regras de Negócio e Restrições

| **ID** | **Regra** |
|---|---|
| **RN1** | A duração mínima do recorte ($T_{end} - T_{start}$) é de 1.0 segundo. |
| **RN2** | A duração máxima do recorte depende do perfil do utilizador: **60 segundos** para o Utilizador Registado e **600 segundos (10 minutos)** para o Utilizador Premium. |
| **RN3** | Cada operação de recorte concluída com sucesso debita 1 operação na quota diária do perfil do utilizador (o perfil registado tem limite de 5 operações diárias). Operações canceladas ou com erro não debitam quota. |
| **RN4** | O recorte é não-destrutivo por omissão: o ficheiro de vídeo original permanece inalterado na biblioteca do projeto. |
| **RN5** | O sistema suporta vídeos em formato MP4, WebM e MOV codificados em H.264, VP8/VP9 e áudio AAC/Opus. |

---

### 2.7 Assunções

| **ID** | **Assunção** |
|---|---|
| **A1** | O vídeo original está integralmente armazenado e acessível ao sistema no momento em que a ferramenta é acionada. |
| **A2** | O navegador do utilizador suporta os elementos multimédia necessários para renderizar o leitor e atualizar a linha temporal interativa. |
| **A3** | O sistema dispõe de recursos de computação suficientes para processar recortes curtos em poucos segundos. |

---

### 2.8 Questões em Aberto

| **ID** | **Questão** |
|---|---|
| **Q1** | Como lidar com recortes cujo início não coincide com um fotograma-chave (*keyframe*) para evitar fotogramas congelados sem penalizar o tempo de resposta? |
| **Q2** | O novo vídeo recortado deve herdar automaticamente as etiquetas (*tags*) e a descrição do vídeo original? |

---

## 3. Utilização de agentes de IA

| **Ferramenta / *skill*** | **Tarefa apoiada** | **Validação realizada pela equipa** |
|---|---|---|
| **Antigravity (Google DeepMind)** | **Brainstorming e Estruturação de Ideias:** Discussão e exploração de potenciais funcionalidades de vídeo para o MVP; apoio na organização lógica do caso de uso de recorte temporal (identificação dos passos nominais do fluxo principal e formulação de fluxos alternativos de cancelamento e substituição). | A equipa debateu e validou a escolha do *Recorte Temporal* como a funcionalidade nuclear de maior valor imediato para o utilizador, descartando expressamente opções centradas no carregamento/upload de ficheiros por serem meros mecanismos habilitadores; ajustou a ordem dos passos para garantir uma experiência de edição fluida e intuitiva. |
| **Antigravity (Google DeepMind)** | **Exploração de Casos Limite e Regras de Negócio:** Mapeamento de possíveis exceções no manuseamento de vídeo (inversão cronológica de marcadores, recortes inferiores a 1 segundo, ficheiros com corrupção de fluxo) e sugestão de parâmetros temporais por perfil de utilizador. | A equipa reviu criticamente as durações propostas e calibrou-as para os limites reais do PictuRAS (teto de 60 s para utilizador Registado e 600 s para Premium); garantiu que o consumo de quota reflete o modelo pré-existente da plataforma (dedução de 1 operação da quota diária de 5 operações apenas após sucesso). |
| **Antigravity (Google DeepMind)** | **Derivação Formal de Requisitos (Secção 4):** Apoio no rascunho inicial de requisitos derivados a partir dos verbos de ação e regras do caso de uso, aplicando a sintaxe *"O sistema deve..."* e redigindo os testes de aceitação (*Dado/Quando/Então*). | Revisão integral por todos os elementos do grupo; eliminação ativa de jargão de implementação técnica (remoção de referências diretas a ferramentas como FFmpeg ou S3 no enunciado dos requisitos, movendo esses detalhes para a tabela de impacto arquitetural); verificação de consistência para assegurar cobertura bidirecional estrita na matriz de rastreabilidade. |

---
---

## 4. Esboço de requisitos derivados

### 4.1 Requisitos de Sistema

| **ID** | **Requisito** | **Tipo** | **Prioridade** | **Novo/Alt** | **Origem** | **Como verificar** |
|---|---|---|---|---|---|---|
| **REQ-VID-TRIM-001** | O sistema deve apresentar uma interface de recorte com linha temporal interativa, controlos de reprodução e seletores de início ($T_{start}$) e fim ($T_{end}$) ao abrir a ferramenta de recorte para um vídeo selecionado. | F | Deve ter | NOVO | Passo 1 | *Dado* que o utilizador seleciona um vídeo e escolhe **Recortar vídeo**, *Quando* a interface carrega, *Então* apresenta a linha temporal, o leitor e os seletores $T_{start}$ e $T_{end}$. |
| **REQ-VID-TRIM-002** | O sistema deve permitir ao utilizador ajustar os marcadores temporais $T_{start}$ e $T_{end}$ através de controlos deslizantes na linha temporal e através da introdução numérica direta no formato `hh:mm:ss.ms`. | F | Deve ter | NOVO | Passo 2 | *Dado* a ferramenta de recorte aberta, *Quando* o utilizador desloca os seletores ou digita um tempo numérico válido, *Então* os valores são atualizados e refletidos na linha temporal. |
| **REQ-VID-TRIM-003** | O sistema deve apresentar a duração resultante do segmento ($T_{end} - T_{start}$) e os fotogramas de pré-visualização correspondentes aos instantes de corte selecionados. | F | Deve ter | NOVO | Passo 2 | *Dado* marcadores ajustados em 00:00:05 e 00:00:20, *Quando* a seleção é alterada, *Então* o sistema calcula e apresenta a duração de 15 segundos e os respetivos fotogramas de início e fim. |
| **REQ-VID-TRIM-004** | O sistema deve permitir ao utilizador pré-visualizar em ciclo contínuo (*loop*) a reprodução do vídeo exclusivamente no intervalo compreendido entre $T_{start}$ e $T_{end}$. | F | Deveria ter | NOVO | Passo 3 | *Dado* um excerto selecionado, *Quando* o utilizador escolhe **Pré-visualizar recorte**, *Então* o leitor inicia a reprodução em $T_{start}$, conclui em $T_{end}$ e reinicia automaticamente em $T_{start}$. |
| **REQ-VID-TRIM-005** | O sistema deve validar a consistência dos marcadores temporais, os limites de duração do perfil e o saldo de quota do utilizador antes de iniciar o processamento do recorte. | F | Deve ter | NOVO | Passo 4, E1, E2, E3, E4, RN1, RN2, RN3 | *Dado* a confirmação de recorte, *Quando* o utilizador escolhe **Aplicar recorte**, *Então* o sistema valida as condições temporais, o perfil e a quota antes de aceitar a tarefa. |
| **REQ-VID-TRIM-006** | O sistema deve processar o recorte do vídeo de forma assíncrona, informando o utilizador de que a tarefa está em processamento. | F | Deve ter | NOVO | Passo 4, Passo 5 | *Dado* um pedido de recorte validado, *Quando* a operação é submetida, *Então* o sistema apresenta um indicador de processamento assíncrono e encaminha a tarefa para execução em segundo plano. |
| **REQ-VID-TRIM-007** | O sistema deve persistir o novo ficheiro de vídeo resultante do recorte e associá-lo à biblioteca do projeto do utilizador. | F | Deve ter | NOVO | Passo 5, Garantia de Sucesso | *Dado* a conclusão com sucesso do processamento, *Quando* o novo ficheiro de vídeo é gerado, *Então* o ficheiro fica armazenado e disponível na biblioteca do projeto. |
| **REQ-VID-TRIM-008** | O sistema deve notificar o utilizador em tempo real sobre a conclusão do processamento e apresentar o novo vídeo na biblioteca do projeto. | F | Deve ter | NOVO | Passo 6, Garantia de Sucesso | *Dado* o utilizador com a biblioteca aberta, *Quando* o processamento do recorte conclui, *Então* o sistema emite uma notificação e o novo vídeo passa a ser apresentado sem recarregamento manual. |
| **REQ-VID-TRIM-009** | O sistema deve permitir ao utilizador cancelar a operação de recorte em qualquer momento antes da confirmação, regressando à biblioteca sem criar ficheiros nem debitar quota. | F | Deveria ter | NOVO | FA1 | *Dado* a ferramenta de recorte aberta, *Quando* o utilizador seleciona **Cancelar**, *Então* a interface fecha-se, nenhum ficheiro é criado e a quota permanece inalterada. |
| **REQ-VID-TRIM-010** | O sistema deve permitir ao utilizador optar pela substituição do ficheiro original pelo novo recorte na biblioteca do projeto. | F | Poderia ter | NOVO | FA2 | *Dado* a opção **Substituir ficheiro original** selecionada, *Quando* o recorte conclui com sucesso, *Então* a biblioteca passa a apresentar o novo vídeo no lugar do anterior. |
| **REQ-VID-TRIM-011** | O sistema deve permitir o avanço e recuo fotograma a fotograma através de atalhos de teclado durante o ajuste dos marcadores de corte. | F | Poderia ter | NOVO | FA3 | *Dado* o foco num marcador da linha temporal, *Quando* o utilizador prime as teclas de seta esquerda ou direita, *Então* a posição ajusta-se no valor exato de um fotograma ($\pm 1$ fotograma). |
| **REQ-VID-TRIM-012** | O sistema deve impedir a confirmação da operação e apresentar a mensagem *“O instante final deve ser superior ao instante inicial”* quando $T_{start} \ge T_{end}$. | F | Deve ter | NOVO | E1 | *Dado* $T_{start} = 00:00:10$ e $T_{end} = 00:00:08$, *Quando* o utilizador define estes valores, *Então* o botão de confirmação permanece desativado e o aviso de erro é visível. |
| **REQ-VID-TRIM-013** | O sistema deve rejeitar recortes com duração inferior a 1.0 segundo, apresentando a mensagem *“O excerto selecionado tem de ter uma duração mínima de 1 segundo”*. | F | Deve ter | NOVO | E2, RN1 | *Dado* uma seleção com duração de 0.5 s, *Quando* o utilizador tenta aplicar o recorte, *Então* o sistema impede a submissão e apresenta a respetiva mensagem de restrição. |
| **REQ-VID-TRIM-014** | O sistema deve rejeitar recortes com duração superior a 60 segundos para o Utilizador Registado e superior a 600 segundos para o Utilizador Premium. | F | Deve ter | ALT | E3, RN2 | *Dado* um Utilizador Registado com seleção superior a 60 s, *Quando* tenta aplicar o recorte, *Então* o sistema bloqueia a submissão e indica o limite do perfil. |
| **REQ-VID-TRIM-015** | O sistema deve debitar 1 operação da quota diária do perfil do utilizador apenas após a conclusão com sucesso do recorte. | F | Deve ter | ALT | E4, RN3, Garantia de Sucesso | *Dado* um utilizador com 5 operações diárias disponíveis, *Quando* o recorte é concluído com sucesso, *Então* o saldo de operações diárias é atualizado para 4. |
| **REQ-VID-TRIM-016** | O sistema deve manter o ficheiro de vídeo original inalterado na biblioteca e não debitar quota em caso de falha no processamento. | NF (Fiabilidade) | Deve ter | NOVO | E5, Garantia Mínima, RN4 | *Dado* a ocorrência de uma falha técnica durante o recorte, *Quando* a operação é abortada, *Então* o vídeo original mantém-se íntegro e a quota não é debitada. |
| **REQ-VID-TRIM-017** | O sistema deve aceitar ficheiros de vídeo nos formatos MP4, WebM e MOV codificados em H.264, VP8/VP9 e áudio AAC/Opus. | NF (Compatibilidade) | Deve ter | NOVO | RN5 | *Dado* vídeos nos formatos MP4, WebM e MOV com codecs suportados, *Quando* o recorte é solicitado, *Então* o sistema realiza a leitura e o processamento sem erro de incompatibilidade. |
| **REQ-VID-TRIM-018** | O sistema deve concluir o processamento do recorte em $\le 3.0\text{ s}$ para vídeos com duração até 60 segundos. | NF (Desempenho) | Deveria ter | NOVO | A3 | *Dado* um vídeo com duração até 60 s, *Quando* a tarefa de recorte é processada, *Então* o tempo total de processamento não excede 3.0 segundos. |
| **REQ-VID-TRIM-019** | O sistema deve atualizar os fotogramas de pré-visualização dos instantes $T_{start}$ e $T_{end}$ na interface em $\le 200\text{ ms}$ durante a movimentação dos seletores. | NF (Usabilidade) | Deveria ter | NOVO | Passo 2 | *Dado* a linha temporal ativa, *Quando* o seletor é deslocado para uma nova posição, *Então* o fotograma correspondente é renderizado no ecrã em $\le 200\text{ ms}$. |

---

### 4.2 Impacto no sistema existente

| **Elemento existente afetado** | **Impacto (Manter / Estender / Alterar)** | **Descrição do impacto** | **Requisitos relacionados** |
|---|---|---|---|
| **Sistema de Quotas e Perfis** (`subscriptions`) | **Alterar** | A regra de contabilização de operações do perfil registado (limite de 5 operações diárias) passa a deduzir 1 operação após a conclusão de uma tarefa de recorte de vídeo bem-sucedida. | REQ-VID-TRIM-005, REQ-VID-TRIM-014, REQ-VID-TRIM-015 |
| **Gestão de Projetos e Biblioteca** (`projects`) | **Estender** | O modelo de dados do projeto, que anteriormente apenas geria imagens estáticas, passa a suportar metadados específicos de vídeo (duração, resolução, formato) e a ligação entre vídeos originais e vídeos recortados. | REQ-VID-TRIM-007, REQ-VID-TRIM-010 |
| **Fila de Tarefas Assíncronas** (`rabbitMQ`) | **Estender** | A infraestrutura de mensageria assíncrona passa a incluir uma fila dedicada ao processamento de vídeo, permitindo desacoplar a receção do pedido HTTP da execução computacional do recorte. | REQ-VID-TRIM-006, REQ-VID-TRIM-008 |
| **Notificações em Tempo Real** (`wsGateway`) | **Manter** | A infraestrutura de eventos em tempo real existente mantém o seu comportamento, sendo reutilizada para emitir eventos de conclusão do recorte para a interface do utilizador. | REQ-VID-TRIM-008 |
| **Armazenamento de Ficheiros** (`imageStorageService` / SeaweedFS S3) | **Estender** | O serviço de armazenamento de ficheiros passa a suportar o carregamento, persistência e leitura por gama de bytes (*HTTP Range Requests*) de ficheiros de vídeo para visualização contínua. | REQ-VID-TRIM-007, REQ-VID-TRIM-016, REQ-VID-TRIM-017 |

---

### 4.3 Matriz de Rastreabilidade

| **Elemento do Caso de Uso** | **Descrição abreviada** | **Requisito(s) de Sistema** |
|---|---|---|
| **Passo 1** | Seleção de vídeo e apresentação da interface de recorte | REQ-VID-TRIM-001 |
| **Passo 2** | Ajuste de $T_{start}$ e $T_{end}$ com cálculo de duração e fotogramas | REQ-VID-TRIM-002, REQ-VID-TRIM-003, REQ-VID-TRIM-019 |
| **Passo 3** | Pré-visualização do recorte em ciclo contínuo (*loop*) | REQ-VID-TRIM-004 |
| **Passo 4** | Validação, confirmação e submissão assíncrona do recorte | REQ-VID-TRIM-005, REQ-VID-TRIM-006 |
| **Passo 5** | Execução do recorte e persistência na biblioteca | REQ-VID-TRIM-006, REQ-VID-TRIM-007 |
| **Passo 6** | Notificação em tempo real e apresentação na biblioteca | REQ-VID-TRIM-008 |
| **FA1** | Cancelamento da operação de recorte | REQ-VID-TRIM-009 |
| **FA2** | Substituição do ficheiro original pelo novo recorte | REQ-VID-TRIM-010 |
| **FA3** | Ajuste fino por fotograma via atalhos de teclado | REQ-VID-TRIM-011 |
| **E1** | Instante inicial $\ge$ final com bloqueio e mensagem | REQ-VID-TRIM-005, REQ-VID-TRIM-012 |
| **E2** | Duração inferior ao mínimo de 1.0 s com rejeição | REQ-VID-TRIM-005, REQ-VID-TRIM-013 |
| **E3** | Duração superior ao limite do perfil do utilizador | REQ-VID-TRIM-005, REQ-VID-TRIM-014 |
| **E4** | Quota diária de operações esgotada | REQ-VID-TRIM-005, REQ-VID-TRIM-015 |
| **E5** | Falha de processamento com garantia de estado inalterado | REQ-VID-TRIM-016 |
| **Garantia de Sucesso** | Novo vídeo na biblioteca, original inalterado e quota debitada | REQ-VID-TRIM-007, REQ-VID-TRIM-008, REQ-VID-TRIM-015 |
| **Garantia Mínima** | Em falha, biblioteca inalterada, sem ficheiros corrompidos e quota intacta | REQ-VID-TRIM-016 |
| **RN1** | Duração mínima do recorte estipulada em 1.0 segundo | REQ-VID-TRIM-005, REQ-VID-TRIM-013 |
| **RN2** | Limites máximos de duração por perfil (60 s Registado / 600 s Premium) | REQ-VID-TRIM-005, REQ-VID-TRIM-014 |
| **RN3** | Dedução de 1 operação da quota diária apenas em caso de sucesso | REQ-VID-TRIM-005, REQ-VID-TRIM-015 |
| **RN4** | Edição não-destrutiva por omissão | REQ-VID-TRIM-016 |
| **RN5** | Suporte de formatos MP4, WebM e MOV e codecs especificados | REQ-VID-TRIM-017 |
| **A3** | Processamento rápido para recortes de curta duração | REQ-VID-TRIM-018 |
