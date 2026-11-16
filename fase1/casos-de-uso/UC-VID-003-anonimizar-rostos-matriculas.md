# 📝 Exercícios 1 e 2 — Casos de Uso e Especificação de Requisitos do Sistema (ERS)
### Casos de Uso e ERS · Fase 1: Suporte a Vídeo no PictuRAS

## 0. Identificação

| **Campo** | **Valor** |
|-----------|-----------|
| **Grupo / Equipa** | 6 |
| **Autores** | António Sousa (PG63923), Bruno Sousa (PG63927), Bruno Vale (PG63926), Diogo Macedo (PG63947), Sérgio Vieira (PG65442) |
| **Data** | 2026-10-15 |
| **Versão do documento** | v1.3 |
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
| **Versão** | v1.3 |
| **Autor** | Diogo Henrique Freitas Macedo |
| **Data** | 2026-10-15 |
| **Objetivo** | Permitir ao utilizador detetar automaticamente elementos sensíveis (rostos de pessoas e matrículas de veículos) ao longo de todo o vídeo e aplicar uma máscara de desfocagem (*blur*) ou mosaico (*pixelate*), obtendo uma versão anonimizada em conformidade com normas de privacidade e RGPD. |
| **Âmbito** | PictuRAS — edição de vídeo no projeto: processamento avançado com visão por computador, gestão de projetos, quotas de utilização e notificações em tempo real. |
| **Ator Principal** | Utilizador Registado (ou Utilizador Premium) |
| **Stakeholders e Interesses** | - **Utilizador Registado / Premium**: pretende partilhar ou arquivar vídeos sem expor dados pessoais de terceiros, com um processo automatizado e sem esforço de edição manual fotograma a fotograma.<br>- **Convidado por Link (com permissão `edit`)**: pretende aplicar a ferramenta num projeto partilhado recebendo o feedback de progresso na sua própria sessão.<br>- **Proprietário da Plataforma / Administrador de Sistema**: pretende disponibilizar uma funcionalidade avançada de forte apelo comercial (SaaS) em conformidade com o RGPD, garantindo sustentabilidade computacional através de quotas e limites de duração.<br>- **Equipa DevOps / Desenvolvimento**: valida a robustez dos workers de IA perante cargas temporais pesadas e assegura isolamento, controlo de concorrência e gestão de falhas na pipeline assíncrona. |
| **Pré-condições** | - O utilizador tem sessão autenticada na plataforma e permissão de edição no projeto.<br>- O vídeo de entrada foi carregado com sucesso no projeto e está acessível no armazenamento do sistema.<br>- O utilizador dispõe de saldo suficiente de operações diárias avançadas (no caso de Utilizador Registado). |
| **Trigger** | O utilizador, com um vídeo selecionado no editor do projeto, adiciona/configura a ferramenta **Anonimização de Privacidade (Blur)**, define os parâmetros e confirma a execução clicando em **Aplicar (Apply)**. |

### 2.2 Fluxo Principal

| **Passo** | **Ação do Ator** | **Resposta do Sistema** |
|-----------|------------------|-------------------------|
| 1 | O utilizador abre o projeto e seleciona um vídeo para processamento. | Apresenta a interface de edição com o leitor de vídeo, pré-visualização, duração, resolução, formato, o saldo de operações diárias restantes e a barra lateral de ferramentas disponíveis. |
| 2 | O utilizador seleciona a ferramenta **Anonimização de Privacidade (Blur)**. | Exibe o painel de configuração com as opções: elementos a detetar (Rostos, Matrículas ou Ambos), estilo de ocultação (Desfocagem Gaussiana ou Mosaico) e nível de intensidade (Baixa, Média ou Alta). |
| 3 | O utilizador define os parâmetros pretendidos e confirma a execução clicando em **Aplicar (Apply)**. | Valida imediatamente o formato e codec do vídeo (MP4 ou MOV com H.264), a duração e a resolução face ao perfil do utilizador, verifica a existência de alterações nos parâmetros face ao estado atual e valida o saldo de quotas disponível. |
| 4 | — | Aceita o pedido de processamento, reserva uma operação na quota do utilizador e inicia o trabalho assíncrono em segundo plano. |
| 5 | — | Apresenta na interface um painel informativo de processamento com o estado da tarefa ("Em fila" / "A processar"), uma barra de progresso percentual dinâmica e o botão **Cancelar** permanentemente disponível. |
| 6 | — | O serviço de visão por computador analisa o vídeo fotograma a fotograma, deteta e rastreia os alvos sensíveis configurados com limiar de confiança mínimo e aplica a máscara selecionada, emitindo atualizações periódicas de progresso para a interface. |
| 7 | — | O sistema combina os fotogramas processados com a faixa de áudio original sem perda de sincronismo, produz o novo ficheiro de vídeo normalizado (MP4) e guarda o resultado no armazenamento de objetos. |
| 8 | — | O sistema confirma a conclusão bem-sucedida da tarefa, consolida o débito da operação na quota do utilizador e notifica a interface em tempo real. |
| 9 | — | A interface fecha o painel de processamento, exibe uma mensagem de sucesso e disponibiliza o vídeo anonimizado no modo de resultados para reprodução e transferência imediata. |

### 2.3 Fluxos Alternativos

