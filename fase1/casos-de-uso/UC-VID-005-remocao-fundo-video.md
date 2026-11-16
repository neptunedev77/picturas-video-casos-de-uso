# 📝 Exercícios 1 e 2 — Casos de Uso e Especificação de Requisitos do Sistema (ERS)
### Casos de Uso e ERS · Fase 1: Suporte a Vídeo no PictuRAS
## UC-VID-005: Remoção e Substituição Automática de Fundo em Vídeo por IA (*AI Video Background Removal & Virtual Green Screen*)

---

## 0. Identificação

| **Campo** | **Valor** |
|---|---|
| **Grupo / Equipa** | Grupo 6 |
| **Autores** | António Sousa (PG63923), Bruno Sousa (PG63927), Bruno Vale (PG63926), Diogo Macedo (PG63947), Sérgio Vieira (PG65442) |
| **Data** | 2026-10-18 |
| **Versão do documento** | v2.0 (Especificação Completa ERS — Exercício 2) |
| **Unidade Curricular** | Requisitos e Arquiteturas de Software — MEI, Universidade do Minho |

---

## 1. Funcionalidade de vídeo escolhida

| **Campo** | **Valor** |
|---|---|
| **Funcionalidade** | Remoção e Substituição Automática de Fundo em Vídeo por IA (*AI Video Background Removal / Virtual Green Screen*) |
| **Perfil(s) de utilizador abrangido(s)** | Utilizador Registado (Plano Free) e Utilizador Premium. Tratando-se de uma ferramenta intensiva de Inteligência Artificial e visão por computador, o acesso encontra-se estritamente vedado a Utilizadores Anónimos. O plano Registado dispõe de acesso condicionado por quotas diárias e limites de resolução/duração (até 30 segundos a 720p), enquanto o plano Premium beneficia de processamento prioritário no cluster, suporte a resoluções até 1080p e durações até 180 segundos. |

### Justificação no contexto do MVP
Constitui a extensão de maior impacto e valor percetível da ferramenta homóloga já existente para imagem (`bg_remove_ai`), permitindo validar no MVP a viabilidade de inferência pesada de IA ao longo do vídeo e o desacoplamento assíncrono do pipeline de vídeo sem sobrecarregar o servidor web.

---

## 2. Caso de Uso

### 2.1 Cabeçalho

| **Secção** | **Detalhes** |
|---|---|
| **ID do Caso de Uso** | UC-VID-005 |
| **Nome** | Remoção e Substituição Automática de Fundo em Vídeo por IA (*Video Background Removal*) |
| **Versão** | v2.0 (Especificação Completa ERS — Exercício 2) |
| **Autor** | Sérgio Vieira (PG65442) |
| **Data** | 2026-10-18 |
| **Objetivo** | Permitir ao utilizador selecionar um vídeo na biblioteca do projeto, acionar a ferramenta de IA para estimar a máscara do sujeito e remover o fundo da cena, escolher o modo de substituição (Chroma Key verde `#00FF00`, cor sólida personalizada ou desfocagem de profundidade) e obter um novo ficheiro de vídeo processado mantendo o sincronismo do áudio original intacto. |
| **Âmbito** | Módulo de processamento avançado de vídeo do PictuRAS e gestão de projetos multimédia. |
| **Ator Principal** | Utilizador Registado ou Utilizador Premium |
| **Stakeholders e Interesses** | - **Utilizador Criador de Conteúdo / Profissional:** Pretende isolar o sujeito do vídeo para posterior composição gráfica ou melhoria estética rápida sem necessidade de estúdio físico com fundo verde.<br>- **Proprietário da Plataforma SaaS:** Pretende valorizar o catálogo de ferramentas inteligentes de vídeo com forte apelo visual, assegurando a viabilidade económica da infraestrutura através de quotas e limites estritos de tempo de computação por perfil.<br>- **Equipa de Engenharia / Arquitetura:** Pretende garantir que a inferência pesada de redes neuronais corre de forma assíncrona em contentores dedicados (`Tools`), sem bloquear o servidor web, garantindo tolerância a falhas e escalabilidade horizontal. |
| **Pré-condições** | 1. O utilizador encontra-se autenticado.<br>2. O projeto possui pelo menos um ficheiro de vídeo suportado (`.mp4` ou `.mov`) carregado no projeto.<br>3. O utilizador dispõe de saldo na quota diária de operações (para perfil Registado/Free). |
| **Trigger** | O utilizador, com um vídeo aberto na interface de edição do projeto, clica no ícone **Remover Fundo de Vídeo (IA)** na barra de ferramentas de vídeo. |

---

### 2.2 Fluxo Principal

| **Passo** | **Ação do Ator** | **Resposta do Sistema** |
|:---:|---|---|
| **1** | O utilizador abre o projeto, seleciona um vídeo na galeria e clica no botão **Remover Fundo (IA)** | Apresenta a janela modal de configuração da ferramenta com pré-visualização do vídeo, opções de modo de substituição de fundo e intervalo de aplicação |
| **2** | O utilizador seleciona o modo de fundo pretendido: **Chroma Key (Fundo Verde `#00FF00`)**, **Cor Sólida** (selecionando uma cor no seletor) ou **Desfocagem de Profundidade (*Portrait Blur*)** | Atualiza a interface gráfica destacando o modo escolhido e exibindo as amostras visuais de referência |
| **3** | O utilizador define o âmbito temporal: opta por aplicar ao **Vídeo Completo** ou define um **Intervalo Temporal Personalizado** ($T_{start}$ a $T_{end}$) | Valida os instantes temporais face à duração total do vídeo e exibe a estimativa de tempo e de consumo de quota |
| **4** | O utilizador confirma a execução clicando em **Processar Vídeo** | Valida a elegibilidade da quota diária e a conformidade dos parâmetros com o perfil do utilizador, aceita o pedido e inicia o processamento assíncrono da tarefa |
| **5** | — | Devolve a confirmação de aceitação do pedido com o identificador da tarefa e apresenta na interface um painel de acompanhamento com o estado da operação (*"em fila" / "a processar"*) |
| **6** | — | O sistema inicia o processamento assíncrono em segundo plano, analisando o vídeo e isolando o sujeito ao longo do intervalo de fotogramas selecionado |
| **7** | — | O sistema compõe o vídeo aplicando o novo fundo pretendido, preserva a integridade e sincronismo da pista de áudio e armazena o novo recurso gerado no catálogo do projeto |
| **8** | — | O sistema conclui o processamento com sucesso, debita 1 operação na conta do utilizador e emite uma notificação de conclusão em tempo real |
| **9** | — | O frontend fecha o painel de processamento, emite notificação de sucesso (*Toast*) e apresenta o novo vídeo processado (`<nome>_sem_fundo.mp4`) na galeria do projeto pronto para reprodução e exportação |

