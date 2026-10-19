# 📝 Exercício 2 — Atualização do Dossiê de Requisitos

### Especificação de Requisitos do Sistema · Fase 1: Suporte a Vídeo no PictuRAS

---

## 0. Identificação

| **Campo** | **Valor** |
|-----------|-----------|
| **Grupo / Equipa** | 6 |
| **Autores** | António Sousa (PG63923), Bruno Sousa (PG63927), Bruno Vale (PG63926), Diogo Macedo (PG63947), Sérgio Vieira (PG65442) |
| **Data** | 2026-10-16 |
| **Versão do documento** | v1.5 |
| **Unidade Curricular** | Requisitos e Arquiteturas de Software — MEI, Universidade do Minho |

---

## 1. Funcionalidade de vídeo escolhida

| **Campo** | **Valor** |
|-----------|-----------|
| **Funcionalidade** | Geração automática de legendas para vídeo |
| **Perfil(s) de utilizador abrangido(s)** | Utilizador registado (gratuito) e utilizador premium. Os limites de utilização podem variar de acordo com o perfil do utilizador. |

**Justificação no contexto do MVP**

A geração automática de legendas permite validar um fluxo de processamento de vídeo mais completo do que uma operação puramente visual, uma vez que envolve análise da faixa de áudio, reconhecimento de fala, sincronização temporal e geração de um resultado associado ao vídeo.

No contexto do MVP, esta funcionalidade acrescenta valor direto ao utilizador ao melhorar a acessibilidade e permitir a consulta do conteúdo falado em formato textual, ao mesmo tempo que valida a integração de novos serviços de processamento multimédia com a arquitetura existente do PictuRAS.

---

## 2. Caso de Uso

### 2.1 Cabeçalho

| **Secção** | **Detalhes** |
|------------|--------------|
| **ID do Caso de Uso** | UC-VID-004 |
| **Nome** | Gerar Legendas Automáticas para um Vídeo |
| **Versão** | v1.5 |
| **Autor** | Bruno Vale |
| **Data** | 2026-10-16 |
| **Objetivo** | Permitir ao utilizador gerar automaticamente legendas sincronizadas a partir da faixa de áudio de um vídeo. |
| **Âmbito** | Módulo de vídeo do PictuRAS: análise de áudio, reconhecimento de fala, geração de legendas e disponibilização do resultado. |
| **Ator Principal** | Utilizador registado (gratuito) ou utilizador premium. |
| **Stakeholders e Interesses** | - **Utilizador**: pretende obter legendas de forma automática, reduzindo o trabalho manual e melhorando a acessibilidade do vídeo.<br>- **Proprietário do Sistema**: pretende disponibilizar uma funcionalidade de valor acrescentado sem comprometer excessivamente os recursos computacionais.<br>- **Equipa de Desenvolvimento**: pretende validar a integração de processamento de áudio e reconhecimento de fala no suporte a vídeo do PictuRAS. |
| **Pré-condições** | - O utilizador tem sessão iniciada.<br>- O vídeo foi submetido com sucesso e encontra-se acessível ao sistema.<br>- O vídeo possui uma faixa de áudio utilizável.<br>- O formato do vídeo e o codec de áudio são suportados.<br>- O utilizador tem permissão para executar a operação. |
| **Trigger** | O utilizador seleciona um vídeo e escolhe a opção **Gerar legendas automaticamente**. |

### 2.2 Fluxo Principal

| **Passo** | **Ação do Ator** | **Resposta do Sistema** |
|-----------|------------------|-------------------------|
| 1 | O utilizador seleciona um vídeo disponível. | O sistema apresenta o vídeo e as operações de processamento disponíveis. |
| 2 | O utilizador escolhe **Gerar legendas automaticamente**. | O sistema verifica se o vídeo contém uma faixa de áudio utilizável. |
| 3 | O utilizador indica o idioma do conteúdo falado. | O sistema verifica se o idioma indicado é suportado e prepara o processamento. |
| 4 | O utilizador confirma a operação. | O sistema valida o vídeo, o áudio, o perfil do utilizador e as restrições aplicáveis. |
| 5 | — | O sistema extrai ou acede à faixa de áudio necessária ao processamento. |
| 6 | — | O sistema processa o áudio através do componente responsável pelo reconhecimento de fala. |
| 7 | — | O sistema obtém os segmentos de texto reconhecido e os respetivos intervalos temporais. |
| 8 | — | O sistema constrói as legendas sincronizadas com base no texto e nas marcas temporais obtidas. |
| 9 | — | O sistema apresenta uma pré-visualização das legendas associadas ao vídeo. |
| 10 | O utilizador revê as legendas e confirma o resultado. | O sistema valida a confirmação e prepara o resultado final. |
| 11 | — | O sistema gera o ficheiro de legendas num formato suportado. |
| 12 | O utilizador visualiza ou obtém o ficheiro de legendas. | O sistema disponibiliza o resultado, mantendo o vídeo original inalterado. |

### 2.3 Fluxos Alternativos

| **Fluxo** | **Descrição** |
|-----------|---------------|
| **FA1 – Alterar o idioma** | No passo 3, o utilizador altera o idioma indicado antes de confirmar a operação → O sistema valida o novo idioma e mantém o vídeo selecionado. |
| **FA2 – Repetir a geração** | No passo 10, o utilizador considera o resultado insatisfatório → O sistema permite regressar ao passo 3 para alterar o idioma e iniciar uma nova geração de legendas. |
| **FA3 – Cancelar antes do processamento** | Antes do passo 4, o utilizador cancela a operação → O sistema termina o caso de uso sem iniciar o reconhecimento de fala nem gerar um ficheiro de legendas. |
| **FA4 – Cancelar durante o processamento** | Entre os passos 5 e 8, o utilizador solicita o cancelamento → O sistema interrompe o processamento quando tecnicamente possível, descarta resultados incompletos e mantém o vídeo original inalterado. |
| **FA5 – Não confirmar o resultado** | No passo 10, o utilizador decide não confirmar as legendas geradas → O sistema termina o caso de uso sem disponibilizar o resultado como versão final. |

### 2.4 Exceções

| **Condição** | **Comportamento do Sistema** |
|--------------|------------------------------|
| O vídeo não possui faixa de áudio. | O sistema informa que não é possível gerar legendas automaticamente porque o vídeo não contém áudio. |
| O formato do vídeo ou codec de áudio não é suportado. | O sistema rejeita o pedido e informa o utilizador sobre a incompatibilidade. |
| O áudio possui qualidade insuficiente para reconhecimento de fala. | O sistema informa que a qualidade do áudio pode impedir a geração fiável das legendas e não apresenta resultados inválidos como concluídos. |
| O idioma selecionado não é suportado pelo componente de reconhecimento de fala. | O sistema informa o utilizador e solicita a escolha de um idioma suportado. |
| O vídeo excede os limites de tamanho ou duração definidos para o perfil do utilizador. | O sistema informa qual a restrição excedida e não inicia o processamento. |
| O utilizador não possui quota suficiente para executar a operação. | O sistema informa o utilizador e não cria o pedido de processamento. |
| O reconhecimento de fala falha durante o processamento. | O sistema marca a operação como falhada, mantém o vídeo original inalterado e informa o utilizador. |
| Apenas parte do áudio pode ser processada corretamente. | O sistema assinala o resultado como parcial e informa o utilizador sobre os segmentos que não puderam ser reconhecidos. |

