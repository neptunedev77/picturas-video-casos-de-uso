# 📝 Exercício 1 — Template de Entrega
### Casos de Uso · Fase 1: Suporte a Vídeo no PictuRAS


---

## 0. Identificação

| **Campo** | **Valor** |
|-----------|-----------|
| **Grupo / Equipa** | 25 |
| **Autores** | António Sousa (PG63923)  |
| **Data** | 2026-10-05 |
| **Versão do documento** | v1.0 |
| **Unidade Curricular** | Requisitos e Arquiteturas de Software — MEI, Universidade do Minho |

---

## 1. Funcionalidade de vídeo escolhida

| **Campo** | **Valor** |
|-----------|-----------|
| **Funcionalidade** | Pré-visualização de pipeline em vídeo (por amostragem de fotogramas) |
| **Perfil(s) de utilizador abrangido(s)** | Utilizador registado, nos planos free e premium. Ambos processam vídeos com consumo de quota diária, por isso ambos beneficiam de validar o resultado antes de o gastar. |

**Justificação no contexto do MVP**

O processamento de vídeo aplica cada ferramenta a milhares de fotogramas, pelo que um pipeline mal configurado desperdiça quota diária e tempo de fila. A pré-visualização sobre 5 a 10 fotogramas representativos deixa o utilizador validar o resultado a baixo custo antes de confirmar. Sem esta funcionalidade, o MVP não valida a ligação entre o pipeline de ferramentas de imagem já existente e o vídeo, nem a estimativa de custo e de tempo que o processamento completo exige.

---

### 2.1 Cabeçalho

| **Secção** | **Detalhes** |
|------------|--------------|
| **ID do Caso de Uso** | UC-VID-001 |
| **Nome** | Pré-visualizar Pipeline antes de Processar um Vídeo |
| **Versão** | v1.0 |
| **Autor** | António Sousa |
| **Data** | 2026-10-05 |
| **Objetivo** | Permitir ao utilizador validar o resultado de um pipeline de ferramentas aplicado a uma amostra de 5 a 10 fotogramas representativos do vídeo, e conhecer a estimativa de tempo e de consumo de quota do processamento completo, antes de decidir se o confirma. |
| **Âmbito** | Módulo de vídeo do PictuRAS: pipeline de ferramentas, quota e fila de processamento |
| **Ator Principal** | Utilizador registado (plano free ou premium) |
| **Stakeholders e Interesses** | - **Utilizador**: quer avaliar o resultado do pipeline sem gastar quota nem esperar pelo processamento completo<br>- **Proprietário do Sistema**: pretende reduzir processamentos completos desnecessários e o consumo de recursos computacionais<br>- **Equipa de Desenvolvimento**: valida a aplicação do pipeline de imagem a fotogramas de vídeo e a estimativa de custo antes de investir no processamento completo |
| **Pré-condições** | - O utilizador tem sessão iniciada<br>- O vídeo já foi submetido com sucesso e está disponível ao utilizador<br>- O utilizador definiu um pipeline com pelo menos uma ferramenta |
| **Trigger** | O utilizador, com um vídeo e um pipeline definidos, escolhe a opção **Pré-visualizar** |

### 2.2 Fluxo Principal

| **Passo** | **Ação do Ator** | **Resposta do Sistema** |
|-----------|------------------|-------------------------|
| 1 | O utilizador abre um projeto e seleciona um vídeo | Apresenta o vídeo e o pipeline de ferramentas definido para o projeto |
| 2 | O utilizador define ou ajusta o pipeline (ferramentas e respetivos parâmetros) | Valida que todas as ferramentas do pipeline são aplicáveis a fotogramas de vídeo |
| 3 | O utilizador escolhe **Pré-visualizar**, seleciona o modo de amostragem (intervalo regular ou mudanças de cena) e o número de fotogramas (5 a 10) | — |
| 4 | — | Valida o vídeo, o pipeline e os parâmetros de amostragem |
| 5 | — | Seleciona os fotogramas representativos de acordo com o modo de amostragem escolhido |
| 6 | — | Aplica o pipeline a cada fotograma selecionado e mostra o progresso em tempo real |
| 7 | — | Calcula, a partir da amostra, a estimativa de tempo e de consumo de quota do processamento completo |
| 8 | — | Apresenta cada fotograma original e processado lado a lado, com as estimativas de tempo e de quota |
| 9 | O utilizador analisa o resultado e escolhe **Processar vídeo completo** | — |
| 10 | — | Verifica que a quota disponível cobre o custo estimado, regista o pedido e coloca o processamento na fila, informando o utilizador de que pode acompanhar o progresso |
### 2.3 Fluxos Alternativos

