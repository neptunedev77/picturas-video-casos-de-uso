# 📝 Exercício 2 — Especificação de Requisitos do Sistema (ERS)
### Casos de Uso e ERS · Fase 1: Suporte a Vídeo no PictuRAS

## 0. Identificação

| **Campo** | **Valor** |
|-----------|-----------|
| **Grupo / Equipa** | 6 |
| **Autores** | António Sousa (pg63923), Bruno Vale (pg63926), Bruno Sousa (pg63927), Diogo Macedo (pg63947), Sérgio Vieira (PG65442) |
| **Data** | 2026-10-15 |
| **Versão do documento** | v1.2 |
| **Unidade Curricular** | Requisitos e Arquiteturas de Software — MEI, Universidade do Minho |

---

## 1. Funcionalidade de vídeo escolhida

| **Campo** | **Valor** |
|-----------|-----------|
| **Funcionalidade** | Deteção e Anonimização Automática de Rostos e Matrículas em Vídeo (*Video Privacy Blur*) |
| **Perfil(s) de utilizador abrangido(s)** | Utilizador Registado (Gratuito) e Utilizador Premium (incluindo colaboradores autenticados com permissão `edit` via link de partilha). Tratando-se de uma ferramenta avançada de visão por computador (IA), o plano Registado dispõe de acesso condicionado por quotas diárias (até 5 operações avançadas/dia) e limites estritos de duração/resolução, enquanto o plano Premium beneficia de processamento ilimitado, suporte a ficheiros de maior dimensão e fila de prioridade alta. |

**Justificação no contexto do MVP**
A conformidade com a privacidade e o RGPD (Restrição R3 e RNF44 da base PictuRAS) na partilha de conteúdos multimédia é hoje um requisito crítico na cloud. No MVP, esta funcionalidade comprova a extensão natural dos modelos de IA/visão por computador já existentes no PictuRAS (como deteção de pessoas e objetos — RF46) para o domínio temporal de vídeo, validando o pipeline completo de processamento assíncrono intensivo: extração contínua de fotogramas, inferência com seguimento de alvos (*tracking*), aplicação de máscaras visuais, re-codificação com preservação de áudio e acompanhamento de progresso com reporte em tempo real via WebSockets (`ws_gateway`) e controlo de cancelamento por tokens (`activeToken` / `committedToken`).

---

## 2. Caso de Uso

### 2.1 Cabeçalho

| **Secção** | **Detalhes** |
|------------|--------------|
| **ID do Caso de Uso** | UC-VID-003 |
| **Nome** | Anonimizar Rostos e Matrículas em Vídeo |
| **Versão** | v1.2 |
| **Autor** | Diogo Henrique Freitas Macedo |
| **Data** | 2026-10-15 |
| **Objetivo** | Permitir ao utilizador detetar automaticamente elementos sensíveis (rostos de pessoas e matrículas de veículos) ao longo de todo o vídeo e aplicar uma máscara de desfocagem (*blur*) ou mosaico (*pixelate*), obtendo uma versão anonimizada em conformidade com normas de privacidade e RGPD. |
| **Âmbito** | Módulo de processamento avançado de vídeo do PictuRAS — serviços de visão por computador (`Tools-MS`), mensageria assíncrona (`RabbitMQ`), gestão de projetos (`Projects-MS`), gestão de quotas (`Users-MS`), gateway de tempo real (`ws_gateway`) e armazenamento de objetos (`SeaweedFS` / `img_storage`). |
| **Ator Principal** | Utilizador Registado (ou Utilizador Premium) |
| **Stakeholders e Interesses** | - **Utilizador Registado / Premium**: pretende partilhar ou arquivar vídeos sem expor dados pessoais de terceiros, com um processo automatizado e sem esforço de edição manual fotograma a fotograma.<br>- **Convidado por Link (com permissão `edit`)**: pretende aplicar a ferramenta num projeto partilhado recebendo o feedback de progresso na sua própria sessão (`runnerId` / `X-Caller-Id`).<br>- **Proprietário da Plataforma / Administrador de Sistema**: pretende disponibilizar uma funcionalidade avançada de forte apelo comercial (SaaS) em conformidade com o RGPD, garantindo sustentabilidade computacional através de quotas e limites de duração.<br>- **Equipa DevOps / Desenvolvimento**: valida a robustez dos workers de IA perante cargas temporais pesadas e assegura isolamento, controlo de versão (`X-Project-Version`) e gestão de falhas na pipeline assíncrona. |
| **Pré-condições** | - O utilizador tem sessão autenticada na plataforma (JWT válido) e permissão de edição no projeto.<br>- O vídeo de entrada foi carregado com sucesso no projeto e está acessível no armazenamento de objetos (`SeaweedFS`).<br>- O utilizador dispõe de saldo suficiente de operações diárias avançadas no `Users-MS` (no caso de Utilizador Registado). |
| **Trigger** | O utilizador, com um vídeo selecionado no editor do projeto, adiciona/configura a ferramenta **Anonimização de Privacidade (Blur)**, guarda os parâmetros e confirma a execução clicando em **Aplicar (Apply)**. |

### 2.2 Fluxo Principal