### 2.5 Pós-condições

| **Tipo** | **Resultado** |
|----------|---------------|
| **Garantia de Sucesso** | É gerado um conjunto de legendas sincronizadas com o conteúdo falado do vídeo, ficando o respetivo ficheiro disponível ao utilizador. O vídeo original permanece inalterado. |
| **Garantia Mínima** | O vídeo original permanece inalterado. Em caso de falha, nenhum ficheiro parcial ou inválido é apresentado como resultado concluído com sucesso. |

### 2.6 Regras de Negócio e Restrições

| **ID** | **Regra** |
|--------|-----------|
| **RN1** | A geração automática de legendas requer que o vídeo possua uma faixa de áudio utilizável. |
| **RN2** | Apenas formatos de vídeo, codecs de áudio e idiomas suportados pelo sistema podem ser processados. |
| **RN3** | O vídeo original não deve ser modificado pela operação de geração de legendas. |
| **RN4** | Cada segmento de legenda deve ficar associado a um intervalo temporal válido do vídeo. |
| **RN5** | O processamento só pode iniciar depois de o vídeo, a faixa de áudio e os parâmetros da operação terem sido validados. |
| **RN6** | Os limites de tamanho, duração e utilização podem variar de acordo com o perfil do utilizador. |
| **RN7** | Um resultado só pode ser apresentado como concluído depois de o sistema validar a geração do ficheiro de legendas. |
| **RN8** | Resultados parciais devem ser identificados explicitamente como tal e não podem ser apresentados como transcrições completas. |
| **RN9** | A operação de geração automática de legendas deve possuir um estado identificável durante o seu ciclo de vida. |
| **RN10** | O ficheiro de legendas gerado deve permanecer associado ao vídeo de origem e seguir a política de persistência e eliminação aplicada aos restantes resultados do projeto. |
| **RN11** | As gerações de legendas concluídas com sucesso devem ser contabilizadas segundo as regras de utilização aplicáveis ao perfil do utilizador. |

### 2.7 Assunções

| **ID** | **Assunção** |
|--------|--------------|
| **A1** | O sistema dispõe de um componente ou serviço capaz de realizar reconhecimento automático de fala. |
| **A2** | O serviço de processamento consegue extrair ou aceder à faixa de áudio dos formatos de vídeo suportados. |
| **A3** | O componente de reconhecimento de fala devolve texto associado a informação temporal suficiente para gerar legendas sincronizadas. |
| **A4** | No contexto do MVP, não é necessária a identificação automática de diferentes oradores. |
| **A5** | No contexto do MVP, as legendas são geradas no mesmo idioma do conteúdo falado, sem tradução automática. |
| **A6** | O utilizador pode rever o resultado antes de considerar a operação concluída. |
| **A7** | A infraestrutura utilizada no MVP possui recursos suficientes para processar os vídeos considerados nos testes. |

### 2.8 Questões em Aberto

| **ID** | **Questão** |
|--------|-------------|
| **Q1** | Que idiomas serão suportados pelo MVP? |
| **Q3** | Que formato de legendas deve ser disponibilizado: SRT, WebVTT ou ambos? |
| **Q4** | O utilizador poderá editar manualmente as legendas antes de guardar o resultado? |
| **Q6** | Qual será o tamanho máximo permitido para o vídeo? |
| **Q7** | Qual será a duração máxima permitida para o vídeo? |
| **Q8** | O utilizador registado (gratuito) e o utilizador premium terão limites diferentes para esta operação? |
| **Q10** | Uma operação que falha durante o reconhecimento de fala deve consumir quota? |
| **Q11** | Como devem ser distinguidos e apresentados os segmentos de áudio sem fala dos segmentos com fala impossível de reconhecer? |

**Questões encerradas nesta versão**

| **ID** | **Decisão** |
|--------|-------------|
| **Q2** | No MVP, o idioma é indicado manualmente pelo utilizador, conforme o passo 3 do fluxo principal. A deteção automática do idioma não é requisito do MVP. |
| **Q5** | No MVP, as legendas são disponibilizadas como ficheiro separado. A incorporação direta das legendas no vídeo fica fora do âmbito desta funcionalidade. |
| **Q9** | No MVP, a geração automática de legendas está disponível apenas para utilizadores autenticados com perfil registado ou premium; o perfil anónimo fica excluído. |
| **Q12** | No MVP, não é exigido progresso percentual em tempo real. O acompanhamento é realizado através do estado da operação, com atualização segundo REQ-VID-LEG-040 e DQ-005. |

---

## 3. Utilização de agentes de IA

| **Ferramenta / *skill*** | **Tarefa apoiada** | **Validação realizada pela equipa** |
|--------------------------|--------------------|--------------------------------------|
| **ChatGPT** | Apoio na criação e revisão do caso de uso UC-VID-004; derivação e evolução da Secção 4 para uma ERS completa; separação entre requisitos funcionais e de qualidade; classificação segundo a ISO/IEC 25010; critérios de aceitação; análise de completude; decisões de qualidade; impacto no sistema existente e matriz de rastreabilidade. Foi ainda usado para confrontar a ERS com a arquitetura atual do repositório `picturas-27`. | O conteúdo foi confrontado com o enunciado da Fase 1, os templates e guias dos Exercícios 1 e 2, o UC-VID-004 e a arquitetura atual documentada do `picturas-27`, incluindo API Gateway, `users`, `projects`, `subscriptions`, `imageStorageService`, RabbitMQ, `wsGateway`, SeaweedFS e o padrão de microserviços em `Tools`. Foram revistos os IDs, a atomicidade, a verificabilidade, NOVO/ALT, Mantido/Refinado/Novo, a rastreabilidade UC/RN/DQ e a distinção entre decisões do MVP e questões em aberto. A revisão final do dossiê completo pela equipa deve ser realizada antes da entrega. |

---

## ✅ Lista de verificação da baseline do Exercício 1

- [x] Secções 0 a 3 preenchidas e texto de ajuda removido.
- [x] Funcionalidade de vídeo escolhida e justificada no contexto do MVP.
- [x] Ator principal identificado, com o respetivo perfil.
- [x] Caso de uso com fluxo principal, fluxos alternativos e exceções específicas de vídeo.
- [x] Pós-condições com garantia de sucesso e garantia mínima.
- [x] Regras de negócio e restrições preenchidas.
- [x] Assunções e questões em aberto registadas.
- [x] Utilização de agentes de IA documentada.

---

## 4. Especificação de Requisitos do Sistema (ERS)

**Caso de Uso:** UC-VID-004 — Gerar Legendas Automáticas para um Vídeo  
**Versão do dossiê:** v1.5  
**Baseline do Exercício 1:** v1.1 — REQ-VID-LEG-001 a REQ-VID-LEG-029

