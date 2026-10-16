# 📝 Exercício 1 — Template de Entrega
### Casos de Uso · Fase 1: Suporte a Vídeo no PictuRAS


---

## 0. Identificação

| **Campo** | **Valor** |
|-----------|-----------|
| **Grupo / Equipa** | 25 |
| **Autores** | António Sousa (PG63923), Bruno Sousa (63927), Bruno Vale (63926), Diogo Macedo (PG63947) |
| **Data** | 2026-10-15 |
| **Versão do documento** | v1.1 |
| **Unidade Curricular** | Requisitos e Arquiteturas de Software — MEI, Universidade do Minho |

---

## 1. Funcionalidade de vídeo escolhida

| **Campo** | **Valor** |
|-----------|-----------|
| **Funcionalidade** | Remoção de silêncios e pausas em vídeo, com revisão manual dos cortes |
| **Perfil(s) de utilizador abrangido(s)** | Utilizador registado, nos planos free e premium. No plano free, cada aplicação de cortes conta para a quota diária de operações e existem limites de duração do vídeo; no plano premium, a utilização é ilimitada e os limites de duração são superiores. |

**Justificação no contexto do MVP**

Quem grava aulas, podcasts em vídeo, tutoriais ou reuniões perde muito tempo a cortar pausas e silêncios à mão, e esta é uma das funcionalidades mais pedidas em editores de vídeo. No MVP, permite validar um fluxo completo sobre vídeo: analisar o áudio, mostrar ao utilizador os troços que seriam removidos para que os possa rever e corrigir, e gerar um novo vídeo mais curto com som e imagem sincronizados. Como a análise não gasta quota e só a aplicação dos cortes conta como operação, o utilizador só paga por um resultado que confirmou.

---

### 2.1 Cabeçalho

| **Secção** | **Detalhes** |
|------------|--------------|
| **ID do Caso de Uso** | UC-VID-001 |
| **Nome** | Remover silêncios e pausas de um vídeo |
| **Versão** | v1.0 |
| **Autor** | António Sousa |
| **Data** | 2026-10-05 |
| **Objetivo** | Permitir ao utilizador detetar automaticamente os silêncios e pausas de um vídeo, rever e ajustar os troços a remover e obter uma nova versão do vídeo, mais curta, sem esses troços. |
| **Âmbito** | Módulo de vídeo do PictuRAS: análise do áudio, revisão dos cortes, processamento do vídeo, quota e fila de processamento |
| **Ator Principal** | Utilizador registado (plano free ou premium) |
| **Stakeholders e Interesses** | - **Utilizador (criador de conteúdo)**: quer encurtar o vídeo sem ter de cortar manualmente cada pausa, mas sem perder pausas intencionais, momentos com música ou falas mais baixas<br>- **Proprietário do Sistema**: pretende oferecer uma funcionalidade muito procurada e com baixo custo de processamento, que incentive o registo e a subscrição premium<br>- **Equipa de Desenvolvimento**: valida o processamento de áudio em vídeo, a revisão manual de um resultado intermédio e a manutenção da sincronização entre som e imagem depois dos cortes |
| **Pré-condições** | - O utilizador tem sessão iniciada<br>- O vídeo já foi submetido com sucesso e está disponível no projeto do utilizador<br>- O vídeo tem som |
| **Trigger** | O utilizador, com um vídeo selecionado, escolhe a opção **Remover silêncios** |

### 2.2 Fluxo Principal

| **Passo** | **Ação do Ator** | **Resposta do Sistema** |
|-----------|------------------|-------------------------|
| 1 | O utilizador abre um projeto e seleciona um vídeo | Apresenta o vídeo, a sua duração e as operações diárias que o utilizador ainda tem disponíveis |
| 2 | O utilizador escolhe **Remover silêncios** | Apresenta as opções de deteção com valores sugeridos: sensibilidade ao silêncio, duração mínima de uma pausa para ser removida, margem a manter antes e depois da fala e indicação de que o vídeo tem música de fundo. Disponibiliza também três perfis pré-definidos (Suave, Equilibrado e Agressivo) |
| 3 | O utilizador ajusta as opções, ou mantém as sugeridas, e escolhe **Analisar** | Valida o vídeo, o seu som, a duração permitida para o perfil do utilizador e as opções escolhidas |
| 4 | — | Analisa o áudio do vídeo, identifica os troços de silêncio e mostra o progresso da análise |
| 5 | — | Apresenta os resultados: a linha temporal do áudio com os troços a remover assinalados, a lista desses troços (início, fim e duração) e a poupança prevista (duração original, duração final e tempo removido) |
| 6 | O utilizador revê os troços: ouve cada um, desmarca os que quer manter e ajusta o início ou o fim dos que entender | Atualiza a marcação na linha temporal e a poupança prevista a cada alteração |
| 7 | O utilizador escolhe **Aplicar cortes** | Verifica que existe pelo menos um troço selecionado e que o utilizador tem quota disponível, regista a operação e coloca o processamento na fila |
| 8 | — | Mostra o estado e o progresso do processamento, com a opção de cancelar sempre visível |
| 9 | — | Remove os troços selecionados do som e da imagem ao mesmo tempo, suaviza as passagens entre troços para não se ouvirem cortes bruscos e gera o novo vídeo |
| 10 | — | Confirma que o som e a imagem do novo vídeo estão sincronizados e guarda-o no projeto |
| 11 | O utilizador consulta o resultado | Apresenta o novo vídeo para reprodução e transferência, juntamente com a comparação entre a duração original e a final. O vídeo original mantém-se inalterado |

### 2.3 Fluxos Alternativos

