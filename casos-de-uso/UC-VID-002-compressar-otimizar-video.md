# 📝 Exercício 1 — Template de Entrega
### Casos de Uso · Fase 1: Suporte a Vídeo no PictuRAS

---

## 0. Identificação

| **Campo** | **Valor** |
|-----------|-----------|
| **Grupo / Equipa** | 6 |
| **Autores** | Bruno Sousa PG63927, Bruno Vale PG63926, Diogo Macedo PG63947, António Sousa PG63923 |
| **Data** | 2026-10-05 |
| **Versão do documento** | v1.1 |
| **Unidade Curricular** | Requisitos e Arquiteturas de Software — MEI, Universidade do Minho |

---

## 1. Funcionalidade de vídeo escolhida

| **Campo** | **Valor** |
|-----------|-----------|
| **Funcionalidade** | Compressão/Otimização de vídeo com escolha de qualidade |
| **Perfil(s) de utilizador abrangido(s)** | Utilizador registado e utilizador premium. Ambos podem utilizar a funcionalidade, podendo existir diferenças nos limites de tamanho, duração ou opções de qualidade disponíveis consoante o perfil. |

**Justificação no contexto do MVP** 

A compressão e otimização de vídeo permite reduzir o tamanho dos ficheiros mantendo uma qualidade adequada às necessidades do utilizador. No contexto do MVP, esta funcionalidade permite validar operações essenciais de suporte a vídeo, como carregamento, análise, escolha de parâmetros, processamento e geração de um novo ficheiro.

---

## 2. Caso de Uso

### 2.1 Cabeçalho

| **Secção** | **Detalhes** |
|------------|--------------|
| **ID do Caso de Uso** | UC-VID-002 |
| **Nome** | Comprimir/Otimizar vídeo |
| **Versão** | v1.0 |
| **Autor** | Bruno Sousa  |
| **Data** | 2026-10-05 |
| **Objetivo** | Permitir ao utilizador reduzir o tamanho de um vídeo através da escolha de um nível de qualidade, obtendo uma nova versão otimizada do ficheiro. |
| **Âmbito** | Módulo de processamento de vídeo do PictuRAS |
| **Ator Principal** | Utilizador registado ou premium |
| **Stakeholders e Interesses** | - **Utilizador**: pretende reduzir o tamanho do vídeo mantendo um nível de qualidade adequado e obter um ficheiro utilizável após o processamento.<br>- **PictuRAS**: pretende garantir que apenas ficheiros válidos são processados, respeitando os limites definidos e evitando resultados incompletos ou inválidos |
| **Pré-condições** | - O utilizador encontra-se autenticado.<br>-O utilizador possui acesso à funcionalidade de otimização de vídeo.<br>- O sistema encontra-se disponível para receber e processar ficheiros de vídeo. |
| **Trigger** | O utilizador seleciona a opção de comprimir/otimizar vídeo |

### 2.2 Fluxo Principal

| **Passo** | **Ação do Ator** | **Resposta do Sistema** |
|-----------|------------------|-------------------------|
| 1 | Seleciona a opção de comprimir/otimizar vídeo | Apresenta a interface da funcionalidade|
| 2 | Seleciona um ficheiro de vídeo | Recebe o ficheiro e inicia sua validação |
| 3 | — | Verifica o formato do vídeo e obtém informação relevante, como tamanho e duração |
| 4 | — | Apresenta as opções de qualidade/otimização disponíveis |
| 5 | Seleciona o nível de qualidade pretendido | Apresenta a opção selecionada e os parâmetros associados |
| 6 | Confirma a operação | Valida o vídeo, o perfil do utilizador e os parâmetros escolhidos |
| 7 | — | Inicia o processamento do vídeo |
| 8 | — | Gera uma nova versão otimizada do vídeo de acordo com a qualidade escolhida |
| 9 | — | Guarda o resultado do processamento e informa o utilizador de que a operação foi concluída |
| 10 | Solicita o acesso ao resultado | Disponibiliza o vídeo otimizado ao utilizador |

### 2.3 Fluxos Alternativos

| **Fluxo** | **Descrição** |
|-----------|---------------|
| FA1 – Alterar nível de qualidade | Antes de confirmar a operação, o utilizador decide escolher outro nível de qualidade. O sistema atualiza a opção selecionada e apresenta os parâmetros correspondentes, regressando depois ao passo de confirmação |
| FA2 – Cancelar operação | Antes ou durante o processamento, o utilizador seleciona a opção de cancelar. O sistema interrompe a operação, não disponibiliza nenhum resultado incompleto e mantém o ficheiro original inalterado. Caso o processamento já tenha sido efetivamente iniciado, a operação permanece contabilizada para efeitos da quota diária |
| FA3 – Selecionar outro vídeo | Antes de confirmar o processamento, o utilizador decide substituir o vídeo selecionado. O sistema descarta a seleção atual e permite escolher um novo ficheiro, repetindo posteriormente a respetiva validação |
| FA4 – Resultado otimizado maior do que o original | Após a compressão, o sistema verifica que o ficheiro resultante possui um tamanho superior ao vídeo original. O sistema informa o utilizador de que não foi obtida redução de tamanho, mantém o vídeo original inalterado e permite ao utilizador optar por conservar ou descarregar o resultado gerado. |


### 2.4 Exceções