O catálogo 4.1 é a fonte única dos requisitos desta ERS. A matriz 4.3 rastreia esses IDs até ao caso de uso, às regras de negócio ou às decisões de qualidade. A tabela 4.2 descreve o impacto no sistema existente.

### 4.1 Requisitos da ERS

#### 4.1.1 Requisitos Funcionais

| **ID** | **Requisito** | **Prioridade** | **Evolução** | **Novo/Alt** | **Origem (UC / RN / decisão)** | **Justificação** | **Critério de aceitação / verificação** |
|---|---|---|---|---|---|---|---|
| **REQ-VID-LEG-001** | O sistema deve permitir ao utilizador registado ou premium solicitar a geração automática de legendas para um vídeo selecionado. | Deve ter | Mantido | NOVO | UC-VID-004, Trigger; Passos 1–2 | Inicia a funcionalidade principal do caso de uso. | Dado um utilizador registado ou premium com um vídeo disponível, quando seleciona a geração automática de legendas, então o sistema inicia o fluxo da operação. |
| **REQ-VID-LEG-002** | O sistema deve verificar se o vídeo selecionado possui uma faixa de áudio utilizável antes de iniciar o processamento. | Deve ter | Mantido | NOVO | UC-VID-004, Passo 2; RN1 | Sem áudio utilizável não é possível gerar legendas. | Dado um vídeo sem áudio utilizável, quando é solicitada a geração de legendas, então o processamento não é iniciado. |
| **REQ-VID-LEG-003** | O sistema deve permitir ao utilizador indicar o idioma do conteúdo falado antes do início do processamento. | Deve ter | **Refinado** | NOVO | UC-VID-004, Passo 3 | Torna atómica a seleção inicial do idioma. | Dado um vídeo válido, quando o utilizador indica um idioma suportado, então esse idioma fica associado à operação. |
| **REQ-VID-LEG-004** | O sistema deve impedir o início do processamento quando o idioma indicado não é suportado. | Deve ter | Mantido | NOVO | UC-VID-004, Passo 3; Exceção idioma não suportado; RN2 | Evita processamento com um parâmetro de idioma incompatível. | Dado um idioma não suportado, quando o utilizador tenta confirmar a operação, então o processamento não é iniciado. |
| **REQ-VID-LEG-005** | O sistema deve rejeitar o processamento quando o formato do vídeo não é suportado. | Deve ter | **Refinado** | NOVO | UC-VID-004, Exceção formato/codec; RN2 | Separa a validação do formato da validação do codec de áudio. | Dado um formato de vídeo não suportado, quando é solicitada a geração, então o pedido é rejeitado antes do reconhecimento de fala. |
| **REQ-VID-LEG-006** | O sistema deve rejeitar o processamento quando o tamanho do vídeo excede o limite definido para o perfil do utilizador. | Deve ter | Mantido | NOVO | UC-VID-004, Exceção limites; RN6 | Aplica os limites de dimensão definidos para cada perfil. | Dado um limite de tamanho configurado para o perfil e um vídeo que o excede, quando a operação é confirmada, então o processamento não é iniciado. |
| **REQ-VID-LEG-007** | O sistema deve rejeitar o processamento quando a duração do vídeo excede o limite definido para o perfil do utilizador. | Deve ter | Mantido | NOVO | UC-VID-004, Exceção limites; RN6 | Aplica os limites de duração definidos para cada perfil. | Dado um limite de duração configurado para o perfil e um vídeo que o excede, quando a operação é confirmada, então o processamento não é iniciado. |
| **REQ-VID-LEG-008** | O sistema deve impedir a criação do pedido de processamento quando o utilizador não possui quota suficiente. | Deve ter | Mantido | **ALT** | UC-VID-004, Exceção quota insuficiente; RN6 | Integra a funcionalidade no mecanismo de quota existente. | Dado um utilizador registado sem quota disponível, quando confirma a geração de legendas, então nenhum pedido de processamento é criado. |
| **REQ-VID-LEG-009** | O sistema deve obter a faixa de áudio necessária ao reconhecimento de fala a partir do vídeo selecionado. | Deve ter | Mantido | NOVO | UC-VID-004, Passo 5; A2 | O áudio constitui a entrada do reconhecimento de fala. | Dado um vídeo válido com áudio, quando o processamento começa, então a faixa de áudio necessária fica disponível para reconhecimento de fala. |
| **REQ-VID-LEG-010** | O sistema deve processar a faixa de áudio através de reconhecimento automático de fala. | Deve ter | Mantido | NOVO | UC-VID-004, Passo 6; A1 | É a operação central para obter o conteúdo textual falado. | Dado áudio válido, quando é processado pelo componente de reconhecimento, então o sistema obtém segmentos de texto reconhecido. |
| **REQ-VID-LEG-011** | O sistema deve associar informação temporal aos segmentos de texto reconhecidos. | Deve ter | Mantido | NOVO | UC-VID-004, Passo 7; A3 | A sincronização das legendas exige informação temporal. | Dados segmentos de texto reconhecido, quando o reconhecimento termina, então cada segmento possui informação temporal associada. |
| **REQ-VID-LEG-012** | O sistema deve construir legendas sincronizadas a partir dos segmentos de texto e da respetiva informação temporal. | Deve ter | Mantido | NOVO | UC-VID-004, Passo 8; RN4 | Produz o resultado principal da funcionalidade. | Dados segmentos de texto com intervalos temporais válidos, quando a geração é executada, então são produzidas legendas sincronizadas. |
| **REQ-VID-LEG-013** | O sistema deve apresentar ao utilizador uma pré-visualização das legendas geradas. | Deve ter | Mantido | NOVO | UC-VID-004, Passo 9; A6 | Permite rever o resultado antes de o considerar final. | Dadas legendas geradas, quando termina o processamento, então o utilizador consegue visualizá-las antes da confirmação final. |
| **REQ-VID-LEG-014** | O sistema deve permitir ao utilizador confirmar o resultado apresentado na pré-visualização. | Deve ter | Mantido | NOVO | UC-VID-004, Passo 10 | A confirmação distingue a pré-visualização do resultado final. | Dada uma pré-visualização das legendas, quando o utilizador aceita o resultado, então consegue confirmá-lo. |
| **REQ-VID-LEG-015** | O sistema deve permitir ao utilizador iniciar uma nova geração de legendas quando rejeita o resultado apresentado. | Deveria ter | Mantido | NOVO | UC-VID-004, FA2 | Permite corrigir uma geração considerada insatisfatória. | Dado um resultado rejeitado, quando o utilizador escolhe repetir a geração, então pode regressar à definição do idioma e iniciar uma nova geração. |
| **REQ-VID-LEG-016** | O sistema deve permitir ao utilizador cancelar a operação antes do início do processamento. | Deveria ter | Mantido | NOVO | UC-VID-004, FA3 | Evita iniciar processamento desnecessário. | Dada uma operação ainda não iniciada, quando o utilizador cancela, então o reconhecimento de fala não é iniciado. |
| **REQ-VID-LEG-017** | O sistema deve permitir ao utilizador solicitar o cancelamento de um processamento de legendas em curso. | Deveria ter | Mantido | NOVO | UC-VID-004, FA4 | Operações de vídeo podem ser demoradas e justificar cancelamento. | Dado um processamento em curso, quando o utilizador solicita o cancelamento, então o sistema regista o pedido de cancelamento. |
| **REQ-VID-LEG-018** | O sistema deve descartar os resultados incompletos quando um processamento é cancelado com sucesso. | Deve ter | Mantido | NOVO | UC-VID-004, FA4; Garantia mínima | Evita disponibilizar como final um resultado de uma operação cancelada. | Dada uma operação cancelada com sucesso, quando termina, então nenhum resultado incompleto fica disponível como resultado final. |
| **REQ-VID-LEG-019** | O sistema deve gerar o ficheiro de legendas apenas após a confirmação do resultado pelo utilizador. | Deve ter | Mantido | NOVO | UC-VID-004, Passos 10–11; RN7 | Evita produzir um resultado final que não tenha sido aceite. | Dadas legendas pré-visualizadas, quando o utilizador confirma o resultado, então é gerado o ficheiro final de legendas. |
| **REQ-VID-LEG-020** | O sistema deve disponibilizar ao utilizador o ficheiro de legendas gerado. | Deve ter | Mantido | NOVO | UC-VID-004, Passo 12; Pós-condição de sucesso | O ficheiro constitui o resultado entregue ao utilizador. | Dado um ficheiro de legendas gerado com sucesso, quando a operação termina, então o ficheiro fica acessível ao utilizador. |
| **REQ-VID-LEG-021** | O sistema deve marcar a operação como falhada quando ocorre um erro durante o reconhecimento de fala. | Deve ter | Mantido | NOVO | UC-VID-004, Exceção falha no reconhecimento | Permite distinguir uma falha de um resultado concluído. | Dada uma falha durante o reconhecimento de fala, quando o processamento termina, então o estado da operação é falhado. |
| **REQ-VID-LEG-022** | O sistema deve assinalar explicitamente os segmentos que não puderam ser reconhecidos quando o resultado é parcial. | Deve ter | Mantido | NOVO | UC-VID-004, Exceção resultado parcial; RN8 | Impede que partes não reconhecidas sejam confundidas com uma transcrição completa. | Dado um resultado parcial, quando é apresentado, então os segmentos não reconhecidos são identificados explicitamente. |
| **REQ-VID-LEG-023** | O sistema deve informar o utilizador da causa que impediu o início ou a conclusão da geração de legendas. | Deve ter | Mantido | NOVO | UC-VID-004, Exceções 2.4 | O utilizador precisa de compreender o motivo de uma rejeição ou falha. | Dada uma condição de erro prevista no caso de uso, quando a operação é rejeitada ou falha, então o sistema apresenta a causa correspondente. |
| **REQ-VID-LEG-024** | O sistema deve manter o vídeo original inalterado durante e após a operação de geração automática de legendas. | Deve ter | **Refinado** | NOVO | UC-VID-004, RN3; Pós-condições; FA4 | Formaliza como restrição funcional a preservação do conteúdo de origem. | Dado o mesmo vídeo antes e depois de uma operação de geração de legendas, quando o conteúdo original é comparado, então não existe alteração provocada pela operação. |
| **REQ-VID-LEG-025** | O sistema deve garantir que cada segmento de legenda possui um instante inicial anterior ao instante final e ambos pertencem à duração do vídeo. | Deve ter | **Refinado** | NOVO | UC-VID-004, RN4 | Formaliza a validade funcional dos intervalos temporais. | Dado um ficheiro de legendas gerado, quando todos os segmentos são validados, então cada intervalo temporal é válido e encontra-se dentro da duração do vídeo. |
| **REQ-VID-LEG-027** | O sistema deve permitir a execução da geração automática de legendas apenas a utilizadores autenticados com perfil registado ou premium. | Deve ter | **Refinado** | NOVO | UC-VID-004, Ator principal; Pré-condições | O acesso por perfil é uma regra funcional do serviço no MVP. | Dado um utilizador anónimo ou sem sessão válida, quando tenta executar a funcionalidade, então a operação não é autorizada. |
| **REQ-VID-LEG-028** | O sistema deve apresentar a geração automática de legendas entre as operações disponíveis para um vídeo selecionado. | Deve ter | Mantido | NOVO | UC-VID-004, Passo 1 | A funcionalidade tem de estar acessível no fluxo de processamento do vídeo. | Dado um vídeo selecionado por um utilizador elegível, quando são apresentadas as operações disponíveis, então a geração automática de legendas encontra-se disponível. |
| **REQ-VID-LEG-029** | O sistema deve permitir ao utilizador confirmar a operação antes do início do processamento. | Deve ter | Mantido | NOVO | UC-VID-004, Passo 4 | Impede o início involuntário de uma operação potencialmente dispendiosa. | Dados o vídeo e os parâmetros validados, quando o utilizador confirma a operação, então o sistema pode iniciar o processamento. |
| **REQ-VID-LEG-030** | O sistema deve permitir ao utilizador alterar o idioma indicado antes da confirmação da operação. | Deveria ter | **Novo** | NOVO | UC-VID-004, FA1 | Separa a alteração do idioma da seleção inicial, tornando os requisitos atómicos. | Dado um idioma previamente selecionado e o processamento ainda não iniciado, quando o utilizador escolhe outro idioma suportado, então o novo idioma substitui o anterior. |
| **REQ-VID-LEG-031** | O sistema deve rejeitar o processamento quando o codec de áudio do vídeo não é suportado. | Deve ter | **Novo** | NOVO | UC-VID-004, Exceção formato/codec; RN2 | Separa a validação do codec da validação do formato do vídeo. | Dado um codec de áudio não suportado, quando é solicitada a geração, então o pedido é rejeitado antes do reconhecimento de fala. |
| **REQ-VID-LEG-032** | O sistema deve apresentar o estado da operação de geração de legendas como em processamento, concluída, falhada ou cancelada, conforme aplicável. | Deve ter | **Novo** | NOVO | RN9; completude da ERS | Operações de vídeo podem demorar e necessitam de acompanhamento explícito. | Dada uma operação de geração de legendas, quando o seu estado muda, então o estado apresentado corresponde à situação atual da operação. |
| **REQ-VID-LEG-033** | O sistema deve associar o ficheiro de legendas gerado ao vídeo que originou a operação. | Deve ter | **Novo** | NOVO | RN10; completude da ERS | Mantém a relação entre a entrada e o resultado gerado. | Dada uma geração concluída, quando o resultado é consultado, então é possível identificar o respetivo vídeo de origem. |
| **REQ-VID-LEG-034** | O sistema deve aplicar ao ficheiro de legendas a mesma política de persistência e eliminação usada para os restantes resultados associados ao projeto. | Deveria ter | **Novo** | **ALT** | RN10; arquitetura existente | Evita introduzir no MVP uma política de retenção específica sem suporte na arquitetura atual. | Dado um resultado de legendas associado a um projeto, quando o ciclo de vida desse resultado é alterado pelas regras existentes do projeto, então o ficheiro de legendas segue o mesmo comportamento de persistência ou eliminação. |
| **REQ-VID-LEG-035** | O sistema deve contabilizar uma geração automática de legendas concluída com sucesso de acordo com as regras de quota do perfil do utilizador. | Deve ter | **Novo** | **ALT** | RN11; perfis do PictuRAS | Integra a nova operação no modelo de utilização já existente. | Dado um utilizador registado com quota disponível, quando uma geração termina com sucesso, então é contabilizada uma operação; um utilizador premium não é bloqueado por limite diário. |