| **Fluxo** | **Descrição** |
|-----------|---------------|
| **FA1 – Utilizador premium** | No passo 7, o sistema verifica que o utilizador é premium → O processamento é colocado em fila com prioridade e não é descontada nenhuma operação da quota |
| **FA2 – Nenhum silêncio encontrado** | No passo 4, o sistema não encontra troços que cumpram as opções escolhidas → Informa o utilizador, sugere um perfil mais agressivo e termina sem gastar quota |
| **FA3 – Repetir a análise com outras opções** | No passo 6, o utilizador não está satisfeito com os troços encontrados e altera as opções de deteção → O sistema avisa que os ajustes manuais feitos serão perdidos e, após confirmação, o fluxo regressa ao passo 3 |
| **FA4 – Manter todos os troços** | No passo 6, o utilizador desmarca todos os troços → A opção **Aplicar cortes** fica indisponível e o caso de uso termina sem gastar quota se o utilizador sair |
| **FA5 – Retomar a revisão mais tarde** | No passo 6, o utilizador sai sem aplicar os cortes → O sistema guarda a revisão feita e, quando o utilizador voltar a abrir a ferramenta no mesmo vídeo, apresenta-a sem ser preciso analisar de novo |
| **FA6 – Cancelar a análise** | Durante o passo 4, o utilizador cancela → O sistema interrompe a análise, descarta os resultados parciais e regressa ao passo 2 |
| **FA7 – Cancelar o processamento** | Durante os passos 8 a 10, o utilizador cancela → O sistema interrompe o processamento, devolve a operação à quota, mantém o vídeo original e regressa ao passo 6 com a revisão intacta |
| **FA8 – Remoção de grande parte do vídeo** | No passo 7, os troços selecionados representam mais de 80% da duração do vídeo → O sistema pede ao utilizador que confirme antes de colocar o processamento na fila |

### 2.4 Exceções

| **Condição** | **Comportamento do Sistema** |
|--------------|------------------------------|
| O vídeo não tem som | Informa que não é possível detetar silêncios num vídeo sem som e não executa a análise |
| O ficheiro de vídeo está corrompido, ilegível ou usa um formato não suportado | Apresenta o erro "Não foi possível ler este vídeo" e não executa a análise |
| O vídeo excede a duração, a resolução ou o tamanho permitidos para o perfil do utilizador (RN2, RN9) | Indica o limite do perfil que foi excedido e o valor do vídeo e não executa a análise |
| O utilizador atingiu o limite diário de análises (RN6) | Informa que o limite foi atingido e não executa a análise; as revisões já guardadas continuam acessíveis |
| No momento de aplicar os cortes, o utilizador não tem quota disponível | Informa que o limite diário de operações foi atingido e guarda a revisão para poder aplicar os cortes mais tarde |
| Quase todo o áudio é considerado silêncio (por exemplo, sensibilidade mal ajustada ou vídeo só com ruído de fundo) | Não propõe cortes, informa que as opções podem não ser adequadas a este vídeo e sugere um perfil mais suave |
| O processamento falha ou demora mais do que o tempo máximo previsto | Interrompe o processamento, devolve a operação à quota, mantém o vídeo original e informa o utilizador |
| O novo vídeo fica com o som desfasado da imagem | Não disponibiliza o resultado, devolve a operação à quota e informa o utilizador de que o processamento não foi concluído |
| A ligação em tempo real é interrompida durante a análise ou o processamento | O processamento continua no servidor e o estado atualizado é apresentado quando a ligação for restabelecida |

### 2.5 Pós-condições

| **Tipo** | **Resultado** |
|----------|---------------|
| **Garantia de Sucesso** | É criado um novo vídeo sem os troços confirmados pelo utilizador, com som e imagem sincronizados e sem cortes bruscos audíveis; o novo vídeo fica guardado no projeto, o utilizador vê o tempo poupado e o vídeo original mantém-se inalterado |
| **Garantia Mínima** | O vídeo original mantém-se inalterado; não é disponibilizado nenhum vídeo incompleto ou desfasado; qualquer operação descontada num processamento que não terminou é devolvida à quota e é apresentada uma mensagem com o motivo |

### 2.6 Regras de Negócio e Restrições

| **ID** | **Regra** |
|--------|-----------|
| **RN1** | Cada aplicação de cortes concluída conta como uma operação na quota diária do plano free; no plano premium não há limite |
| **RN2** | No plano free, só podem ser processados vídeos até 2 minutos; no plano premium, até 30 minutos |
| **RN3** | Os cortes só são aplicados depois de o utilizador rever os troços e confirmar explicitamente |
| **RN4** | Os troços são removidos ao mesmo tempo do som e da imagem, para que o novo vídeo se mantenha sincronizado |
| **RN5** | A remoção de silêncios gera sempre um novo vídeo, sem alterar o original |
| **RN6** | A análise não conta para a quota diária de operações, mas no plano free está limitada a 15 análises por dia |
| **RN7** | Não é descontada quota quando nenhum troço é selecionado, quando o processamento é cancelado ou quando falha |
| **RN8** | É sempre mantida uma pequena margem antes e depois da fala, para que o início e o fim das palavras não sejam cortados |
| **RN9** | São aceites vídeos MP4 e MOV com vídeo H.264 e áudio AAC; no plano free até 1080p e 200 MB, no plano premium até 4K e 2 GB |

### 2.7 Assunções

| **ID** | **Assunção** |
|--------|--------------|
| A1 | O vídeo pertence a um projeto do utilizador, tal como as imagens, e está integralmente armazenado e acessível no momento do pedido |
| A2 | Em vídeos falados (aulas, podcasts, tutoriais, reuniões), as pausas têm um volume claramente inferior ao da fala, o que permite distingui-las automaticamente |
| A3 | Em vídeos com música de fundo, é possível dar prioridade às frequências da voz na análise; os casos em que isto não chega são corrigidos pelo utilizador na revisão manual |
| A4 | A análise do áudio é rápida o suficiente para o utilizador aguardar pelo resultado, acompanhando o progresso em tempo real |
| A5 | O utilizador acompanha o progresso da análise e do processamento através de uma ligação em tempo real (WebSocket) |
| A6 | Os ficheiros temporários criados durante o processamento são apagados quando este termina, é cancelado ou falha |
| A7 | Os limites de duração (2 e 30 minutos) e de análises diárias (15) foram fixados a partir da duração típica de excertos de redes sociais (free) e de uma aula ou reunião curta (premium); serão revistos após testes com vídeos reais |
| A8 | Os limites de resolução e tamanho (RN9) assumem vídeos gravados com telemóvel ou ecrã, onde 1080p é o caso mais comum; 200 MB cobrem 2 minutos em 1080p com folga |
| A9 | Os alvos de desempenho do MVP assumem execução local em Docker, num computador da equipa, apenas com CPU (sem placa gráfica) |
| A10 | Um desfasamento entre som e imagem até 40 ms (um fotograma a 25 fps) não é percetível pelo utilizador |
| A11 | Os valores sugeridos para as opções de deteção (perfis Suave, Equilibrado e Agressivo) funcionam razoavelmente para voz gravada em condições normais; foram escolhidos com base em testes iniciais e ajustam-se na revisão manual |
| A12 | Uma revisão não aplicada pode ser descartada ao fim de 7 dias sem prejuízo para o utilizador, já que pode sempre voltar a analisar o vídeo |

