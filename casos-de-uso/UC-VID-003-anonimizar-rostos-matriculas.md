# 📝 Exercício 1 — Template de Entrega
### Casos de Uso · Fase 1: Suporte a Vídeo no PictuRAS

## 0. Identificação

| **Campo** | **Valor** |
|-----------|-----------|
| **Grupo / Equipa** | 25 |
| **Autores** | António Sousa (pg63923), Bruno Vale (pg63926), Bruno Sousa (pg63927), Diogo Macedo (pg63947) |
| **Data** | 2026-10-06 |
| **Versão do documento** | v1.0 |
| **Unidade Curricular** | Requisitos e Arquiteturas de Software — MEI, Universidade do Minho |

---

## 1. Funcionalidade de vídeo escolhida

| **Campo** | **Valor** |
|-----------|-----------|
| **Funcionalidade** | Deteção e Anonimização Automática de Rostos e Matrículas em Vídeo (*Video Privacy Blur*) |
| **Perfil(s) de utilizador abrangido(s)** | Utilizador Registado e Utilizador Premium. Tratando-se de uma ferramenta avançada de visão por computador, o plano Registado dispõe de acesso condicionado por quotas diárias e limites estritos de duração/resolução, enquanto o plano Premium beneficia de processamento ilimitado, suporte a ficheiros de maior dimensão e fila de prioridade alta. |

**Justificação no contexto do MVP**
A conformidade com a privacidade e o RGPD na partilha de conteúdos multimédia é hoje um requisito crítico na cloud. No MVP, esta funcionalidade comprova a extensão natural dos modelos de IA/visão por computador já existentes no PictuRAS para o domínio temporal de vídeo, validando o pipeline completo de processamento assíncrono intensivo: extração contínua de fotogramas, inferência com seguimento de alvos (*tracking*), aplicação de máscaras visuais, re-codificação e acompanhamento de progresso com reporte em tempo real.

---

## 2. Caso de Uso

### 2.1 Cabeçalho

| **Secção** | **Detalhes** |
|------------|--------------|
| **ID do Caso de Uso** | UC-VID-002 |
| **Nome** | Anonimizar Rostos e Matrículas em Vídeo |
| **Versão** | v1.0 |
| **Autor** | Diogo Henrique Freitas Macedo |
| **Data** | 2026-10-06 |
| **Objetivo** | Permitir ao utilizador detetar automaticamente elementos sensíveis (rostos de pessoas e matrículas de veículos) ao longo de todo o vídeo e aplicar uma máscara de desfocagem (*blur*) ou mosaico (*pixelate*), obtendo uma versão anonimizada em conformidade com normas de privacidade. |
| **Âmbito** | Módulo de processamento avançado de vídeo do PictuRAS — serviços de visão por computador (IA), mensageria assíncrona e gestão de projetos. |
| **Ator Principal** | Utilizador Registado |
| **Stakeholders e Interesses** | - **Utilizador Registado / Premium**: pretende partilhar ou arquivar vídeos sem expor dados pessoais de terceiros, com um processo automatizado e sem esforço de edição manual frame a frame.<br>- **Proprietário da Plataforma**: pretende disponibilizar uma funcionalidade avançada de forte apelo comercial (SaaS) garantindo sustentabilidade computacional através de quotas e limites de duração.<br>- **Equipa DevOps / Desenvolvimento**: valida a robustez do cluster de workers de IA perante cargas de trabalho pesadas e assegura isolamento e gestão de falhas na pipeline assíncrona. |
| **Pré-condições** | - O utilizador tem sessão autenticada na plataforma.<br>- O vídeo de entrada foi carregado com sucesso no projeto e está acessível no armazenamento de objetos.<br>- O utilizador dispõe de saldo suficiente de operações diárias (no caso de Utilizador Registado). |
| **Trigger** | O utilizador, com um vídeo selecionado no editor do projeto, escolhe a ferramenta **Anonimização de Privacidade (Blur)**, configura as opções de deteção e confirma a execução clicando em **Aplicar Filtro de Privacidade**. |

### 2.2 Fluxo Principal