#### 4.1.2 Requisitos Não Funcionais e de Qualidade

| **ID** | **Requisito** | **Característica ISO/IEC 25010** | **Alvo MVP** | **Alvo produção** | **Evolução** | **Origem (UC / DQ)** | **Critério de aceitação / verificação** |
|---|---|---|---|---|---|---|---|
| **REQ-VID-LEG-026** | O sistema deve garantir que nenhum resultado falhado, inválido ou parcial seja apresentado como concluído com sucesso. | Fiabilidade | 0% de resultados falhados, inválidos ou parciais apresentados como sucesso. | 0% de resultados falhados, inválidos ou parciais apresentados como sucesso. | Mantido | UC-VID-004, Garantia mínima; RN7; RN8 | Dadas operações falhadas, inválidas e parciais, quando os respetivos estados são apresentados, então nenhuma é identificada como concluída com sucesso. |
| **REQ-VID-LEG-036** | O sistema deve aceitar ou rejeitar o pedido de geração de legendas sem aguardar pela conclusão do reconhecimento de fala. | Eficiência de Desempenho | O pedido é validado e aceite/rejeitado de forma assíncrona, sem bloquear a interface durante o processamento. | Igual ao MVP, com monitorização de latência operacional. | Novo | DQ-001; arquitetura `projects`/RabbitMQ | O processamento multimédia é demorado e a arquitetura existente suporta invocação assíncrona através de RabbitMQ. | Dado um vídeo e parâmetros válidos, quando o utilizador confirma a operação, então a interface recebe a confirmação de aceitação/rejeição antes da conclusão do reconhecimento de fala e permanece utilizável. |
| **REQ-VID-LEG-037** | O processamento de geração de legendas não deve bloquear a sessão do utilizador nem impedir a utilização de outras funcionalidades da aplicação enquanto a operação decorre. | Eficiência de Desempenho / Usabilidade | Sessão utilizável durante toda a execução do trabalho assíncrono. | Igual ao MVP. | Novo | DQ-002; RabbitMQ; `wsGateway` | Reutiliza o modelo assíncrono já existente para ferramentas de processamento. | Dada uma geração em processamento, quando o utilizador navega para outra área da aplicação, então a sessão continua utilizável e o trabalho mantém-se ativo. |
| **REQ-VID-LEG-038** | Uma falha durante o processamento deve deixar a operação num estado consistente, sem disponibilizar ficheiros parciais como resultado final. | Fiabilidade | Estado `falhado`; nenhum ficheiro parcial é publicado como resultado final; sem retoma automática obrigatória. | Estado consistente, com estratégia de recuperação ou repetição automática quando aplicável. | Novo | DQ-003; UC-VID-004, Exceção falha; `projects` | A orquestração do projeto deve distinguir conclusões válidas de falhas e impedir resultados incompletos. | Dada uma falha provocada durante o processamento, quando a operação termina, então fica no estado `falhado` e nenhum ficheiro parcial é disponibilizado como resultado final. |
| **REQ-VID-LEG-039** | O acesso ao vídeo utilizado na operação e ao respetivo ficheiro de legendas deve respeitar os mecanismos de autenticação e autorização existentes do PictuRAS. | Segurança | Acesso apenas através de sessão/autorização válida, reutilizando JWT e permissões do projeto. | Igual ao MVP, complementado por mecanismos de acesso temporário quando adotados pela plataforma. | Novo | DQ-004; API Gateway; permissões do projeto; `imageStorageService` | Evita criar um mecanismo paralelo de segurança para resultados de legendas. | Dado um utilizador sem autorização sobre o projeto, quando tenta aceder ao vídeo ou às legendas, então o acesso é recusado pelos mecanismos existentes. |
| **REQ-VID-LEG-040** | O sistema deve comunicar ao utilizador cada transição relevante de estado da operação de geração de legendas através do mecanismo de eventos em tempo real existente. | Usabilidade | Estados `em processamento`, `concluída`, `falhada` e `cancelada` são refletidos através do `wsGateway`; progresso percentual não é obrigatório. | Estados e progresso detalhado podem ser comunicados pelo mesmo canal de eventos. | Novo | DQ-005; RN9; RabbitMQ `ws_queue`; `wsGateway` | O PictuRAS já disponibiliza atualizações de processamento em tempo real por WebSocket. | Dada uma transição de estado publicada para a operação, quando o evento é consumido pelo `wsGateway`, então a interface apresenta o novo estado ao utilizador. |
| **REQ-VID-LEG-041** | O componente de geração de legendas deve ser integrado como uma ferramenta de processamento isolada, seguindo o padrão de microserviços existente em `Tools`, sem exigir alterações funcionais às restantes ferramentas. | Manutenibilidade | Worker independente, integrado através da mensageria existente e sem alteração funcional das ferramentas atuais. | Contrato de ferramenta estável que permita substituir o componente de reconhecimento de fala sem afetar as restantes ferramentas. | Novo | DQ-006; arquitetura `Tools`/RabbitMQ | A arquitetura atual implementa cada ferramenta como microserviço independente consumidor de uma fila RabbitMQ. | Dado o novo worker de legendas integrado, quando o sistema é construído e executado, então as ferramentas existentes continuam a funcionar sem alteração do respetivo comportamento. |
| **REQ-VID-LEG-042** | O ficheiro de legendas deve ser persistido através do mecanismo de armazenamento existente e permanecer disponível enquanto o respetivo resultado do projeto estiver ativo. | Fiabilidade | Persistência através de `imageStorageService`/SeaweedFS segundo o ciclo de vida existente dos resultados; sem TTL específico introduzido pelo UC-VID-004. | Política de retenção configurável caso venha a ser definida globalmente pela plataforma. | Novo | DQ-007; RN10; `imageStorageService`/SeaweedFS | Evita introduzir valores de retenção arbitrários e reutiliza o armazenamento S3 já existente. | Dada uma geração concluída, quando o resultado do projeto se encontra ativo, então o ficheiro de legendas permanece acessível através do mecanismo de armazenamento existente. |
| **REQ-VID-LEG-043** | O serviço responsável pela geração de legendas deve poder ser executado no ambiente Docker Compose do PictuRAS sem exigir dependências de processamento instaladas diretamente no sistema anfitrião. | Portabilidade | O worker inicia através de `docker compose up --build` juntamente com os restantes serviços. | Imagem do serviço preparada para implantação isolada em ambiente de orquestração compatível com contentores. | Novo | DQ-008; arquitetura Docker Compose | A aplicação existente é uma arquitetura de microserviços orquestrada por Docker Compose. | Dado um ambiente com Docker e Docker Compose suportados pelo projeto, quando a stack é construída, então o serviço de legendas inicia sem instalação manual de bibliotecas de reconhecimento de fala no anfitrião. |
**Nota:** Nesta revisão foram removidos alvos temporais e períodos de retenção que não estavam suportados pela arquitetura ou pelo caso de uso. Os requisitos de qualidade privilegiam a reutilização dos mecanismos existentes do PictuRAS; qualquer novo alvo quantitativo deverá ser aprovado explicitamente pela equipa.