### 2.8 Questões em Aberto

| **ID** | **Questão** |
|--------|-------------|
| Q1 | O perfil anónimo deve ter acesso a esta funcionalidade, por exemplo apenas em vídeos muito curtos? |
| Q2 | Em projetos partilhados, a operação deve ser descontada ao dono do projeto ou ao utilizador que aplicou os cortes? |
| Q3 | Resolvida na assunção A12 e no requisito REQ-VID-SIL-013 (as revisões não aplicadas são guardadas durante 7 dias). |
| Q4 | O vídeo resultante deve poder ser usado diretamente noutras ferramentas de vídeo (por exemplo, gerar legendas depois de remover os silêncios)? |
| Q5 | Deve ser possível, no futuro, remover também hesitações como "hum" ou "ah", e não apenas silêncios? |
| Q6 | Deve ser possível exportar a lista de cortes para usar noutro editor de vídeo? |
| Q7 | Os limites fixados nas assunções A7 e A8 são adequados, ou devem ser ajustados depois de testes com vídeos reais? |

---

## 3. Utilização de agentes de IA


| **Ferramenta / *skill*** | **Tarefa apoiada** | **Validação realizada pela equipa** |
|--------------------------|--------------------|--------------------------------------|
| Claude (Anthropic) | Primeira versão das secções do caso de uso (2.1 a 2.8) | Revisão manual integral de todo o conteúdo; ajustes para refletir a funcionalidade e as características reais do projeto PictuRAS; confronto com o README do repositório; assunções e questões em aberto assinaladas sempre que o comportamento do sistema não pôde ser confirmado |
| Claude (Anthropic) | Primeira versão da ERS (secção 4), revisão das assunções e questões em aberto e proposta de limites e alvos MVP/produção | Revisão manual de cada requisito face ao caso de uso e ao enunciado do Exercício 2; confirmação de que cada requisito tem origem e critério verificável; confronto dos elementos afetados com a arquitetura do PictuRAS; valores e limites assinalados como assunções a validar com testes |

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

## 4. Especificação de Requisitos do Sistema (ERS)

**Caso de Uso:** UC-VID-001 — Remover Silêncios e Pausas de um Vídeo  
**Versão do dossiê:** v1.1  
**Baseline do Exercício 1:** v1.0 (caso de uso UC-VID-001; a secção de requisitos derivados não foi preenchida no Exercício 1, pelo que todos os requisitos desta ERS são novos)

### 4.1 Requisitos da ERS

#### 4.1.1 Requisitos Funcionais