---

### 2.3 Fluxos Alternativos

| **Fluxo** | **Descrição** |
|---|---|
| **FA1 — Cancelamento prévio da operação** | No Passo 1, 2 ou 3, o utilizador clica em **Cancelar** ou fecha o modal → O sistema descarta as configurações selecionadas, não inicia qualquer processamento e não debita qualquer quota. |
| **FA2 — Cancelamento de tarefa em execução** | No Passo 5, enquanto o estado for *"em fila"* ou *"a processar"*, o utilizador prime **Cancelar Processamento** → O sistema cancela a execução da tarefa, liberta os recursos alocados e assegura que a quota diária do utilizador não é debitada. |
| **FA3 — Seleção de Cor Sólida Personalizada** | No Passo 2, o utilizador escolhe a opção "Cor Sólida" e introduz um código hexadecimal específico (ex.: `#FFFFFF` branco ou `#1E293B` ardósia) através do componente seletor de cor → O sistema regista o valor RGB correspondente para substituição do fundo no processador de vídeo. |
| **FA4 — Ajuste Automático de Intervalo Excedido** | No Passo 3, o utilizador insere manualmente um instante final superior à duração do vídeo → O frontend apresenta aviso visual e ajusta automaticamente o valor para a duração real exata do vídeo através de um clique no botão de correção rápida. |

---

### 2.4 Exceções

| **Condição** | **Comportamento do Sistema** |
|---|---|
| **E0 — Tentativa de acesso por Utilizador Anónimo** | O utilizador tenta acionar a ferramenta sem autenticação ativa. O sistema bloqueia a ação, recusa com HTTP `401 Unauthorized` e apresenta diálogo solicitando login ou criação de conta. |
| **E1 — Duração ou Resolução superior aos limites do Perfil** | Se um Utilizador Registado submeter um vídeo com duração superior a 30 segundos ou resolução acima de 720p, o sistema recusa o pedido com HTTP `400 Bad Request`, informando os limites do plano e sugerindo upgrade para Premium. |
| **E2 — Saldo de Quota Diária Esgotado** | No Passo 4, ao verificar a conta do utilizador gratuito, constata-se saldo zero de operações diárias. O sistema recusa o pedido e apresenta modal informativo para renovação ou adesão ao plano Premium. |
| **E3 — Vídeo sem presença humana detetada** | O modelo de IA não deteta qualquer pessoa ou silhueta humana durante o intervalo analisado. O sistema interrompe a operação com estado *"falhada"*, regista o motivo *"Nenhum sujeito humano detetado para isolamento de fundo"*, notifica o utilizador e assegura que a quota não é debitada. |
| **E4 — Falha de processamento ou erro de descodificação** | Ocorre uma anomalia na descodificação, falta de recursos ou interrupção do processamento. O sistema aplica política de classificação estrita:<br>• **Falha permanente** (*vídeo inválido/corrompido, parâmetros incompatíveis*): O sistema não repete o pedido, define o estado como *"falhada"*, liberta recursos temporários e notifica o utilizador sem repetição indevida nem débito de quota.<br>• **Falha temporária** (*indisponibilidade momentânea do armazenamento*): Repetição limitada com *backoff* exponencial.<br>• **Falha na codificação final**: Descarta o ficheiro corrompido, limpa os dados temporários e nunca publica como concluído. |
| **E5 — Conflito de versão concorrente no projeto** | Durante a confirmação do pedido, a versão do projeto indicada no pedido difere da versão atual (projeto editado noutra sessão). O sistema recusa o pedido e atualiza o projeto na interface antes de nova submissão. |

---

### 2.5 Pós-condições

| **Tipo** | **Resultado** |
|---|---|
| **Garantia de Sucesso** | Um novo ficheiro de vídeo com o fundo substituído de acordo com os parâmetros escolhidos é gerado, guardado no projeto. O áudio original mantém-se perfeitamente sincronizado. A versão do projeto é incrementada, é debitada 1 operação na quota e o vídeo fica disponível na galeria. O vídeo original permanece íntegro. |
| **Garantia Mínima** | Em caso de erro, cancelamento ou falha do processamento, nenhum ficheiro corrompido é associado ao projeto, o processamento é interrompido de imediato, a quota do utilizador mantém-se intacta e o estado do sistema regressa à consistência prévia. |

---

### 2.6 Regras de Negócio e Restrições

| **ID** | **Regra / Restrição** |
|---|---|
| **RN0** | **Inelegibilidade de Utilizadores Anónimos:** Devido ao elevado custo computacional da inferência de IA em vídeo e à ausência de quotas em sessões anónimas, o acesso à ferramenta é exclusivo a utilizadores autenticados (Registados ou Premium). Utilizadores anónimos são impedidos de submeter tarefas. |
| **RN1** | **Edição Não Destrutiva:** O vídeo original nunca é sobreposto, alterado ou apagado; o processamento gera sempre um novo recurso com sufixo identificativo (`_sem_fundo.mp4`). |
| **RN2** | **Preservação e Sincronismo de Áudio:** O fluxo de áudio original deve ser mapeado sem alteração de tom ou velocidade. Quando é definido um intervalo de aplicação, o vídeo conserva a sua duração e cadência original completa (aplicando o efeito na janela temporal e mantendo frames originais fora dela), assegurando a continuidade de timestamps (PTS) e uma meta verificável de desfasamento áudio-vídeo $\le 40\text{ ms}$. |
| **RN3** | **Limites Diferenciados por Perfil:**<br>- **Utilizador Free:** Duração máxima de 30 segundos, resolução máxima 720p (1280×720), opções Chroma Key e Cor Sólida.<br>- **Utilizador Premium:** Duração máxima de 180 segundos, resolução máxima 1080p (1920×1080), todas as opções desbloqueadas incluindo Bokeh/Blur. |
| **RN4** | **Dedução Condicional de Quota:** O débito de 1 crédito na quota diária ocorre estritamente após a conclusão do processamento com sucesso. Operações canceladas ou com erro não consomem quota. |
| **RN5** | **Suporte de Formatos de Entrada:** São aceites contentores MP4 e MOV com vídeo H.264 e áudio AAC (RNG-02). O vídeo de saída é sempre MP4/H.264, para reprodução universal no browser. |
| **RN6** | **Idempotência e Consistência de Tarefas:** Cada tarefa possui um identificador único estável. Pedidos repetidos não originam resultados duplicados nem cobranças repetidas de quota ao utilizador. |
| **RN7** | **Prioridade Premium:** Os pedidos de utilizadores premium são processados com prioridade na fila (RNG-07). |
| **RN8** | **Projetos Partilhados:** Num projeto partilhado, quem tem um link com permissão de edição pode remover o fundo; a operação é descontada a quem a executa (RNG-05). |
| **RT1** | **Isolamento de Carga Computacional:** A inferência de IA deve ser executada em segundo plano, num serviço próprio, separada do atendimento dos pedidos do utilizador. |
| **RT2** | **Higiene de Armazenamento e Streaming:** Os fotogramas são processados em memória, evitando escrita desnecessária em disco, e todos os ficheiros temporários são eliminados no fim de cada tarefa, mesmo em caso de erro. |