| **Condição** | **Comportamento do Sistema** |
|--------------|------------------------------|
| O formato ou codec do vídeo não é suportado. | O sistema rejeita o ficheiro, informa o utilizador de que o vídeo não pode ser processado e apresenta, quando aplicável, os formatos suportados |
| O ficheiro excede os limites permitidos para o perfil do utilizador | O sistema impede o início do processamento e informa o utilizador de que o vídeo ultrapassa os limites definidos para o seu perfil |
| Ocorre uma falha durante o processamento do vídeo. | O sistema interrompe a operação, não disponibiliza resultados incompletos e mantém o vídeo original inalterado |
| Não existe espaço ou capacidade suficiente para concluir o processamento. | O sistema cancela a operação e informa o utilizador de que não foi possível concluir a otimização |
| O utilizador registado não possui quota diária disponível. | O sistema recusa o pedido de compressão/otimização antes do início do processamento e informa o utilizador de que não possui quota disponível. |


### 2.5 Pós-condições

| **Tipo** | **Resultado** |
|----------|---------------|
| Garantia de Sucesso | É criada uma nova versão otimizada do vídeo de acordo com o nível de qualidade escolhido. O ficheiro resultante fica disponível ao utilizador e o vídeo original permanece inalterado. |
| Garantia Mínima | Em caso de falha, o vídeo original permanece inalterado e nenhum ficheiro incompleto ou inválido é disponibilizado como resultado da operação |


### 2.6 Regras de Negócio e Restrições

| **ID** | **Regra** |
|--------|-----------|
| RN1 | Apenas vídeos em formatos e codecs suportados pelo sistema podem ser processados. |
| RN2 | O vídeo original não deve ser alterado ou substituído durante o processo de otimização. |
| RN3 | Utilizadores registados podem processar vídeos até 500 MB e 10 minutos; utilizadores premium podem processar vídeos até 2 GB e 60 minutos. |
| RN4 | No MVP, a funcionalidade suporta vídeos no formato MP4 com codec H.264. |
| RN5 | Os níveis de qualidade disponíveis são Alta, Equilibrada e Tamanho reduzido. Alta utiliza H.264 com CRF 23 e mantém a resolução original; Equilibrada utiliza H.264 com CRF 28 e mantém a resolução original; Tamanho reduzido utiliza H.264 com CRF 32 e limita a resolução máxima a 720p. |
| RN6 | Apenas vídeos cujo processamento tenha sido concluído com sucesso podem ser disponibilizados ao utilizador como resultado final. |
| RN7 | Cada operação de compressão/otimização que tenha iniciado efetivamente o processamento conta como uma operação para efeitos da quota diária do utilizador registado. Se a operação for recusada ou cancelada antes do início do processamento, não consome quota. Se o processamento já tiver sido iniciado, a quota não é devolvida, mesmo que a operação falhe ou seja posteriormente cancelada. |

### 2.7 Assunções

| **ID** | **Assunção** |
|--------|--------------|
| A1 | Assume-se que o PictuRAS já possui um mecanismo de carregamento de ficheiros de vídeo. |
| A2 | Assume-se que o sistema consegue identificar informação básica do vídeo, nomeadamente o seu formato, codec, duração e tamanho. |
| A3 | Assume-se que o processo de otimização gera um novo ficheiro e não substitui o vídeo original. |
| A4 | Assume-se que existem três níveis de qualidade disponíveis para escolha do utilizador: Alta, Equilibrada e Tamanho reduzido. |
| A5 | Assume-se que o sistema consegue verificar os limites aplicáveis ao perfil do utilizador antes de iniciar o processamento. |
| A6 | Assume-se, para o MVP, que o processamento de vídeo será realizado de forma assíncrona, permitindo ao utilizador continuar a utilizar a aplicação. |
| A7 | Assume-se que os estados mínimos de uma operação de processamento são: em fila, em processamento, concluído, falhado e cancelado. |
| A8 | Assume-se que, no MVP, a indicação de progresso será atualizada pelo menos a cada 5 segundos. |
| A9 | Assume-se que apenas o proprietário do vídeo pode aceder ao ficheiro original e ao respetivo resultado otimizado. |
| A10 | Assume-se que o vídeo otimizado permanece disponível durante, pelo menos, 24 horas após a conclusão do processamento. |

### 2.8 Questões em Aberto

| **ID** | **Questão** |
|--------|-------------|
| Q1 | O sistema deverá apresentar ao utilizador uma estimativa do tamanho final do vídeo antes de iniciar o processamento? |
| Q2 | Em produção, qual deverá ser o período de retenção dos vídeos otimizados para cada perfil de utilizador? |
| Q3 | Em produção, que tipos de falha deverão permitir retoma ou repetição automática do processamento? |
| Q4 | Numa evolução futura, a compressão/otimização de vídeo deverá integrar o encadeamento de ferramentas e o processamento em lote existentes no PictuRAS? |

---

## 3. Utilização de agentes de IA

| **Ferramenta / *skill*** | **Tarefa apoiada** | **Validação realizada pela equipa** |
|--------------------------|--------------------|--------------------------------------|
| ChatGPT | Apoio na interpretação dos templates e na escolha e estruturação da funcionalidade de compressão/otimização de vídeo. | A equipa comparou as sugestões com os templates e enunciados disponibilizados pelo docente e adaptou o conteúdo ao caso de uso escolhido. |
| ChatGPT | Apoio na derivação e organização dos requisitos funcionais a partir do caso de uso, regras de negócio, fluxos alternativos e exceções. | A equipa verificou a origem de cada requisito e manteve os IDs definidos no Exercício 1 quando a intenção do requisito não foi alterada. |
| ChatGPT | Apoio na identificação e classificação dos requisitos não funcionais segundo a ISO/IEC 25010 e na definição de alvos distintos para MVP e produção. | A equipa reviu os valores propostos, confirmou a sua adequação ao âmbito do MVP e registou as decisões de qualidade utilizadas na ERS. |
| ChatGPT | Apoio na atualização da análise de impacto, matriz de rastreabilidade, decisões de qualidade, assunções e questões em aberto. | A equipa verificou que cada requisito possui uma origem identificada e que os tópicos fora do âmbito estão explicitamente justificados. |