#### 4.1.3 Verificação da completude e dos limites do âmbito

| **Tópico a verificar** | **Aplicável?** | **Decisão / justificação** | **Requisito(s) relacionado(s)** |
|---|---|---|---|
| Formato, codec, duração e dimensão do vídeo | Sim | A geração de legendas depende da capacidade de obter e processar o áudio. A ERS valida separadamente o formato do vídeo, o codec de áudio, o tamanho e a duração antes do processamento. Os valores concretos de tamanho e duração permanecem nas questões em aberto Q6 e Q7 até serem fixados. | REQ-VID-LEG-005; REQ-VID-LEG-006; REQ-VID-LEG-007; REQ-VID-LEG-031 |
| Estado, progresso, cancelamento e resultado | Sim | A operação pode demorar e necessita de acompanhamento. No MVP, o estado é comunicado através do mecanismo já existente de eventos RabbitMQ/`wsGateway`; não é obrigatório apresentar percentagem de progresso. O utilizador pode cancelar a operação e obter o resultado quando concluída. | REQ-VID-LEG-013; REQ-VID-LEG-016; REQ-VID-LEG-017; REQ-VID-LEG-018; REQ-VID-LEG-019; REQ-VID-LEG-020; REQ-VID-LEG-032; REQ-VID-LEG-040 |
| Falhas durante o processamento | Sim | Uma falha deve deixar a operação num estado consistente, identificá-la como falhada e impedir que resultados incompletos ou inválidos sejam apresentados como finais. | REQ-VID-LEG-021; REQ-VID-LEG-023; REQ-VID-LEG-026; REQ-VID-LEG-038 |
| Persistência e expiração dos ficheiros | Sim | O ficheiro de legendas fica associado ao vídeo de origem e é persistido através do `imageStorageService`/SeaweedFS. No MVP não é introduzido um TTL específico para legendas; o resultado segue o ciclo de vida já aplicado aos restantes resultados do projeto. | REQ-VID-LEG-033; REQ-VID-LEG-034; REQ-VID-LEG-042 |
| Perfis e contagem de operações | Sim | A funcionalidade é disponibilizada aos perfis registado e premium e reutiliza o mecanismo existente de quotas. Gerações concluídas com sucesso são contabilizadas segundo as regras do perfil. O consumo de quota em operações falhadas permanece em aberto na Q10. | REQ-VID-LEG-001; REQ-VID-LEG-006; REQ-VID-LEG-007; REQ-VID-LEG-008; REQ-VID-LEG-027; REQ-VID-LEG-035 |
| Encadeamento de ferramentas e processamento em lote | Não, no âmbito deste MVP | O UC-VID-004 trata a geração de legendas para um vídeo selecionado individualmente. A utilização desta funcionalidade em pipelines ou em processamento de vários vídeos em lote fica fora do âmbito do MVP e poderá ser considerada como evolução futura. | N/A |