| **Passo** | **Ação do Ator** | **Resposta do Sistema** |
|-----------|------------------|-------------------------|
| 1 | O utilizador abre o projeto e seleciona um vídeo para processamento. | Apresenta a interface de edição de vídeo com pré-visualização, duração, resolução, formato, saldo de operações diárias restantes (RNF48) e a barra lateral de ferramentas disponíveis. |
| 2 | O utilizador seleciona a ferramenta **Anonimização de Privacidade (Blur)**. | Exibe as opções de configuração: elementos a detetar (Rostos, Matrículas ou Ambos), estilo de ocultação (Desfocagem Gaussiana ou Mosaico) e nível de intensidade (Baixa, Média ou Alta). |
| 3 | O utilizador seleciona os parâmetros desejados, guarda a configuração na pipeline (atualizando `X-Project-Version`) e clica em **Aplicar (Apply)**. | Verifica se o fingerprint SHA-256 da pipeline mudou face a `committedTools`, valida a conformidade do ficheiro (duração e resolução face ao perfil do utilizador) e consulta o `Users-MS` para verificar a quota diária de operações avançadas disponível. |
| 4 | — | Incrementa o `activeToken` da execução (preservando `prevCommittedToken`), debita 1 operação avançada nova (`adv_ops` / `pendingAdvancedOps`) no `Users-MS` e publica a mensagem com os parâmetros do pedido na fila dedicada do RabbitMQ (`privacy_blur_queue`). |
| 5 | — | Apresenta na interface um overlay de processamento (*Processing*) com estado da tarefa (*"Em fila" / "A processar"*), barra de progresso percentual dinâmica e botão **Cancelar** permanentemente visível. |
| 6 | — | O worker de vídeo (`privacy_blur_tool`) consome a mensagem da fila, obtém o vídeo via `SeaweedFS` / `img_storage`, descodifica os fotogramas, executa o modelo de deteção e rastreamento (*tracking*) dos objetos sensíveis e aplica a máscara selecionada, emitindo eventos periódicos de progresso para a `ws_queue`. |
| 7 | — | O worker recombina os fotogramas processados com a faixa de áudio original (*audio pass-through*), gera o novo ficheiro de vídeo normalizado (MP4/H.264), armazena-o no repositório de objetos (`SeaweedFS`) e publica a conclusão na `project_queue`. |
| 8 | — | O `Projects-MS` valida que o token do resultado coincide com o `activeToken`, atualiza o `committedToken` e o registo `chargedAdvancedTools`, e publica o evento de conclusão na `ws_queue`, que o `ws_gateway` envia via Socket.IO para a sala do utilizador que iniciou a ação (`runnerId`). |
| 9 | — | A interface limpa o estado de espera, fecha o painel de progresso, apresenta uma notificação de sucesso e disponibiliza o vídeo anonimizado no modo *Results* do projeto para reprodução e transferência. |

### 2.3 Fluxos Alternativos

| **Fluxo** | **Descrição** |
|-----------|---------------|
| **FA1 – Processamento por Utilizador Premium com Fila Prioritária** | No passo 3, o sistema verifica no `Users-MS` que o utilizador é Premium → O pedido é encaminhado diretamente para a fila de alta prioridade (`high_priority_queue`), sem decrementar quotas diárias. O fluxo segue para o passo 5. |
| **FA2 – Nenhum elemento sensível detetado** | No passo 6, o modelo conclui a análise de todos os fotogramas e deteta 0 ocorrências de rostos ou matrículas com confiança ≥ 0.65 → O sistema conclui o processo mantendo o vídeo original como resultado, notifica o utilizador com o aviso *"Nenhum rosto ou matrícula detetado no vídeo; o ficheiro resultante é idêntico ao original"* e invoca o endpoint de reembolso no `Users-MS` (`POST /:user/process/refund/:advanced_tools`) para estornar a operação debitada. |
| **FA3 – Cancelamento voluntário da anonimização** | Durante os passos 5 ou 6, o utilizador clica no botão **Cancelar** → O frontend ativa `ignoreUpdatesRef` e invoca `DELETE /projects/:uid/:pid/process`. O `Projects-MS` incrementa o `activeToken` (invalidando outputs tardios do worker), faz *rollback* do `committedToken` para `prevCommittedToken`, remove artefactos temporários associados ao token cancelado, estorna a operação pendente no `Users-MS` e restaura o editor ao estado anterior em menos de 1 segundo. |
| **FA4 – Reaplicação sem alterações na pipeline (Short-Circuit)** | No passo 3, o utilizador clica em **Aplicar**, mas o fingerprint SHA-256 das ferramentas e parâmetros coincide exatamente com o último estado confirmado (`committedTools` com `committedToken > 0`) → O `Projects-MS` evita nova publicação no RabbitMQ e novo débito de operações, devolvendo imediatamente os resultados já processados. |

### 2.4 Exceções

| **Condição** | **Comportamento do Sistema** |
|--------------|------------------------------|
| **Exceção 1 – Quota diária de operações avançadas esgotada** | No passo 3, o `Users-MS` responde com `"No more daily_operations available"` por o utilizador Registado já ter consumido as suas 5 operações diárias → O frontend traduz o erro através do módulo `getErrorMessage` e apresenta a mensagem *"Limite diário de operações avançadas atingido. Efetue upgrade para a conta Premium para processar sem limites"*, não submetendo a tarefa. |
| **Exceção 2 – Duração ou resolução do vídeo excede o limite do perfil** | No passo 3, a duração ou resolução do vídeo submetido excede o limite permitido para contas Registadas (superior a 60 segundos ou superior a 1080p) → Exibe a mensagem uniformizada *"A ferramenta de anonimização em contas Gratuitas está limitada a vídeos de até 60 segundos (1080p). O vídeo atual excede este limite"*, impedindo a execução. |
| **Exceção 3 – Codec de vídeo incompatível ou fluxo ilegível** | No passo 6, o worker não consegue abrir o contentor de vídeo ou descodificar os pacotes de imagem → Emite código de erro estruturado para a `project_queue` / `ws_queue`, o frontend mapeia o erro via `getAiErrorMessage` exibindo o toast *"Erro ao ler os fotogramas do vídeo. Certifique-se de que o ficheiro não está corrompido e utiliza um formato válido (MP4/H.264)"*, descarta a tarefa, faz *rollback* do token e estorna a quota debitada no `Users-MS`. |
| **Exceção 4 – Sobrecarga ou Timeout do serviço de IA** | No passo 6, se a operação ultrapassar 60 segundos, o frontend exibe um toast informativo de demora (padrão T-03); se exceder o tempo limite operacional máximo (timeout de 180 segundos) ou o worker falhar de forma anómala → O `Projects-MS` invalida o `activeToken`, liberta a fila, repõe o crédito da operação no `Users-MS` e notifica a interface: *"O serviço de processamento demorou demasiado tempo a responder. A operação foi cancelada e o seu crédito foi reposto"*. |