---

## ✅ Lista de verificação antes de entregar (Exercício 1)

- [✅] Secções 0 a 3 preenchidas e texto de ajuda (`>` e `{…}`) removido.
- [✅] Funcionalidade de vídeo escolhida **e justificada** no contexto do MVP.
- [✅] Ator principal identificado, com o respetivo perfil.
- [✅] Caso de uso com fluxo principal, **≥1 fluxo alternativo** e **≥1 exceção específica de vídeo**.
- [✅] Pós-condições com garantia de sucesso **e** garantia mínima.
- [✅] Regras de negócio e restrições preenchidas.
- [✅] Assunções e questões em aberto registadas.
- [✅] Utilização de agentes de IA documentada.

---
---

---

## 4. Especificação de Requisitos do Sistema (ERS)

**Caso de Uso:** UC-VID-002 — Comprimir/Otimizar vídeo  
**Versão do dossiê:** v1.1  
**Baseline do Exercício 1:** v1.0 (caso de uso UC-VID-002; a secção de requisitos derivados não foi preenchida no Exercício 1, pelo que todos os requisitos desta ERS são novos)

### 4.1 Requisitos da ERS

#### 4.1.1 Requisitos Funcionais

| **ID** | **Requisito** | **Prioridade** | **Evolução** | **Novo/Alt** | **Origem (UC / RN / decisão)** | **Justificação** | **Critério de aceitação / verificação** |

|--------|---------------|----------------|--------------|--------------|--------------------------------|-----------------|----------------------------------------|

| REQ-VID-COMP-001 | O sistema deve permitir ao utilizador registado ou premium selecionar um vídeo para compressão/otimização. | Deve ter | Novo | NOVO | UC-VID-002, passos 1–2 | Permite iniciar a utilização da funcionalidade de compressão/otimização. | Dado um utilizador registado ou premium, quando seleciona a funcionalidade e escolhe um vídeo, então o sistema aceita a seleção e inicia a validação. |

| REQ-VID-COMP-002 | O sistema deve validar o formato e o codec do vídeo selecionado antes de iniciar o processamento. | Deve ter | Novo | NOVO | UC-VID-002, passo 3; Exceção 1; RN1 | Evita que ficheiros incompatíveis entrem no processamento. | Dado um vídeo selecionado, quando este é submetido, então o sistema identifica o formato e o codec antes de permitir o processamento. |

| REQ-VID-COMP-003 | O sistema deve determinar o tamanho do vídeo selecionado. | Deve ter | Novo | NOVO | UC-VID-002, passo 3; A2 | O tamanho é necessário para verificar os limites associados ao perfil do utilizador. | Dado um vídeo válido, quando é analisado, então o sistema obtém o respetivo tamanho. |

| REQ-VID-COMP-004 | O sistema deve determinar a duração do vídeo selecionado. | Deve ter | Novo | NOVO | UC-VID-002, passo 3; A2 | A duração é necessária para verificar os limites associados ao perfil do utilizador. | Dado um vídeo válido, quando é analisado, então o sistema obtém a respetiva duração. |

| REQ-VID-COMP-005 | O sistema deve apresentar ao utilizador os níveis de qualidade disponíveis para otimização. | Deve ter | Novo | NOVO | UC-VID-002, passo 4; RN5 | O utilizador necessita de conhecer as opções disponíveis antes de configurar o processamento. | Dado um vídeo validado, quando são apresentadas as opções de processamento, então o sistema apresenta os níveis Alta, Equilibrada e Tamanho reduzido. |

| REQ-VID-COMP-006 | O sistema deve permitir ao utilizador selecionar um nível de qualidade para o vídeo otimizado. | Deve ter | Novo | NOVO | UC-VID-002, passo 5; RN5 | A escolha da qualidade determina o perfil de otimização pretendido pelo utilizador. | Dadas as opções disponíveis, quando o utilizador seleciona uma delas, então essa opção fica associada à operação. |

| REQ-VID-COMP-007 | O sistema deve validar os limites de tamanho e duração aplicáveis ao perfil do utilizador antes de iniciar o processamento. | Deve ter | Novo | ALT | UC-VID-002, passo 6; Exceção 2; RN3; A5 | A operação tem de respeitar os limites definidos para cada perfil de utilização. | Dado um vídeo e um utilizador autenticado, quando a operação é confirmada, então o sistema verifica os limites do respetivo perfil antes de iniciar o processamento. |

| REQ-VID-COMP-008 | O sistema deve gerar uma nova versão otimizada do vídeo de acordo com o nível de qualidade selecionado. | Deve ter | Novo | NOVO | UC-VID-002, passos 7–8; RN5; Pós-condição de sucesso | Representa o resultado principal da funcionalidade escolhida. | Dado um vídeo válido, quando o processamento termina com sucesso, então o sistema aplica o perfil correspondente: Alta — H.264 CRF 23 mantendo a resolução original; Equilibrada — H.264 CRF 28 mantendo a resolução original; Tamanho reduzido — H.264 CRF 32 com resolução máxima de 720p. |

| REQ-VID-COMP-010 | O sistema deve armazenar o vídeo otimizado após a conclusão bem-sucedida do processamento. | Deve ter | Novo | ALT | UC-VID-002, passo 9; Pós-condição de sucesso | O resultado tem de ficar disponível após o processamento para poder ser utilizado pelo utilizador. | Dado um processamento concluído com sucesso, quando a operação termina, então o ficheiro resultante fica armazenado e associado ao utilizador. |