| **ID** | **Requisito** | **Prioridade** | **Evolução** | **Novo/Alt** | **Origem (UC / RN / decisão)** | **Justificação** | **Critério de aceitação / verificação** |
|--------|---------------|----------------|--------------|--------------|--------------------------------|-----------------|----------------------------------------|
| REQ-VID-SIL-001 | O sistema deve permitir a um utilizador registado selecionar a ferramenta **Remover silêncios** sobre um vídeo do seu projeto e configurar a sensibilidade ao silêncio (−60 a −20 dB), a duração mínima de uma pausa (0,3 a 5 s), a margem antes e depois da fala (0 a 1000 ms) e a indicação de música de fundo. | Deve ter | Novo | NOVO | UC-VID-001, passos 1 e 2 | Os vídeos falados variam muito (aula, podcast, reunião) e precisam de sensibilidades diferentes. | Dado um vídeo aberto no projeto, quando o utilizador escolhe Remover silêncios, então as quatro opções aparecem preenchidas com os valores do perfil Equilibrado e valores fora dos intervalos são recusados. |
| REQ-VID-SIL-002 | O sistema deve disponibilizar os perfis Suave (−40 dB, 1,0 s, 250 ms), Equilibrado (−35 dB, 0,7 s, 150 ms) e Agressivo (−30 dB, 0,4 s, 80 ms), que preenchem as opções de deteção. | Deveria ter | Novo | NOVO | UC-VID-001, passo 2, FA2 | Evita que o utilizador tenha de perceber decibéis para obter um bom resultado. | Dado o painel de opções, quando o utilizador escolhe Agressivo, então as opções passam a −30 dB, 0,4 s e 80 ms. |
| REQ-VID-SIL-003 | O sistema deve rejeitar, antes de iniciar a análise, vídeos cujo formato, codec, resolução ou tamanho não respeitem RN9, indicando o motivo. | Deve ter | Novo | NOVO | UC-VID-001, passo 3, exceções de formato e de limites, RN9 | Evita ocupar o processamento com ficheiros que vão falhar. | Dado um vídeo AVI ou um vídeo 4K de um utilizador free, quando escolhe Analisar, então o pedido é recusado com a mensagem correspondente e nenhuma análise é iniciada. |
| REQ-VID-SIL-004 | O sistema deve rejeitar vídeos cuja duração exceda o limite do perfil do utilizador (2 minutos no free, 30 minutos no premium). | Deve ter | Novo | NOVO | UC-VID-001, passo 3, exceção de limites, RN2 | Protege a capacidade de processamento e sustenta a diferença entre planos. | Dado um utilizador free com um vídeo de 2 min 10 s, quando escolhe Analisar, então o pedido é recusado com indicação do limite de 2 minutos. |
| REQ-VID-SIL-005 | O sistema deve rejeitar vídeos sem faixa de som, informando que não é possível detetar silêncios. | Deve ter | Novo | NOVO | UC-VID-001, pré-condições, exceção de vídeo sem som | Sem som não existe nada para analisar. | Dado um vídeo sem som, quando o utilizador escolhe Analisar, então aparece a mensagem de vídeo sem som e não é iniciada nenhuma análise. |
| REQ-VID-SIL-006 | O sistema deve permitir até 15 análises por dia a utilizadores free, sem as descontar da quota de operações, e não deve limitar as análises de utilizadores premium. | Deve ter | Novo | ALT | UC-VID-001, exceção de limite de análises, RN6 | A análise é barata e é o que permite rever antes de gastar quota, mas precisa de limite para evitar abusos. | Dado um utilizador free com 15 análises feitas no dia, quando pede a 16.ª, então é recusada; as 15 anteriores não alteraram o saldo de operações. |
| REQ-VID-SIL-007 | O sistema deve identificar os troços de silêncio do áudio de acordo com a sensibilidade e a duração mínima escolhidas e, quando indicada música de fundo, dar prioridade às frequências da voz na análise. | Deve ter | Novo | NOVO | UC-VID-001, passo 4, A2, A3 | É o núcleo da funcionalidade. | Dado um vídeo de teste com pausas anotadas à mão, quando analisado com o perfil Equilibrado, então são encontradas as pausas com 0,7 s ou mais (ver REQ-VID-SIL-033). |
| REQ-VID-SIL-008 | O sistema deve reduzir cada troço detetado pela margem escolhida em cada extremidade, descartar os troços que fiquem abaixo da duração mínima e juntar troços separados por menos de 0,1 s. | Deve ter | Novo | NOVO | UC-VID-001, passo 4, RN8 | A margem evita cortar o início e o fim das palavras; juntar troços evita cortes demasiado seguidos. | Dado um silêncio de 10,0 s a 12,0 s com margem de 150 ms, então o troço proposto é de 10,15 s a 11,85 s; dado um silêncio de 0,8 s com a mesma margem e mínimo de 0,7 s, então é descartado. |
| REQ-VID-SIL-009 | O sistema deve mostrar o progresso da análise e permitir cancelá-la, descartando os resultados parciais. | Deve ter | Novo | NOVO | UC-VID-001, passo 4, FA6 | O utilizador não deve ficar preso a uma análise que já não quer. | Dada uma análise em curso, quando o utilizador cancela, então regressa às opções de deteção e não fica guardado nenhum resultado parcial. |
| REQ-VID-SIL-010 | O sistema deve apresentar o resultado da análise com a linha temporal do áudio e os troços a remover assinalados, a lista de troços (início, fim, duração) e a poupança prevista (duração original, duração final e tempo removido em segundos e em percentagem). | Deve ter | Novo | NOVO | UC-VID-001, passo 5 | É a base da revisão manual e mostra o valor da operação antes de gastar quota. | Dada uma análise concluída, então cada troço da lista corresponde a uma zona assinalada na linha temporal, nas mesmas posições, e a poupança é igual à soma das durações dos troços. |
| REQ-VID-SIL-011 | O sistema deve permitir ouvir cada troço com 1 s antes e depois, desmarcá-lo ou voltar a marcá-lo e ajustar o seu início e fim, sem que os troços ultrapassem a duração do vídeo ou se sobreponham. | Deve ter | Novo | NOVO | UC-VID-001, passo 6, FA4 | Permite manter pausas intencionais e corrigir deteções imprecisas. | Dado um troço, quando o utilizador arrasta o seu fim para dentro do troço seguinte, então a alteração é recusada e o troço mantém o valor anterior. |
| REQ-VID-SIL-012 | O sistema deve recalcular a poupança prevista e a marcação na linha temporal sempre que o utilizador altera um troço. | Deve ter | Novo | NOVO | UC-VID-001, passo 6 | O utilizador precisa de ver o efeito de cada decisão. | Dado um vídeo de 120 s com 30 s de troços marcados, quando o utilizador desmarca um troço de 5 s, então a poupança passa de 30 s (25%) para 25 s (20,8%). |
| REQ-VID-SIL-013 | O sistema deve guardar a revisão de um vídeo (opções, troços e ajustes) quando o utilizador sai sem aplicar ou fica sem quota, apresentá-la ao reabrir a ferramenta no mesmo vídeo e eliminá-la ao fim de 7 dias sem utilização. | Deveria ter | Novo | NOVO | UC-VID-001, FA5, exceção de falta de quota, A12 | Permite aplicar mais tarde, por exemplo no dia seguinte, sem repetir a análise. | Dada uma revisão guardada, quando o utilizador reabre a ferramenta no mesmo vídeo, então vê os mesmos troços e ajustes; passados 7 dias sem utilização, a revisão já não existe. |
| REQ-VID-SIL-014 | O sistema deve permitir repetir a análise com outras opções, avisando que os ajustes manuais serão perdidos e pedindo confirmação. | Deveria ter | Novo | NOVO | UC-VID-001, FA3 | Evita que o utilizador perca trabalho sem perceber. | Dada uma revisão com ajustes, quando o utilizador escolhe Analisar de novo, então aparece o aviso e a análise só começa após confirmação. |
| REQ-VID-SIL-015 | O sistema deve informar o utilizador, sem propor cortes nem gastar quota, quando não encontra nenhum troço ou quando mais de 95% do áudio é considerado silêncio, sugerindo um perfil mais agressivo ou mais suave, respetivamente. | Deveria ter | Novo | NOVO | UC-VID-001, FA2, exceção de áudio quase todo silencioso | Evita resultados inúteis e orienta o utilizador para opções adequadas. | Dado um vídeo sem pausas, então aparece a sugestão do perfil Agressivo; dado um vídeo só com ruído de fundo baixo, então aparece a sugestão do perfil Suave; em ambos o saldo não muda. |
| REQ-VID-SIL-016 | O sistema deve aplicar os cortes apenas após o utilizador escolher **Aplicar cortes**, exigir pelo menos um troço marcado e pedir confirmação adicional quando os troços marcados somam mais de 80% da duração do vídeo. | Deve ter | Novo | NOVO | UC-VID-001, passo 7, FA4, FA8, RN3 | Evita cortes indesejados e gastos de quota sem efeito. | Dados 0 troços marcados, então Aplicar cortes está indisponível; dados troços que somam 85% do vídeo, então aparece o pedido de confirmação e nada entra na fila sem resposta afirmativa. |
| REQ-VID-SIL-017 | O sistema deve verificar a quota de um utilizador free ao aplicar os cortes, descontar 1 operação quando o processamento entra na fila e devolvê-la se o processamento for cancelado, falhar ou for rejeitado por desfasamento. | Deve ter | Novo | ALT | UC-VID-001, passo 7, FA7, exceções de falta de quota, falha e desfasamento, RN1, RN7 | O utilizador só paga por um vídeo que recebeu. | Dado um utilizador free com 3 operações, quando aplica cortes com sucesso, então fica com 2; quando aplica e cancela, fica com 3; com 0 operações, o pedido é recusado e a revisão é guardada. |
| REQ-VID-SIL-018 | O sistema deve colocar os pedidos de utilizadores premium numa fila com prioridade e não lhes descontar operações. | Deve ter | Novo | ALT | UC-VID-001, FA1, RN1 | Materializa a vantagem do plano premium. | Dado um utilizador premium, quando aplica cortes, então o pedido entra na fila prioritária e o saldo não se altera. |
| REQ-VID-SIL-019 | O sistema deve apresentar o estado do processamento (em fila, a analisar, a processar, concluído, falhado) e a percentagem de progresso, e repor o estado atual quando a ligação em tempo real é restabelecida. | Deve ter | Novo | ALT | UC-VID-001, passos 4 e 8, exceção de perda de ligação, A5 | O processamento demora e o utilizador precisa de saber o que está a acontecer. | Dado um processamento em curso, quando a ligação cai e volta, então a interface mostra o estado e a percentagem atuais sem nova submissão. |
| REQ-VID-SIL-020 | O sistema deve permitir cancelar o processamento a qualquer momento, interrompendo-o, mantendo o vídeo original e regressando à revisão com os troços intactos. | Deve ter | Novo | ALT | UC-VID-001, passo 8, FA7 | O utilizador não deve ficar preso a uma operação longa nem perder o trabalho de revisão. | Dado um processamento em curso, quando o utilizador cancela, então regressa à revisão em ≤ 2 s com os mesmos troços e nenhum vídeo novo é guardado. |
| REQ-VID-SIL-021 | O sistema deve remover os troços marcados do som e da imagem com os mesmos tempos e suavizar o som em cada junção (10 ms) para que não se ouçam estalidos. | Deve ter | Novo | NOVO | UC-VID-001, passo 9, RN4 | Cortar só o som, ou cortar som e imagem em tempos diferentes, deixaria o vídeo dessincronizado. | Dado um vídeo de teste com locução e um relógio visível, quando os cortes são aplicados, então não há desfasamento visível entre voz e lábios nem estalidos nas junções. |
| REQ-VID-SIL-022 | O sistema deve gerar o resultado como um novo vídeo MP4 (H.264/AAC) guardado no projeto, sem alterar o vídeo original. | Deve ter | Novo | NOVO | UC-VID-001, passos 9 e 10, RN5, pós-condição de sucesso | Edição não destrutiva, coerente com o resto do PictuRAS. | Dado um processamento concluído, então o projeto contém o vídeo original (com o mesmo hash SHA-256 de antes) e o novo vídeo. |
| REQ-VID-SIL-023 | O sistema deve verificar, antes de disponibilizar o novo vídeo, que a diferença entre a duração do som e da imagem não ultrapassa 40 ms e que a duração final corresponde à prevista (com erro ≤ 0,5 s), rejeitando o resultado caso contrário. | Deve ter | Novo | NOVO | UC-VID-001, passo 10, exceção de desfasamento, A10 | Impede que um vídeo dessincronizado seja entregue como bom. | Dado um resultado gerado, quando inspecionado com `ffprobe`, então as durações de som e imagem diferem ≤ 40 ms; num teste com desfasamento forçado, o resultado é rejeitado e a operação devolvida. |
| REQ-VID-SIL-024 | O sistema deve, quando o processamento falha a meio, marcar o pedido como falhado, não deixar ficheiros parciais acessíveis ao utilizador, apagar os ficheiros temporários e informar o utilizador com o motivo. | Deve ter | Novo | NOVO | UC-VID-001, exceção de falha ou tempo excedido, pós-condição mínima, A6 | O sistema tem de ficar num estado consistente depois de qualquer falha. | Dado um processamento interrompido de propósito a meio, então o estado fica "falhado", o projeto só contém o vídeo original e não restam ficheiros temporários desse pedido. |
| REQ-VID-SIL-025 | O sistema deve disponibilizar o novo vídeo para reprodução e transferência, mostrando a duração original, a final e o tempo poupado. | Deve ter | Novo | NOVO | UC-VID-001, passo 11 | Fecha o fluxo e mostra o ganho obtido. | Dado um processamento concluído, então o vídeo pode ser reproduzido e transferido e a comparação de durações é apresentada. |
| REQ-VID-SIL-026 | O sistema deve manter o vídeo original e o vídeo resultante enquanto existirem no projeto e eliminá-los quando o utilizador os apagar ou apagar o projeto. | Deve ter | Novo | ALT | UC-VID-001, pós-condição de sucesso, A1 | Os vídeos seguem as mesmas regras de persistência das imagens. | Dado um projeto com vídeos, quando o utilizador o apaga, então os ficheiros deixam de estar acessíveis e são removidos do armazenamento. |