**Evolução:** *Mantido* = requisito preservado; *Refinado* = clarificado ou tornado verificável sem alterar a intenção; *Novo* = acrescentado para completar a ERS. **NOVO/ALT** indica o impacto face ao PictuRAS existente, e não a novidade face ao Exercício 1.

### 4.2 Impacto no sistema existente

A análise seguinte considera a arquitetura atual do repositório `picturas-27`, baseada em Nginx, API Gateway, serviços `users`, `projects` e `subscriptions`, `imageStorageService`, `wsGateway`, RabbitMQ, SeaweedFS e microserviços de ferramentas em `Tools`.

| **Elemento existente afetado** | **Impacto (Manter / Estender / Alterar)** | **Descrição do impacto** | **Requisito(s) relacionado(s)** |
|---|---|---|---|
| **Nginx / API Gateway / autenticação JWT** | Manter | A nova funcionalidade reutiliza o ponto de entrada HTTPS e os mecanismos existentes de autenticação/autorização; não é criado um mecanismo de login próprio para legendas. | REQ-VID-LEG-001; REQ-VID-LEG-027; REQ-VID-LEG-039 |
| **Frontend (`frontend`)** | Estender | O editor passa a disponibilizar a operação de geração de legendas, seleção de idioma, estados da operação, pré-visualização e obtenção do ficheiro resultante. | REQ-VID-LEG-001; REQ-VID-LEG-003; REQ-VID-LEG-013; REQ-VID-LEG-014; REQ-VID-LEG-020; REQ-VID-LEG-028; REQ-VID-LEG-032; REQ-VID-LEG-040 |
| **User Service (`users`) / perfis e quota diária** | Alterar | A nova operação passa a ser considerada nas regras de utilização do perfil gratuito e na verificação da quota disponível. A decisão sobre consumo de quota em operações falhadas mantém-se em aberto. | REQ-VID-LEG-006; REQ-VID-LEG-007; REQ-VID-LEG-008; REQ-VID-LEG-027; REQ-VID-LEG-035 |
| **Subscription Service (`subscriptions`)** | Manter | Mantém a distinção entre planos gratuito e premium e continua a fornecer o contexto de subscrição utilizado pela aplicação; o UC-VID-004 não introduz um novo plano. | REQ-VID-LEG-027; REQ-VID-LEG-035 |
| **Project Service (`projects`)** | Estender | A orquestração de projetos passa a aceitar a nova ferramenta, controlar o ciclo de vida da execução, associar o resultado ao vídeo/projeto e distinguir conclusão, falha e cancelamento. | REQ-VID-LEG-018; REQ-VID-LEG-021; REQ-VID-LEG-032; REQ-VID-LEG-033; REQ-VID-LEG-038 |
| **Infraestrutura de mensageria (`RabbitMQ`)** | Estender | A geração de legendas passa a usar o padrão assíncrono já utilizado pelas ferramentas, com uma fila dedicada ao novo worker e publicação dos respetivos resultados/eventos no exchange existente. | REQ-VID-LEG-010; REQ-VID-LEG-036; REQ-VID-LEG-037; REQ-VID-LEG-040; REQ-VID-LEG-041 |
| **Arquitetura de ferramentas (`Tools`)** | Estender | É acrescentado um worker/microserviço de geração de legendas, isolado das ferramentas existentes e responsável pela extração/acesso ao áudio, reconhecimento de fala e geração do resultado temporal. | REQ-VID-LEG-009; REQ-VID-LEG-010; REQ-VID-LEG-011; REQ-VID-LEG-012; REQ-VID-LEG-041; REQ-VID-LEG-043 |
| **WebSocket Gateway (`wsGateway`)** | Estender | O gateway de eventos passa a transportar também alterações de estado da operação de legendas para a interface. No MVP não é obrigatório enviar percentagem de progresso. | REQ-VID-LEG-032; REQ-VID-LEG-040 |
| **Image Storage Service (`imageStorageService`) / SeaweedFS** | Estender | O armazenamento passa a suportar o vídeo usado pela operação e o ficheiro de legendas associado, reutilizando a fachada S3 e o armazenamento SeaweedFS já existentes. Não é introduzido um TTL específico no MVP. | REQ-VID-LEG-020; REQ-VID-LEG-033; REQ-VID-LEG-034; REQ-VID-LEG-039; REQ-VID-LEG-042 |
| **Docker Compose** | Estender | A definição da stack passa a incluir o novo worker de legendas e as respetivas dependências, mantendo o mesmo modelo de implantação local dos restantes microserviços. | REQ-VID-LEG-041; REQ-VID-LEG-043 |
| **Encadeamento de ferramentas e processamento em lote** | Manter | Permanecem sem alterações no MVP do UC-VID-004. A geração de legendas é executada sobre um vídeo selecionado individualmente. | N/A |