| REQ-VID-COMP-011 | O sistema deve informar o utilizador quando o processamento do vídeo estiver concluído. | Deve ter | Novo | NOVO | UC-VID-002, passo 9 | Como o processamento de vídeo pode não ser imediato, o utilizador deve saber quando o resultado está disponível. | Dado um processamento concluído, quando o resultado fica disponível, então o sistema apresenta uma indicação de conclusão ao utilizador. |

| REQ-VID-COMP-012 | O sistema deve disponibilizar ao utilizador o vídeo otimizado após a conclusão bem-sucedida do processamento. | Deve ter | Novo | ALT | UC-VID-002, passo 10; RN6; Pós-condição de sucesso | O utilizador necessita de aceder ao resultado final da operação. | Dado um vídeo processado com sucesso, quando o utilizador solicita o resultado, então o sistema disponibiliza o ficheiro otimizado. |

| REQ-VID-COMP-013 | O sistema deve permitir ao utilizador alterar o nível de qualidade antes de confirmar a operação. | Deveria ter | Novo | NOVO | UC-VID-002, FA1 | Permite corrigir ou alterar a escolha antes de consumir recursos de processamento. | Dada uma qualidade previamente selecionada, quando o utilizador escolhe outra antes da confirmação, então o sistema substitui a seleção anterior. |

| REQ-VID-COMP-014 | O sistema deve permitir ao utilizador cancelar uma operação enquanto esta se encontra em fila ou em processamento. | Deveria ter | Novo | NOVO | UC-VID-002, FA2 | Permite interromper uma operação que o utilizador já não pretende concluir. | Dada uma operação em fila ou em processamento, quando o utilizador seleciona cancelar, então o sistema interrompe a operação, assume o estado “cancelado”, não disponibiliza resultados incompletos e mantém o vídeo original inalterado. Se o processamento já tiver sido iniciado, a quota consumida não é devolvida. |

| REQ-VID-COMP-015 | O sistema deve permitir ao utilizador substituir o vídeo selecionado antes de confirmar o processamento. | Deveria ter | Novo | NOVO | UC-VID-002, FA3 | Permite corrigir a seleção do ficheiro sem abandonar a funcionalidade. | Dado um vídeo previamente selecionado, quando o utilizador escolhe outro, então o sistema substitui a seleção e valida o novo vídeo. |

| REQ-VID-COMP-016 | O sistema deve rejeitar vídeos cujo formato ou codec não seja suportado e informar o utilizador da incompatibilidade. | Deve ter | Novo | NOVO | UC-VID-002, Exceção 1; RN1 | Impede o processamento de ficheiros incompatíveis e fornece informação ao utilizador sobre a causa da rejeição. | Dado um ficheiro num formato ou codec não suportado, quando é submetido, então o sistema impede o processamento e apresenta uma mensagem de incompatibilidade. |

| REQ-VID-COMP-017 | O sistema deve impedir o processamento de vídeos que excedam os limites definidos para o perfil do utilizador. | Deve ter | Novo | ALT | UC-VID-002, Exceção 2; RN3 | Garante a aplicação dos limites definidos para cada perfil. | Dado um vídeo que exceda pelo menos um limite do perfil, quando o utilizador confirma a operação, então o sistema rejeita o processamento e informa qual o limite excedido. |

| REQ-VID-COMP-019 | O sistema deve cancelar a operação e informar o utilizador quando não existir capacidade suficiente para concluir o processamento. | Deve ter | Novo | NOVO | UC-VID-002, Exceção 4 | Evita que uma operação fique indefinidamente incompleta em caso de falta de capacidade. | Dada uma situação de capacidade insuficiente, quando o sistema tenta iniciar ou continuar o processamento, então a operação é cancelada e o utilizador é informado. |

| REQ-VID-COMP-020 | O sistema deve aceitar, no MVP, apenas vídeos no formato MP4 codificados em H.264 para esta funcionalidade. | Deve ter | Novo | NOVO | RN4 | Define explicitamente os formatos e codecs suportados no âmbito atual do MVP. | Dado um vídeo MP4/H.264, quando é submetido, então é aceite quanto ao formato e codec; um ficheiro fora desta combinação é rejeitado. |

| REQ-VID-COMP-021 | O sistema deve limitar a 500 MB o tamanho de cada vídeo submetido por um utilizador registado. | Deve ter | Novo | ALT | RN3 | Controla a utilização de recursos associada ao perfil registado. | Dado um utilizador registado, quando submete um vídeo até 500 MB, então o vídeo passa a validação de tamanho; acima de 500 MB é rejeitado. |

| REQ-VID-COMP-022 | O sistema deve limitar a 10 minutos a duração de cada vídeo submetido por um utilizador registado. | Deve ter | Novo | ALT | RN3 | Controla a utilização de recursos associada ao perfil registado. | Dado um utilizador registado, quando submete um vídeo com duração até 10 minutos, então o vídeo passa a validação de duração; acima de 10 minutos é rejeitado. |

| REQ-VID-COMP-023 | O sistema deve limitar a 2 GB o tamanho de cada vídeo submetido por um utilizador premium. | Deve ter | Novo | ALT | RN3 | Diferencia os limites do perfil premium relativamente ao perfil registado. | Dado um utilizador premium, quando submete um vídeo até 2 GB, então o vídeo passa a validação de tamanho; acima de 2 GB é rejeitado. |