---

### 2.7 Assunções

| **ID** | **Assunção** |
|---|---|
| **A1** | O modelo de segmentação de IA, leve, está incluído no serviço de processamento, operando com total autonomia local e sem dependências externas pagas. |
| **A2** | A infraestrutura Docker Compose tem capacidade de alocação de CPU suficiente para processar vídeo a pelo menos 10 fps em modo de inferência. |
| **A3** | O leitor multimédia do frontend suporta reprodução nativa HTML5 de vídeo com faixa de áudio integrada e eventos de atualização de estado. |
| **A4** | Os limites de RN3 (30 s/720p e 180 s/1080p) são os mais baixos das ferramentas de vídeo porque a segmentação por IA corre em CPU (A2): mesmo com a IA num fotograma em cada três, um vídeo demora cerca de 2 vezes a sua duração. Serão revistos após testes com vídeos reais. |

---

### 2.8 Questões em Aberto

| **ID** | **Questão** |
|---|---|
| **Q1** | Deve a plataforma suportar no futuro exportação com canal alfa transparente nativo (formato ProRes 4444 ou WebM VP9 com transparência) para além do fundo verde Chroma Key? *(Adiada para fase posterior: no MVP o fundo verde (Chroma Key) permite recortar o sujeito noutro editor.)* |
| **Q2** | Deve ser disponibilizada uma funcionalidade de pré-visualização instantânea do recorte numa única frame antes de despoletar o processamento do vídeo inteiro? *(Adiada para fase posterior: no MVP o utilizador pode aplicar a ferramenta a um intervalo temporal curto (passo 3) para ver o resultado antes de processar o vídeo inteiro.)* |
| **Q3** | Se a fila de pedidos atingir saturação ou a inferência exceder a duração admissível, deve o sistema definir um tempo limite de espera (*timeout*)? *(Resolvida na ERS pelo REQ-VID-BG-031: o sistema aplica um tempo máximo de execução proporcional à duração com cancelamento gracioso).* |

---

## 3. Utilização de agentes de IA

| **Ferramenta / *skill*** | **Tarefa apoiada** | **Validação realizada pela equipa** |
|---|---|---|
| **Antigravity (Google DeepMind)** | Apoio no desenho e formulação integral do caso de uso UC-VID-005; levantamento das opções de substituição de fundo (Chroma Key, cor sólida e portrait bokeh); estruturação da arquitetura de mensageria assíncrona desacoplada via RabbitMQ e conformidade com os guiões dos Exercícios 1 e 2 de RAS. | A equipa confrontou as propostas da IA com a arquitetura real do PictuRAS (microsserviços `projects`, `Tools`, `wsGateway` e RabbitMQ). Rejeitou a sugestão de utilizar APIs pagas da Stability/OpenAI, decidindo incorporar modelos de visão computacional leves diretamente no contentor Docker para manter autonomia local e custo zero de execução. |
| **Antigravity (Google DeepMind)** | Derivação formal da Especificação de Requisitos de Software (Secção 4), elaboração das Decisões de Qualidade (DQ-001 a DQ-008), matriz de impacto arquitetural e matriz de rastreabilidade bidirecional com testes em formato *Dado/Quando/Então*. | A equipa reviu minuciosamente cada requisito de sistema, garantindo a atomicidade, a ausência de ambiguidades, o cumprimento estrito das restrições de quota do modelo SaaS existente e o alinhamento com a estrutura da equipa do Grupo 6. |

---

## ✅ Lista de verificação da baseline do Exercício 1

- [x] Secções 0 a 3 preenchidas e texto de ajuda removido.
- [x] Funcionalidade de vídeo escolhida e justificada no contexto do MVP.
- [x] Ator principal identificado, com o respetivo perfil.
- [x] Caso de uso com fluxo principal, ≥1 fluxo alternativo e ≥1 exceção específica de vídeo.
- [x] Pós-condições com garantia de sucesso e garantia mínima.
- [x] Regras de negócio e restrições preenchidas.
- [x] Assunções e questões em aberto registadas.
- [x] Utilização de agentes de IA documentada.

---
---

## 4. Especificação de Requisitos do Sistema (ERS)

**Caso de Uso:** UC-VID-005 — Remoção e Substituição Automática de Fundo em Vídeo por IA  
**Versão do dossiê:** v2.0 (Especificação Completa ERS — Exercício 2)  
**Baseline do Exercício 1:** v1.0 — REQ-VID-BG-001 a REQ-VID-BG-018  

O catálogo 4.1 é a fonte única dos requisitos desta ERS. A matriz 4.3 rastreia esses IDs até ao caso de uso ou às decisões de qualidade. A tabela 4.2 descreve o impacto no sistema existente.

### 4.1 Requisitos da ERS

#### 4.1.1 Requisitos Funcionais