#### 4.1.2 Requisitos Não Funcionais e de Qualidade

| **ID** | **Requisito** | **Característica ISO/IEC 25010** | **Alvo MVP** | **Alvo produção** | **Evolução** | **Origem (UC / DQ)** | **Critério de aceitação / verificação** |
|--------|---------------|----------------------------------|--------------|------------------|--------------|----------------------|----------------------------------------|
| REQ-VID-SIL-027 | O sistema deve confirmar a aceitação de um pedido de análise ou de aplicação de cortes em pouco tempo, independentemente da duração do vídeo, sem bloquear a sessão do utilizador. | Eficiência de Desempenho | ≤ 3 s em 95% dos pedidos | ≤ 500 ms em 95% dos pedidos | Novo | UC-VID-001, passos 3 e 7 / DQ-001 | Dados 20 pedidos com vídeos de 10 s a 30 min, então a resposta de aceitação chega dentro do alvo em pelo menos 19. |
| REQ-VID-SIL-028 | O sistema deve concluir a análise do áudio num tempo proporcional à duração do vídeo. | Eficiência de Desempenho | ≤ 0,1× a duração (vídeo de 2 min em ≤ 12 s; de 30 min em ≤ 3 min) | ≤ 0,03× a duração | Novo | UC-VID-001, passo 4, A4, A9 / DQ-002 | Dados vídeos de 2 e 30 minutos, quando analisados no ambiente Docker local, então a análise termina dentro do alvo em 5 execuções seguidas. |
| REQ-VID-SIL-029 | O sistema deve gerar o novo vídeo num tempo proporcional à duração do vídeo resultante. | Eficiência de Desempenho | ≤ 1,5× a duração resultante, a 1080p, só com CPU | ≤ 0,5× a duração resultante, com aceleração por hardware | Novo | UC-VID-001, passo 9, A9 / DQ-002 | Dado um vídeo resultante de 2 minutos a 1080p, então o processamento conclui em ≤ 3 minutos. |
| REQ-VID-SIL-030 | O sistema deve suportar vários pedidos de remoção de silêncios em simultâneo sem falhas, colocando os restantes em fila. | Eficiência de Desempenho (Capacidade) | 2 pedidos em simultâneo numa instância do serviço; os seguintes ficam em fila | Escala automática para pelo menos 50 pedidos em simultâneo | Novo | UC-VID-001, passo 7 / DQ-003 | Dados 5 pedidos enviados ao mesmo tempo, então 2 são processados em paralelo, os restantes ficam "em fila" e todos terminam com sucesso. |
| REQ-VID-SIL-031 | O sistema deve terminar automaticamente pedidos que excedam o tempo máximo, deixando o sistema num estado consistente. | Fiabilidade | Tempo máximo: análise 5 min; processamento 3× a duração do vídeo + 1 min; sem retoma nem repetição automática (estado "falhado") | 1 repetição automática e retoma a partir do último troço concluído | Novo | UC-VID-001, exceção de falha ou tempo excedido / DQ-004 | Dado um serviço bloqueado de propósito, quando o tempo máximo é atingido, então o pedido passa a "falhado", a operação é devolvida e o utilizador é informado. |
| REQ-VID-SIL-032 | O sistema deve manter o som e a imagem do vídeo resultante sincronizados. | Adequação Funcional (Exatidão) | Diferença ≤ 40 ms, verificada automaticamente em cada resultado | Igual, com testes de regressão sobre um conjunto alargado de vídeos | Novo | UC-VID-001, passo 10, RN4, A10 / DQ-005 | Dados 5 vídeos de teste (gravados com telemóvel e com ecrã), então todos os resultados passam a verificação de REQ-VID-SIL-023. |
| REQ-VID-SIL-033 | O sistema deve detetar corretamente as pausas de vídeos falados com o perfil Equilibrado. | Adequação Funcional (Exatidão) | ≥ 85% das pausas ≥ 0,7 s detetadas, com erro nos limites ≤ 100 ms, em vídeos sem música | ≥ 95%, incluindo vídeos com música de fundo | Novo | UC-VID-001, passo 4, A2, A11 / DQ-006 | Dado um conjunto de 3 vídeos com pausas anotadas à mão, então a percentagem de pausas detetadas e o erro nos limites cumprem o alvo. |
| REQ-VID-SIL-034 | O sistema deve comunicar o progresso e os erros de forma compreensível durante operações que demoram minutos. | Usabilidade | Progresso atualizado pelo menos a cada 5 s; mensagens de erro em português com a causa e o que o utilizador pode fazer | Atualização a cada 1 s com estimativa do tempo restante | Novo | UC-VID-001, passos 4 e 8, exceções / DQ-007 | Dado um processamento de 2 minutos, então a percentagem muda pelo menos a cada 5 s; dado cada erro das exceções, então a mensagem indica causa e ação possível. |
| REQ-VID-SIL-035 | A revisão dos troços deve responder às ações do utilizador sem atrasos percetíveis. | Usabilidade | Atualização em ≤ 200 ms com até 300 troços | ≤ 100 ms com até 2000 troços | Novo | UC-VID-001, passo 6 / DQ-008 | Dado um vídeo com 300 troços, quando o utilizador desmarca um troço, então a linha temporal e a poupança atualizam em ≤ 200 ms. |
| REQ-VID-SIL-036 | O sistema deve restringir o acesso ao vídeo original, à revisão e ao vídeo resultante ao dono do projeto e a quem tenha um link de partilha válido, usando endereços não adivinháveis. | Segurança | Validação da sessão e da partilha em cada pedido; identificadores aleatórios nos endereços dos ficheiros | Endereços temporários com validade ≤ 15 min | Novo | UC-VID-001, passo 11 / DQ-009 | Dado um utilizador sem permissão ou com link revogado, quando pede um dos ficheiros, então o acesso é negado (401/403/410); alterar o identificador no endereço não dá acesso a outro ficheiro. |
| REQ-VID-SIL-037 | O sistema deve aceitar e produzir vídeos em formatos reproduzíveis nos browsers atuais. | Compatibilidade | Entrada MP4 e MOV (H.264/AAC); saída MP4 (H.264/AAC) reproduzível em Chrome, Firefox, Safari e Edge | Entrada também em WebM e HEVC | Novo | UC-VID-001, passo 11, RN9 / DQ-010 | Dado um vídeo resultante, quando aberto nos quatro browsers, então é reproduzido sem plugins. |
| REQ-VID-SIL-038 | A remoção de silêncios deve ser acrescentada como um serviço independente, sem alterar o código das ferramentas existentes. | Manutenibilidade | Serviço próprio ligado à fila de mensagens; nenhuma ferramenta existente alterada | Registo de novas ferramentas de vídeo sem alterar código do resto do sistema | Novo | DQ-011 | Dado o código entregue, então a comparação com a versão base não mostra alterações nas ferramentas de imagem existentes. |
| REQ-VID-SIL-039 | As dependências de processamento de vídeo (FFmpeg e bibliotecas) devem estar isoladas no contentor do serviço. | Portabilidade | Imagem Docker para `amd64` e `arm64`, arrancada com `docker compose up` | Imagem otimizada para orquestração (Kubernetes) | Novo | DQ-012 | Dado um computador apenas com Docker, quando se arranca o sistema, então o serviço funciona sem instalar FFmpeg no computador. |
| REQ-VID-SIL-040 | O sistema deve garantir que o vídeo original nunca é alterado por análises, cortes, cancelamentos ou falhas. | Fiabilidade (Integridade) | Original imutável, verificado por hash | Versionamento e cópias de segurança diárias | Novo | UC-VID-001, RN5, pós-condições / DQ-013 | Dado um projeto após análises, um processamento concluído, um cancelado e um falhado, então o hash SHA-256 do original é igual ao inicial. |