| **Fluxo** | **Descrição** |
|-----------|---------------|
| **FA1 – Ajustar o pipeline** | No passo 9, o utilizador não está satisfeito com o resultado e altera as ferramentas ou os parâmetros do pipeline → O fluxo regressa ao passo 2, mantendo o vídeo e os parâmetros de amostragem |
| **FA2 – Alterar a amostragem** | No passo 9, o utilizador pretende ver o pipeline noutros fotogramas e altera o modo de amostragem ou o número de fotogramas → O fluxo regressa ao passo 3 |
| **FA3 – Vídeo com poucas mudanças de cena** | No passo 5, em modo de mudanças de cena, o sistema deteta menos mudanças do que o número de fotogramas pedido → O sistema informa o utilizador e completa a amostra com fotogramas a intervalos regulares |
| **FA4 – Vídeo com poucos fotogramas** | No passo 5, o vídeo tem menos fotogramas do que o número pedido → O sistema usa todos os fotogramas disponíveis e informa o utilizador do número efetivo |
| **FA5 – Cancelar a pré-visualização** | Durante o passo 6, o utilizador cancela a pré-visualização → O sistema interrompe o processamento, descarta os resultados parciais e regressa ao estado anterior ao passo 3 |
| **FA6 – Não confirmar o processamento** | No passo 9, o utilizador sai sem escolher **Processar vídeo completo** → O sistema termina o caso de uso sem criar qualquer pedido de processamento |

### 2.4 Exceções

| **Condição** | **Comportamento do Sistema** |
|--------------|------------------------------|
| O ficheiro de vídeo está corrompido, ilegível ou utiliza um formato ou codec não suportado | Apresenta o erro "Não foi possível ler este vídeo" e não executa a pré-visualização |
| O pipeline contém uma ferramenta não aplicável a vídeo | Indica a ferramenta e o motivo, não executa a pré-visualização e mantém o pipeline editável |
| O utilizador excedeu o limite diário de pré-visualizações (RN2) | Informa que o limite foi atingido e não executa a pré-visualização |
| Uma ferramenta falha em alguns fotogramas da amostra | Apresenta os fotogramas processados com sucesso, assinala os que falharam e indica que a estimativa é aproximada |
| Uma ferramenta falha em todos os fotogramas da amostra | Apresenta o erro "Não foi possível gerar a pré-visualização. Tente novamente.", não apresenta estimativas e mantém o pipeline inalterado |
| A ligação em tempo real é interrompida durante a pré-visualização | Informa o utilizador da interrupção e apresenta o estado da pré-visualização quando a ligação for restabelecida |
| No momento de confirmar o processamento, a quota disponível é inferior ao custo estimado | Informa o utilizador da quota disponível e do custo estimado e não coloca o processamento completo em fila |

### 2.5 Pós-condições

| **Tipo** | **Resultado** |
|----------|---------------|
| **Garantia de Sucesso** | O utilizador visualiza a pré-visualização do pipeline aplicada aos fotogramas selecionados e recebe a estimativa do tempo de processamento e do consumo de quota para o vídeo completo; o vídeo original e o pipeline mantêm-se inalterados |
| **Garantia Mínima** | O vídeo original e o pipeline mantêm-se inalterados; não é criado qualquer pedido de processamento completo e é apresentada uma mensagem de erro ou informação sobre o motivo pelo qual a pré-visualização não foi concluída |

### 2.6 Regras de Negócio e Restrições