| **ID** | **Requisito** | **Prioridade** | **Evolução** | **Novo/Alt** | **Origem (UC / RN / decisão)** | **Justificação** | **Critério de aceitação / verificação** |
|---|---|---|---|---|---|---|---|
| **REQ-VID-BG-001** | O sistema deve disponibilizar a ferramenta de remoção de fundo na barra de edição sempre que o recurso multimédia selecionado for um vídeo suportado e o utilizador estiver autenticado. | Deve ter | Refinado | NOVO | Passo 1, RN0, E0 | Garante o ponto de entrada na interface apenas a utilizadores elegíveis, bloqueando utilizadores anónimos. | *Dado* um utilizador autenticado com um vídeo selecionado, *Quando* a barra de ferramentas é apresentada, *Então* o botão de remoção de fundo por IA está visível e ativo. |
| **REQ-VID-BG-002** | O sistema deve apresentar uma janela modal interativa com reprodução do vídeo, seletores de modo de substituição de fundo e configuração de intervalo temporal. | Deve ter | Mantido | NOVO | Passo 1 | Facilita a configuração dos parâmetros de processamento sem perder o contexto do projeto. | *Dado* o clique no botão de remoção de fundo, *Quando* a interface carrega, *Então* a janela modal abre exibindo o reprodutor e os controlos de configuração. |
| **REQ-VID-BG-003** | O sistema deve suportar três modos de substituição de fundo: Fundo Verde Chroma Key (`#00FF00`), Cor Sólida Personalizada (Hex/RGB) e Desfocagem de Profundidade (*Portrait Bokeh*). | Deve ter | Mantido | NOVO | Passo 2, FA3, RN3 | Disponibiliza opções criativas essenciais para edição externa, estúdio virtual e melhoria estética. | *Dado* a janela modal aberta, *Quando* o utilizador seleciona o modo Cor Sólida e escolhe uma cor, *Então* a cor selecionada é associada aos parâmetros da tarefa. |
| **REQ-VID-BG-004** | O sistema deve permitir aplicar a remoção de fundo à totalidade do vídeo ou a um intervalo temporal contínuo ($T_{start}$ a $T_{end}$) definido pelo utilizador. | Deve ter | Mantido | NOVO | Passo 3 | Oferece flexibilidade ao utilizador para isolar apenas o segmento relevante da gravação. | *Dado* um vídeo de 20 segundos, *Quando* o utilizador define o intervalo de 5s a 15s, *Então* os parâmetros registam $T_{start}=5$ e $T_{end}=15$. |
| **REQ-VID-BG-005** | O sistema deve validar no cliente e no servidor se o instante temporal final é estritamente superior ao inicial e se não excede a duração total do vídeo. | Deve ter | Mantido | NOVO | Passo 3, E1, FA4 | Impede o envio de parâmetros incoerentes que causariam falhas imediatas no processamento. | *Dado* $T_{start}=10$ e $T_{end}=5$, *Quando* o utilizador tenta submeter, *Então* o sistema bloqueia o envio e sinaliza o erro na interface; *Dado* um vídeo de 20 segundos e a inserção manual de $T_{end}=25$, *Quando* o utilizador clica no botão de correção rápida, *Então* o valor é automaticamente reajustado para a duração real de 20 segundos. |
| **REQ-VID-BG-006** | O sistema deve validar os limites de duração e resolução estipulados para o perfil do utilizador (Free: até 30s/720p; Premium: até 180s/1080p) antes de aceitar a tarefa. | Deve ter | Mantido | ALT | Passo 4, E1, RN3 | Assegura a sustentabilidade e controlo de consumo da infraestrutura computacional. | *Dado* um Utilizador Registado com vídeo de 45 segundos, *Quando* confirma o processamento, *Então* o sistema rejeita o pedido informando o limite do perfil Free. |
| **REQ-VID-BG-007** | O sistema deve validar se o utilizador possui saldo disponível na sua quota diária de operações antes de iniciar o processamento. | Deve ter | Mantido | ALT | Passo 4, E2 | Evita consumo abusivo de recursos computacionais por contas gratuitas esgotadas. | *Dado* um utilizador com 0 operações disponíveis, *Quando* clica em processar, *Então* o sistema recusa a operação com aviso de quota. |
| **REQ-VID-BG-008** | O sistema deve aceitar pedidos válidos de forma assíncrona, devolvendo de imediato a confirmação com o identificador da tarefa e colocando-a em fila para processamento. | Deve ter | Mantido | NOVO | Passo 4, Passo 5, DQ-001 | Separa a resposta ao utilizador do processamento de IA, que é demorado. | *Dado* um pedido válido, *Quando* é recebido, *Então* é devolvida de imediato a confirmação com o identificador da tarefa e a tarefa fica em fila. |
| **REQ-VID-BG-009** | O sistema deve manter o registo de estado explícito da tarefa durante o seu ciclo de vida (`em fila`, `a processar`, `concluída`, `falhada`, `cancelada`), sendo os estados finais imutáveis perante eventos tardios. | Deve ter | Mantido | NOVO | Passo 5, DQ-003 | Permite ao utilizador acompanhar a evolução do processamento assíncrono. | *Dado* uma tarefa submetida, *Quando* o processamento começa, *Então* o estado passa a `a processar`. |
| **REQ-VID-BG-010** | O sistema deve permitir ao utilizador cancelar a operação antes da confirmação ou enquanto a mesma estiver em processamento. | Deveria ter | Mantido | NOVO | FA1, FA2 | Dá controlo total ao utilizador e evita desperdício computacional em tarefas descartadas. | *Dado* uma tarefa no estado `a processar`, *Quando* o utilizador clica em Cancelar, *Então* o processamento é abortado e a quota não é consumida. |
| **REQ-VID-BG-011** | O sistema deve atribuir a cada fotograma do intervalo uma máscara do sujeito humano: estimada por um modelo de IA executado localmente num fotograma-chave em cada três e, nos fotogramas intermédios, interpolada entre as duas máscaras-chave vizinhas. | Deve ter | Refinado | NOVO | Passo 6, DQ-006 | A inferência em CPU em todos os fotogramas demora 6 a 12 vezes a duração do vídeo e não cabe no tempo máximo comum (REQ-VID-TIMEOUT-001); a interpolação dá a cada fotograma uma máscara própria, sem repetir a anterior, e transições suaves. | *Dado* um vídeo de 30 fotogramas, *Quando* a remoção de fundo é aplicada, *Então* o modelo de IA corre em 10 fotogramas e os 30 fotogramas do resultado têm máscara (estimada ou interpolada). |
| **REQ-VID-BG-012** | O sistema deve compor cada fotograma final juntando o sujeito segmentado com o novo fundo (verde Chroma Key, cor sólida ou aproximação de bokeh), suavizando apenas a zona de transição da margem do sujeito ($0.05 \le \alpha \le 0.95$). | Deve ter | Refinado | NOVO | Passo 7 | Preserva a opacidade e nitidez 100% integral no interior do sujeito e o fundo limpo, suavizando apenas os artefactos nas arestas de transição. | *Dado* a máscara alfa gerada, *Quando* o modo é Chroma Key, *Então* as margens são refinadas na banda de transição e o fundo substituído por `#00FF00`. |
| **REQ-VID-BG-013** | O sistema deve manter a faixa de áudio do vídeo original com a mesma cadência, duração e continuidade temporal, copiando-a sem perdas quando já está em AAC ou convertendo-a para AAC nos restantes formatos suportados; um vídeo sem áudio gera um resultado sem áudio, sem erro. | Deve ter | Refinado | NOVO | Passo 7, RN2 | Garante a sincronização do som sem desvios acumulados (desfasamento $\le 40\text{ ms}$) e a compatibilidade com o formato MP4. | *Dado* um vídeo com áudio AAC ou Opus, *Quando* o novo vídeo é gerado em MP4, *Então* o desfasamento entre som e imagem é $\le 40\text{ ms}$; *Dado* um vídeo sem áudio, *Quando* é processado, *Então* o MP4 resultante é gerado sem áudio e sem erro. |
| **REQ-VID-BG-014** | O sistema deve gerar o vídeo final em MP4, com vídeo H.264 e áudio AAC, preparado para começar a ser reproduzido no browser antes de estar totalmente transferido. | Deve ter | Mantido | NOVO | Passo 7, RN5 | Garante que o resultado gerado pode ser reproduzido de imediato em qualquer browser sem plugins e com início de reprodução instantâneo. | *Dado* o vídeo final gerado, *Quando* é inspecionado, *Então* é MP4 (H.264/AAC) com o índice no início do ficheiro e começa a ser reproduzido de imediato no browser. |
| **REQ-VID-BG-015** | O sistema deve guardar o vídeo processado no projeto com o nome `<nome>_sem_fundo.mp4`. | Deve ter | Mantido | NOVO | Passo 7, RN1, DQ-007 | Persiste o resultado e acrescenta-o ao projeto. | *Dado* o vídeo final gerado, *Quando* é guardado, *Então* aparece no projeto como novo vídeo. |
| **REQ-VID-BG-016** | O sistema deve notificar o utilizador da conclusão da tarefa em tempo real, sem exigir recarregamento da página. | Deve ter | Mantido | ALT | Passo 8, Passo 9, DQ-005 | Assegura uma experiência de utilização reativa e moderna em tempo real. | *Dado* o vídeo guardado, *Quando* a conclusão é comunicada, *Então* a interface apresenta o novo vídeo e uma notificação de sucesso. |
| **REQ-VID-BG-017** | O sistema deve debitar 1 operação da quota diária da conta do utilizador apenas e só após a conclusão da tarefa com sucesso. | Deve ter | Mantido | ALT | Passo 8, RN4, RN6 | Evita prejuízo para o utilizador no caso de eventuais anomalias técnicas no processamento. | *Dado* um utilizador com 5 operações, *Quando* o processamento conclui com sucesso, *Então* a quota diária é decrementada para 4 operações. |
| **REQ-VID-BG-018** | O sistema deve manter o vídeo original intacto no armazenamento de objetos e no projeto em todas as circunstâncias. | Deve ter | Mantido | NOVO | RN1, Garantia de Sucesso, Garantia Mínima | Cumpre a exigência fundamental de edição estritamente não-destrutiva. | *Dado* o processamento com sucesso ou erro, *Quando* o vídeo original é consultado, *Então* o seu identificador e conteúdo permanecem inalterados. |
| **REQ-VID-BG-029** | O sistema deve recusar a submissão quando a versão do projeto indicada no pedido for diferente da versão atual (projeto alterado noutra sessão). | Deve ter | Novo | NOVO | E5 | Previne condições de corrida e inconsistências de estado causadas por edições concorrentes em sessões distintas do mesmo projeto. | *Dado* um pedido de processamento com uma versão do projeto desatualizada, *Quando* é validado, *Então* é recusado com HTTP 409 e não é colocado em fila. |
| **REQ-VID-BG-030** | O sistema deve restringir o modo Desfocagem de Profundidade (*Portrait Bokeh*) a utilizadores Premium, bloqueando a opção na interface e recusando o pedido para utilizadores Free. | Deve ter | Novo | NOVO | Passo 2, RN3 | Assegura a diferenciação e monetização do serviço, reservando opções computacionalmente mais exigentes para contas pagas. | *Dado* um utilizador com perfil Free/Registado, *Quando* tenta submeter uma tarefa com o modo Portrait Bokeh, *Então* a interface bloqueia a opção e o pedido é recusado (HTTP 403). |