#### 4.1.3 Verificação da completude e dos limites do âmbito

| **Tópico a verificar** | **Aplicável?** | **Decisão / justificação** | **Requisito(s) relacionado(s)** |
|-----------------------|---------------|----------------------------|--------------------------------|
| Formato, codec, duração e dimensão do vídeo | Sim | Entrada MP4/MOV (H.264/AAC); free até 2 min, 1080p e 200 MB; premium até 30 min, 4K e 2 GB; o vídeo tem de ter som; saída sempre MP4 (RN2, RN9, A7, A8). | REQ-VID-SIL-003, 004, 005, 022, 037 |
| Estado, progresso, cancelamento e resultado | Sim | Estados e percentagem em tempo real, cancelamento da análise e do processamento, recuperação após perda de ligação e apresentação do resultado com o tempo poupado. | REQ-VID-SIL-009, 019, 020, 025, 034 |
| Falhas durante o processamento | Sim | Sem retoma no MVP: o pedido fica "falhado", não há ficheiros parciais visíveis, os temporários são apagados e a operação é devolvida; resultados desfasados são rejeitados. | REQ-VID-SIL-017, 023, 024, 031, 040 |
| Persistência e expiração dos ficheiros | Sim | Original e resultado ficam enquanto existirem no projeto; revisões não aplicadas expiram ao fim de 7 dias (A12); temporários apagados no fim de cada pedido (A6). | REQ-VID-SIL-013, 024, 026 |
| Perfis e contagem de operações | Sim | Anónimo sem acesso no MVP (Q1); free: 1 operação por aplicação concluída e até 15 análises por dia; premium: ilimitado e com prioridade. | REQ-VID-SIL-006, 017, 018 |
| Encadeamento de ferramentas e processamento em lote | Não | Fora do âmbito do MVP: a ferramenta é aplicada a um vídeo de cada vez, porque a revisão manual exige que o utilizador acompanhe cada vídeo; o encadeamento e o lote existentes continuam só para imagens. A possibilidade de encadear com outras ferramentas de vídeo fica em aberto (Q4). | N/A |