### 4.3 Matriz de Rastreabilidade Atualizada

| **Elemento de origem** | **Descrição abreviada** | **Requisito(s) relacionado(s)** |
|---|---|---|
| Trigger | Selecionar um vídeo e escolher gerar legendas automaticamente. | REQ-VID-LEG-001 |
| Ator principal / Pré-condições | Utilizador autenticado com perfil registado ou premium. | REQ-VID-LEG-027 |
| Passo 1 | Selecionar vídeo e apresentar as operações disponíveis. | REQ-VID-LEG-001; REQ-VID-LEG-028 |
| Passo 2 | Solicitar a geração e verificar áudio utilizável. | REQ-VID-LEG-001; REQ-VID-LEG-002 |
| Passo 3 | Indicar idioma e validar suporte. | REQ-VID-LEG-003; REQ-VID-LEG-004 |
| Passo 4 | Confirmar a operação e validar vídeo, áudio, perfil e restrições. | REQ-VID-LEG-002; REQ-VID-LEG-004; REQ-VID-LEG-005; REQ-VID-LEG-006; REQ-VID-LEG-007; REQ-VID-LEG-008; REQ-VID-LEG-029; REQ-VID-LEG-031 |
| Passo 5 | Obter a faixa de áudio do vídeo. | REQ-VID-LEG-009 |
| Passo 6 | Executar reconhecimento automático de fala. | REQ-VID-LEG-010 |
| Passo 7 | Obter texto reconhecido e informação temporal. | REQ-VID-LEG-011 |
| Passo 8 | Construir legendas sincronizadas. | REQ-VID-LEG-012; REQ-VID-LEG-025 |
| Passo 9 | Apresentar pré-visualização das legendas. | REQ-VID-LEG-013 |
| Passo 10 | Rever e confirmar o resultado. | REQ-VID-LEG-014; REQ-VID-LEG-019 |
| Passo 11 | Gerar o ficheiro final de legendas. | REQ-VID-LEG-019 |
| Passo 12 | Disponibilizar o ficheiro e preservar o vídeo original. | REQ-VID-LEG-020; REQ-VID-LEG-024 |
| FA1 – Alterar idioma | Alterar o idioma antes da confirmação. | REQ-VID-LEG-030; REQ-VID-LEG-004 |
| FA2 – Repetir geração | Rejeitar o resultado e iniciar nova geração. | REQ-VID-LEG-015 |
| FA3 – Cancelar antes do processamento | Terminar a operação antes de iniciar o reconhecimento. | REQ-VID-LEG-016 |
| FA4 – Cancelar durante o processamento | Solicitar cancelamento, descartar o resultado incompleto e preservar o original. | REQ-VID-LEG-017; REQ-VID-LEG-018; REQ-VID-LEG-024 |
| FA5 – Não confirmar o resultado | Não disponibilizar o resultado rejeitado como versão final. | REQ-VID-LEG-019 |
| Exceção – vídeo sem áudio | Impedir geração e informar a causa. | REQ-VID-LEG-002; REQ-VID-LEG-023 |
| Exceção – formato não suportado | Rejeitar vídeo com formato incompatível. | REQ-VID-LEG-005; REQ-VID-LEG-023 |
| Exceção – codec não suportado | Rejeitar vídeo com codec de áudio incompatível. | REQ-VID-LEG-031; REQ-VID-LEG-023 |
| Exceção – qualidade insuficiente do áudio | Informar sobre a impossibilidade de geração fiável e não apresentar um resultado inválido como concluído. | REQ-VID-LEG-023; REQ-VID-LEG-026 |
| Exceção – idioma não suportado | Impedir processamento e solicitar idioma suportado. | REQ-VID-LEG-004; REQ-VID-LEG-023 |
| Exceção – tamanho excedido | Rejeitar vídeo acima do limite do perfil. | REQ-VID-LEG-006; REQ-VID-LEG-023 |
| Exceção – duração excedida | Rejeitar vídeo acima do limite do perfil. | REQ-VID-LEG-007; REQ-VID-LEG-023 |
| Exceção – quota insuficiente | Não criar o pedido de processamento. | REQ-VID-LEG-008; REQ-VID-LEG-023 |
| Exceção – falha no reconhecimento | Marcar a operação como falhada, informar o utilizador e manter estado consistente. | REQ-VID-LEG-021; REQ-VID-LEG-023; REQ-VID-LEG-026; REQ-VID-LEG-038 |
| Exceção – resultado parcial | Identificar segmentos não reconhecidos e não apresentar o resultado parcial como completo. | REQ-VID-LEG-022; REQ-VID-LEG-026 |
| Pós-condição – Garantia de Sucesso | Ficheiro disponível e vídeo original preservado. | REQ-VID-LEG-019; REQ-VID-LEG-020; REQ-VID-LEG-024 |
| Pós-condição – Garantia Mínima | Original preservado e resultado inválido não apresentado como sucesso. | REQ-VID-LEG-018; REQ-VID-LEG-024; REQ-VID-LEG-026; REQ-VID-LEG-038 |
| RN1 | A geração requer uma faixa de áudio utilizável. | REQ-VID-LEG-002; REQ-VID-LEG-009 |
| RN2 | Apenas idiomas, formatos e codecs suportados podem ser processados. | REQ-VID-LEG-004; REQ-VID-LEG-005; REQ-VID-LEG-031 |
| RN3 | O vídeo original não pode ser alterado. | REQ-VID-LEG-024 |
| RN4 | Cada segmento deve possuir intervalo temporal válido. | REQ-VID-LEG-011; REQ-VID-LEG-012; REQ-VID-LEG-025 |
| RN5 | O processamento só começa depois das validações. | REQ-VID-LEG-002; REQ-VID-LEG-004; REQ-VID-LEG-005; REQ-VID-LEG-006; REQ-VID-LEG-007; REQ-VID-LEG-008; REQ-VID-LEG-029; REQ-VID-LEG-031 |
| RN6 | Limites de tamanho, duração e utilização podem variar conforme o perfil. | REQ-VID-LEG-006; REQ-VID-LEG-007; REQ-VID-LEG-008 |
| RN7 | Um resultado só é concluído após validação da geração do ficheiro. | REQ-VID-LEG-019; REQ-VID-LEG-020; REQ-VID-LEG-026 |
| RN8 | Resultados parciais devem ser explicitamente identificados. | REQ-VID-LEG-022; REQ-VID-LEG-026 |
| RN9 | A operação possui um estado identificável durante o ciclo de vida. | REQ-VID-LEG-032; REQ-VID-LEG-040 |
| RN10 | O ficheiro fica associado ao vídeo de origem e segue o ciclo de vida dos restantes resultados do projeto. | REQ-VID-LEG-033; REQ-VID-LEG-034; REQ-VID-LEG-042 |
| RN11 | Gerações concluídas com sucesso seguem as regras de contabilização do perfil. | REQ-VID-LEG-035 |
| DQ-001 | A submissão da geração de legendas deve reutilizar o modelo assíncrono do `Project Service`/RabbitMQ, devolvendo aceitação ou rejeição sem esperar pela conclusão do reconhecimento de fala. | Evita bloquear a interface e alinha a nova ferramenta com a arquitetura atual de processamento. | REQ-VID-LEG-036 |
| DQ-002 | O trabalho de reconhecimento deve continuar em execução independentemente da navegação do utilizador na interface. | O PictuRAS já executa ferramentas de forma assíncrona através de RabbitMQ. | REQ-VID-LEG-037 |
| DQ-003 | No MVP, uma falha termina no estado `falhado`, sem resultado parcial acessível como final; retoma automática não é obrigatória. | Mantém o MVP simples e coerente com a separação entre execução válida e falha. | REQ-VID-LEG-026; REQ-VID-LEG-038 |
| DQ-004 | A geração de legendas reutiliza os mecanismos existentes de autenticação JWT, autorização de projetos e acesso ao armazenamento, em vez de criar um esquema paralelo de segurança. | Mantém consistência com a arquitetura atual e reduz duplicação de mecanismos de segurança. | REQ-VID-LEG-039 |
| DQ-005 | No MVP, as transições de estado são comunicadas pelo mecanismo RabbitMQ `ws_queue` / `wsGateway`; não é exigido progresso percentual em tempo real. | Reutiliza o canal de eventos em tempo real já existente e evita acrescentar complexidade desnecessária ao MVP. | REQ-VID-LEG-040 |
| DQ-006 | O processamento de legendas é implementado como worker/microserviço independente segundo o padrão `Tools`, comunicando através da mensageria existente. | Preserva o baixo acoplamento e o modelo arquitetural já usado pelas ferramentas do PictuRAS. | REQ-VID-LEG-041 |
| DQ-007 | O ficheiro de legendas é persistido através do `imageStorageService`/SeaweedFS e segue o ciclo de vida dos restantes resultados do projeto; não é definido TTL exclusivo para legendas no MVP. | Remove períodos de retenção arbitrários e reutiliza o mecanismo de armazenamento S3 já existente. | REQ-VID-LEG-034; REQ-VID-LEG-042 |
| DQ-008 | O worker de legendas deve ser empacotado como serviço Docker e integrado na stack Docker Compose do PictuRAS. | A aplicação atual é composta por microserviços orquestrados por Docker Compose; o novo serviço deve manter esse modelo de implantação. | REQ-VID-LEG-043 |
| DQ-009 | O worker de legendas é empacotado e executado no modelo Docker Compose do PictuRAS. | REQ-VID-LEG-043 |