#### 4.1.2 Requisitos Não Funcionais e de Qualidade

*Classificação segundo a norma ISO/IEC 25010:2011: característica principal e, entre parênteses, a subcaracterística formal.*

| **ID** | **Requisito** | **Característica ISO/IEC 25010** | **Alvo MVP** | **Alvo produção** | **Evolução** | **Origem (UC / DQ)** | **Critério de aceitação / verificação** |
|---|---|---|---|---|---|---|---|
| **REQ-VID-BG-019** | O sistema deve responder à submissão da tarefa em menos de 1,0 s, sem esperar pelo processamento. | Eficiência de Desempenho (Comportamento Temporal) | $\le 1.0\text{ s}$ | $\le 300\text{ ms}$ | Novo | DQ-001, Passo 4, Passo 5 | *Dado* o envio de um pedido válido, *Quando* é validado, *Então* a confirmação com o identificador da tarefa é devolvida em $\le 1.0\text{ s}$. |
| **REQ-VID-BG-020** | O processamento deve continuar em segundo plano mesmo que o utilizador feche o browser. | Fiabilidade (Recuperabilidade) | Obrigatório (sem interrupção por desconexão web) | Obrigatório (com reconexão transparente e restauração de progresso) | Novo | DQ-002, Passo 5 | *Dado* um processamento em curso, *Quando* o utilizador fecha o browser, *Então* o processamento termina e o vídeo fica registado no projeto. |
| **REQ-VID-BG-021** | O sistema deve distinguir falhas permanentes (recusadas sem repetição e sem descontar quota) de falhas transitórias (repetidas com intervalos crescentes), sem duplicar tarefas e sem deixar ficheiros residuais. | Fiabilidade (Tolerância a Falhas) | Sem retoma a meio; estado `falhada`; ficheiros temporários apagados | Retoma automática a partir do último segmento processado; registo das tarefas que falharam | Novo | DQ-003, E4, RN6 | *Dado* um erro no processamento, *Quando* ocorre, *Então* a tarefa fica `falhada`, não é repetida indevidamente e a quota não é descontada. |
| **REQ-VID-BG-022** | O acesso à funcionalidade deve reutilizar a autenticação existente e recusar utilizadores anónimos. | Segurança (Autenticidade) | Obrigatório (sessão válida; anónimos recusados com HTTP 401) | Obrigatório, com endereços temporários dos ficheiros válidos durante 15 min | Novo | DQ-004, RN0, E0 | *Dado* um utilizador não autenticado ou sem permissão no projeto, *Quando* tenta acionar a ferramenta, *Então* o sistema devolve HTTP 401/403. |
| **REQ-VID-BG-023** | As transições de estado da tarefa devem ser comunicadas à interface em tempo real. | Eficiência de Desempenho (Comportamento Temporal) | Latência $\le 500\text{ ms}$ | Latência $\le 100\text{ ms}$ (com alternativa quando a ligação em tempo real falha) | Novo | DQ-005, Passo 8, Passo 9 | *Dado* uma transição de estado da tarefa, *Quando* ocorre, *Então* a interface recebe-a em $\le 500\text{ ms}$. |
| **REQ-VID-BG-024** | A remoção de fundo deve ser acrescentada como uma ferramenta independente, sem acoplamento a outras ferramentas. | Manutenibilidade (Modularidade) | Obrigatório (zero alterações no código de outras ferramentas) | Obrigatório (escala horizontal automática consoante a fila de pedidos) | Novo | DQ-006, RT1 | *Dado* o PictuRAS em execução, *Quando* a nova ferramenta é iniciada, *Então* nenhuma outra ferramenta sofre alterações de comportamento. |
| **REQ-VID-BG-025** | O vídeo de saída deve ser guardado no armazenamento existente, seguir o ciclo de vida normal dos ficheiros do projeto e ficar acessível apenas a quem tem permissão no projeto. | Segurança (Confidencialidade / Integridade) | Obrigatório (armazenamento persistente com acesso restrito) | Obrigatório (com ciclo de vida com expiração programada de artefactos temporários) | Novo | DQ-007, Passo 7 | *Dado* o vídeo final guardado, *Quando* alguém lhe tenta aceder, *Então* só os utilizadores com permissão no projeto o conseguem, através de um endereço temporário. |
| **REQ-VID-BG-026** | O serviço de remoção de fundo deve arrancar com `docker compose up --build`, com o modelo de IA incluído na imagem, sem instalar dependências no computador. | Portabilidade (Instalabilidade) | Obrigatório (execução transparente em Linux/Windows via Docker) | Obrigatório (imagem multiarquitetura otimizada para CPU e GPU) | Novo | DQ-008, A1 | *Dado* um computador apenas com Docker, *Quando* o sistema é arrancado, *Então* o serviço de remoção de fundo inicia e liga-se ao resto do sistema. |
| **REQ-VID-BG-027** | O vídeo de saída deve manter o alinhamento temporal entre o áudio e a imagem, preservando a cadência original. | Adequação Funcional (Correção Funcional) | Desvio nominal $\le 40\text{ ms}$ (tolerância de 1 frame a 25 fps) | Desvio $\le 15\text{ ms}$, medido automaticamente em cada versão | Novo | RN2, Passo 7 | *Dado* o vídeo final, *Quando* se comparam os tempos do áudio e da imagem, *Então* o desfasamento é $\le 40\text{ ms}$. |
| **REQ-VID-BG-028** | O processamento deve evitar ficheiros intermédios de grande dimensão em disco e apagar todos os ficheiros temporários no fim de cada tarefa. | Eficiência de Desempenho (Utilização de Recursos) | Fotogramas processados em memória; ficheiros temporários apagados no fim | Partilha de memória entre processos com limite de escrita em disco | Novo | RT2, E4 | *Dado* a execução de uma tarefa, *Quando* termina, *Então* não foram criados ficheiros intermédios de grande dimensão e não restam ficheiros temporários. |
| **REQ-VID-BG-031** | O sistema deve processar o vídeo num tempo proporcional à sua duração e interromper a tarefa se o tempo máximo for excedido. | Eficiência de Desempenho (Comportamento Temporal) | Tempo de inferência $\le 3\times$ a duração do vídeo; Timeout de execução de $(3\times \text{duração} + 60\text{ s})$ | Tempo de inferência $\le 1.5\times$ a duração do vídeo (aceleração GPU/CUDA); Timeout de $(1.5\times \text{duração} + 30\text{ s})$ | Novo | A2, Q3, DQ-001 | *Dado* um vídeo de 30 segundos, *Quando* é processado, *Então* termina em $\le 90\text{ s}$; se exceder 150 s, a tarefa é interrompida com estado `falhada`, os recursos são libertados e o utilizador é notificado sem desconto de quota. |