| **Fluxo** | **Descrição** |
|-----------|---------------|
| **FA1 – Processamento por Utilizador Premium com Fila Prioritária** | No passo 3, o sistema verifica que o utilizador possui o plano Premium → O pedido é encaminhado de imediato para uma fila de alta prioridade, sem debitar operações na quota diária. O fluxo segue para o passo 5. |
| **FA2 – Nenhum elemento sensível detetado** | No passo 6, a análise conclui todos os fotogramas e deteta 0 ocorrências de rostos ou matrículas com confiança $\ge 0.65$ → O sistema conclui o processo mantendo o vídeo original como resultado, notifica o utilizador com o aviso *"Nenhum rosto ou matrícula detetado no vídeo; o ficheiro resultante é idêntico ao original"* e estorna automaticamente a operação debitada na quota do utilizador. |
| **FA3 – Cancelamento voluntário da anonimização** | Durante os passos 5 ou 6, o utilizador clica no botão **Cancelar** → O sistema interrompe o processamento, descarta os ficheiros parciais gerados, repõe a quota debitada e restaura o editor ao estado anterior em menos de 1 segundo. |
| **FA4 – Reaplicação sem alterações na pipeline (Short-Circuit)** | No passo 3, o utilizador clica em **Aplicar**, mas a configuração das ferramentas e parâmetros coincide exatamente com o último processamento confirmado → O sistema devolve imediatamente o resultado existente sem novo processamento nem consumo de quota. |

### 2.4 Exceções

| **Condição** | **Comportamento do Sistema** |
|--------------|------------------------------|
| **Exceção 1 – Quota diária de operações avançadas esgotada** | No passo 3, o utilizador Registado já consumiu as suas 5 operações diárias → O sistema bloqueia a submissão e apresenta a mensagem *"Limite diário de operações avançadas atingido. Efetue upgrade para a conta Premium para processar sem limites"*, impedindo a execução. |
| **Exceção 2 – Duração ou resolução do vídeo excede o limite do perfil** | No passo 3, a duração ou resolução do vídeo excede o limite permitido para contas Registadas (superior a 60 segundos ou superior a 1080p) → Exibe a mensagem uniformizada *"A ferramenta de anonimização em contas Gratuitas está limitada a vídeos de até 60 segundos (1080p). O vídeo atual excede este limite"*, impedindo a execução. |
| **Exceção 3 – Formato ou codec incompatível ou ficheiro corrompido** | No passo 3, a validação inicial deteta que o ficheiro não é um MP4 ou MOV válido (H.264/AAC) ou encontra-se corrompido → O sistema rejeita o pedido no momento da submissão, não debita quota e apresenta a mensagem *"Formato ou codec de vídeo inválido. Certifique-se de que o ficheiro utiliza um formato suportado (MP4 ou MOV com vídeo H.264)"*. |
| **Exceção 4 – Sobrecarga ou Timeout do serviço de IA** | No passo 6, se a operação ultrapassar 60 segundos, a interface exibe um aviso informativo de demora; se exceder o tempo limite operacional máximo dinâmico ($3 \times \text{duração do vídeo} + 60\text{ s}$) ou o serviço falhar de forma anómala → O sistema interrompe a tarefa, marca-a como falhada, liberta recursos, devolve a operação à quota do utilizador e apresenta a mensagem: *"O processamento excedeu o tempo máximo e foi interrompido. A operação não foi descontada"*. |

### 2.5 Pós-condições

| **Tipo** | **Resultado** |
|----------|---------------|
| **Garantia de Sucesso** | O novo ficheiro de vídeo gerado contém todos os rostos e matrículas detetados desfocados/pixelizados de forma contínua; o fluxo de áudio original mantém-se perfeitamente sincronizado; o ficheiro original mantém-se inalterado no armazenamento; o resultado fica persistido e associado ao novo estado do projeto; a quota de operações e o contador na interface são atualizados. |
| **Garantia Mínima** | O vídeo original permanece inalterado; o projeto regressa ao último estado confirmado válido sem associar ficheiros parciais ou corrompidos; qualquer quota reservada na execução é estornada na íntegra; é apresentada uma mensagem de erro clara e uniformizada na interface. |

### 2.6 Regras de Negócio e Restrições

| **ID** | **Regra** |
|--------|-----------|
| **RN1** | A anonimização automática é categorizada como **Ferramenta Avançada (IA)**, consumindo 1 operação diária por cada nova execução em perfis Registados (limite de 5 operações/dia). Utilizadores Premium têm execuções ilimitadas. A operação é reservada ao aceitar o pedido e só fica descontada quando o processamento termina com sucesso (RNG-04). |
| **RN2** | Para o perfil **Registado**, o vídeo de entrada não pode exceder 60 segundos de duração nem resolução superior a 1080p (Full HD); para o perfil **Premium**, o limite é de 300 segundos (5 minutos) com resolução até 4K. Utilizadores **Anónimos** não têm acesso a ferramentas avançadas de vídeo. |
| **RN3** | O vídeo resultante deve preservar o contentor MP4 (H.264) e a faixa de áudio original (copiada diretamente sem perda de sincronismo labial — *audio pass-through*). |
| **RN4** | A inferência visual deve utilizar um limiar de confiança (*confidence threshold*) mínimo de 0.65 para evitar falsos positivos excessivos sobre texturas ou objetos estáticos de fundo. |
| **RN5** | O processamento é estritamente não destrutivo: a versão original enviada pelo utilizador nunca é sobrescrita pelo resultado do processamento, permitindo *Reset* e *Undo* sem perda de qualidade. |
| **RN6** | Toda a comunicação de progresso e conclusão deve ser transmitida de modo assíncrono via mensageria e WebSockets para o utilizador que iniciou a operação; a API REST síncrona limita-se a validar e aceitar o pedido. |