| **Passo** | **Ação do Ator** | **Resposta do Sistema** |
|-----------|------------------|-------------------------|
| 1 | O utilizador abre o projeto e seleciona um vídeo para processamento. | Apresenta a interface de edição de vídeo com pré-visualização, duração, formato e a barra lateral de ferramentas disponíveis. |
| 2 | O utilizador seleciona a ferramenta **Anonimização de Privacidade (Blur)**. | Exibe as opções de configuração: elementos a detetar (Rostos, Matrículas ou Ambos), estilo de ocultação (Desfocagem Gaussiana ou Mosaico) e nível de intensidade. |
| 3 | O utilizador seleciona os parâmetros desejados e clica em **Aplicar Filtro de Privacidade**. | Valida a conformidade do ficheiro (duração e resolução face ao perfil do utilizador) e verifica a quota diária de operações disponível. |
| 4 | — | Debita 1 operação avançada na conta do utilizador, gera uma mensagem com os parâmetros do pedido e coloca a tarefa na fila de processamento assíncrono (RabbitMQ). |
| 5 | — | Apresenta na interface um painel de acompanhamento com estado da tarefa (*"Em fila" / "A processar"*), barra de progresso percentual e botão de cancelamento. |
| 6 | — | O worker de IA retira a mensagem da fila, descodifica os fotogramas, executa o modelo de deteção e rastreamento (*tracking*) dos objetos sensíveis e aplica a máscara selecionada aos blocos correspondentes. |
| 7 | — | O worker recombina os fotogramas processados com o fluxo de áudio original, gera o novo ficheiro de vídeo normalizado e armazena-o no repositório de objetos (MinIO). |
| 8 | — | O sistema envia uma notificação de conclusão em tempo real via WebSocket para a interface do utilizador. |
| 9 | — | A interface fecha o painel de progresso, apresenta uma notificação de sucesso e disponibiliza o vídeo anonimizado na lista de resultados do projeto para reprodução e transferência. |

### 2.3 Fluxos Alternativos

| **Fluxo** | **Descrição** |
|-----------|---------------|
| **FA1 – Processamento por Utilizador Premium com Fila Prioritária** | No passo 3, o sistema verifica que o utilizador é Premium → O pedido é colocado diretamente na fila de alta prioridade (`high_priority_queue`), ignorando verificação de quotas diárias. O fluxo segue para o passo 5. |
| **FA2 – Nenhum elemento sensível detetado** | No passo 6, o modelo conclui a análise de todos os fotogramas e deteta 0 ocorrências de rostos ou matrículas → O sistema conclui o processo, notifica o utilizador com o aviso *"Nenhum rosto ou matrícula detetado no vídeo; o ficheiro resultante é idêntico ao original"* e estorna a operação debitada no saldo do utilizador. |
| **FA3 – Cancelamento voluntário da anonimização** | Durante os passos 5 ou 6, o utilizador clica em **Cancelar** → O sistema envia o pedido de interrupção, o worker aborta a inferência, remove artefactos parciais temporários em disco, invalida o token da execução, estorna a operação debitada e devolve o editor ao estado anterior em menos de 1 segundo. |

### 2.4 Exceções

| **Condição** | **Comportamento do Sistema** |
|--------------|------------------------------|
| **Quota diária de operações avançadas esgotada** | No passo 3, o sistema verifica que o utilizador Registado já consumiu as suas 5 operações diárias → Apresenta o erro *"Limite diário de operações avançadas atingido. Efetue upgrade para a conta Premium para processar sem limites"* e não submete a tarefa. |
| **Duração do vídeo excede o limite do perfil** | No passo 3, a duração do vídeo submetido excede o limite permitido para contas gratuitas (ex.: superior a 60 segundos) → Exibe a mensagem *"A ferramenta de anonimização em contas Gratuitas está limitada a vídeos de até 60 segundos. O vídeo atual tem {X} segundos"*, impedindo a execução. |
| **Codec de vídeo incompatível ou fluxo ilegível** | No passo 6, o worker não consegue abrir o contentor de vídeo ou descodificar os pacotes de imagem → Emite evento de falha via WebSocket, exibe o toast *"Erro ao ler os fotogramas do vídeo. Certifique-se de que o ficheiro não está corrompido e utiliza um formato válido (MP4/H.264)"*, descarta a tarefa e estorna a quota debitada. |
| **Sobrecarga ou Timeout do serviço de IA** | No passo 6, a análise excede o tempo limite operacional configurado (timeout de 180 segundos para vídeos longos) ou o worker reinicia de forma anómala → O orquestrador assinala a falha do job, liberta a fila, repõe o crédito da operação ao utilizador e notifica a interface: *"O serviço de processamento demorou demasiado tempo a responder. A operação foi cancelada e o seu crédito foi reposto"*. |

### 2.5 Pós-condições

| **Tipo** | **Resultado** |
|----------|---------------|
| **Garantia de Sucesso** | O novo ficheiro de vídeo gerado contém todos os rostos e matrículas desfocados/pixelizados de forma contínua; o fluxo de áudio original mantém-se perfeitamente sincronizado; o ficheiro original mantém-se inalterado; o resultado fica persistido no armazenamento de objetos e visível no projeto; a quota de operações é atualizada. |
| **Garantia Mínima** | O vídeo original permanece inalterado; nenhum ficheiro corrompido é associado ao projeto; qualquer quota que tenha sido provisoriamente debitada é estornada na íntegra; é apresentada uma mensagem de erro clara na interface. |

### 2.6 Regras de Negócio e Restrições