### 4.2 Impacto no sistema existente

| **Elemento existente afetado** | **Impacto (Manter / Estender / Alterar)** | **Descrição do impacto** | **Requisito(s) relacionado(s)** |
|--------------------------------|-------------------------------------------|--------------------------|--------------------------------|
| Perfis e quota (serviço de utilizadores) | Alterar | Passa a contar as análises diárias separadamente das operações e a devolver operações quando o processamento é cancelado ou falha. | REQ-VID-SIL-006, 017, 018 |
| Projetos (serviço de projetos) | Estender | Os projetos passam a guardar vídeos, as revisões de remoção de silêncios e os vídeos resultantes, com os novos estados de processamento. | REQ-VID-SIL-013, 019, 022, 026 |
| Fila de mensagens | Estender | Nova fila para a remoção de silêncios e utilização da fila prioritária para utilizadores premium. | REQ-VID-SIL-018, 030 |
| Ferramentas (novo serviço) | Estender | Novo serviço de remoção de silêncios, com FFmpeg, responsável pela análise, pelos cortes e pela verificação do resultado. | REQ-VID-SIL-007, 008, 021, 023, 038, 039 |
| Armazenamento de ficheiros | Estender | Passa a guardar vídeos originais e resultantes, com acesso restrito e endereços não adivinháveis. | REQ-VID-SIL-022, 026, 036 |
| Notificações em tempo real (WebSocket) | Estender | Novos estados e percentagem de progresso da análise e do processamento. | REQ-VID-SIL-019, 034 |
| Interface do editor | Estender | Novo painel de opções e perfis, ecrã de revisão com linha temporal e lista de troços e apresentação do tempo poupado. | REQ-VID-SIL-001, 002, 010, 011, 012, 025, 035 |
| Configuração de arranque (`docker-compose`) | Estender | Novo serviço acrescentado à configuração. | REQ-VID-SIL-039 |
| Encadeamento, processamento em lote e ferramentas de imagem | Manter | Sem alterações; continuam a aplicar-se só a imagens. | REQ-VID-SIL-038 |

### 4.3 Matriz de Rastreabilidade Atualizada