| **ID** | **Regra** |
|--------|-----------|
| **RN1** | A pré-visualização é realizada sobre uma amostra de 5 a 10 fotogramas representativos do vídeo |
| **RN2** | O utilizador está sujeito a um limite diário de pré-visualizações, definido de acordo com o seu perfil |
| **RN3** | A pré-visualização aplica o pipeline configurado aos fotogramas selecionados, sem alterar o vídeo original |
| **RN4** | A pré-visualização apresenta uma estimativa do tempo de processamento e do consumo de quota para o processamento completo do vídeo |
| **RN5** | O processamento completo do vídeo só é colocado em fila após confirmação explícita do utilizador |
| **RN6** | A pré-visualização não é contabilizada na quota diária de operações do perfil do utilizador; está sujeita apenas ao limite diário de pré-visualizações (RN2) |

### 2.7 Assunções

| **ID** | **Assunção** |
|--------|--------------|
| A1 | O vídeo pertence a um projeto do utilizador, tal como as imagens, e está integralmente armazenado e acessível ao serviço no momento do pedido |
| A2 | As ferramentas de imagem existentes podem ser aplicadas a fotogramas isolados extraídos do vídeo, sem alterações ao seu funcionamento |
| A3 | A extração e o processamento de uma amostra de 5 a 10 fotogramas é suficientemente rápida para o utilizador aguardar pelo resultado, acompanhando o progresso em tempo real |
| A4 | Uma amostra de 5 a 10 fotogramas é suficientemente representativa do vídeo para o utilizador avaliar o resultado do pipeline |
| A5 | A estimativa de tempo e de consumo de quota pode ser calculada com base no processamento da amostra e nas características do vídeo (duração e número de fotogramas) |
| A6 | Quando uma ferramenta falha apenas em alguns fotogramas, a pré-visualização é apresentada com os fotogramas processados com sucesso, e não anulada por completo |
| A7 | O utilizador acompanha o progresso da pré-visualização através de uma ligação em tempo real (WebSocket) |

### 2.8 Questões em Aberto

| **ID** | **Questão** |
|--------|-------------|
| Q1 | O que conta como "operação" para efeitos de quota: uma execução de pipeline, uma ferramenta ou uma imagem? |
| Q2 | Qual deve ser o limite diário de pré-visualizações por perfil (RN2)? |
| Q3 | Qual é o limite diário de operações do plano premium: ilimitado ou outro valor? |
| Q4 | O perfil anónimo deve ter acesso a esta funcionalidade? |
| Q5 | O vídeo deve ser armazenado no mesmo serviço de armazenamento (MinIO) das imagens ou numa solução distinta? |
| Q6 | O processamento da pré-visualização deve continuar no servidor se a ligação em tempo real for interrompida, recuperando o estado quando for restabelecida? |
| Q7 | Devem existir limites de duração ou de tamanho de vídeo para a pré-visualização, de acordo com o perfil do utilizador? |

---

## 3. Utilização de agentes de IA


| **Ferramenta / *skill*** | **Tarefa apoiada** | **Validação realizada pela equipa** |
|--------------------------|--------------------|--------------------------------------|
| Claude (Anthropic) | Primeira versão das secções do caso de uso (2.1 a 2.8) | Revisão manual integral de todo o conteúdo; ajustes para refletir a funcionalidade e as características reais do projeto PictuRAS; confronto com o README do repositório; assunções e questões em aberto assinaladas sempre que o comportamento do sistema não pôde ser confirmado |

---

## ✅ Lista de verificação antes de entregar (Exercício 1)

- [ ] Secções 0 a 3 preenchidas e texto de ajuda (`>` e `{…}`) removido.
- [ ] Funcionalidade de vídeo escolhida **e justificada** no contexto do MVP.
- [ ] Ator principal identificado, com o respetivo perfil.
- [ ] Caso de uso com fluxo principal, **≥1 fluxo alternativo** e **≥1 exceção específica de vídeo**.
- [ ] Pós-condições com garantia de sucesso **e** garantia mínima.
- [ ] Regras de negócio e restrições preenchidas.
- [ ] Assunções e questões em aberto registadas.
- [ ] Utilização de agentes de IA documentada.

---
---

## 4. Esboço de requisitos derivados

> ⛔ **Não preencher no Exercício 1.** Esta secção será trabalhada na aula seguinte, a partir do caso de uso das secções 2.1 a 2.8. Fica aqui para que conheçam o passo seguinte — veja a secção com o mesmo nome no exemplo de vídeo.

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