#### 4.1.3 Verificação da completude e dos limites do âmbito

| **Tópico a verificar** | **Aplicável?** | **Decisão / justificação** | **Requisito(s) relacionado(s)** |
|---|---|---|---|
| **Formato, codec, duração e dimensão do vídeo** | **Sim** | Suporta contentores MP4, WebM e MOV codificados em H.264/AVC, VP8, VP9 e áudio AAC/Opus. O vídeo de saída é padronizado em MP4 (H.264/AAC). Limites estritos: perfil Free suporta até 30 segundos e resolução 720p; perfil Premium suporta até 180 segundos e resolução 1080p. | REQ-VID-BG-005, REQ-VID-BG-006, REQ-VID-BG-014, REQ-VID-BG-025, REQ-VID-BG-031 |
| **Estado, progresso, cancelamento e resultado** | **Sim** | Máquina de estados explícita (`em fila`, `a processar`, `concluída`, `falhada`, `cancelada`) acompanhada em tempo real, sem recarregar a página. Permite cancelamento no modal antes do envio ou durante o processamento ativo com libertação imediata de recursos. | REQ-VID-BG-008, REQ-VID-BG-009, REQ-VID-BG-010, REQ-VID-BG-016, REQ-VID-BG-020, REQ-VID-BG-023 |
| **Falhas durante o processamento** | **Sim** | Classificação estrita de falhas no worker: falhas permanentes (vídeo corrompido, formato inválido) são rejeitadas com `requeue=False` sem re-execução indevida; falhas transitórias de infraestrutura têm repetição limitada com backoff exponencial; timeout de execução cancela tarefas encravadas; ficheiros temporários são purgados no bloco `finally`. | REQ-VID-BG-021, REQ-VID-BG-028, REQ-VID-BG-031 |
| **Persistência e expiração dos ficheiros** | **Sim** | O vídeo resultante é guardado no projeto com o nome `<nome>_sem_fundo.mp4`. O vídeo original permanece permanentemente intacto. | REQ-VID-BG-015, REQ-VID-BG-018, REQ-VID-BG-025 |
| **Perfis e contagem de operações** | **Sim** | Acesso reservado a utilizadores autenticados (Registados ou Premium); utilizadores anónimos são estritamente inelegíveis (RN0). A dedução de 1 crédito diário ocorre exclusivamente após a receção do evento de sucesso, com garantia de idempotência. Restrição de efeitos avançados (Bokeh) a Premium. | REQ-VID-BG-006, REQ-VID-BG-007, REQ-VID-BG-017, REQ-VID-BG-022, REQ-VID-BG-030 |
| **Encadeamento de ferramentas e processamento em lote** | **Não** | **Fora do âmbito do MVP de vídeo:** A ferramenta opera de forma atómica sobre um vídeo individual selecionado pelo utilizador. O encadeamento automático com outras ferramentas e a submissão de múltiplos vídeos em lote ficam reservados para fases futuras de maturidade da plataforma. | N/A *(Exclusão deliberada e justificada de âmbito)* |

