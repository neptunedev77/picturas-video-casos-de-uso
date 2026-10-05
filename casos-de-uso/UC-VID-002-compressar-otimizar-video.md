# 📝 Exercício 1 — Template de Entrega
### Casos de Uso · Fase 1: Suporte a Vídeo no PictuRAS

---

## 0. Identificação

| **Campo** | **Valor** |
|-----------|-----------|
| **Grupo / Equipa** | 25 |
| **Autores** | Bruno Sousa PG63927, Bruno Vale PG63926, Diogo Macedo PG63947, António Sousa PG63923 |
| **Data** | 2026-10-05 |
| **Versão do documento** | v1.0 |
| **Unidade Curricular** | Requisitos e Arquiteturas de Software — MEI, Universidade do Minho |

---

## 1. Funcionalidade de vídeo escolhida

| **Campo** | **Valor** |
|-----------|-----------|
| **Funcionalidade** | Compressão/Otimização de vídeo com escolha de qualidade |
| **Perfil(s) de utilizador abrangido(s)** | Utilizador registado e utilizador premium. Ambos podem utilizar a funcionalidade, podendo existir diferenças nos limites de tamanho, duração ou opções de qualidade disponíveis consoante o perfil. |

**Justificação no contexto do MVP** *(2–3 linhas)*

A compressão e otimização de vídeo permite reduzir o tamanho dos ficheiros mantendo uma qualidade adequada às necessidades do utilizador. No contexto do MVP, esta funcionalidade permite validar operações essenciais de suporte a vídeo, como carregamento, análise, escolha de parâmetros, processamento e geração de um novo ficheiro.

---

## 2. Caso de Uso

### 2.1 Cabeçalho

| **Secção** | **Detalhes** |
|------------|--------------|
| **ID do Caso de Uso** | UC-VID-2 |
| **Nome** | Comprimir/Otimizar vídeo |
| **Versão** | v1.0 |
| **Autor** | Bruno Sousa  |
| **Data** | 2026-10-05 |
| **Objetivo** | Permitir ao utilizador reduzir o tamanho de um vídeo através da escolha de um nível de qualidade, obtendo uma nova versão otimizada do ficheiro. |
| **Âmbito** | Módulo de processamento de vídeo do PictuRAS |
| **Ator Principal** | Utilizador registado ou premium |
| **Stakeholders e Interesses** | - **Utilizador**: pretende reduzir o tamanho do vídeo mantendo um nível de qualidade adequado e obter um ficheiro utilizável após o processamento.<br>- **PictuRAS**: pretende garantir que apenas ficheiros válidos são processados, respeitando os limites definidos e evitando resultados incompletos ou inválidos |
| **Pré-condições** | -O utilizador encontra-se autenticado.<br>-O utilizador possui acesso à funcionalidade de otimização de vídeo.<br>- O sistema encontra-se disponível para receber e processar ficheiros de vídeo. |
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
| 8 | — | Geras uma nova versão otimizada do vídeo de acordo com a qualidade escolhida |
| 9 | — | Guarda o resultado do processamento e informa o utilizador de que a operação foi concluída |
| 10 | Solicita o acesso ao resultado | Disponibiliza o vídeo otimizado ao utilizador |

### 2.3 Fluxos Alternativos

| **Fluxo** | **Descrição** |
|-----------|---------------|
| FA1 – Alterar nível de qualidade | Antes de confirmar a operação, o utilizador decide escolher outro nível de qualidade. O sistema atualiza a opção selecionada e apresenta os parâmetros correspondentes, regressando depois ao passo de confirmação |
| FA2 – Cancelar operação | Antes do início do processamento, o utilizador seleciona a opção de cancelar. O sistema termina a operação, não gera nenhum novo vídeo e mantém o ficheiro original inalterado |
| FA2 – Selecionar outro vídeo | Antes de confirmar o processamento, o utilizador decide substituir o vídeo selecionado. O sistema descarta a seleção atual e permite escolher um novo ficheiro, repetindo posteriormente a respetiva validação |