### 2.5 Pós-condições

| **Tipo** | **Resultado** |
|----------|---------------|
| **Garantia de Sucesso** | O novo ficheiro de vídeo gerado contém todos os rostos e matrículas detetados desfocados/pixelizados de forma contínua; o fluxo de áudio original mantém-se perfeitamente sincronizado; o ficheiro original mantém-se inalterado no `SeaweedFS`; o resultado fica persistido e associado ao novo `committedToken`; a quota de operações (`chargedAdvancedTools`) e o contador na interface são atualizados. |
| **Garantia Mínima** | O vídeo original permanece inalterado; o projeto regressa ao último `prevCommittedToken` válido sem associar ficheiros parciais ou corrompidos; qualquer quota reservada na execução (`pendingAdvancedOps`) é estornada na íntegra via `Users-MS`; é apresentada uma mensagem de erro clara e uniformizada na interface. |

### 2.6 Regras de Negócio e Restrições

| **ID** | **Regra** |
|--------|-----------|
| **RN1** | A anonimização automática é categorizada como **Ferramenta Avançada (IA)**, consumindo 1 operação diária por cada nova execução (`adv_ops`) em perfis Registados (limite de 5 operações/dia). Utilizadores Premium têm execuções ilimitadas. |
| **RN2** | Para o perfil **Registado**, o vídeo de entrada não pode exceder 60 segundos de duração nem resolução superior a 1080p (Full HD); para o perfil **Premium**, o limite é de 300 segundos (5 minutos) com resolução até 4K. Utilizadores **Anónimos** não têm acesso a ferramentas avançadas de vídeo. |
| **RN3** | O vídeo resultante deve preservar o contentor MP4 (H.264) e a faixa de áudio original (copiada diretamente sem perda de sincronismo labial — *audio pass-through*). |
| **RN4** | A inferência visual deve utilizar um limiar de confiança (*confidence threshold*) mínimo de 0.65 para evitar falsos positivos excessivos sobre texturas ou objetos estáticos de fundo. |
| **RN5** | O processamento é estritamente não destrutivo: a versão original enviada pelo utilizador nunca é sobrescrita pelo resultado do processamento, permitindo *Reset* e *Undo* sem perda de qualidade. |
| **RN6** | Toda a comunicação de progresso e conclusão deve ser transmitida de modo assíncrono via RabbitMQ (`ws_queue`) e WebSocket (`ws_gateway` / Socket.IO) para o `runnerId` que iniciou a operação; a API REST síncrona limita-se a validar e aceitar o pedido. |

### 2.7 Assunções

| **ID** | **Assunção** |
|--------|--------------|
| **A1** | O vídeo submetido possui iluminação e contraste razoáveis que permitem aos modelos de visão por computador a extração e distinção de características faciais e carateres alfanuméricos de matrículas. |
| **A2** | O contentor Docker do worker de vídeo dispõe de recursos de CPU/memória suficientes para garantir que o tempo de processamento no MVP não ultrapassa uma média de 2 a 3 vezes a duração nominal do vídeo (respeitando o timeout máximo de 180 s). |
| **A3** | O armazenamento de objetos compatível com S3 (`SeaweedFS`, mediado por `img_storage`) possui espaço em disco suficiente para albergar simultaneamente o vídeo original, os artefactos temporários e o vídeo resultante final, com encriptação em repouso (SSE). |
| **A4** | O algoritmo de seguimento (*tracking*) entre fotogramas garante que a máscara de desfocagem acompanha o movimento contínuo dos alvos sem intermitências (*flickering*) visíveis. |
| **A5** | Os ficheiros temporários gerados localmente no contentor do worker durante a extração e remuxing são eliminados imediatamente após o upload do resultado ou interrupção da tarefa. |

### 2.8 Questões em Aberto

| **ID** | **Questão** |
|--------|-------------|
| **Q1** | Deve existir numa fase futura uma opção manual que permita ao utilizador definir zonas retangulares de exclusão na linha temporal, caso a IA deixe escapar algum rosto pontual em ângulos extremos? |
| **Q2** | Em projetos partilhados com permissão `edit` (UC07), o consumo da operação avançada de vídeo deve ser debitado na quota do proprietário do projeto (`ownerId`) ou na quota do colaborador autenticado que clicou em Aplicar (`runnerId` / `X-Caller-Id`)? |
| **Q3** | Resolvida na Assunção A5 e no requisito REQ-VID-BLUR-014 (os artefactos temporários de trabalho no worker são expurgados imediatamente após a conclusão ou falha da execução). |

---

## 3. Utilização de agentes de IA

| **Ferramenta / *skill*** | **Tarefa apoiada** | **Validação realizada pela equipa** |
|--------------------------|--------------------|--------------------------------------|
| Gemini 4 Argon | Ajuda a estruturação do caso de uso UC-VID-003, derivação e expansão para a ERS completa (Exercício 2), classificação segundo a norma ISO/IEC 25010, definição de alvos MVP vs. Produção e alinhamento com a arquitetura `picturas-27`. | Revisão manual pela equipa, confrontando os requisitos, filas RabbitMQ, tokens de execução (`activeToken`), controlo de concorrência (`X-Project-Version`) e serviço de storage (`SeaweedFS`) com os documentos de requisitos e arquitetura da solução base. |

---

## 4. Especificação de Requisitos do Sistema (ERS)

**Caso de Uso:** UC-VID-003 — Anonimizar Rostos e Matrículas em Vídeo  
**Versão do dossiê:** v1.2  
**Baseline do Exercício 1:** v1.1 (REQ-VID-BLUR-001 a REQ-VID-BLUR-013)