**Evolução:** *Mantido* = requisito preservado do Exercício 1; *Refinado* = clarificado ou tornado verificável sem mudar a intenção; *Novo* = acrescentado para completar a ERS. **NOVO/ALT** indica o impacto face ao PictuRAS existente.

### 4.2 Impacto no sistema existente

| **Elemento existente afetado** | **Impacto (Manter / Estender / Alterar)** | **Descrição do impacto** | **Requisito(s) relacionado(s)** |
|---|---|---|---|
| **Nginx / API Gateway / Autenticação JWT** | **Manter** | Reutiliza integralmente as rotas de entrada HTTPS e a validação de cabeçalhos de autenticação JWT existentes; barra utilizadores anónimos com HTTP 401 sem alterar o gateway. | REQ-VID-BG-001, REQ-VID-BG-022 |
| **Interface Web (`frontend`)** | **Estender** | Adiciona o componente modal `video-bg-remove-tool.tsx` na barra de ferramentas, permitindo escolher modos de fundo (com bloqueio de bokeh no Free), paleta de cores e visualização de progresso. | REQ-VID-BG-001, REQ-VID-BG-002, REQ-VID-BG-003, REQ-VID-BG-004, REQ-VID-BG-016, REQ-VID-BG-030 |
| **Microsserviço de Projetos (`projects`)** | **Estender** | Ganha o novo endpoint de submissão assíncrona, faz a validação de parâmetros/perfil, valida versão concorrente (`X-Project-Version`) e despacha mensagens para o RabbitMQ com metadados do projeto. | REQ-VID-BG-005, REQ-VID-BG-006, REQ-VID-BG-008, REQ-VID-BG-015, REQ-VID-BG-029, REQ-VID-BG-030 |
| **Mensageria Assíncrona (`rabbitMQ`)** | **Estender** | Adiciona a fila durável `video_bg_remove_requests_queue`, com prioridade para pedidos Premium, no ficheiro de configuração `definitions.json`. | REQ-VID-BG-008, REQ-VID-BG-019, REQ-VID-BG-024 |
| **Serviço de Armazenamento (`imageStorageService`)** | **Manter** | Reutiliza a geração de presigned URLs S3 temporárias para download do vídeo original e upload do vídeo processado sem fundo para o bucket do projeto. | REQ-VID-BG-015, REQ-VID-BG-025 |
| **Gestão de Quotas e Contas (`subscriptions` / `users`)** | **Alterar** | A rotina de validação e consumo de operações diárias é invocada para tarefas de vídeo de remoção de fundo bem-sucedidas. | REQ-VID-BG-006, REQ-VID-BG-007, REQ-VID-BG-017 |
| **Gateway em Tempo Real (`wsGateway`)** | **Manter** | A infraestrutura de WebSockets difunde os eventos de progresso e conclusão emitidos pelo worker para o frontend sem alterações no gateway. | REQ-VID-BG-009, REQ-VID-BG-016, REQ-VID-BG-023 |
| **Catálogo de Ferramentas (`projeto/Tools/`)** | **Estender** | Introdução do novo microsserviço independente `video_bg_remove` com o seu próprio contentor Docker, rotinas de inferência neural e monitor de timeout. | REQ-VID-BG-011, REQ-VID-BG-012, REQ-VID-BG-024, REQ-VID-BG-026, REQ-VID-BG-031 |

### 4.3 Matriz de Rastreabilidade Atualizada