| REQ-VID-COMP-024 | O sistema deve limitar a 60 minutos a duração de cada vídeo submetido por um utilizador premium. | Deve ter | Novo | ALT | RN3 | Diferencia os limites do perfil premium relativamente ao perfil registado. | Dado um utilizador premium, quando submete um vídeo com duração até 60 minutos, então o vídeo passa a validação de duração; acima de 60 minutos é rejeitado. |

| REQ-VID-COMP-025 | O sistema deve contabilizar cada compressão/otimização que inicie efetivamente o processamento como uma operação na quota diária do utilizador registado. | Deve ter | Novo | ALT | RN7 | Integra a nova funcionalidade de vídeo com o mecanismo de quota já existente no PictuRAS. | Dado um utilizador registado com quota disponível, quando a compressão inicia efetivamente o processamento, então a sua contagem diária aumenta em uma operação. Se a operação falhar ou for cancelada após esse momento, a operação permanece contabilizada. |

| REQ-VID-COMP-034 | O sistema deve recusar o início de uma compressão/otimização quando o utilizador registado não possuir quota diária disponível. | Deve ter | Novo | NOVO | UC-VID-002, Exceção 5; RN7 | Impede o início de operações quando a quota diária do utilizador está esgotada. | Dado um utilizador registado sem quota disponível, quando confirma uma operação de compressão/otimização, então o sistema recusa o pedido antes do início do processamento e informa o utilizador de que não possui quota disponível. |

#### 4.1.2 Requisitos Não Funcionais e de Qualidade

| **ID** | **Requisito** | **Característica ISO/IEC 25010** | **Alvo MVP** | **Alvo produção** | **Evolução** | **Origem (UC / DQ)** | **Critério de aceitação / verificação** |

|--------|---------------|----------------------------------|--------------|------------------|--------------|----------------------|----------------------------------------|

| REQ-VID-COMP-009 | O sistema deve preservar o vídeo original sem alterações durante e após o processo de otimização. | Fiabilidade | O vídeo original deve permanecer inalterado em 100% das operações concluídas ou falhadas. | Igual ao MVP. | Novo | UC-VID-002, RN2; Pós-condições | Dado um vídeo submetido, quando o processamento termina com sucesso ou falha, então o ficheiro original mantém-se inalterado. |

| REQ-VID-COMP-018 | O sistema não deve disponibilizar ficheiros resultantes incompletos quando ocorrer uma falha durante o processamento. | Fiabilidade | Nenhum resultado parcial deve ficar acessível ao utilizador após uma falha. | Além de não disponibilizar resultados parciais, o sistema deverá permitir recuperação ou repetição automática do processamento quando aplicável. | Novo | UC-VID-002, Exceção 3; Garantia Mínima; RN6 | Dada uma falha durante o processamento, quando a operação termina, então nenhum ficheiro parcial fica disponível ao utilizador. |

| REQ-VID-COMP-026 | O sistema deve confirmar a aceitação ou rejeição de um vídeo para processamento em até 3 segundos após a conclusão da submissão do ficheiro. | Eficiência de Desempenho | ≤ 3 s | ≤ 1 s | Novo | DQ-001 | Dado um vídeo já submetido, quando termina a validação inicial, então o sistema apresenta a aceitação ou rejeição em até 3 segundos no MVP. |

| REQ-VID-COMP-027 | O processamento do vídeo deve ser executado de forma assíncrona, permitindo ao utilizador continuar a utilizar a aplicação enquanto a otimização decorre. | Eficiência de Desempenho / Usabilidade | O processamento não deve bloquear a sessão do utilizador. | Igual ao MVP, com suporte a maior número de processamentos simultâneos. | Novo | DQ-002 | Dado um processamento em curso, quando o utilizador navega para outra área da aplicação, então consegue continuar a utilizá-la sem esperar pela conclusão da otimização. |

| REQ-VID-COMP-028 | O sistema deve apresentar ao utilizador o estado do processamento do vídeo. | Usabilidade | Estados mínimos: em fila, em processamento, concluído, falhado e cancelado. | Estados do MVP mais indicação detalhada de progresso e tempo estimado restante. | Novo | DQ-003 | Dado um trabalho de otimização existente, quando o utilizador consulta o seu estado, então é apresentado um dos estados definidos — em fila, em processamento, concluído, falhado ou cancelado — e este corresponde ao estado real do processamento. |

| REQ-VID-COMP-029 | Durante o processamento, o sistema deve apresentar uma indicação de progresso atualizada pelo menos a cada 5 segundos. | Usabilidade | Atualização ≤ 5 s | Atualização ≤ 2 s e apresentação de tempo estimado restante. | Novo | DQ-004 | Dado um vídeo em processamento, quando a operação permanece ativa durante mais de 5 segundos, então a indicação de progresso é atualizada pelo menos uma vez em cada intervalo de 5 segundos. |

| REQ-VID-COMP-030 | O acesso ao vídeo original e ao respetivo resultado otimizado deve estar restrito ao utilizador proprietário desses ficheiros. | Segurança | Um utilizador autenticado não pode aceder aos vídeos pertencentes a outro utilizador. | Igual ao MVP, complementado com mecanismos adicionais de controlo e auditoria de acessos. | Novo | DQ-005 | Dado um vídeo pertencente ao utilizador A, quando o utilizador B tenta aceder ao original ou ao resultado, então o sistema rejeita o acesso. |

| REQ-VID-COMP-031 | Os ficheiros resultantes da otimização devem permanecer disponíveis durante pelo menos 24 horas após a conclusão do processamento. | Fiabilidade | Disponibilidade mínima de 24 horas após conclusão. | Período configurável de retenção de acordo com o perfil do utilizador. | Novo | DQ-006 | Dado um processamento concluído com sucesso, quando o utilizador acede ao resultado dentro das 24 horas seguintes, então o vídeo permanece disponível. |