| **ID** | **Regra** |
|--------|-----------|
| **RN1** | A anonimização automática é categorizada como **Ferramenta Avançada (IA)**, consumindo 1 operação diária por cada execução em perfis Registados. Utilizadores Premium têm execuções ilimitadas. |
| **RN2** | Para o perfil **Registado**, o vídeo de entrada não pode exceder 60 segundos de duração nem resolução superior a 1080p (Full HD); para o perfil **Premium**, o limite é de 300 segundos (5 minutos) com resolução até 4K. |
| **RN3** | O vídeo resultante deve preservar o contentor e a faixa de áudio originais (copiados diretamente sem perda de sincronismo labial - *audio pass-through*). |
| **RN4** | A inferência visual deve utilizar um limiar de confiança (*confidence threshold*) mínimo de 0.65 para evitar falsos positivos excessivos sobre texturas ou objetos estáticos de fundo. |
| **RN5** | O processamento é estritamente não destrutivo: a versão original enviada pelo utilizador nunca é sobrescrita pelo resultado do processamento. |
| **RN6** | Toda a comunicação de progresso da tarefa deve ser transmitida de modo assíncrono via WebSocket; a API REST síncrona limita-se a aceitar o pedido e responder com o identificador único da execução (`executionId`). |

### 2.7 Assunções

| **ID** | **Assunção** |
|--------|--------------|
| **A1** | O vídeo submetido possui iluminação e contraste razoáveis que permitem aos modelos de visão por computador a extração e distinção de características faciais e carateres alfanuméricos de matrículas. |
| **A2** | O backend de processamento dispõe de aceleração computacional ou capacidade de CPU suficiente para garantir que o tempo de processamento não ultrapassa uma média de 2 a 3 vezes a duração nominal do vídeo. |
| **A3** | O armazenamento de objetos (MinIO) possui espaço em disco suficiente para albergar simultaneamente o vídeo original, os fotogramas temporários do pipeline e o vídeo resultante final. |
| **A4** | A identificação temporal e o algoritmo de seguimento (*tracking*) garantem que a máscara de desfocagem acompanha o movimento contínuo dos alvos sem intermitências (*flickering*) entre fotogramas consecutivos. |

### 2.8 Questões em Aberto

| **ID** | **Questão** |
|--------|-------------|
| **Q1** | Deve existir uma opção manual que permita ao utilizador definir zonas retangulares de exclusão na linha temporal, caso a IA deixe escapar algum rosto pontual em ângulos extremos? |
| **Q2** | Em vídeos de Utilizadores Registados que tenham exatamente 60 segundos de duração, o consumo de quota deve ser de 1 operação fixa ou escalonado proporcionalmente à duração do ficheiro? |
| **Q3** | Os ficheiros de trabalho temporários (fotogramas isolados e máscaras extraídas) gerados durante o processamento devem ser expurgados imediatamente após a geração do MP4 final para libertar espaço no storage? |

---

## 3. Utilização de agentes de IA

| **Ferramenta / *skill*** | **Tarefa apoiada** | **Validação realizada pela equipa** |
|--------------------------|--------------------|--------------------------------------|
| Gemini | Esboço inicial do caso de uso e sugestão de fluxos alternativos e exceções. | Leitura e revisão manual pela equipa, ajustando as regras e limites ao contexto do projeto. |

---

## ✅ Lista de verificação antes de entregar (Exercício 1)

- [x] Secções 0 a 3 preenchidas e texto de ajuda (`>` e `{…}`) removido.
- [x] Funcionalidade de vídeo escolhida **e justificada** no contexto do MVP.
- [x] Ator principal identificado, com o respetivo perfil.
- [x] Caso de uso com fluxo principal, **≥1 fluxo alternativo** e **≥1 exceção específica de vídeo**.
- [x] Pós-condições com garantia de sucesso **e** garantia mínima.
- [x] Regras de negócio e restrições preenchidas.
- [x] Assunções e questões em aberto registadas.
- [x] Utilização de agentes de IA documentada.

---
---

## 4. Esboço de requisitos derivados

### 4.1 Requisitos de Sistema

| **ID** | **Requisito** | **Tipo** | **Prioridade** | **Novo/Alt** | **Origem** | **Como verificar** |
|--------|---------------|----------|----------------|--------------|------------|--------------------|
| REQ-VID-{FUNC}-001 | O sistema deve {…} | F | | | | |

### 4.2 Impacto no sistema existente

| **Elemento existente afetado** | **Impacto (Manter / Estender / Alterar)** | **Descrição do impacto** | **Requisitos relacionados** |
|--------------------------------|-------------------------------------------|--------------------------|------------------------------|
| {…} | {…} | {…} | {…} |

### 4.3 Matriz de Rastreabilidade

| **Elemento do Caso de Uso** | **Descrição abreviada** | **Requisito(s) de Sistema** |
|------------------------------|-------------------------|------------------------------|
| Passo 1 | {…} | REQ-VID-…-001 |