### 2.7 Assunções

| **ID** | **Assunção** |
|--------|--------------|
| **A1** | O vídeo submetido possui iluminação e contraste razoáveis que permitem aos modelos de visão por computador a extração e distinção de características faciais e carateres alfanuméricos de matrículas. |
| **A2** | O contentor Docker do worker de vídeo dispõe de recursos de CPU/memória suficientes para garantir que o tempo de processamento no MVP não ultrapassa uma média de 2 a 3 vezes a duração nominal do vídeo (respeitando o timeout dinâmico de $3 \times \text{duração} + 60\text{ s}$). |
| **A3** | O armazenamento do PictuRAS possui espaço em disco suficiente para albergar simultaneamente o vídeo original, os artefactos temporários e o vídeo resultante final, com encriptação em repouso. |
| **A4** | O algoritmo de seguimento (*tracking*) entre fotogramas garante que a máscara de desfocagem acompanha o movimento contínuo dos alvos sem intermitências (*flickering*) visíveis. |
| **A5** | Os ficheiros temporários gerados localmente no contentor do worker durante a extração e remuxing são eliminados imediatamente após o upload do resultado ou interrupção da tarefa. |
| **A6** | Os limites de RN2 (60 s/1080p e 300 s/4K) foram fixados a partir do tempo de processamento esperado em CPU (A2), para que um vídeo free termine em poucos minutos; serão revistos após testes com vídeos reais. |

### 2.8 Questões em Aberto

| **ID** | **Questão** |
|--------|-------------|
| **Q1** | Deve existir numa fase futura uma opção manual que permita ao utilizador definir zonas retangulares de exclusão na linha temporal, caso a IA deixe escapar algum rosto pontual em ângulos extremos? |
| **Q2** | **Resolvida por decisão conjunta de grupo:** Em projetos partilhados com permissão `edit` (UC07), a quota de operações avançadas é debitada na conta do colaborador autenticado que executa a ação, e não na conta do proprietário do projeto. |
| **Q3** | **Resolvida na Assunção A5 e no REQ-VID-BLUR-014:** Os artefactos temporários de trabalho no worker são expurgados imediatamente após a conclusão, cancelamento ou falha da execução. |

---

## 3. Utilização de agentes de IA

| **Ferramenta / *skill*** | **Tarefa apoiada** | **Validação realizada pela equipa** |
|--------------------------|--------------------|--------------------------------------|
| Gemini 4 Argon | Ajuda à estruturação do caso de uso UC-VID-003, derivação e expansão para a ERS completa (Exercício 2), classificação segundo a norma ISO/IEC 25010, definição de alvos MVP vs. Produção, alinhamento com a arquitetura `picturas-27` e revisão de consistência face ao relatório de auditoria do grupo. | Revisão manual pela equipa, confrontando os requisitos, filas RabbitMQ, tokens de execução (`activeToken`), controlo de concorrência (`X-Project-Version`) e serviço de storage (`SeaweedFS`) com os documentos de requisitos e arquitetura da solução base. |

---

## 4. Especificação de Requisitos do Sistema (ERS)

**Caso de Uso:** UC-VID-003 — Anonimizar Rostos e Matrículas em Vídeo  
**Versão do dossiê:** v1.3  
**Baseline do Exercício 1:** v1.1 (REQ-VID-BLUR-001 a REQ-VID-BLUR-013)

### 4.1 Requisitos da ERS

#### 4.1.1 Requisitos Funcionais