### 4.1 Requisitos da ERS

#### 4.1.1 Requisitos Funcionais

| **ID** | **Requisito** | **Prioridade** | **Evolução** | **Novo/Alt** | **Origem (UC / RN / decisão)** | **Justificação** | **Critério de aceitação / verificação** |
|--------|---------------|----------------|--------------|--------------|--------------------------------|------------------|-----------------------------------------|
| REQ-VID-BLUR-001 | O sistema deve permitir ao utilizador autenticado selecionar a ferramenta de anonimização de vídeo e configurar os alvos a detetar (rostos, matrículas ou ambos), o estilo de máscara (desfocagem gaussiana ou mosaico) e o nível de intensidade (baixa, média ou alta). | Deve ter | Mantido | NOVO | UC-VID-003, Passo 1, Passo 2 | Permite adequar a anonimização ao grau de privacidade e preferência visual do utilizador. | Dado um vídeo aberto no editor, quando o utilizador seleciona a ferramenta de anonimização, então os 3 seletores são apresentados com valores predefinidos válidos. |
| REQ-VID-BLUR-002 | O sistema deve validar se a duração, a resolução e o formato do vídeo submetido respeitam os limites do perfil do utilizador (MP4/H.264; até 60 s e 1080p para Registado; até 300 s e 4K para Premium) antes de enfileirar o trabalho. | Deve ter | Refinado | ALT | UC-VID-003, Passo 3, RN2, Exceção 2 | Protege a capacidade computacional dos workers de IA e sustenta o modelo SaaS de diferenciação por perfis. | Dado um utilizador Registado com um vídeo de 70 s, quando clica em Aplicar, então o pedido é rejeitado com HTTP 400 e mensagem explicativa sem publicar no RabbitMQ. |
| REQ-VID-BLUR-003 | O sistema deve verificar o saldo no `Users-MS` e debitar 1 operação avançada diária (`adv_ops`) ao utilizador Registado apenas quando a ferramenta de anonimização é nova face ao último processamento confirmado (`chargedAdvancedTools`). | Deve ter | Refinado | ALT | UC-VID-003, Passo 3, Passo 4, RN1, Exceção 1 | Evita *overbilling* em reaplicações e garante o cumprimento do limite de 5 operações diárias do plano gratuito. | Dado um utilizador Registado com 0 operações restantes, quando submete o pedido, então o sistema bloqueia a execução e exibe a mensagem uniformizada de limite esgotado. |
| REQ-VID-BLUR-004 | O sistema deve encaminhar os pedidos de anonimização submetidos por utilizadores Premium para uma fila prioritária (`high_priority_queue`) sem debitar quotas diárias. | Deve ter | Mantido | ALT | UC-VID-003, FA1, RN1 | Assegura o benefício de processamento ilimitado e prioritário contratado na subscrição Premium. | Dado um utilizador Premium autenticado, quando inicia o processamento, então a tarefa entra na `high_priority_queue` e o saldo de quotas não sofre alteração. |
| REQ-VID-BLUR-005 | O sistema deve emitir eventos periódicos de estado ("Em fila", "A processar", "Concluído", "Falhado") e percentagem de fotogramas processados via `ws_gateway` para a sessão do utilizador que iniciou a ação (`runnerId` / `X-Caller-Id`). | Deve ter | Refinado | ALT | UC-VID-003, Passo 5, Passo 6, Passo 8, RN6 | Como o processamento de vídeo é demorado, o utilizador (incluindo convidados em modo partilhado) necessita de feedback contínuo. | Dado um vídeo em processamento, quando o worker avança no processamento de fotogramas, então a barra de progresso da interface atualiza em tempo real via Socket.IO. |
| REQ-VID-BLUR-006 | O sistema deve permitir ao utilizador cancelar a operação em curso (`DELETE /projects/:uid/:pid/process`), incrementando o `activeToken`, fazendo *rollback* para `prevCommittedToken` e estornando a operação pendente no `Users-MS`. | Deve ter | Refinado | ALT | UC-VID-003, Passo 5, FA3, Pós-condição mínima | Impede que o utilizador fique bloqueado ou perca créditos diários em execuções iniciadas por engano ou demasiado longas. | Dado um processamento a decorrer, quando o utilizador clica em Cancelar, então o estado visual regressa ao resultado anterior em ≤ 1 s e o saldo de operações é reposto. |
| REQ-VID-BLUR-007 | O sistema deve detetar e rastrear rostos e matrículas ao longo dos fotogramas com um limiar de confiança mínimo de 0.65 e aplicar a máscara gráfica selecionada sobre as *bounding boxes* identificadas. | Deve ter | Mantido | NOVO | UC-VID-003, Passo 6, RN4 | Constitui o núcleo funcional de proteção de dados pessoais e cumprimento do RGPD em vídeo. | Dado um vídeo de teste com rostos e matrículas visíveis, quando o processamento termina, então todas as ocorrências com confiança ≥ 0.65 apresentam a máscara aplicada sem *flickering*. |
| REQ-VID-BLUR-008 | O sistema deve recombinar os fotogramas anonimizados com a faixa de áudio original (*audio pass-through*) num contentor MP4 (H.264/AAC) e persistir o ficheiro resultante no armazenamento `SeaweedFS`. | Deve ter | Mantido | NOVO | UC-VID-003, Passo 7, Passo 9, RN3, Pós-condição de sucesso | Preserva a integridade sonora e garante reprodução imediata nos navegadores web modernos. | Dado um vídeo com faixa de áudio, quando o processamento termina, então o vídeo exportado no modo *Results* mantém o áudio sincronizado com a imagem. |
| REQ-VID-BLUR-009 | O sistema deve notificar o utilizador e estornar automaticamente a operação avançada no `Users-MS` quando a análise concluir todos os fotogramas com zero deteções de rostos ou matrículas. | Deveria ter | Mantido | NOVO | UC-VID-003, FA2 | Garante justiça no consumo de quotas quando nenhuma modificação visual pôde ser efetuada no vídeo. | Dado um vídeo sem rostos nem matrículas, quando o worker conclui com 0 deteções, então o utilizador recebe o aviso informativo e recupera o crédito debitado. |
| REQ-VID-BLUR-010 | O sistema deve rejeitar ficheiros de vídeo corrompidos ou com codecs incompatíveis, fazendo *rollback* do token de execução, estornando o crédito e exibindo uma mensagem traduzida pelo módulo `getAiErrorMessage`. | Deve ter | Refinado | NOVO | UC-VID-003, Exceção 3, Pós-condição mínima | Previne falhas silenciosas nos workers e garante mensagens de erro inteligíveis em português (padrão T-02). | Dado um ficheiro MP4 corrompido, quando o worker falha na abertura do stream, então o sistema estorna a operação e apresenta o toast explicativo ao utilizador. |
| REQ-VID-BLUR-011 | O sistema deve aplicar *short-circuit* no pedido de processamento quando o fingerprint SHA-256 da pipeline (`committedTools`) não tiver sofrido alterações desde o último `committedToken` válido. | Deveria ter | Mantido | ALT | UC-VID-003, Passo 3, FA4 | Evita recomputação pesada de vídeo e tráfego desnecessário no RabbitMQ e no `SeaweedFS` (padrão T-03). | Dado um projeto já processado, quando o utilizador clica em Aplicar sem alterar parâmetros, então o backend responde imediatamente sem enfileirar novo job. |
| REQ-VID-BLUR-014 | O sistema deve eliminar automaticamente todos os fotogramas e ficheiros temporários locais do worker imediatamente após a transferência do vídeo final para o `SeaweedFS` ou após cancelamento/falha. | Deve ter | Novo | NOVO | UC-VID-003, FA3, Assunção A5, Q3 | Evita a exaustão de armazenamento no contentor Docker do worker e protege a privacidade dos dados (RNF57). | Dado o término ou cancelamento de um job de vídeo, quando se inspeciona o diretório temporário do worker, então não existem ficheiros residuais dessa execução. |