### 2.4 Exceções

| **Condição** | **Comportamento do Sistema** |
|--------------|------------------------------|
| O formato ou codec do vídeo não é suportado. | O sistema rejeita o ficheiro, informa o utilizador de que o vídeo não pode ser processado e apresenta, quando aplicável, os formatos suportados |
| O ficheiro excede os limites permitidos para o perfil do utilizador | O sistema impede o início do processamento e informa o utilizador de que o vídeo ultrapassa os limites definidos para o seu perfil |
| Ocorre uma falha durante o processamento do vídeo. | O sistema interrompe a operação, não disponibiliza resultados incompletos e mantém o vídeo original inalterado |
| Não existe espaço ou capacidade suficiente para concluir o processamento. | O sistema cancela a operação e informa o utilizador de que não foi possível concluir a otimização |


### 2.5 Pós-condições

| **Tipo** | **Resultado** |
|----------|---------------|
| Garantia de Sucesso | É criada uma nova versão otimizada do vídeo de acordo com o nível de qualidade escolhido. O ficheiro resultante fica disponível ao utilizador e o vídeo original permanece inalterado. |
| Garantia Mínima |Em caso de falha, o vídeo original permanece inalterado e nenhum ficheiro incompleto ou inválido é disponibilizado como resultado da operação |

### 2.6 Regras de Negócio e Restrições

| **ID** | **Regra** |
|--------|-----------|
| RN1 | Apenas vídeos em formatos e codecs suportados pelo sistema podem ser processados |
| RN2 | O vídeo original não deve ser alterado ou substituído durante o processo de otimização |
| RN3 | O utilizador apenas pode processar vídeos que respeitem os limites associados ao seu perfil |
| RN4 | O nível de qualidade selecionado deve corresponder a uma configuração de otimização suportada pelo sistema |
| RN5 | Apenas vídeos cujo processamento tenha sido concluído com sucesso podem ser disponibilizados ao utilizador como resultado final. |
| RN6 | As opções ou limites da funcionalidade podem variar consoante o perfil do utilizador. |

### 2.7 Assunções

| **ID** | **Assunção** |
|--------|--------------|
| A1 | Assume-se que o PictuRAS já possui um mecanismo de carregamento de ficheiros de vídeo |
| A2 | Assume-se que o sistema consegue identificar informação básica do vídeo, nomeadamente o seu formato, duração e tamanho |
| A3 | Assume-se que o processo de otimização gera um novo ficheiro e não substitui o vídeo original |
| A4 | Assume-se que existem diferentes níveis de qualidade/otimização disponíveis para escolha do utilizador |
| A5 | Assume-se que o sistema consegue verificar os limites aplicáveis ao perfil do utilizador antes de iniciar o processamento |

### 2.8 Questões em Aberto

| **ID** | **Questão** |
|--------|-------------|
| Q1 | Quais são os formatos e codecs de vídeo suportados pelo PictuRAS? |
| Q2 | Qual é o tamanho máximo permitido para um ficheiro de vídeo? |
| Q3 | Existe uma duração máxima permitida para os vídeos? |
| Q4 | Os limites de tamanho e duração variam entre utilizadores registados e premium? |
| Q5 | Quais serão os níveis de qualidade disponibilizados ao utilizador? |
| Q6 | O sistema deve apresentar uma estimativa do tamanho final do vídeo antes do processamento? |
| Q7 | Durante quanto tempo será armazenado o vídeo otimizado? |
| Q8 | O processamento do vídeo será realizado de forma síncrona ou em segundo plano? |

---

## 3. Utilização de agentes de IA

| **Ferramenta / *skill*** | **Tarefa apoiada** | **Validação realizada pela equipa** |
|--------------------------|--------------------|--------------------------------------|
| ChatGPT | Apoio na interpretação da estrutura do template e na escolha de uma funcionalidade de vídeo com complexidade adequada. | A equipa comparou as sugestões com o template disponibilizado pelo docente e decidiu quais eram adequadas ao contexto do PictuRAS. |

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