| **Elemento de origem** | **Descrição abreviada** | **Requisito(s) relacionado(s)** |
|---|---|---|
| **Passo 1** | Acesso à ferramenta de vídeo e abertura do modal | REQ-VID-BG-001, REQ-VID-BG-002 |
| **Passo 2** | Seleção de modo de fundo (Chroma Key, cor sólida, bokeh) | REQ-VID-BG-002, REQ-VID-BG-003, REQ-VID-BG-030 |
| **Passo 3** | Definição de âmbito temporal (vídeo todo ou intervalo) | REQ-VID-BG-004, REQ-VID-BG-005 |
| **Passo 4** | Confirmação, validação de limites/quota e submissão na fila | REQ-VID-BG-006, REQ-VID-BG-007, REQ-VID-BG-008, REQ-VID-BG-019, REQ-VID-BG-029, REQ-VID-BG-030 |
| **Passo 5** | Confirmação imediata e apresentação de estado em tempo real | REQ-VID-BG-008, REQ-VID-BG-009, REQ-VID-BG-019 |
| **Passo 6** | Descodificação e segmentação por IA em fotogramas-chave, com interpolação | REQ-VID-BG-011, REQ-VID-BG-024, REQ-VID-BG-031 |
| **Passo 7** | Composição visual, remux de áudio e persistência no S3 | REQ-VID-BG-012, REQ-VID-BG-013, REQ-VID-BG-014, REQ-VID-BG-015, REQ-VID-BG-025, REQ-VID-BG-027, REQ-VID-BG-028 |
| **Passo 8** | Débito condicional de quota e emissão de evento de sucesso | REQ-VID-BG-016, REQ-VID-BG-017, REQ-VID-BG-023 |
| **Passo 9** | Atualização reativa da galeria e notificação visual Toast | REQ-VID-BG-016, REQ-VID-BG-023 |
| **FA1** | Cancelamento prévio da configuração no modal | REQ-VID-BG-010 |
| **FA2** | Cancelamento de tarefa em execução e libertação de recursos | REQ-VID-BG-010, REQ-VID-BG-021 |
| **FA3** | Escolha de cor sólida personalizada via seletor hexadecimal | REQ-VID-BG-003 |
| **FA4** | Ajuste automático de intervalo que excede a duração | REQ-VID-BG-005 |
| **E0** | Tentativa de acesso sem autenticação por Utilizador Anónimo | REQ-VID-BG-001, REQ-VID-BG-022 |
| **E1** | Violação de limites de duração ou resolução do perfil | REQ-VID-BG-005, REQ-VID-BG-006 |
| **E2** | Quota diária de operações esgotada | REQ-VID-BG-007 |
| **E3** | Vídeo sem sujeito humano detetado para recorte | REQ-VID-BG-011, REQ-VID-BG-021 |
| **E4** | Falha de execução ou corrupção de ficheiro | REQ-VID-BG-021, REQ-VID-BG-028 |
| **E5** | Conflito de concorrência com versão de projeto | REQ-VID-BG-029 |
| **Garantia de Sucesso** | Novo vídeo no S3, catálogo atualizado, áudio sincronizado e original intacto | REQ-VID-BG-012, REQ-VID-BG-013, REQ-VID-BG-015, REQ-VID-BG-016, REQ-VID-BG-017, REQ-VID-BG-018 |
| **Garantia Mínima** | Sem artefactos corrompidos, resíduos limpos, vídeo e quota preservados | REQ-VID-BG-010, REQ-VID-BG-018, REQ-VID-BG-021, REQ-VID-BG-028, REQ-VID-BG-031 |
| **RN0** | Inelegibilidade de utilizadores anónimos e obrigatoriedade de autenticação | REQ-VID-BG-001, REQ-VID-BG-022 |
| **RN1** | Preservação estrita do ficheiro de vídeo original | REQ-VID-BG-015, REQ-VID-BG-018 |
| **RN2** | Sincronismo estrito de áudio com desfasamento $\le 40\text{ ms}$ | REQ-VID-BG-013, REQ-VID-BG-027 |
| **RN3** | Limites diferenciados por perfil (Free 30s/720p; Premium 180s/1080p, Bokeh restrito a Premium) | REQ-VID-BG-003, REQ-VID-BG-006, REQ-VID-BG-030 |
| **RN4** | Dedução de quota apenas após sucesso da tarefa | REQ-VID-BG-017 |
| **RN5** | Suporte universal de formatos de entrada e saída MP4/H.264 | REQ-VID-BG-014 |
| **RN6** | Idempotência e consistência de tarefas contra duplicação | REQ-VID-BG-017, REQ-VID-BG-021 |
| **RN7** | Prioridade Premium na fila (RNG-07) | REQ-VID-QUOTA-003 (requisito comum do relatório) |
| **RN8** | Projetos partilhados: paga quem executa (RNG-05) | REQ-VID-QUOTA-002, REQ-VID-SEC-001 (requisitos comuns do relatório) |
| **RT1** | Execução de inferência isolada no worker de background | REQ-VID-BG-011, REQ-VID-BG-019, REQ-VID-BG-024 |
| **RT2** | Limpeza mandatória de ficheiros temporários em disco e streaming em memória | REQ-VID-BG-028 |
| **DQ-001** | Submissão assíncrona desacoplada via RabbitMQ | REQ-VID-BG-008, REQ-VID-BG-019, REQ-VID-BG-031 |
| **DQ-002** | Continuidade de execução independente da sessão no browser | REQ-VID-BG-020 |
| **DQ-003** | Máquina de estados explícita e tratamento consistente de falhas | REQ-VID-BG-009, REQ-VID-BG-021 |
| **DQ-004** | Reutilização transparente dos mecanismos de segurança e JWT | REQ-VID-BG-022 |
| **DQ-005** | Difusão de estados em tempo real por WebSockets | REQ-VID-BG-016, REQ-VID-BG-023 |
| **DQ-006** | Padrão arquitetural de microsserviço independente em `Tools` | REQ-VID-BG-011, REQ-VID-BG-024, REQ-VID-BG-031 |
| **DQ-007** | Persistência Universal em Repositório S3 com controlo de acesso | REQ-VID-BG-015, REQ-VID-BG-025 |
| **DQ-008** | Empacotamento autónomo em contentor Docker Compose | REQ-VID-BG-026 |
| **A1** | Modelo neural leve empacotado no contentor sem dependência de APIs externas | REQ-VID-BG-026 |
| **A2** | Infraestrutura com cadência mínima de processamento em inferência | REQ-VID-BG-031 |
| **Q3** | Timeout e cancelamento gracioso em caso de sobrecarga ou bloqueio | REQ-VID-BG-031 |

**Decisões de qualidade introduzidas nesta aula**

| **ID** | **Decisão de qualidade** | **Justificação** | **Requisito(s) relacionado(s)** |
|---|---|---|---|
| **DQ-001** | **Comunicação Assíncrona via Fila Durável RabbitMQ** | Desacopla a requisição HTTP da inferência neural pesada, prevenindo timeouts na rede e assegurando persistência de pedidos. | REQ-VID-BG-008, REQ-VID-BG-019, REQ-VID-BG-031 |
| **DQ-002** | **Desacoplamento do Ciclo de Vida da Sessão Web** | Permite que tarefas longas de vídeo completem a inferência e gravação no S3 mesmo após fecho do browser pelo utilizador. | REQ-VID-BG-020 |
| **DQ-003** | **Classificação Estrita de Falhas e Garantia de Idempotência** | Distingue falhas permanentes de transitórias, prevenindo loops de requeue no RabbitMQ e evitando cobranças duplicadas de quota. | REQ-VID-BG-009, REQ-VID-BG-021 |
| **DQ-004** | **Reutilização de Autenticação JWT e Bloqueio de Anónimos** | Garante integridade de segurança sem duplicar mecanismos de autorização, bloqueando sessões sem identificação de quota. | REQ-VID-BG-022 |
| **DQ-005** | **Propagação Reativa de Estados via WebSockets (`wsGateway`)** | Elimina polling agressivo por parte do frontend, assegurando notificação imediata ($\le 500\text{ ms}$) da conclusão da tarefa. | REQ-VID-BG-016, REQ-VID-BG-023 |
| **DQ-006** | **Padrão de Microsserviço Autónomo e Isolado em `Tools`** | Garante manutenibilidade e modularidade estrita, permitindo evoluir a ferramenta sem risco de regressão nos outros serviços. | REQ-VID-BG-011, REQ-VID-BG-024, REQ-VID-BG-031 |
| **DQ-007** | **Persistência Universal em Repositório S3 com Controlo de Acesso** | Garante conformidade com a gestão de ficheiros da plataforma através de presigned URLs privadas compatíveis com streaming HTTP. | REQ-VID-BG-015, REQ-VID-BG-025 |
| **DQ-008** | **Contentorização Otimizada com Modelo Neural Embutido** | Permite execução imediata via `docker compose up --build` com o modelo `u2netp` ONNX (4,7 MB) embutido na imagem, dispensando setup no host e descargas no arranque. | REQ-VID-BG-026 |

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