| **ID** | **Requisito** | **Prioridade** | **Evolução** | **Novo/Alt** | **Origem (UC / RN / decisão)** | **Justificação** | **Critério de aceitação / verificação** |
|--------|---------------|----------------|--------------|--------------|--------------------------------|------------------|-----------------------------------------|
| REQ-VID-BLUR-001 | O sistema deve permitir ao utilizador autenticado selecionar a ferramenta de anonimização de vídeo e configurar os alvos a detetar (rostos, matrículas ou ambos), o estilo de máscara (desfocagem gaussiana ou mosaico) e o nível de intensidade (baixa, média ou alta). | Deve ter | Mantido | NOVO | UC-VID-003, Passo 1, Passo 2 | Permite adequar a anonimização ao grau de privacidade e preferência visual do utilizador. | Dado um vídeo aberto no editor, quando o utilizador seleciona a ferramenta de anonimização, então os 3 seletores são apresentados com valores predefinidos válidos. |
| REQ-VID-BLUR-002 | O sistema deve validar, no momento da submissão e antes de colocar o pedido em fila, se o formato, o codec, a duração e a resolução do vídeo respeitam os limites do perfil do utilizador (MP4 ou MOV com H.264; até 60 s e 1080p para Registado; até 300 s e 4K para Premium). | Deve ter | Refinado | ALT | UC-VID-003, Passo 3, RN2, Exceção 2, Exceção 3 | Evita ocupar o processamento com vídeos que vão ser recusados e sustenta a diferenciação de perfis. | Dado um utilizador Registado com um vídeo de 70 s ou com codec inválido, quando clica em Aplicar, então o pedido é recusado com a mensagem do limite e não é colocado em fila. |
| REQ-VID-BLUR-003 | O sistema deve verificar o saldo de operações avançadas do utilizador Registado e descontar 1 operação apenas quando a anonimização é nova face ao último processamento confirmado do projeto. | Deve ter | Refinado | ALT | UC-VID-003, Passo 3, Passo 4, RN1, Exceção 1 | Evita cobranças repetidas em reaplicações e garante o cumprimento do limite de 5 operações diárias do plano gratuito. | Dado um utilizador Registado com 0 operações restantes, quando submete o pedido, então o sistema bloqueia a execução e exibe a mensagem uniformizada de limite esgotado. |
| REQ-VID-BLUR-004 | O sistema deve colocar os pedidos de anonimização de utilizadores Premium numa fila com prioridade, sem descontar operações diárias. | Deve ter | Mantido | ALT | UC-VID-003, FA1, RN1 | Assegura o benefício de processamento ilimitado e prioritário contratado na subscrição Premium. | Dado um utilizador Premium autenticado, quando inicia o processamento, então o pedido é tratado com prioridade sobre os pedidos de utilizadores Registados e o saldo de operações não se altera. |
| REQ-VID-BLUR-005 | O sistema deve enviar periodicamente ao utilizador que iniciou a operação o estado ("Em fila", "A processar", "Concluída", "Falhada", "Cancelada") e a percentagem de fotogramas processados. | Deve ter | Refinado | ALT | UC-VID-003, Passo 5, Passo 6, Passo 8, RN6 | Como o processamento de vídeo é demorado, o utilizador (incluindo convidados em modo partilhado) necessita de feedback contínuo. | Dado um vídeo em processamento, quando o processamento avança, então a barra de progresso da interface é atualizada em tempo real, sem recarregar a página. |
| REQ-VID-BLUR-006 | O sistema deve permitir ao utilizador cancelar a anonimização em curso, repondo o projeto no estado anterior ao processamento e devolvendo a operação reservada. | Deve ter | Refinado | ALT | UC-VID-003, Passo 5, FA3, Pós-condição mínima | Impede que o utilizador fique bloqueado ou perca créditos diários em execuções iniciadas por engano ou demasiado longas. | Dado um processamento a decorrer, quando o utilizador clica em Cancelar, então o estado visual regressa ao resultado anterior em ≤ 1 s e o saldo de operações é reposto. |
| REQ-VID-BLUR-007 | O sistema deve detetar e seguir rostos e matrículas ao longo dos fotogramas com um limiar de confiança mínimo de 0,65 e aplicar a máscara selecionada sobre as zonas identificadas. | Deve ter | Mantido | NOVO | UC-VID-003, Passo 6, RN4 | Constitui o núcleo funcional de proteção de dados pessoais e cumprimento do RGPD em vídeo. | Dado um vídeo de teste com rostos e matrículas visíveis, quando o processamento termina, então todas as ocorrências com confiança ≥ 0,65 apresentam a máscara aplicada, sem cintilação entre fotogramas. |
| REQ-VID-BLUR-008 | O sistema deve juntar os fotogramas anonimizados com a faixa de áudio original, sem a alterar, num vídeo MP4 (H.264/AAC) guardado no projeto. | Deve ter | Mantido | NOVO | UC-VID-003, Passo 7, Passo 9, RN3, Pós-condição de sucesso | Preserva a integridade sonora e garante reprodução imediata nos navegadores web modernos. | Dado um vídeo com faixa de áudio, quando o processamento termina, então o vídeo resultante mantém o áudio sincronizado com a imagem. |
| REQ-VID-BLUR-009 | O sistema deve avisar o utilizador e devolver automaticamente a operação avançada quando a análise de todos os fotogramas não encontra nenhum rosto nem matrícula. | Deveria ter | Mantido | NOVO | UC-VID-003, FA2 | Garante justiça no consumo de quotas quando nenhuma modificação visual pôde ser efetuada no vídeo. | Dado um vídeo sem rostos nem matrículas, quando o processamento termina com 0 deteções, então o utilizador recebe o aviso informativo e recupera a operação descontada. |
| REQ-VID-BLUR-010 | O sistema deve rejeitar, no momento da submissão, ficheiros corrompidos ou com formato ou codec incompatíveis (com nova verificação durante o processamento), sem descontar a operação e apresentando uma mensagem de erro em português. | Deve ter | Refinado | NOVO | UC-VID-003, Passo 3, Exceção 3, Pós-condição mínima | Evita falhas silenciosas durante o processamento e garante mensagens de erro compreensíveis. | Dado um ficheiro corrompido ou com codec não suportado, quando é submetido, então o pedido é recusado de imediato e é apresentada a mensagem explicativa. |
| REQ-VID-BLUR-011 | O sistema deve devolver imediatamente o resultado existente, sem novo processamento nem desconto de operação, quando o utilizador aplica a anonimização com os mesmos parâmetros do último processamento confirmado. | Deveria ter | Mantido | ALT | UC-VID-003, Passo 3, FA4 | Evita reprocessar um vídeo inteiro sem necessidade. | Dado um projeto já processado, quando o utilizador clica em Aplicar sem alterar parâmetros, então o sistema responde de imediato sem iniciar novo processamento. |
| REQ-VID-BLUR-014 | O sistema deve apagar todos os fotogramas e ficheiros temporários do processamento logo após guardar o vídeo final, ou após cancelamento ou falha. | Deve ter | Novo | NOVO | UC-VID-003, FA3, Assunção A5, Q3 | Evita esgotar o espaço do serviço de processamento e protege a privacidade dos dados (RNF57). | Dado o fim, o cancelamento ou a falha de um processamento de vídeo, quando se inspeciona o espaço temporário do serviço, então não existem ficheiros dessa execução. |