| **Elemento de origem** | **Descrição abreviada** | **Requisito(s) relacionado(s)** |
|------------------------|-------------------------|--------------------------------|
| Passo 1 | Abrir projeto e selecionar vídeo | REQ-VID-SIL-001 |
| Passo 2 | Opções de deteção e perfis | REQ-VID-SIL-001, 002 |
| Passo 3 | Validação do vídeo, do som e dos limites | REQ-VID-SIL-003, 004, 005, 006, 027 |
| Passo 4 | Análise do áudio e progresso | REQ-VID-SIL-007, 008, 009, 019, 028, 033, 034 |
| Passo 5 | Apresentação dos troços e da poupança | REQ-VID-SIL-010 |
| Passo 6 | Revisão manual dos troços | REQ-VID-SIL-011, 012, 035 |
| Passo 7 | Aplicar cortes, verificar quota e colocar em fila | REQ-VID-SIL-016, 017, 027, 030 |
| Passo 8 | Estado, progresso e cancelamento | REQ-VID-SIL-019, 020, 034 |
| Passo 9 | Corte do som e da imagem e geração do vídeo | REQ-VID-SIL-021, 022, 029 |
| Passo 10 | Verificação da sincronização e gravação | REQ-VID-SIL-022, 023, 032 |
| Passo 11 | Resultado e tempo poupado | REQ-VID-SIL-025, 036, 037 |
| FA1 | Utilizador premium com prioridade | REQ-VID-SIL-018 |
| FA2 | Nenhum silêncio encontrado | REQ-VID-SIL-015 |
| FA3 | Repetir a análise com outras opções | REQ-VID-SIL-014 |
| FA4 | Manter todos os troços | REQ-VID-SIL-011, 016 |
| FA5 | Retomar a revisão mais tarde | REQ-VID-SIL-013 |
| FA6 | Cancelar a análise | REQ-VID-SIL-009 |
| FA7 | Cancelar o processamento | REQ-VID-SIL-017, 020 |
| FA8 | Remoção de mais de 80% do vídeo | REQ-VID-SIL-016 |
| Exceção – vídeo sem som | Vídeo sem faixa de som | REQ-VID-SIL-005 |
| Exceção – ficheiro ilegível ou formato não suportado | Ficheiro corrompido ou formato fora de RN9 | REQ-VID-SIL-003 |
| Exceção – limites do perfil excedidos | Duração, resolução ou tamanho acima do permitido | REQ-VID-SIL-003, 004 |
| Exceção – limite de análises | 15 análises diárias atingidas | REQ-VID-SIL-006 |
| Exceção – sem quota | Sem operações disponíveis ao aplicar | REQ-VID-SIL-013, 017 |
| Exceção – áudio quase todo silencioso | Mais de 95% do áudio considerado silêncio | REQ-VID-SIL-015 |
| Exceção – falha ou tempo excedido | Processamento interrompido | REQ-VID-SIL-024, 031 |
| Exceção – som desfasado | Resultado dessincronizado | REQ-VID-SIL-023, 032 |
| Exceção – perda de ligação | Ligação em tempo real interrompida | REQ-VID-SIL-019 |
| Pós-condição de sucesso | Novo vídeo sincronizado, original intacto | REQ-VID-SIL-021, 022, 025, 026 |
| Pós-condição mínima | Original intacto, sem ficheiros parciais, quota devolvida | REQ-VID-SIL-017, 024, 040 |
| RN1 | Uma operação por aplicação no free | REQ-VID-SIL-017, 018 |
| RN2 | Limites de duração por plano | REQ-VID-SIL-004 |
| RN3 | Confirmação explícita | REQ-VID-SIL-016 |
| RN4 | Cortes simultâneos no som e na imagem | REQ-VID-SIL-021, 032 |
| RN5 | Original nunca alterado | REQ-VID-SIL-022, 040 |
| RN6 | 15 análises por dia no free | REQ-VID-SIL-006 |
| RN7 | Sem desconto em cancelamento, falha ou sem troços | REQ-VID-SIL-015, 016, 017 |
| RN8 | Margem antes e depois da fala | REQ-VID-SIL-008 |
| RN9 | Formatos, resolução e tamanho aceites | REQ-VID-SIL-003, 037 |
| DQ-001 | Aceitação rápida e processamento em segundo plano | REQ-VID-SIL-027 |
| DQ-002 | Separar análise (só áudio) de processamento | REQ-VID-SIL-028, 029 |
| DQ-003 | Capacidade limitada no MVP com fila | REQ-VID-SIL-030 |
| DQ-004 | Tempos máximos sem retoma no MVP | REQ-VID-SIL-031 |
| DQ-005 | Tolerância de sincronização de 40 ms | REQ-VID-SIL-032 |
| DQ-006 | Exatidão mínima da deteção | REQ-VID-SIL-033 |
| DQ-007 | Cadência do progresso e mensagens de erro | REQ-VID-SIL-034 |
| DQ-008 | Revisão feita no browser | REQ-VID-SIL-035 |
| DQ-009 | Acesso restrito e endereços não adivinháveis | REQ-VID-SIL-036 |
| DQ-010 | MP4 (H.264/AAC) como formato de saída | REQ-VID-SIL-037 |
| DQ-011 | Serviço independente | REQ-VID-SIL-038 |
| DQ-012 | FFmpeg isolado em Docker | REQ-VID-SIL-039 |
| DQ-013 | Integridade do original verificada por hash | REQ-VID-SIL-040 |

**Decisões de qualidade introduzidas nesta aula**

| **ID** | **Decisão de qualidade** | **Justificação** | **Requisito(s) relacionado(s)** |
|--------|--------------------------|-----------------|--------------------------------|
| DQ-001 | O pedido apenas é validado e colocado em fila; a análise e o processamento correm em segundo plano. | Um vídeo pode demorar minutos a processar e o utilizador não pode ficar à espera de uma resposta. | REQ-VID-SIL-027 |
| DQ-002 | A análise trabalha apenas sobre o áudio e só o processamento final mexe na imagem. | A análise fica rápida e barata, o que permite que não gaste quota e possa ser repetida. | REQ-VID-SIL-028, 029 |
| DQ-003 | No MVP, uma única instância do serviço processa 2 pedidos ao mesmo tempo e os restantes esperam na fila. | É suficiente para validar a funcionalidade nas máquinas da equipa; a escala fica para produção (Fase 2). | REQ-VID-SIL-030 |
| DQ-004 | No MVP não há retoma nem repetição automática: um pedido que falha ou excede o tempo máximo fica "falhado" e a operação é devolvida. | Mantém o MVP simples e o sistema consistente; a retoma é um alvo de produção. | REQ-VID-SIL-031 |
| DQ-005 | A tolerância de sincronização é de 40 ms, verificada automaticamente em cada resultado. | Corresponde a um fotograma a 25 fps, abaixo do que o utilizador consegue perceber (A10). | REQ-VID-SIL-032 |
| DQ-006 | A deteção é medida contra vídeos com pausas anotadas à mão, com alvo mais baixo para o MVP e sem música de fundo. | Torna a qualidade da deteção verificável; os erros que restam são corrigidos na revisão manual. | REQ-VID-SIL-033 |
| DQ-007 | O progresso é enviado pelo menos a cada 5 s e cada erro tem uma mensagem própria em português com a causa e a ação possível. | Equilibra o feedback ao utilizador com o número de mensagens trocadas. | REQ-VID-SIL-034 |
| DQ-008 | A linha temporal é calculada uma vez no servidor e a revisão é feita no browser, que só comunica com o servidor ao guardar e ao aplicar. | Torna a revisão fluida e evita pedidos ao servidor a cada clique. | REQ-VID-SIL-035 |
| DQ-009 | O acesso aos ficheiros reutiliza a validação de sessão e de partilha existente e os ficheiros são identificados por identificadores aleatórios. | Mantém a coerência com a segurança atual do PictuRAS e impede adivinhar endereços. | REQ-VID-SIL-036 |
| DQ-010 | A saída é sempre MP4 com H.264/AAC. | É o formato com reprodução nativa em todos os browsers atuais. | REQ-VID-SIL-037 |
| DQ-011 | A remoção de silêncios é um serviço independente, ligado ao resto do sistema pela fila de mensagens, como as ferramentas existentes. | Permite acrescentar a funcionalidade sem mexer nas ferramentas de imagem. | REQ-VID-SIL-038 |
| DQ-012 | O FFmpeg e as restantes dependências ficam dentro da imagem Docker do serviço. | Evita diferenças entre os computadores da equipa e facilita a instalação. | REQ-VID-SIL-039 |
| DQ-013 | A integridade do vídeo original é verificada por comparação de hash nos testes. | Dá uma forma objetiva de provar que o original nunca é alterado. | REQ-VID-SIL-040 |

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
