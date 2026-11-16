#import "../template.typ": *

== UC-VID-005 — Remoção e Substituição Automática de Fundo em Vídeo por IA (Video Background Removal)

=== Cabeçalho

#tab([Caso de uso UC-VID-005 — Remoção e Substituição Automática de Fundo em Vídeo por IA (Video Background Removal)],
  tabela-campos(
    [ID do Caso de Uso], [UC-VID-005],
    [Nome], [Remoção e Substituição Automática de Fundo em Vídeo por IA (#emph[Video Background Removal])],
    [Versão], [v2.0 (Especificação Completa ERS — Exercício 2)],
    [Autor], [Sérgio Vieira (PG65442)],
    [Data], [2026-10-18],
    [Objetivo], [Permitir ao utilizador selecionar um vídeo na biblioteca do projeto, acionar a ferramenta de IA para estimar a máscara do sujeito e remover o fundo da cena, escolher o modo de substituição (Chroma Key verde `#00FF00`, cor sólida personalizada ou desfocagem de profundidade) e obter um novo ficheiro de vídeo processado mantendo o sincronismo do áudio original intacto.],
    [Âmbito], [Módulo de processamento avançado de vídeo do PictuRAS e gestão de projetos multimédia.],
    [Ator Principal], [Utilizador Registado ou Utilizador Premium],
    [_Stakeholders_ e Interesses], [
      - *Utilizador (criador de conteúdo)*: pretende isolar o sujeito do vídeo para posterior composição gráfica ou melhoria estética rápida sem necessidade de estúdio físico com fundo verde.
      - *Proprietário do Sistema*: pretende valorizar o catálogo de ferramentas inteligentes de vídeo com forte apelo visual, assegurando a viabilidade económica da infraestrutura através de quotas e limites estritos de tempo de computação por perfil.
      - *Equipa de Desenvolvimento*: pretende garantir que a inferência pesada de redes neuronais corre de forma assíncrona em contentores dedicados (`Tools`), sem bloquear o servidor web, garantindo tolerância a falhas e escalabilidade horizontal.
    ],
    [Pré-condições], [
      + O utilizador encontra-se autenticado.
      + O projeto possui pelo menos um ficheiro de vídeo suportado (`.mp4` ou `.mov`) carregado no projeto.
      + O utilizador dispõe de saldo na quota diária de operações (para perfil Registado/Free).
    ],
    [_Trigger_], [O utilizador, com um vídeo aberto na interface de edição do projeto, clica no ícone #strong[Remover Fundo de Vídeo (IA)] na barra de ferramentas de vídeo.],
  ),
)

=== Fluxo Principal

#tab([UC-VID-005 — Fluxo principal],
  tabela(
    colunas: (1.2cm, 1fr, 1fr),
    [Passo], [Ação do Ator], [Resposta do Sistema],
    [1], [O utilizador abre o projeto, seleciona um vídeo na galeria e clica no botão #strong[Remover Fundo (IA)]], [Apresenta a janela modal de configuração da ferramenta com pré-visualização do vídeo, opções de modo de substituição de fundo e intervalo de aplicação],
    [2], [O utilizador seleciona o modo de fundo pretendido: #strong[Chroma Key (Fundo Verde `#00FF00`)], #strong[Cor Sólida] (selecionando uma cor no seletor) ou #strong[Desfocagem de Profundidade (\*Portrait Blur\*)]], [Atualiza a interface gráfica destacando o modo escolhido e exibindo as amostras visuais de referência],
    [3], [O utilizador define o âmbito temporal: opta por aplicar ao #strong[Vídeo Completo] ou define um #strong[Intervalo Temporal Personalizado] (T#sub[start] a T#sub[end])], [Valida os instantes temporais face à duração total do vídeo e exibe a estimativa de tempo e de consumo de quota],
    [4], [O utilizador confirma a execução clicando em #strong[Processar Vídeo]], [Valida a elegibilidade da quota diária e a conformidade dos parâmetros com o perfil do utilizador, aceita o pedido e inicia o processamento assíncrono da tarefa],
    [5], [—], [Devolve a confirmação de aceitação do pedido com o identificador da tarefa e apresenta na interface um painel de acompanhamento com o estado da operação (#emph["em fila" / "a processar"])],
    [6], [—], [O sistema inicia o processamento assíncrono em segundo plano, analisando o vídeo e isolando o sujeito ao longo do intervalo de fotogramas selecionado],
    [7], [—], [O sistema compõe o vídeo aplicando o novo fundo pretendido, preserva a integridade e sincronismo da pista de áudio e armazena o novo recurso gerado no catálogo do projeto],
    [8], [—], [O sistema conclui o processamento com sucesso, debita 1 operação na conta do utilizador e emite uma notificação de conclusão em tempo real],
    [9], [—], [O frontend fecha o painel de processamento, emite notificação de sucesso (#emph[Toast]) e apresenta o novo vídeo processado (`<nome>_sem_fundo.mp4`) na galeria do projeto pronto para reprodução e exportação],
  ),
)

=== Fluxos Alternativos

#tab([UC-VID-005 — Fluxos alternativos],
  tabela(
    colunas: (4cm, 1fr),
    [Fluxo], [Descrição (passo de origem: condição → comportamento → retorno)],
    [FA1 — Cancelamento prévio da operação], [No Passo 1, 2 ou 3, o utilizador clica em #strong[Cancelar] ou fecha o modal → O sistema descarta as configurações selecionadas, não inicia qualquer processamento e não debita qualquer quota.],
    [FA2 — Cancelamento de tarefa em execução], [No Passo 5, enquanto o estado for #emph["em fila"] ou #emph["a processar"], o utilizador prime #strong[Cancelar Processamento] → O sistema cancela a execução da tarefa, liberta os recursos alocados e assegura que a quota diária do utilizador não é debitada.],
    [FA3 — Seleção de Cor Sólida Personalizada], [No Passo 2, o utilizador escolhe a opção "Cor Sólida" e introduz um código hexadecimal específico (ex.: `#FFFFFF` branco ou `#1E293B` ardósia) através do componente seletor de cor → O sistema regista o valor RGB correspondente para substituição do fundo no processador de vídeo.],
    [FA4 — Ajuste Automático de Intervalo Excedido], [No Passo 3, o utilizador insere manualmente um instante final superior à duração do vídeo → O frontend apresenta aviso visual e ajusta automaticamente o valor para a duração real exata do vídeo através de um clique no botão de correção rápida.],
  ),
)

=== Exceções

#tab([UC-VID-005 — Exceções],
  tabela(
    colunas: (1fr, 1fr),
    [Condição], [Comportamento do Sistema],
    [#strong[E0 — Tentativa de acesso por Utilizador Anónimo]], [O utilizador tenta acionar a ferramenta sem autenticação ativa. O sistema bloqueia a ação, recusa com HTTP `401 Unauthorized` e apresenta diálogo solicitando login ou criação de conta.],
    [#strong[E1 — Duração ou Resolução superior aos limites do Perfil]], [Se um Utilizador Registado submeter um vídeo com duração superior a 30 segundos ou resolução acima de 720p, o sistema recusa o pedido com HTTP `400 Bad Request`, informando os limites do plano e sugerindo upgrade para Premium.],
    [#strong[E2 — Saldo de Quota Diária Esgotado]], [No Passo 4, ao verificar a conta do utilizador gratuito, constata-se saldo zero de operações diárias. O sistema recusa o pedido e apresenta modal informativo para renovação ou adesão ao plano Premium.],
    [#strong[E3 — Vídeo sem presença humana detetada]], [O modelo de IA não deteta qualquer pessoa ou silhueta humana durante o intervalo analisado. O sistema interrompe a operação com estado #emph["falhada"], regista o motivo #emph["Nenhum sujeito humano detetado para isolamento de fundo"], notifica o utilizador e assegura que a quota não é debitada.],
    [#strong[E4 — Falha de processamento ou erro de descodificação]], [
      Ocorre uma anomalia na descodificação, falta de recursos ou interrupção do processamento. O sistema aplica política de classificação estrita: \
      • #strong[Falha permanente] (#emph[vídeo inválido/corrompido, parâmetros incompatíveis]): O sistema não repete o pedido, define o estado como #emph["falhada"], liberta recursos temporários e notifica o utilizador sem repetição indevida nem débito de quota. \
      • #strong[Falha temporária] (#emph[indisponibilidade momentânea do armazenamento]): Repetição limitada com #emph[backoff] exponencial. \
      • #strong[Falha na codificação final]: Descarta o ficheiro corrompido, limpa os dados temporários e nunca publica como concluído. \
    ],
    [#strong[E5 — Conflito de versão concorrente no projeto]], [Durante a confirmação do pedido, a versão do projeto indicada no pedido difere da versão atual (projeto editado noutra sessão). O sistema recusa o pedido e atualiza o projeto na interface antes de nova submissão.],
  ),
)

=== Pós-condições

#tabela(
  colunas: (4cm, 1fr),
  [Tipo], [Resultado],
  [Garantia de Sucesso], [Um novo ficheiro de vídeo com o fundo substituído de acordo com os parâmetros escolhidos é gerado, guardado no projeto. O áudio original mantém-se perfeitamente sincronizado. A versão do projeto é incrementada, é debitada 1 operação na quota e o vídeo fica disponível na galeria. O vídeo original permanece íntegro.],
    [Garantia Mínima], [Em caso de erro, cancelamento ou falha do processamento, nenhum ficheiro corrompido é associado ao projeto, o processamento é interrompido de imediato, a quota do utilizador mantém-se intacta e o estado do sistema regressa à consistência prévia.],
)

=== Regras de Negócio e Restrições

#tabela(
  colunas: (1.4cm, 1fr),
  [ID], [Regra],
    [RN0], [#strong[Inelegibilidade de Utilizadores Anónimos:] Devido ao elevado custo computacional da inferência de IA em vídeo e à ausência de quotas em sessões anónimas, o acesso à ferramenta é exclusivo a utilizadores autenticados (Registados ou Premium). Utilizadores anónimos são impedidos de submeter tarefas.],
    [RN1], [#strong[Edição Não Destrutiva:] O vídeo original nunca é sobreposto, alterado ou apagado; o processamento gera sempre um novo recurso com sufixo identificativo (`_sem_fundo.mp4`).],
    [RN2], [#strong[Preservação e Sincronismo de Áudio:] O fluxo de áudio original deve ser mapeado sem alteração de tom ou velocidade. Quando é definido um intervalo de aplicação, o vídeo conserva a sua duração e cadência original completa (aplicando o efeito na janela temporal e mantendo frames originais fora dela), assegurando a continuidade de timestamps (PTS) e uma meta verificável de desfasamento áudio-vídeo ≤ 40 ms.],
    [RN3], [
      #strong[Limites Diferenciados por Perfil:] \
      - #strong[Utilizador Free:] Duração máxima de 30 segundos, resolução máxima 720p (1280×720), opções Chroma Key e Cor Sólida.
      - #strong[Utilizador Premium:] Duração máxima de 180 segundos, resolução máxima 1080p (1920×1080), todas as opções desbloqueadas incluindo Bokeh/Blur.
    ],
    [RN4], [#strong[Dedução Condicional de Quota:] O débito de 1 crédito na quota diária ocorre estritamente após a conclusão do processamento com sucesso. Operações canceladas ou com erro não consomem quota.],
    [RN5], [#strong[Suporte de Formatos de Entrada:] São aceites contentores MP4 e MOV com vídeo H.264 e áudio AAC (RNG-02). O vídeo de saída é sempre MP4/H.264, para reprodução universal no browser.],
    [RN6], [#strong[Idempotência e Consistência de Tarefas:] Cada tarefa possui um identificador único estável. Pedidos repetidos não originam resultados duplicados nem cobranças repetidas de quota ao utilizador.],
    [RN7], [#strong[Prioridade Premium:] Os pedidos de utilizadores premium são processados com prioridade na fila (RNG-07).],
    [RN8], [#strong[Projetos Partilhados:] Num projeto partilhado, quem tem um link com permissão de edição pode remover o fundo; a operação é descontada a quem a executa (RNG-05).],
    [RT1], [#strong[Isolamento de Carga Computacional:] A inferência de IA deve ser executada em segundo plano, num serviço próprio, separada do atendimento dos pedidos do utilizador.],
    [RT2], [#strong[Higiene de Armazenamento e Streaming:] Os fotogramas são processados em memória, evitando escrita desnecessária em disco, e todos os ficheiros temporários são eliminados no fim de cada tarefa, mesmo em caso de erro.],
)

=== Assunções

#tabela(
  colunas: (1.4cm, 1fr),
  [ID], [Assunção],
    [A1], [O modelo de segmentação de IA, leve, está incluído no serviço de processamento, operando com total autonomia local e sem dependências externas pagas.],
    [A2], [A infraestrutura Docker Compose tem capacidade de alocação de CPU suficiente para processar vídeo a pelo menos 10 fps em modo de inferência.],
    [A3], [O leitor multimédia do frontend suporta reprodução nativa HTML5 de vídeo com faixa de áudio integrada e eventos de atualização de estado.],
    [A4], [Os limites de RN3 (30 s/720p e 180 s/1080p) são os mais baixos das ferramentas de vídeo porque a segmentação por IA corre em CPU (A2): mesmo com a IA num fotograma em cada três, um vídeo demora cerca de 2 vezes a sua duração. Serão revistos após testes com vídeos reais.],
)

=== Questões em Aberto

#tabela(
  colunas: (1.4cm, 1fr, 5cm),
  [ID], [Questão], [Resolução],
  [Q1], [Deve a plataforma suportar no futuro exportação com canal alfa transparente nativo (formato ProRes 4444 ou WebM VP9 com transparência) para além do fundo verde Chroma Key?], [Adiada para fase posterior: no MVP o fundo verde (Chroma Key) permite recortar o sujeito noutro editor.],
  [Q2], [Deve ser disponibilizada uma funcionalidade de pré-visualização instantânea do recorte numa única frame antes de despoletar o processamento do vídeo inteiro?], [Adiada para fase posterior: no MVP o utilizador pode aplicar a ferramenta a um intervalo temporal curto (passo 3) para ver o resultado antes de processar o vídeo inteiro.],
  [Q3], [Se a fila de pedidos atingir saturação ou a inferência exceder a duração admissível, deve o sistema definir um tempo limite de espera (#emph[timeout])?], [Decidida: na ERS pelos REQ-VID-BG-031 e REQ-VID-TIMEOUT-001: o sistema aplica um tempo máximo de execução proporcional à duração com cancelamento gracioso.],
)