| REQ-VID-COMP-032 | O sistema deve manter o estado da operação como “falhado” quando ocorrer uma falha que impeça a conclusão da otimização. | Fiabilidade | Todas as operações interrompidas por erro terminam com estado “falhado”. | Retoma automática para falhas recuperáveis e estado “falhado” apenas quando a retoma não for possível. | Novo | DQ-007 | Dada uma falha durante a otimização, quando o processamento não consegue terminar, então o estado final apresentado é “falhado”. |

| REQ-VID-COMP-033 | A adição futura de novos níveis de qualidade de compressão não deve exigir alterações ao comportamento dos níveis já existentes. | Manutenibilidade | A configuração de um novo nível deve poder ser adicionada sem alterar os resultados dos níveis existentes. | Novas estratégias e ferramentas de vídeo devem poder ser integradas de forma independente das existentes. | Novo | DQ-008 | Dada a introdução de um novo nível de qualidade, quando são executados testes sobre Alta, Equilibrada e Tamanho reduzido, então os seus comportamentos anteriores permanecem inalterados. |

| REQ-VID-COMP-035 | O sistema deve concluir o processamento de compressão em até 1,5 vezes a duração do vídeo, nas condições de referência definidas para o MVP. | Eficiência de Desempenho | ≤ 1,5 × a duração do vídeo. | ≤ 1,0 × a duração do vídeo. | Novo | DQ-009 | Dado um vídeo válido processado no ambiente de referência do MVP, quando a compressão decorre sem contenção anormal de recursos, então o tempo total de processamento não excede 1,5 vezes a duração do vídeo. |

| REQ-VID-COMP-036 | O sistema deve interromper automaticamente uma operação de compressão que exceda o tempo máximo de processamento definido. | Fiabilidade / Eficiência de Desempenho | Timeout de 2 vezes a duração do vídeo, com um mínimo de 60 segundos. | Timeout configurável de acordo com o perfil e infraestrutura. | Novo | DQ-010 | Dada uma operação em processamento, quando o respetivo tempo de execução ultrapassa o timeout definido, então o sistema interrompe a operação, marca-a como falhada e não disponibiliza resultados incompletos. |

#### 4.1.3 Verificação da completude e dos limites do âmbito

| **Tópico a verificar** | **Aplicável?** | **Decisão / justificação** | **Requisito(s) relacionado(s)** |
|-----------------------|---------------|----------------------------|--------------------------------|
| Formato, codec, duração e dimensão do vídeo | Sim | A funcionalidade depende da validação destas propriedades antes do processamento. No MVP são aceites vídeos MP4 com codec H.264 e aplicam-se limites distintos de tamanho e duração conforme o perfil do utilizador. | REQ-VID-COMP-002, REQ-VID-COMP-003, REQ-VID-COMP-004, REQ-VID-COMP-007, REQ-VID-COMP-016, REQ-VID-COMP-017, REQ-VID-COMP-020, REQ-VID-COMP-021, REQ-VID-COMP-022, REQ-VID-COMP-023, REQ-VID-COMP-024 |
| Estado, progresso, cancelamento e resultado | Sim | Como o processamento de vídeo pode ser demorado, o utilizador deve conseguir acompanhar o estado e o progresso da operação, cancelar enquanto esta se encontra em fila ou em processamento e aceder ao resultado quando concluído. | REQ-VID-COMP-011, REQ-VID-COMP-012, REQ-VID-COMP-014, REQ-VID-COMP-027, REQ-VID-COMP-028, REQ-VID-COMP-029 | 
| Falhas durante o processamento | Sim | A funcionalidade deve tratar falhas sem alterar o vídeo original nem disponibilizar resultados incompletos. O estado final da operação deve refletir a falha ocorrida. | REQ-VID-COMP-009, REQ-VID-COMP-018, REQ-VID-COMP-019, REQ-VID-COMP-032 |
| Persistência e expiração dos ficheiros | Sim | O vídeo otimizado deve ser armazenado e permanecer disponível ao utilizador por um período mínimo. Para o MVP definiu-se uma retenção mínima de 24 horas para o resultado processado. | REQ-VID-COMP-010, REQ-VID-COMP-012, REQ-VID-COMP-031 |
| Perfis e contagem de operações | Sim | A funcionalidade mantém os perfis registado e premium já existentes, aplicando limites diferentes a cada perfil. As operações de compressão são integradas no mecanismo de quota diária e pedidos de utilizadores registados sem quota disponível são recusados. | REQ-VID-COMP-007, REQ-VID-COMP-017, REQ-VID-COMP-021, REQ-VID-COMP-022, REQ-VID-COMP-023, REQ-VID-COMP-024, REQ-VID-COMP-025, REQ-VID-COMP-034 |
| Encadeamento de ferramentas e processamento em lote | Não — fora do âmbito | A compressão/otimização de vídeo no MVP é definida como uma operação individual sobre um único vídeo. A integração com o encadeamento de ferramentas e com o processamento em lote poderá ser considerada numa evolução futura, mas não faz parte do âmbito atual. | N/A |
| Tempo máximo de processamento e timeout | Sim | O processamento deve possuir um limite de desempenho verificável e um mecanismo de timeout para impedir operações que permaneçam indefinidamente em execução. | REQ-VID-COMP-035, REQ-VID-COMP-036 |

### 4.2 Impacto no sistema existente

