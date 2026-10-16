# 📝 Exercício 1 — Template de Entrega

### Casos de Uso · Fase 1: Suporte a Vídeo no PictuRAS

---

## 0. Identificação

| **Campo** | **Valor** |
|-----------|-----------|
| **Grupo / Equipa** | 25 |
| **Autores** | Bruno Vale (PG63926); Bruno Sousa (PG63927); António Sousa (PG63923); Diogo Macedo (PG63947) |
| **Data** | 2026-10-05 |
| **Versão do documento** | v1.0 |
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
| **Versão** | v1.0 |
| **Autor** | Bruno Vale |
| **Data** | 2026-10-05 |
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
| **Q2** | O sistema deverá detetar automaticamente o idioma ou apenas permitir seleção manual? |
| **Q3** | Que formato de legendas deve ser disponibilizado: SRT, WebVTT ou ambos? |
| **Q4** | O utilizador poderá editar manualmente as legendas antes de guardar o resultado? |
| **Q5** | As legendas deverão poder ser incorporadas diretamente no vídeo ou apenas disponibilizadas como ficheiro separado? |
| **Q6** | Qual será o tamanho máximo permitido para o vídeo? |
| **Q7** | Qual será a duração máxima permitida para o vídeo? |
| **Q8** | O utilizador registado (gratuito) e o utilizador premium terão limites diferentes para esta operação? |
| **Q9** | O perfil anónimo deverá ter acesso à geração automática de legendas? |
| **Q10** | Uma operação que falha durante o reconhecimento de fala deve consumir quota? |
| **Q11** | Como deve o sistema tratar segmentos de áudio sem fala ou com fala impossível de reconhecer? |
| **Q12** | O utilizador deve conseguir acompanhar o progresso do reconhecimento de fala em tempo real? |

---

## 3. Utilização de agentes de IA

| **Ferramenta / *skill*** | **Tarefa apoiada** | **Validação realizada pela equipa** |
|--------------------------|--------------------|--------------------------------------|
| **ChatGPT** | Apoio na criação da primeira versão do caso de uso UC-VID-004, incluindo fluxo principal, fluxos alternativos, exceções, pós-condições, regras de negócio, assunções e questões em aberto. | Revisão manual integral realizada pela equipa, com comparação com o template fornecido pelos docentes, o enunciado da Fase 1 e os restantes casos de uso do grupo. Foram revistos o fluxo principal, os fluxos alternativos, as exceções, as regras de negócio, as assunções e as questões em aberto, mantendo como assunções ou questões em aberto os elementos cujo comportamento ainda não está confirmado. |

---

## ✅ Lista de verificação antes de entregar (Exercício 1)

- [x] Secções 0 a 3 preenchidas e texto de ajuda (`>` e `{…}`) removido.
- [x] Funcionalidade de vídeo escolhida e justificada no contexto do MVP.
- [x] Ator principal identificado, com o respetivo perfil.
- [x] Caso de uso com fluxo principal, **≥1 fluxo alternativo** e **≥1 exceção específica de vídeo**.
- [x] Pós-condições com garantia de sucesso e garantia mínima.
- [x] Regras de negócio e restrições preenchidas.
- [x] Assunções e questões em aberto registadas.
- [x] Utilização de agentes de IA documentada.