#### 4.1.2 Requisitos Não Funcionais e de Qualidade

| **ID** | **Requisito** | **Característica ISO/IEC 25010** | **Alvo MVP** | **Alvo produção** | **Evolução** | **Origem (UC / DQ)** | **Critério de aceitação / verificação** |
|--------|---------------|----------------------------------|--------------|-------------------|--------------|----------------------|-----------------------------------------|
| REQ-VID-BLUR-012 | O sistema deve monitorizar a duração do processamento de vídeo, emitindo alerta de demora aos 60 s e aplicando timeout automático dinâmico proporcional à duração do vídeo com estorno de quota em caso de bloqueio. | Eficiência de Desempenho / Fiabilidade | Aviso aos 60 s; timeout de $3 \times \text{duração do vídeo} + 60\text{ s}$ sem retry | Aviso aos 45 s; timeout de $1{,}5 \times \text{duração} + 30\text{ s}$ com 1 retry automático | Refinado | Exceção 4, DQ-001 | Dado um vídeo de 60 s cujo processamento fique artificialmente bloqueado, quando decorrem 240 s ($3 \times 60 + 60$), o sistema cancela a tarefa, repõe a quota e notifica o utilizador. |
| REQ-VID-BLUR-013 | O sistema deve garantir que o ficheiro de vídeo original se mantém inalterado e sem perda de qualidade após qualquer processamento, cancelamento ou operação de *Reset*/*Undo*. | Segurança (Integridade) | Ficheiro original imutável no armazenamento | Imutável com versionamento de snapshots e backup diário | Refinado | RN5, Pós-condições, DQ-002 | Dado um projeto após processamento e subsequente *Reset*, quando se compara o hash SHA-256 do vídeo com o ficheiro inicial carregado, então os hashes coincidem em 100% dos casos. |
| REQ-VID-BLUR-015 | O sistema deve responder ao pedido de submissão do processamento de forma assíncrona, sem bloquear a interface do utilizador. | Eficiência de Desempenho | ≤ 2,0 s (confirmação de enfileiramento) | ≤ 500 ms | Novo | RN6, DQ-003 | Dado um vídeo carregado no projeto, quando o utilizador clica em Aplicar, então a resposta de aceitação chega em ≤ 2,0 s em 95% dos testes. |
| REQ-VID-BLUR-016 | O processamento de anonimização deve terminar dentro de um rácio máximo de tempo face à duração do vídeo. | Eficiência de Desempenho | ≤ 3× a duração do vídeo (a 720p/30fps em CPU) | ≤ 0,5× a duração do vídeo (com aceleração GPU/CUDA) | Novo | Assunção A2, DQ-004 | Dado um vídeo de 20 s a 720p, quando processado no ambiente local do MVP, então termina em ≤ 60 s. |
| REQ-VID-BLUR-017 | O sistema deve atualizar o indicador de progresso na interface do utilizador com uma periodicidade regular durante todo o processamento. | Usabilidade | Atualização a cada ≥ 10% de fotogramas ou ≤ 5 s | Atualização contínua a cada ≤ 1 s com estimativa de tempo restante (ETA) | Novo | Passo 5, Passo 6, DQ-005 | Dado um vídeo de 30 s em processamento, quando se observa o painel de progresso, então o valor percentual é atualizado pelo menos a cada 5 s. |
| REQ-VID-BLUR-018 | O sistema deve restringir o acesso ao vídeo original e ao vídeo anonimizado ao proprietário do projeto e a utilizadores autenticados com link de partilha válido, cifrando as comunicações e o armazenamento. | Segurança | Sessão e link de partilha validados em cada pedido; comunicações e armazenamento cifrados | Endereços temporários de curta duração (≤ 15 min) com rotação automática de chaves | Novo | DQ-006 | Dado um utilizador não autorizado ou com link revogado, quando tenta aceder ao vídeo, então o acesso é negado. |
| REQ-VID-BLUR-019 | O sistema deve aceitar e exportar vídeos em formato e codecs compatíveis nativamente com o reprodutor HTML5 dos navegadores modernos (Chrome, Safari, Firefox e Edge). | Compatibilidade | Contentor MP4 (vídeo H.264, áudio AAC) | Suporte alargado a MP4, MOV e WebM (H.264, HEVC, VP9) | Novo | RN3, DQ-007 | Dado o vídeo final gerado, quando reproduzido no Chrome, Firefox e Safari, então é reproduzido nativamente sem necessidade de _plugins_. |
| REQ-VID-BLUR-020 | A anonimização de vídeo deve ser acrescentada como uma ferramenta independente, sem exigir modificações no código das ferramentas de imagem existentes. | Manutenibilidade | Ferramenta independente, ligada ao resto do sistema pela fila de mensagens | Registo dinâmico das capacidades da ferramenta através de um contrato comum | Novo | DQ-008 | Dada a adição da ferramenta de anonimização, quando o sistema é construído, então nenhum ficheiro das ferramentas existentes necessita de alteração. |
| REQ-VID-BLUR-021 | Todas as dependências de processamento de vídeo e de visão por computador devem estar isoladas no contentor do serviço. | Portabilidade | Imagem Docker para amd64 e arm64, arrancada com o resto do sistema | Imagem multiarquitetura pronta para orquestração, com suporte opcional a GPU | Novo | DQ-009 | Dado um computador apenas com Docker, quando se arranca o sistema, então o serviço de anonimização funciona sem bibliotecas instaladas no computador. |
| REQ-VID-BLUR-022 | O modelo de visão por computador deve garantir uma taxa mínima de deteção correta de rostos e matrículas visíveis em vídeos de teste de referência. | Adequação Funcional (Exatidão) | Taxa de deteção $\ge 90\%$ em dataset de teste padronizado | Taxa de deteção $\ge 98\%$ em dataset de teste padronizado | Novo | UC-VID-003, Passo 6, DQ-010 | Dado um vídeo de validação com 100 instâncias anotadas de rostos e matrículas em condições normais, quando processado no MVP, pelo menos 90 instâncias são detetadas e anonimizadas com confiança $\ge 0.65$. |

#### 4.1.3 Verificação da completude e dos limites do âmbito

| **Tópico a verificar** | **Aplicável?** | **Decisão / justificação** | **Requisito(s) relacionado(s)** |
|------------------------|----------------|----------------------------|---------------------------------|
| **Formato, codec, duração e dimensão do vídeo** | Sim | Validados à entrada no passo de submissão: formato MP4 (H.264/AAC), duração máxima de 60 s (1080p) para perfil Registado e 300 s (4K) para Premium. | REQ-VID-BLUR-002, REQ-VID-BLUR-008, REQ-VID-BLUR-010, REQ-VID-BLUR-019 |
| **Estado, progresso, cancelamento e resultado** | Sim | Painel de processamento com estado e progresso em tempo real e cancelamento com reposição do estado anterior e devolução da operação. | REQ-VID-BLUR-005, REQ-VID-BLUR-006, REQ-VID-BLUR-017 |
| **Falhas durante o processamento** | Sim | Validação antecipada de codecs, timeout dinâmico proporcional à duração ($3 \times \text{duração} + 60\text{ s}$), mensagens de erro uniformizadas, limpeza de temporários e devolução da operação. | REQ-VID-BLUR-010, REQ-VID-BLUR-012, REQ-VID-BLUR-013, REQ-VID-BLUR-014 |
| **Persistência e expiração dos ficheiros** | Sim | Vídeo original e vídeo resultante são guardados no projeto; os ficheiros intermédios são apagados de imediato após cada job. | REQ-VID-BLUR-008, REQ-VID-BLUR-013, REQ-VID-BLUR-014 |
| **Perfis e contagem de operações** | Sim | Anónimos excluídos; registados debitam 1 operação avançada (máx. 5/dia) com reembolso em falha/cancelamento/0 deteções; premium ilimitado e prioritário. Quota consumida pelo utilizador que executa. | REQ-VID-BLUR-002, REQ-VID-BLUR-003, REQ-VID-BLUR-004, REQ-VID-BLUR-009 |
| **Encadeamento de ferramentas e processamento em lote** | Não | **Excluído explicitamente no MVP:** O encadeamento multi-ferramenta, os Presets (UC05), o Assistente IA de receitas (UC06) e a exportação em lote/PDF (T-09) permanecem exclusivos para imagens estáticas. No MVP da Fase 1, a ferramenta de vídeo é executada de forma unitária para validar o pipeline fim-a-fim. | N/A (Exclusão explícita e justificada no âmbito do MVP) |

### 4.2 Impacto no sistema existente

| **Elemento existente afetado** | **Impacto (Manter / Estender / Alterar)** | **Descrição do impacto** | **Requisito(s) relacionado(s)** |
|------------------------|-------------------------------------------|--------------------------|---------------------------------|
| **Gestão de Quotas, Perfis e Reembolsos (`Users-MS` / `Projects-MS`)** | Alterar | A contagem incremental de operações avançadas (`chargedAdvancedTools`, `pendingAdvancedOps`) e o endpoint de reembolso (`POST /:user/process/refund/:advanced_tools`) passam a contabilizar a ferramenta de vídeo e a validar limites de duração/resolução por perfil. | REQ-VID-BLUR-002, REQ-VID-BLUR-003, REQ-VID-BLUR-004, REQ-VID-BLUR-009 |
| **Infraestrutura de Mensageria (`RabbitMQ`)** | Estender | Criação da fila `privacy_blur_requests_queue`, com prioridade para pedidos Premium, para consumo pelo novo worker, reutilizando a `project_queue` para resultados e a `ws_queue` para eventos em tempo real. | REQ-VID-BLUR-004, REQ-VID-BLUR-005, REQ-VID-BLUR-007, REQ-VID-BLUR-020 |
| **Armazenamento de Objetos (`SeaweedFS` e `img_storage`)** | Estender | O serviço `SeaweedFS` (compatível com S3) e o `img_storage` são estendidos para armazenar e servir objetos de vídeo MP4 com encriptação em repouso. | REQ-VID-BLUR-008, REQ-VID-BLUR-013, REQ-VID-BLUR-018 |
| **Orquestração de Execuções, Tokens e Concorrência (`Projects-MS`)** | Estender | Reutilização e extensão do modelo de tokens (`activeToken`, `committedToken`, `prevCommittedToken`), do *short-circuit* por hash SHA-256 no Apply e dos cabeçalhos `X-Project-Version` e `X-Caller-Id` (`runnerId`) para suportar sessões normais e partilhadas (UC07). | REQ-VID-BLUR-005, REQ-VID-BLUR-006, REQ-VID-BLUR-011, REQ-VID-BLUR-012 |
| **Gateway WebSocket (`ws_gateway`) e Erros (`lib/error-messages.ts`)** | Estender | Encaminhamento de eventos de progresso percentual do vídeo via Socket.IO para a sala do `runnerId` e adição de mapeamentos de erro de vídeo em `getErrorMessage` / `getAiErrorMessage`. | REQ-VID-BLUR-005, REQ-VID-BLUR-010, REQ-VID-BLUR-017 |
| **Encadeamento, Lote (.zip/.pdf), Presets (`UC05`) e Assistente IA (`UC06`)** | Manter | Mantidos sem alterações para o domínio de imagens; o download de vídeo é feito diretamente em formato `.mp4` e a aplicação da ferramenta de vídeo é unitária no MVP. | REQ-VID-BLUR-019 |

### 4.3 Matriz de Rastreabilidade Atualizada

| **Elemento de origem** | **Descrição abreviada** | **Requisito(s) relacionado(s)** |
|------------------------|-------------------------|---------------------------------|
| **Passo 1** | Abertura do projeto e visualização do vídeo e saldo de operações no editor | REQ-VID-BLUR-001, REQ-VID-BLUR-003 |
| **Passo 2** | Seleção da ferramenta e configuração de alvos, estilo e intensidade | REQ-VID-BLUR-001 |
| **Passo 3** | Validação imediata de formato/codec, duração, resolução e saldo de quotas | REQ-VID-BLUR-002, REQ-VID-BLUR-003, REQ-VID-BLUR-010, REQ-VID-BLUR-011 |
| **Passo 4** | Iniciação da tarefa assíncrona e débito de operação na quota | REQ-VID-BLUR-003, REQ-VID-BLUR-004, REQ-VID-BLUR-015 |
| **Passo 5** | Apresentação do painel de processamento com progresso e botão Cancelar | REQ-VID-BLUR-005, REQ-VID-BLUR-006, REQ-VID-BLUR-017 |
| **Passo 6** | Descodificação, deteção/tracking (confiança ≥ 0.65), máscara e progresso | REQ-VID-BLUR-005, REQ-VID-BLUR-007, REQ-VID-BLUR-016, REQ-VID-BLUR-017, REQ-VID-BLUR-022 |
| **Passo 7** | Remuxing com áudio original (*pass-through*), gravação no storage e limpeza | REQ-VID-BLUR-008, REQ-VID-BLUR-013, REQ-VID-BLUR-014, REQ-VID-BLUR-019 |
| **Passo 8** | Confirmação da conclusão, consolidação da quota e notificação em tempo real | REQ-VID-BLUR-005, REQ-VID-BLUR-008 |
| **Passo 9** | Encerramento do painel e disponibilização do vídeo no modo de resultados | REQ-VID-BLUR-008, REQ-VID-BLUR-018, REQ-VID-BLUR-019 |
| **FA1** | Prioridade na fila `privacy_blur_requests_queue` e isenção de quota para perfil Premium | REQ-VID-BLUR-004 |
| **FA2** | Aviso e reposição de quota quando há 0 deteções | REQ-VID-BLUR-009 |
| **FA3** | Cancelamento com restauração de estado, limpeza e reembolso em ≤ 1 s | REQ-VID-BLUR-006, REQ-VID-BLUR-014 |
| **FA4** | *Short-circuit* no Apply quando os parâmetros não foram alterados | REQ-VID-BLUR-011 |
| **Exceção 1** | Bloqueio por esgotamento do limite diário de 5 operações avançadas | REQ-VID-BLUR-003 |
| **Exceção 2** | Bloqueio por vídeo exceder duração ou resolução máxima do perfil | REQ-VID-BLUR-002 |
| **Exceção 3** | Rejeição imediata por formato/codec inválido ou ficheiro corrompido com HTTP 400 | REQ-VID-BLUR-002, REQ-VID-BLUR-010 |
| **Exceção 4** | Aviso aos 60 s e interrupção como falhada por timeout dinâmico ($3 \times \text{duração} + 60\text{ s}$) | REQ-VID-BLUR-012, REQ-VID-BLUR-014 |
| **Pós-condições** | Garantia de sucesso (vídeo anonimizado + áudio sincronizado) e mínima (original intacto + restauração) | REQ-VID-BLUR-006, REQ-VID-BLUR-008, REQ-VID-BLUR-013, REQ-VID-BLUR-014 |
| **RN1 / RN2** | Regras de negócio de quotas diárias e limites de duração/resolução por perfil | REQ-VID-BLUR-002, REQ-VID-BLUR-003, REQ-VID-BLUR-004 |
| **RN3 / RN4** | Preservação de áudio original e limiar de confiança mínimo de 0.65 | REQ-VID-BLUR-007, REQ-VID-BLUR-008, REQ-VID-BLUR-019 |
| **RN5 / RN6** | Edição não destrutiva e comunicação assíncrona via broker e WebSockets | REQ-VID-BLUR-005, REQ-VID-BLUR-013, REQ-VID-BLUR-015 |
| **DQ-001** | Política de monitorização de demora (60 s) e timeout dinâmico proporcional à duração | REQ-VID-BLUR-012 |
| **DQ-002** | Garantia de integridade e imutabilidade do ativo original | REQ-VID-BLUR-013 |
| **DQ-003** | Desacoplamento síncrono/assíncrono na submissão HTTP do pedido de vídeo | REQ-VID-BLUR-015 |
| **DQ-004** | Meta de débito computacional em CPU no MVP vs. aceleração por GPU em produção | REQ-VID-BLUR-016 |
| **DQ-005** | Cadência mínima de feedback visual de progresso para operações longas | REQ-VID-BLUR-017 |
| **DQ-006** | Controlo de acesso estrito (JWT + `shareId`) e proteção de dados em trânsito/repouso | REQ-VID-BLUR-018 |
| **DQ-007** | Normalização do contentor e codecs para reprodução nativa HTML5 | REQ-VID-BLUR-019 |
| **DQ-008** | Isolamento modular do worker de vídeo segundo o padrão arquitetural *Tools-MS* | REQ-VID-BLUR-020 |
| **DQ-009** | Contentorização completa das dependências nativas (FFmpeg + OpenCV) em Docker | REQ-VID-BLUR-021 |
| **DQ-010** | Métrica verificável de exatidão de deteção de IA (MVP $\ge 90\%$, Produção $\ge 98\%$) | REQ-VID-BLUR-022 |

**Decisões de qualidade introduzidas nesta aula**

| **ID** | **Decisão de qualidade** | **Justificação** | **Requisito(s) relacionado(s)** |
|--------|--------------------------|------------------|---------------------------------|
| **DQ-001** | Manter o aviso informativo aos 60 s e fixar um timeout dinâmico calculado por $3 \times \text{duração do vídeo} + 60\text{ s}$ no MVP (sem retry), evoluindo para $1{,}5 \times \text{duração} + 30\text{ s}$ com retry em produção. | Permite acomodar vídeos longos de até 300 s (que podem demorar até 900 s a processar em CPU) sem que o sistema aborte prematuramente a execução. | REQ-VID-BLUR-012 |
| **DQ-002** | Preservar o ficheiro de vídeo original intacto no armazenamento de objetos e apoiar a recuperação de estado no mecanismo de tokens. | Garante edição não destrutiva e assegura a integridade dos dados originais segundo a norma ISO/IEC 25010 (Segurança). | REQ-VID-BLUR-013 |
| **DQ-003** | A submissão HTTP deve apenas validar permissões/quotas e publicar na fila RabbitMQ em ≤ 2,0 s no MVP (≤ 500 ms em produção). | Evita timeouts HTTP no Nginx e API Gateway durante operações de vídeo que demoram dezenas de segundos. | REQ-VID-BLUR-015 |
| **DQ-004** | Aceitar processamento em CPU até 3× a duração do vídeo (720p) no MVP (compatível com Apple Silicon `arm64` e `amd64`), reservando a exigência de tempo real (≤ 0,5× com GPU) para produção. | Viabiliza a execução local em qualquer máquina da equipa sem exigir placas gráficas dedicadas na Fase 1. | REQ-VID-BLUR-016 |
| **DQ-005** | Emitir eventos de progresso via mensageria pelo menos a cada 10% de fotogramas ou 5 segundos no MVP. | Assegura visibilidade contínua ao utilizador sem saturar o broker RabbitMQ nem o gateway de tempo real. | REQ-VID-BLUR-017 |
| **DQ-006** | Reutilizar o controlo de acesso do `Projects-MS` (JWT e validação de permissões para links partilhados), TLS no Nginx e encriptação em repouso. | Mantém total coerência com os requisitos de segurança e RGPD (T-05 e RNF44) já implementados na plataforma. | REQ-VID-BLUR-018 |
| **DQ-007** | Aceitar no MVP os contentores MP4 e MOV com vídeo H.264 e áudio AAC (RNG-02), com o resultado sempre em MP4; WebM e HEVC ficam para produção.| Garante compatibilidade nativa imediata com o elemento `<video>` em todos os browsers sem transcodificação adicional. | REQ-VID-BLUR-019 |
| **DQ-008** | Implementar a ferramenta como um worker independente (`privacy_blur_tool`) ligado por AMQP, seguindo exatamente o padrão das ferramentas de IA existentes. | Preserva o baixo acoplamento e permite adicionar a funcionalidade sem tocar no código das ferramentas de imagem. | REQ-VID-BLUR-020 |
| **DQ-009** | Empacotar FFmpeg, OpenCV e modelos de deteção dentro do `Dockerfile` do novo serviço no `docker-compose.yaml`. | Elimina problemas de configuração entre ambientes de desenvolvimento distintos. | REQ-VID-BLUR-021 |
| **DQ-010** | Estabelecer uma meta verificável de exatidão para a deteção de elementos sensíveis (MVP $\ge 90\%$, Produção $\ge 98\%$). | Permite validar formalmente a eficácia do modelo de visão por computador em conformidade com as exigências de privacidade do RGPD. | REQ-VID-BLUR-022 |

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
- [x] Os IDs existentes foram preservados quando a intenção não mudou e o novo requisito recebeu o ID subsequente (`REQ-VID-BLUR-022`).
- [x] A análise de completude não alargou o âmbito sem decisão explícita.
- [x] A matriz de rastreabilidade não tem requisitos órfãos nem elementos relevantes por cobrir.
- [x] As decisões de qualidade e os respetivos requisitos estão identificados.
