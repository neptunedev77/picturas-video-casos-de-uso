# 📝 Exercício 1 — Template de Entrega
### Casos de Uso · Fase 1: Suporte a Vídeo no PictuRAS

## 0. Identificação

| **Campo** | **Valor** |
|-----------|-----------|
| **Grupo / Equipa** | 25 |
| **Autores** |António Sousa (PG63923),Bruno Vale(pg63926), Bruno Sousa (63927), Diogo Henrique Freitas Macedo (pg63947), |
| **Data** | 2026-10-05 |
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
| **ID do Caso de Uso** | UC-VID-003 |
| **Nome** | Anonimizar Rostos e Matrículas em Vídeo |
| **Versão** | v1.0 |
| **Autor** | Diogo Macedo |
| **Data** | 2026-10-05 |
| **Objetivo** | Permitir ao utilizador detetar automaticamente elementos sensíveis (rostos de pessoas e matrículas de veículos) ao longo de todo o vídeo e aplicar uma máscara de desfocagem (*blur*) ou mosaico (*pixelate*), obtendo uma versão anonimizada em conformidade com normas de privacidade. |
| **Âmbito** | Módulo de processamento avançado de vídeo do PictuRAS, serviços de visão por computador (IA), mensageria assíncrona e gestão de projetos. |
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
| 6 | — | O worker de IA retira a mensagem da fila, descodifica os fotogramas, executa o modelo de deteção e rastreamento (*tracking*) dos

## 3. Utilização de agentes de IA

| **Ferramenta / *skill*** | **Tarefa apoiada** | **Validação realizada pela equipa** |
|--------------------------|--------------------|--------------------------------------|
| ChatGPT / Gemini | Esboço inicial do caso de uso e sugestão de fluxos alternativos e exceções. | Leitura e revisão manual pela equipa, ajustando as regras e limites ao contexto do projeto. |

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