| **Elemento existente afetado** | **Impacto (Manter / Estender / Alterar)** | **Descrição do impacto** | **Requisito(s) relacionado(s)** |
|--------------------------------|-------------------------------------------|--------------------------|---------------------------------|
| Perfis de utilização — Registado e Premium | Estender | Os perfis existentes passam a incluir limites específicos de tamanho e duração para operações de compressão/otimização de vídeo. | REQ-VID-COMP-007, REQ-VID-COMP-017, REQ-VID-COMP-021, REQ-VID-COMP-022, REQ-VID-COMP-023, REQ-VID-COMP-024 |
| Quota diária do utilizador registado | Alterar | A contagem existente de operações passa a considerar cada compressão/otimização que inicie efetivamente o processamento como uma operação; pedidos de utilizadores registados sem quota disponível são recusados antes do início do processamento. | REQ-VID-COMP-025, REQ-VID-COMP-034 |
| Mecanismo de carregamento e validação de ficheiros | Estender | O mecanismo existente passa a suportar ficheiros de vídeo e a validar formato, codec, tamanho e duração antes do processamento. | REQ-VID-COMP-001, REQ-VID-COMP-002, REQ-VID-COMP-003, REQ-VID-COMP-004, REQ-VID-COMP-016, REQ-VID-COMP-020 |
| Armazenamento de ficheiros | Estender | O armazenamento existente passa a suportar vídeos originais e ficheiros resultantes da otimização, incluindo a retenção do resultado durante o período definido. | REQ-VID-COMP-009, REQ-VID-COMP-010, REQ-VID-COMP-031 |
| Disponibilização/exportação de resultados | Estender | O mecanismo existente de disponibilização de resultados passa a suportar ficheiros de vídeo otimizados após a conclusão do processamento. | REQ-VID-COMP-012 |
| Interface de ferramentas | Estender | A interface existente passa a disponibilizar a ferramenta de compressão/otimização e as respetivas opções de qualidade. | REQ-VID-COMP-001, REQ-VID-COMP-005, REQ-VID-COMP-006, REQ-VID-COMP-013 |
| Acompanhamento do processamento | Estender | A interface e os mecanismos de execução passam a suportar a apresentação do estado da operação e do respetivo progresso durante o processamento de vídeo. | REQ-VID-COMP-011, REQ-VID-COMP-027, REQ-VID-COMP-028, REQ-VID-COMP-029, REQ-VID-COMP-032 |
| Controlo de acesso aos ficheiros | Estender | O mecanismo de autorização existente passa a garantir que apenas o proprietário pode aceder ao vídeo submetido e ao resultado otimizado. | REQ-VID-COMP-030 |
| Tratamento de falhas de processamento | Estender | O sistema passa a tratar falhas específicas de processamento de vídeo, impedindo a disponibilização de resultados incompletos e mantendo o estado da operação consistente. | REQ-VID-COMP-018, REQ-VID-COMP-019, REQ-VID-COMP-032 |
| Encadeamento de ferramentas e processamento em lote | Manter | O comportamento existente não é alterado nesta fase, porque a integração da compressão/otimização de vídeo com encadeamento e processamento em lote fica fora do âmbito do MVP atual. | N/A |
| Gestão do tempo de processamento | Estender | O processamento de vídeo passa a possuir um objetivo máximo de duração e um mecanismo de timeout para interromper operações que excedam o limite definido. | REQ-VID-COMP-035, REQ-VID-COMP-036 |

### 4.3 Matriz de Rastreabilidade Atualizada