**Decisões de qualidade introduzidas nesta aula**

| **ID** | **Decisão de qualidade** | **Justificação** | **Requisito(s) relacionado(s)** |
|---|---|---|---|
| DQ-001 | A submissão da geração de legendas deve reutilizar o modelo assíncrono do `Project Service`/RabbitMQ, devolvendo aceitação ou rejeição sem esperar pela conclusão do reconhecimento de fala. | Evita bloquear a interface e alinha a nova ferramenta com a arquitetura atual de processamento. | REQ-VID-LEG-036 |
| DQ-002 | O trabalho de reconhecimento deve continuar em execução independentemente da navegação do utilizador na interface. | O PictuRAS já executa ferramentas de forma assíncrona através de RabbitMQ. | REQ-VID-LEG-037 |
| DQ-003 | No MVP, uma falha termina no estado `falhado`, sem resultado parcial acessível como final; retoma automática não é obrigatória. | Mantém o MVP simples e coerente com a separação entre execução válida e falha. | REQ-VID-LEG-026; REQ-VID-LEG-038 |
| DQ-004 | A geração de legendas reutiliza os mecanismos existentes de autenticação JWT, autorização de projetos e acesso ao armazenamento, em vez de criar um esquema paralelo de segurança. | Mantém consistência com a arquitetura atual e reduz duplicação de mecanismos de segurança. | REQ-VID-LEG-039 |
| DQ-005 | No MVP, as transições de estado são comunicadas pelo mecanismo RabbitMQ `ws_queue` / `wsGateway`; não é exigido progresso percentual em tempo real. | Reutiliza o canal de eventos em tempo real já existente e evita acrescentar complexidade desnecessária ao MVP. | REQ-VID-LEG-040 |
| DQ-006 | O processamento de legendas é implementado como worker/microserviço independente segundo o padrão `Tools`, comunicando através da mensageria existente. | Preserva o baixo acoplamento e o modelo arquitetural já usado pelas ferramentas do PictuRAS. | REQ-VID-LEG-041 |
| DQ-007 | O ficheiro de legendas é persistido através do `imageStorageService`/SeaweedFS e segue o ciclo de vida dos restantes resultados do projeto; não é definido TTL exclusivo para legendas no MVP. | Remove períodos de retenção arbitrários e reutiliza o mecanismo de armazenamento S3 já existente. | REQ-VID-LEG-034; REQ-VID-LEG-042 |
| DQ-008 | O worker de legendas deve ser empacotado como serviço Docker e integrado na stack Docker Compose do PictuRAS. | A aplicação atual é composta por microserviços orquestrados por Docker Compose; o novo serviço deve manter esse modelo de implantação. | REQ-VID-LEG-043 |

**Verificações de cobertura**

- [x] Cada requisito funcional e não funcional aparece na matriz.
- [x] Cada requisito tem origem identificada: elemento do caso de uso, regra de negócio ou decisão de qualidade.
- [x] Todos os elementos relevantes do caso de uso têm requisito associado ou justificação para não terem.
- [x] Os tópicos excluídos na secção 4.1.3 estão justificados.
- [x] O impacto no sistema existente está atualizado e ligado aos requisitos relevantes.

---

## ✅ Lista de verificação antes de entregar (Exercício 2)

- [x] As secções 0 a 3 do dossiê foram preservadas; as assunções, questões em aberto e utilização de IA foram atualizadas.
- [x] A funcionalidade, o caso de uso e o perfil do Exercício 1 foram mantidos.
- [x] Requisitos funcionais estão completos para o âmbito e têm critérios verificáveis.
- [x] Requisitos de qualidade estão classificados e distinguem os alvos MVP e produção.
- [x] Os IDs existentes foram preservados quando a intenção não mudou.
- [x] A análise de completude não alargou o âmbito sem decisão explícita.
- [x] A matriz de rastreabilidade não tem requisitos órfãos nem elementos relevantes por cobrir.
- [x] As decisões de qualidade e os respetivos requisitos estão identificados.