#### 4.1.2 Requisitos Não Funcionais e de Qualidade

| **ID** | **Requisito** | **Característica ISO/IEC 25010** | **Alvo MVP** | **Alvo produção** | **Evolução** | **Origem (UC / DQ)** | **Critério de aceitação / verificação** |
|--------|---------------|----------------------------------|--------------|-------------------|--------------|----------------------|-----------------------------------------|
| REQ-VID-BLUR-012 | O sistema deve monitorizar a duração do processamento de vídeo, emitindo alerta de demora aos 60 s e aplicando timeout automático com estorno de quota caso a execução exceda o limite máximo. | Fiabilidade / Eficiência de Desempenho | Aviso aos 60 s; timeout aos 180 s sem retry | Aviso aos 45 s; timeout aos 120 s com 1 retry automático | Refinado | Exceção 4, DQ-001 | Dado um worker bloqueado artificialmente, quando decorrem 180 s, então o `Projects-MS` invalida o token, repõe o crédito e notifica o cliente. |
| REQ-VID-BLUR-013 | O sistema deve garantir que o ficheiro de vídeo original se mantém inalterado e sem perda de qualidade após qualquer processamento, cancelamento ou operação de *Reset*/*Undo*. | Fiabilidade (Integridade) | Ficheiro original imutável no `SeaweedFS` | Imutável com versionamento de snapshots e backup diário | Refinado | RN5, Pós-condições, DQ-002 | Dado um projeto após processamento e subsequente *Reset*, quando se compara o hash SHA-256 do vídeo com o ficheiro inicial carregado, então os hashes coincidem em 100% dos casos. |
| REQ-VID-BLUR-015 | O sistema deve responder ao pedido HTTP de submissão do processamento (`POST /:user/:project/process`) de forma assíncrona, sem bloquear a interface do utilizador. | Eficiência de Desempenho | ≤ 2,0 s (confirmação de enfileiramento) | ≤ 500 ms | Novo | RN6, DQ-003 | Dado um vídeo carregado no projeto, quando o utilizador clica em Aplicar, então a resposta HTTP de aceitação chega em ≤ 2,0 s em 95% dos testes. |
| REQ-VID-BLUR-016 | O worker de anonimização deve processar o vídeo dentro de um rácio máximo de tempo de computação face à duração nominal do ficheiro. | Eficiência de Desempenho | ≤ 3× a duração do vídeo (a 720p/30fps em CPU) | ≤ 0,5× a duração do vídeo (com aceleração GPU/CUDA) | Novo | Assunção A2, DQ-004 | Dado um vídeo de 20 s a 720p, quando processado no ambiente Docker local (MVP), então a tarefa conclui em ≤ 60 s. |
| REQ-VID-BLUR-017 | O sistema deve atualizar o indicador de progresso na interface do utilizador com uma periodicidade regular durante toda a execução do worker. | Usabilidade | Atualização a cada ≥ 10% de fotogramas ou ≤ 5 s | Atualização contínua a cada ≤ 1 s com estimativa de tempo restante (ETA) | Novo | Passo 5, Passo 6, DQ-005 | Dado um vídeo de 30 s em processamento, quando se observa o overlay de progresso, então o valor percentual é atualizado pelo menos a cada 5 s. |
| REQ-VID-BLUR-018 | O sistema deve restringir o acesso ao vídeo original e ao vídeo anonimizado exclusivamente ao proprietário do projeto e a utilizadores autenticados com link de partilha válido (`checkSharePermission`), cifrando as comunicações e o armazenamento. | Segurança | Validação JWT / `shareId`, TLS via Nginx e SSE no `SeaweedFS` | URLs pré-assinadas de curta duração (≤ 15 min) com rotação automática de chaves KMS | Novo | DQ-006 | Dado um utilizador não autorizado ou com link revogado (HTTP 410), quando tenta aceder ao URL do vídeo, então o acesso é negado com código 401/403/410. |
| REQ-VID-BLUR-019 | O sistema deve aceitar e exportar vídeos em formato e codecs compatíveis nativamente com o reprodutor HTML5 dos navegadores modernos (Chrome, Safari, Firefox e Edge). | Compatibilidade | Contentor MP4 (vídeo H.264, áudio AAC) | Suporte alargado a MP4, MOV e WebM (H.264, HEVC, VP9) | Novo | RN3, DQ-007 | Dado o vídeo final gerado pelo worker, quando carregado no elemento `<video>` no Chrome, Firefox e Safari, então é reproduzido nativamente sem necessidade de plugins. |
| REQ-VID-BLUR-020 | A introdução do microsserviço de anonimização de vídeo deve respeitar o padrão arquitetural de *Tools/Workers* sem exigir modificações no código das ferramentas de imagem existentes. | Manutenibilidade | Microsserviço isolado acoplado via fila RabbitMQ | Registo dinâmico de capacidades da ferramenta via contrato padronizado | Novo | DQ-008 | Dada a adição do serviço `privacy_blur_tool`, quando o sistema é compilado, então nenhum ficheiro das ferramentas existentes (`cut_tool`, `rotate_tool`, etc.) necessita de alteração. |
| REQ-VID-BLUR-021 | Todas as dependências de processamento de vídeo e visão por computador (Python, OpenCV, FFmpeg e pesos do modelo) devem correr isoladas num contentor Docker autónomo. | Portabilidade | Imagem Docker `linux/arm64` e `linux/amd64` configurada no `docker-compose.yaml` | Imagem *multi-arch* otimizada para orquestração Kubernetes com suporte opcional a GPU | Novo | DQ-009 | Dado um computador com Docker Compose, quando se executa `docker compose up --build -d`, então o worker de vídeo arranca sem exigir bibliotecas instaladas no sistema anfitrião. |

#### 4.1.3 Verificação da completude e dos limites do âmbito

| **Tópico a verificar** | **Aplicável?** | **Decisão / justificação** | **Requisito(s) relacionado(s)** |
|------------------------|----------------|----------------------------|---------------------------------|
| **Formato, codec, duração e dimensão do vídeo** | Sim | Validados à entrada: formato MP4 (H.264/AAC), duração máxima de 60 s (1080p) para perfil Registado e 300 s (4K) para Premium. | REQ-VID-BLUR-002, REQ-VID-BLUR-008, REQ-VID-BLUR-019 |
| **Estado, progresso, cancelamento e resultado** | Sim | Coberto pelo overlay *Processing*, eventos via `ws_gateway` (Socket.IO) e cancelamento com *rollback* de `activeToken`/`committedToken` e reembolso de quota. | REQ-VID-BLUR-005, REQ-VID-BLUR-006, REQ-VID-BLUR-017 |
| **Falhas durante o processamento** | Sim | Tratamento de ficheiros corrompidos, timeout aos 180 s, mensagens uniformizadas (`getAiErrorMessage`), limpeza de temporários e estorno de operações no `Users-MS`. | REQ-VID-BLUR-010, REQ-VID-BLUR-012, REQ-VID-BLUR-013, REQ-VID-BLUR-014 |
| **Persistência e expiração dos ficheiros** | Sim | Vídeo original e vídeo resultante são persistidos no `SeaweedFS` (via `img_storage`) associados ao projeto; ficheiros intermédios no worker são apagados de imediato após cada job. | REQ-VID-BLUR-008, REQ-VID-BLUR-013, REQ-VID-BLUR-014 |
| **Perfis e contagem de operações** | Sim | Articulado com `Users-MS`: anónimos excluídos; registados debitam 1 operação avançada (máx. 5/dia) com reembolso em falha/cancelamento/0 deteções; premium ilimitado e prioritário. | REQ-VID-BLUR-002, REQ-VID-BLUR-003, REQ-VID-BLUR-004, REQ-VID-BLUR-009 |
| **Encadeamento de ferramentas e processamento em lote** | Não | **Excluído explicitamente no MVP:** O encadeamento multi-ferramenta, os Presets (UC05), o Assistente IA de receitas (UC06) e a exportação em lote/PDF (T-09) permanecem exclusivos para imagens estáticas. No MVP da Fase 1, a ferramenta de vídeo é executada de forma unitária para validar o pipeline fim-a-fim. | N/A (Exclusão explícita e justificada no âmbito do MVP) |

### 4.2 Impacto no sistema existente

| **Elemento existente afetado** | **Impacto (Manter / Estender / Alterar)** | **Descrição do impacto** | **Requisito(s) relacionado(s)** |
|--------------------------------|-------------------------------------------|--------------------------|---------------------------------|
| **Gestão de Quotas, Perfis e Reembolsos (`Users-MS` / `Projects-MS`)** | Alterar | A contagem incremental de operações avançadas (`chargedAdvancedTools`, `pendingAdvancedOps`) e o endpoint de reembolso (`POST /:user/process/refund/:advanced_tools`) passam a contabilizar a ferramenta de vídeo e a validar limites de duração/resolução por perfil. | REQ-VID-BLUR-002, REQ-VID-BLUR-003, REQ-VID-BLUR-004, REQ-VID-BLUR-009 |
| **Infraestrutura de Mensageria (`RabbitMQ`)** | Estender | Criação da fila `privacy_blur_queue` (e fila prioritária `high_priority_queue`) para consumo pelo novo worker, reutilizando a `project_queue` para resultados e a `ws_queue` para eventos em tempo real. | REQ-VID-BLUR-004, REQ-VID-BLUR-005, REQ-VID-BLUR-007, REQ-VID-BLUR-020 |
| **Armazenamento de Objetos (`SeaweedFS` e `img_storage`)** | Estender | O serviço `SeaweedFS` (compatível com S3, que substituiu o MinIO) e o `img_storage` são estendidos para armazenar e servir objetos de vídeo MP4 com encriptação em repouso. | REQ-VID-BLUR-008, REQ-VID-BLUR-013, REQ-VID-BLUR-018 |
| **Orquestração de Execuções, Tokens e Concorrência (`Projects-MS`)** | Estender | Reutilização e extensão do modelo de tokens (`activeToken`, `committedToken`, `prevCommittedToken`), do *short-circuit* por hash SHA-256 no Apply e dos cabeçalhos `X-Project-Version` e `X-Caller-Id` (`runnerId`) para suportar sessões normais e partilhadas (UC07). | REQ-VID-BLUR-005, REQ-VID-BLUR-006, REQ-VID-BLUR-011, REQ-VID-BLUR-012 |
| **Gateway WebSocket (`ws_gateway`) e Erros (`lib/error-messages.ts`)** | Estender | Encaminhamento de eventos de progresso percentual do vídeo via Socket.IO para a sala do `runnerId` e adição de mapeamentos de erro de vídeo em `getErrorMessage` / `getAiErrorMessage`. | REQ-VID-BLUR-005, REQ-VID-BLUR-010, REQ-VID-BLUR-017 |
| **Encadeamento, Lote (.zip/.pdf), Presets (`UC05`) e Assistente IA (`UC06`)** | Manter | Mantidos sem alterações para o domínio de imagens; o download de vídeo é feito diretamente em formato `.mp4` e a aplicação da ferramenta de vídeo é unitária no MVP. | REQ-VID-BLUR-019 |

### 4.3 Matriz de Rastreabilidade Atualizada

| **Elemento de origem** | **Descrição abreviada** | **Requisito(s) relacionado(s)** |
|------------------------|-------------------------|---------------------------------|
| **Passo 1** | Abertura do projeto e visualização do vídeo e saldo de operações no editor | REQ-VID-BLUR-001, REQ-VID-BLUR-003 |
| **Passo 2** | Seleção da ferramenta e configuração de alvos, estilo e intensidade | REQ-VID-BLUR-001 |
| **Passo 3** | Validação de fingerprint SHA-256, duração, resolução e quota no `Users-MS` | REQ-VID-BLUR-002, REQ-VID-BLUR-003, REQ-VID-BLUR-011 |
| **Passo 4** | Incremento de `activeToken`, débito de operação e publicação no RabbitMQ | REQ-VID-BLUR-003, REQ-VID-BLUR-004, REQ-VID-BLUR-015 |
| **Passo 5** | Apresentação do overlay *Processing* com progresso e botão Cancelar | REQ-VID-BLUR-005, REQ-VID-BLUR-006, REQ-VID-BLUR-017 |
| **Passo 6** | Descodificação, deteção/tracking com limiar ≥ 0.65, máscara e eventos de progresso | REQ-VID-BLUR-005, REQ-VID-BLUR-007, REQ-VID-BLUR-016, REQ-VID-BLUR-017 |
| **Passo 7** | Remuxing com áudio original (*pass-through*), gravação no `SeaweedFS` e limpeza local | REQ-VID-BLUR-008, REQ-VID-BLUR-013, REQ-VID-BLUR-014, REQ-VID-BLUR-019 |
| **Passo 8** | Validação do `activeToken`, atualização do `committedToken` e evento no `ws_gateway` | REQ-VID-BLUR-005, REQ-VID-BLUR-008 |
| **Passo 9** | Apresentação da conclusão e disponibilização do vídeo no modo *Results* | REQ-VID-BLUR-008, REQ-VID-BLUR-018, REQ-VID-BLUR-019 |
| **FA1** | Fila prioritária (`high_priority_queue`) e isenção de quota para perfil Premium | REQ-VID-BLUR-004 |
| **FA2** | Aviso e reembolso de operação no `Users-MS` quando há 0 deteções | REQ-VID-BLUR-009 |
| **FA3** | Cancelamento com *rollback* de `committedToken`, limpeza e reembolso em ≤ 1 s | REQ-VID-BLUR-006, REQ-VID-BLUR-014 |
| **FA4** | *Short-circuit* no Apply quando o fingerprint SHA-256 da pipeline não mudou | REQ-VID-BLUR-011 |
| **Exceção 1** | Rejeição por esgotamento do limite diário de 5 operações avançadas | REQ-VID-BLUR-003 |
| **Exceção 2** | Rejeição por vídeo exceder duração ou resolução máxima do perfil | REQ-VID-BLUR-002 |
| **Exceção 3** | Falha de leitura de codec/ficheiro corrompido com reembolso e toast uniformizado | REQ-VID-BLUR-010, REQ-VID-BLUR-014 |
| **Exceção 4** | Aviso aos 60 s e cancelamento automático por timeout aos 180 s com reembolso | REQ-VID-BLUR-012, REQ-VID-BLUR-014 |
| **Pós-condições** | Garantia de sucesso (vídeo anonimizado + áudio sincronizado) e mínima (original intacto + *rollback*) | REQ-VID-BLUR-006, REQ-VID-BLUR-008, REQ-VID-BLUR-013, REQ-VID-BLUR-014 |
| **RN1 / RN2** | Regras de negócio de quotas diárias e limites de duração/resolução por perfil | REQ-VID-BLUR-002, REQ-VID-BLUR-003, REQ-VID-BLUR-004 |
| **RN3 / RN4** | Preservação de áudio original e limiar de confiança mínimo de 0.65 | REQ-VID-BLUR-007, REQ-VID-BLUR-008, REQ-VID-BLUR-019 |
| **RN5 / RN6** | Edição não destrutiva e comunicação assíncrona via RabbitMQ e WebSocket | REQ-VID-BLUR-005, REQ-VID-BLUR-013, REQ-VID-BLUR-015 |
| **DQ-001** | Política de monitorização de demora (60 s) e timeout de segurança (180 s) | REQ-VID-BLUR-012 |
| **DQ-002** | Garantia de imutabilidade do ativo original através de verificação de integridade | REQ-VID-BLUR-013 |
| **DQ-003** | Desacoplamento síncrono/assíncrono na submissão HTTP do pedido de vídeo | REQ-VID-BLUR-015 |
| **DQ-004** | Meta de débito computacional em CPU no MVP vs. aceleração por GPU em produção | REQ-VID-BLUR-016 |
| **DQ-005** | Cadência mínima de feedback visual de progresso para operações longas | REQ-VID-BLUR-017 |
| **DQ-006** | Controlo de acesso estrito (JWT + `shareId`) e proteção de dados em trânsito/repouso | REQ-VID-BLUR-018 |
| **DQ-007** | Normalização do contentor e codecs para reprodução nativa HTML5 | REQ-VID-BLUR-019 |
| **DQ-008** | Isolamento modular do worker de vídeo segundo o padrão arquitetural *Tools-MS* | REQ-VID-BLUR-020 |
| **DQ-009** | Contentorização completa das dependências nativas (FFmpeg + OpenCV) em Docker | REQ-VID-BLUR-021 |

**Decisões de qualidade introduzidas nesta aula**

| **ID** | **Decisão de qualidade** | **Justificação** | **Requisito(s) relacionado(s)** |
|--------|--------------------------|------------------|---------------------------------|
| **DQ-001** | Manter o aviso informativo aos 60 s (padrão T-03) e fixar um timeout rígido de 180 s no MVP sem repetição automática, evoluindo para retry automático em produção. | Impede o bloqueio indefinido de workers em caso de falha na inferência de vídeo, mantendo simplicidade operacional no MVP. | REQ-VID-BLUR-012 |
| **DQ-002** | Preservar o ficheiro de vídeo original intacto no `SeaweedFS` e apoiar a recuperação de estado no mecanismo de tokens (`committedToken` / `prevCommittedToken`). | Garante edição não destrutiva e permite *Undo*, *Reset* e cancelamento instantâneo sem corrupção de dados. | REQ-VID-BLUR-013 |
| **DQ-003** | A submissão HTTP deve apenas validar permissões/quotas e publicar na fila RabbitMQ em ≤ 2,0 s no MVP (≤ 500 ms em produção). | Evita timeouts HTTP no Nginx e API Gateway durante operações de vídeo que demoram dezenas de segundos. | REQ-VID-BLUR-015 |
| **DQ-004** | Aceitar processamento em CPU até 3× a duração do vídeo (720p) no MVP (compatível com Apple Silicon `arm64` e `amd64`), reservando a exigência de tempo real (≤ 0,5× com GPU) para produção. | Viabiliza a execução local em qualquer máquina da equipa sem exigir placas gráficas dedicadas na Fase 1. | REQ-VID-BLUR-016 |
| **DQ-005** | Emitir eventos de progresso via `ws_queue` pelo menos a cada 10% de fotogramas ou 5 segundos no MVP. | Assegura visibilidade contínua ao utilizador sem saturar o broker RabbitMQ nem o `ws_gateway` com mensagens a cada fotograma. | REQ-VID-BLUR-017 |
| **DQ-006** | Reutilizar o controlo de acesso do `Projects-MS` (JWT e `checkSharePermission` para links partilhados), TLS no Nginx e encriptação no `SeaweedFS`. | Mantém total coerência com os requisitos de segurança e RGPD (T-05 e RNF44) já implementados na plataforma. | REQ-VID-BLUR-018 |
| **DQ-007** | Restringir o MVP ao contentor MP4 com codec de vídeo H.264 e áudio AAC, alargando a MOV/WebM em produção. | Garante compatibilidade nativa imediata com o elemento `<video>` em todos os browsers sem transcodificação adicional. | REQ-VID-BLUR-019 |
| **DQ-008** | Implementar a ferramenta como um worker independente (`privacy_blur_tool`) ligado por AMQP, seguindo exatamente o padrão de `expand_ai_tool` e `watermark_tool_ms`. | Preserva o baixo acoplamento e permite adicionar a funcionalidade sem tocar no código das ferramentas de imagem. | REQ-VID-BLUR-020 |
| **DQ-009** | Empacotar FFmpeg, OpenCV e modelos de deteção dentro do `Dockerfile` do novo serviço no `docker-compose.yaml`. | Elimina problemas de configuração entre ambientes de desenvolvimento distintos. | REQ-VID-BLUR-021 |

**Verificações de cobertura**
- [x] Cada requisito funcional e não funcional aparece na matriz.
- [x] Cada requisito tem origem identificada: elemento do caso de uso, regra de negócio ou decisão de qualidade.
- [x] Todos os elementos relevantes do caso de uso têm requisito associado ou justificação para não terem.
- [x] Os tópicos excluídos na secção 4.1.3 estão justificados.
- [x] O impacto no sistema existente está atualizado e ligado aos requisitos relevantes.

---

## ✅ Lista de verificação antes de entregar

- [x] As secções 0 a 3 do dossiê foram preservadas; as assunções, questões em aberto e utilização de IA foram atualizadas.
- [x] A funcionalidade, o caso de uso e o perfil do Exercício 1 foram mantidos.
- [x] Requisitos funcionais estão completos para o âmbito e têm critérios verificáveis.
- [x] Requisitos de qualidade estão classificados e distinguem os alvos MVP e produção.
- [x] Os IDs existentes foram preservados quando a intenção não mudou.
- [x] A análise de completude não alargou o âmbito sem decisão explícita.
- [x] A matriz de rastreabilidade não tem requisitos órfãos nem elementos relevantes por cobrir.
- [x] As decisões de qualidade e os respetivos requisitos estão identificados.