| **Elemento de origem** | **Descrição abreviada** | **Requisito(s) relacionado(s)** |
|------------------------|-------------------------|---------------------------------|
| Passo 1 | Selecionar a funcionalidade de compressão/otimização | REQ-VID-COMP-001 |
| Passo 2 | Selecionar um ficheiro de vídeo | REQ-VID-COMP-001, REQ-VID-COMP-002 |
| Passo 3 | Validar o vídeo e obter informação sobre formato, tamanho e duração | REQ-VID-COMP-002, REQ-VID-COMP-003, REQ-VID-COMP-004, REQ-VID-COMP-020 |
| Passo 4 | Apresentar as opções de qualidade disponíveis | REQ-VID-COMP-005 |
| Passo 5 | Selecionar o nível de qualidade | REQ-VID-COMP-006 |
| Passo 6 | Validar o perfil e os limites aplicáveis | REQ-VID-COMP-007, REQ-VID-COMP-017, REQ-VID-COMP-021, REQ-VID-COMP-022, REQ-VID-COMP-023, REQ-VID-COMP-024 |
| Passo 7 | Iniciar o processamento | REQ-VID-COMP-008, REQ-VID-COMP-025 |
| Passo 8 | Gerar o vídeo otimizado | REQ-VID-COMP-008, REQ-VID-COMP-009 |
| Passo 9 | Guardar o resultado e informar o utilizador | REQ-VID-COMP-010, REQ-VID-COMP-011 |
| Passo 10 | Disponibilizar o vídeo otimizado | REQ-VID-COMP-012 |
| FA1 | Alterar o nível de qualidade antes da confirmação | REQ-VID-COMP-013 |
| FA2 | Cancelar a operação em fila ou durante o processamento | REQ-VID-COMP-014 |
| FA3 | Substituir o vídeo selecionado | REQ-VID-COMP-015 |
| FA4 | Resultado otimizado maior do que o original | REQ-VID-COMP-008, REQ-VID-COMP-009 |
| Exceção 1 | Formato ou codec não suportado | REQ-VID-COMP-016, REQ-VID-COMP-020 |
| Exceção 2 | Limites do perfil excedidos | REQ-VID-COMP-017, REQ-VID-COMP-021, REQ-VID-COMP-022, REQ-VID-COMP-023, REQ-VID-COMP-024 |
| Exceção 3 | Falha durante o processamento | REQ-VID-COMP-009, REQ-VID-COMP-018, REQ-VID-COMP-032 |
| Exceção 4 | Capacidade insuficiente para concluir o processamento | REQ-VID-COMP-019 |
| Garantia de Sucesso | Criar, armazenar e disponibilizar um vídeo otimizado mantendo o original inalterado | REQ-VID-COMP-008, REQ-VID-COMP-009, REQ-VID-COMP-010, REQ-VID-COMP-012 |
| Exceção 5 | Utilizador registado sem quota diária disponível | REQ-VID-COMP-034 |
| Garantia Mínima | Preservar o original e não disponibilizar resultados incompletos | REQ-VID-COMP-009, REQ-VID-COMP-018 |
| RN1 | Apenas formatos e codecs suportados podem ser processados | REQ-VID-COMP-002, REQ-VID-COMP-016, REQ-VID-COMP-020 |
| RN2 | O vídeo original permanece inalterado | REQ-VID-COMP-009 |
| RN3 | Aplicar limites diferentes consoante o perfil | REQ-VID-COMP-007, REQ-VID-COMP-017, REQ-VID-COMP-021, REQ-VID-COMP-022, REQ-VID-COMP-023, REQ-VID-COMP-024 |
| RN4 | Suportar MP4 com codec H.264 no MVP | REQ-VID-COMP-020 |
| RN5 | Definir os parâmetros dos três níveis de qualidade | REQ-VID-COMP-005, REQ-VID-COMP-006, REQ-VID-COMP-008 |
| RN6 | Apenas resultados completos podem ser disponibilizados | REQ-VID-COMP-012, REQ-VID-COMP-018 |
| RN7 | Contabilizar operações iniciadas na quota diária e recusar pedidos sem quota | REQ-VID-COMP-025, REQ-VID-COMP-034 |
| DQ-001 | Definir um tempo máximo para comunicar o resultado da validação inicial | REQ-VID-COMP-026 |
| DQ-002 | Executar o processamento de forma assíncrona | REQ-VID-COMP-027 |
| DQ-003 | Disponibilizar estados explícitos para acompanhar o processamento | REQ-VID-COMP-028 |
| DQ-004 | Atualizar regularmente a indicação de progresso | REQ-VID-COMP-029 |
| DQ-005 | Restringir o acesso aos vídeos ao respetivo proprietário | REQ-VID-COMP-030 |
| DQ-006 | Definir um período mínimo de retenção do vídeo otimizado | REQ-VID-COMP-031 |
| DQ-007 | Manter um estado consistente quando o processamento falha | REQ-VID-COMP-032 |
| DQ-008 | Permitir evolução dos níveis de qualidade sem alterar os existentes | REQ-VID-COMP-033 |
| DQ-009 | Definir um tempo máximo relativo para o processamento | REQ-VID-COMP-035 |
| DQ-010 | Definir um timeout para operações de compressão | REQ-VID-COMP-036 |

**Decisões de qualidade introduzidas nesta aula**

| **ID** | **Decisão de qualidade** | **Justificação** | **Requisito(s) relacionado(s)** |
|--------|--------------------------|-----------------|---------------------------------|
| DQ-001 | A validação inicial deve comunicar aceitação ou rejeição em até 3 segundos no MVP. | Evita que o utilizador fique sem perceber se o vídeo foi aceite para processamento. | REQ-VID-COMP-026 |
| DQ-002 | O processamento de vídeo deve ser assíncrono. | A compressão pode demorar vários minutos e não deve bloquear a utilização da aplicação. | REQ-VID-COMP-027 |
| DQ-003 | O processamento deve possuir estados explícitos: em fila, em processamento, concluído, falhado e cancelado. | Permite ao utilizador acompanhar operações que não são instantâneas e distinguir operações canceladas das concluídas ou falhadas. | REQ-VID-COMP-028 |
| DQ-004 | A indicação de progresso deve ser atualizada pelo menos a cada 5 segundos no MVP. | Dá feedback regular ao utilizador durante operações demoradas. | REQ-VID-COMP-029 |
| DQ-005 | Apenas o proprietário pode aceder ao vídeo original e ao resultado otimizado. | Os vídeos submetidos são dados do utilizador e não devem ficar acessíveis a outros utilizadores. | REQ-VID-COMP-030 |
| DQ-006 | O resultado otimizado deve permanecer disponível durante pelo menos 24 horas no MVP. | Dá ao utilizador um período mínimo previsível para aceder ao resultado. | REQ-VID-COMP-031 |
| DQ-007 | Uma operação que não termine devido a erro deve assumir o estado “falhado” no MVP. | Evita estados ambíguos e permite distinguir operações concluídas de operações interrompidas. | REQ-VID-COMP-032 |
| DQ-008 | A introdução de novos níveis de qualidade não deve alterar o comportamento dos níveis já existentes. | Facilita a evolução futura da funcionalidade e reduz o impacto de alterações. | REQ-VID-COMP-033 |
| DQ-009 | O processamento de compressão deve concluir em até 1,5 vezes a duração do vídeo no ambiente de referência do MVP. | Define um limite mensurável para avaliar o desempenho da funcionalidade. | REQ-VID-COMP-035 |
| DQ-010 | Uma operação de compressão que ultrapasse 2 vezes a duração do vídeo, com um mínimo de 60 segundos, deve ser interrompida automaticamente. | Evita que operações fiquem indefinidamente em execução e estabelece um comportamento verificável para situações de bloqueio. | REQ-VID-COMP-036 |

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

---
